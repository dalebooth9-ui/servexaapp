import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchExcelText(excelUrl: string): Promise<string> {
  const res = await fetch(excelUrl, { signal: AbortSignal.timeout(15000) });
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const XLSX = await import("npm:xlsx@0.18.5");
  const wb = XLSX.read(new Uint8Array(buffer), { type: "array" });
  const texts: string[] = [];
  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    texts.push(`=== Sheet: ${sheetName} ===\n${csv}`);
  }
  return texts.join("\n\n");
}

async function extractPartsAndDays(csvText: string, lovableApiKey: string): Promise<{
  parts: Array<{ name: string; quantity: number; unit_cost: number; sell_price: number }>;
  allocated_days: number | null;
}> {
  if (!csvText.trim()) return { parts: [], allocated_days: null };

  const prompt = `You are a data extraction assistant for a fire protection company.

Below is CSV data from a costing/quote spreadsheet.

Extract TWO things:

1. ALL line items that represent materials, parts, or labour. Rules:
   - Extract only actual materials, components, labour, or services with a description and quantity
   - Skip header rows, total rows, VAT rows, blank rows, and administrative entries
   - For each item extract: description/name, quantity, unit cost (supply/trade price), sell price (if present, otherwise use unit cost)
   - Quantities should be numbers (default 1 if not specified)
   - Costs should be numbers in GBP (strip £ symbols, commas etc). Use 0 if not present.
   - Keep descriptions concise but complete

2. The number of allocated days / days on site. Look for "Days on site", "Allocated days", "Labour days", "Installation days", or a labour row with day quantities.

Respond with ONLY valid JSON (no markdown), in this exact format:
{
  "parts": [
    {"name": "65mm Dry Riser Inlet Box", "quantity": 1, "unit_cost": 145.00, "sell_price": 195.00}
  ],
  "allocated_days": 3
}

If no days found, use null for allocated_days. If no parts found, use empty array.

CSV data:
${csvText.slice(0, 8000)}`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 6000,
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`AI extraction failed ${aiRes.status}: ${errText.slice(0, 200)}`);
  }

  const aiData = await aiRes.json();
  const raw = aiData?.choices?.[0]?.message?.content ?? "";
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);

  const parts = (Array.isArray(parsed.parts) ? parsed.parts : [])
    .filter((p: any) => p?.name && typeof p.name === "string" && p.name.trim().length > 0)
    .map((p: any) => ({
      name: String(p.name).trim(),
      quantity: Math.max(Number(p.quantity) || 1, 1),
      unit_cost: Math.max(Number(p.unit_cost) || 0, 0),
      sell_price: Math.max(Number(p.sell_price) || Number(p.unit_cost) || 0, 0),
    }));

  const days = parsed?.allocated_days;
  const allocated_days =
    days != null && !isNaN(Number(days)) && Number(days) > 0
      ? Math.ceil(Number(days))
      : null;

  return { parts, allocated_days };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableApiKey) throw new Error("LOVABLE_API_KEY not configured");

    const { file_url, job_id, user_id } = await req.json();
    if (!file_url) throw new Error("file_url is required");

    // 1. Fetch & parse Excel
    const csvText = await fetchExcelText(file_url);

    // 2. AI extraction
    const { parts, allocated_days } = await extractPartsAndDays(csvText, lovableApiKey);

    // 3. If job_id provided, persist results
    if (job_id) {
      // Insert parts
      if (parts.length > 0) {
        const rows = parts.map((p, i) => ({
          job_id,
          name: p.name,
          quantity: p.quantity,
          unit_cost: p.unit_cost,
          sell_price: p.sell_price,
          total_cost: p.quantity * p.unit_cost,
          added_by: user_id || "costing_import",
          sort_order: i,
        }));
        await supabase.from("job_parts").insert(rows as any);
      }

      // Update allocated_days if found
      if (allocated_days != null) {
        await supabase.from("jobs").update({ allocated_days } as any).eq("id", job_id);
      }

      // Attach costing sheet as a document
      await supabase.from("job_documents").insert({
        job_id,
        document_type: "uploaded_file",
        label: "Costing Sheet",
        file_url,
        file_name: `CostingSheet.xlsx`,
        source: "auto",
        created_by: user_id || null,
      } as any);

      // Log activity
      await supabase.from("job_activity_log").insert({
        job_id,
        user_id: user_id || null,
        action: "costing_import",
        details: `Costing sheet imported: ${parts.length} part(s) extracted${allocated_days != null ? `, ${allocated_days} allocated day(s)` : ""}`,
      } as any);
    }

    return new Response(
      JSON.stringify({ success: true, parts, allocated_days }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: any) {
    console.error("parse-costing-sheet error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
