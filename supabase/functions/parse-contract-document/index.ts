import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type Clause = { heading: string; text: string };

/**
 * Extracts an organisation's OWN contract wording, verbatim.
 * Nothing is rewritten, summarised or generated — .docx paragraphs are read
 * straight out of the file; PDFs are transcribed with a strict verbatim
 * instruction and still shown to the admin for review before approval.
 */
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return json({ error: "Unauthorized" }, 401);
    }
    const caller = await createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    }).auth.getUser();
    const user = caller.data.user;
    if (!user) return json({ error: "Unauthorized" }, 401);

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: user.id, _role: "admin" });
    if (!isAdmin) return json({ error: "Admin access required" }, 403);

    const { file_base64, file_name } = await req.json();
    if (!file_base64 || !file_name) return json({ error: "file_base64 and file_name are required" }, 400);

    const ext = String(file_name).slice(String(file_name).lastIndexOf(".")).toLowerCase();

    if (ext === ".docx") {
      const bytes = Uint8Array.from(atob(file_base64), (c) => c.charCodeAt(0));
      const { ZipReader, BlobReader, TextWriter } = await import(
        "https://deno.land/x/zipjs@v2.7.34/index.js"
      );
      const reader = new ZipReader(new BlobReader(new Blob([bytes])));
      const entries = await reader.getEntries();
      let xml = "";
      for (const entry of entries) {
        if (entry.filename === "word/document.xml") {
          xml = await entry.getData!(new TextWriter());
          break;
        }
      }
      await reader.close();
      if (!xml) return json({ clauses: [], notice: "Could not read this .docx file." }, 200);

      const paras: { text: string; isHeading: boolean }[] = [];
      for (const m of xml.matchAll(/<w:p[ >][\s\S]*?<\/w:p>/g)) {
        const block = m[0];
        const text = block
          .replace(/<w:tab[^>]*\/>/g, "\t")
          .replace(/<[^>]+>/g, "")
          .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
          .replace(/[ \t]+/g, " ")
          .trim();
        if (!text) continue;
        const styled = /w:pStyle[^>]*w:val="(Heading|Title)[^"]*"/i.test(block);
        const shortCaps = text.length <= 80 && text === text.toUpperCase() && /[A-Z]/.test(text);
        paras.push({ text, isHeading: styled || shortCaps });
      }

      const clauses = groupIntoClauses(paras);
      return json({ clauses, verbatim: true }, 200);
    }

    if (ext === ".pdf") {
      const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
      if (!LOVABLE_API_KEY) return json({ error: "AI transcription is not configured" }, 500);
      const ai = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          temperature: 0,
          messages: [
            {
              role: "system",
              content:
                "You TRANSCRIBE contract documents. Reproduce the wording EXACTLY as written — never rewrite, summarise, shorten, improve or invent any legal text. Return ONLY a JSON array of {\"heading\": string, \"text\": string} in document order. Use the document's own section headings; if a block has no heading use an empty string.",
            },
            {
              role: "user",
              content: [
                { type: "text", text: `Transcribe this contract document (${file_name}) verbatim.` },
                { type: "image_url", image_url: { url: `data:application/pdf;base64,${file_base64}` } },
              ],
            },
          ],
        }),
      });
      if (!ai.ok) {
        if (ai.status === 429) return json({ error: "Too many requests just now — try again in a moment." }, 429);
        if (ai.status === 402) return json({ error: "AI credits exhausted." }, 402);
        return json({ error: "Could not read this PDF." }, 500);
      }
      const data = await ai.json();
      const raw = String(data.choices?.[0]?.message?.content || "[]")
        .replace(/```json?/g, "").replace(/```/g, "").trim();
      let clauses: Clause[] = [];
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          clauses = parsed
            .filter((c: any) => c && typeof c === "object")
            .map((c: any) => ({ heading: String(c.heading || ""), text: String(c.text || "") }))
            .filter((c) => c.heading || c.text);
        }
      } catch {
        clauses = [];
      }
      return json({ clauses, verbatim: false }, 200);
    }

    return json({ error: "Only .docx and .pdf files are supported." }, 400);
  } catch (err) {
    console.error("parse-contract-document error", err);
    return json({ error: (err as Error).message }, 500);
  }
});

function groupIntoClauses(paras: { text: string; isHeading: boolean }[]): Clause[] {
  const clauses: Clause[] = [];
  let current: Clause | null = null;
  for (const p of paras) {
    if (p.isHeading) {
      if (current) clauses.push(current);
      current = { heading: p.text, text: "" };
    } else {
      if (!current) current = { heading: "", text: "" };
      current.text = current.text ? `${current.text}\n${p.text}` : p.text;
    }
  }
  if (current) clauses.push(current);
  return clauses.filter((c) => c.heading || c.text);
}

function json(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
