import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Extract the storage object path from a Supabase signed or public URL.
 * e.g. ".../object/sign/submissions/costing-sheets/abc/file.xlsx?token=..."
 *      → "costing-sheets/abc/file.xlsx"
 */
function extractStoragePath(url: string, bucket: string): string | null {
  try {
    const u = new URL(url);
    const re = new RegExp(`/object/(?:sign|public)/${bucket}/(.+?)(?:\\?|$)`);
    const m = u.pathname.match(re);
    return m ? decodeURIComponent(m[1]) : null;
  } catch {
    return null;
  }
}

async function fetchExcelBytes(
  fileUrl: string,
  bucket: string,
  supabase: ReturnType<typeof createClient>,
): Promise<ArrayBuffer> {
  // Prefer service-role storage download — bypasses RLS entirely
  const storagePath = extractStoragePath(fileUrl, bucket);
  if (storagePath) {
    console.log("Downloading via storage service role:", storagePath);
    const { data, error } = await supabase.storage.from(bucket).download(storagePath);
    if (!error && data) return await data.arrayBuffer();
    console.warn("Storage download failed, falling back to fetch:", error?.message);
  }
  // Fallback: plain fetch (works for signed / public URLs)
  console.log("Downloading via fetch:", fileUrl.slice(0, 100));
  const res = await fetch(fileUrl, { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Failed to fetch file: ${res.status} ${res.statusText}`);
  return await res.arrayBuffer();
}

async function fetchExcelText(
  excelUrl: string,
  bucket: string,
  supabase: ReturnType<typeof createClient>,
): Promise<string> {
  const buffer = await fetchExcelBytes(excelUrl, bucket, supabase);
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

async function extractPartsAndDays(
  csvText: string,
  lovableApiKey: string,
): Promise<{
  parts: Array<{ name: string; quantity: number; unit_cost: number; sell_price: number }>;
  allocated_days: number | null;
}> {
  if (!csvText.trim()) return { parts: [], allocated_days: null };

  const prompt = `You are a precise data extraction assistant for a fire protection company.

Below is CSV data from a costing/quote spreadsheet. Your job is to extract materials/parts/labour line items with ACCURATE quantities and PER-UNIT prices.

CRITICAL RULES FOR QUANTITY EXTRACTION:
- The quantity column is typically labelled "Qty", "No.", "No. Off", "Quantity", "Nos", "Nr" or similar
- Quantities are WHOLE NUMBERS of physical items (e.g. 4, 8, 16, 32)
- DO NOT confuse quantity with unit cost, sell price, or total price columns
- If a row shows: "Flanges | 4 | £14.50 | £58.00" → quantity=4, unit_cost=14.50, sell_price=14.50 (per unit)
- If a row shows: "Labour | 8 days | £750 | £6,000 total" → quantity=8, unit_cost=750, sell_price=750 (per unit, NOT 6000)
- The total/extended price column = quantity × unit_cost. Use this to cross-check columns.
- Only default to quantity=1 if genuinely no quantity is specified

CRITICAL RULES FOR PRICES — ALWAYS PER UNIT:
- unit_cost and sell_price MUST be the price for ONE unit/item, never the total
- If the sheet shows a "Total" or "Extended" column, that is quantity × unit price — do NOT use it as sell_price
- To get per-unit sell price from a total: sell_price_per_unit = total_sell ÷ quantity
- Example: 8 days labour, total sell £6,000 → sell_price = £6,000 ÷ 8 = £750 per day

EXTRACTION RULES:
- Extract ALL line items: materials, components, fittings, labour, services
- Skip header rows, total/subtotal rows, VAT rows, blank rows, section headings
- Strip £ symbols and commas from costs. Use 0 if cost genuinely absent.
- Keep descriptions concise but complete

ALSO EXTRACT:
- The number of allocated days / days on site. Look for "Days on site", "Allocated days", "Labour days", "Installation days", or labour rows with day quantities.

Respond with ONLY valid JSON (no markdown, no explanation), in this exact format:
{
  "parts": [
    {"name": "65mm Dry Riser Inlet Box", "quantity": 4, "unit_cost": 145.00, "sell_price": 195.00}
  ],
  "allocated_days": 3
}

If no days found, use null for allocated_days. If no parts found, use empty array.

CSV data:
${csvText.slice(0, 10000)}`;

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

    const body = await req.json();
    const { file_url, job_id, user_id, bucket = "submissions" } = body;
    if (!file_url) throw new Error("file_url is required");

    console.log("parse-costing-sheet called, job_id:", job_id, "file_url prefix:", file_url.slice(0, 80));

    // 1. Fetch & parse Excel (service role bypasses RLS on private buckets)
    const csvText = await fetchExcelText(file_url, bucket, supabase);
    console.log("CSV text length:", csvText.length);

    // 2. AI extraction
    const { parts, allocated_days } = await extractPartsAndDays(csvText, lovableApiKey);
    console.log("Extracted parts:", parts.length, "allocated_days:", allocated_days);

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
          added_by: user_id ?? "00000000-0000-0000-0000-000000000000",
          sort_order: i,
        }));
        const { error: partsError } = await supabase.from("job_parts").insert(rows as any);
        if (partsError) console.error("parts insert error:", partsError.message);
      }

      // Update allocated_days if found
      if (allocated_days != null) {
        const { error: daysError } = await supabase
          .from("jobs")
          .update({ allocated_days } as any)
          .eq("id", job_id);
        if (daysError) console.error("allocated_days update error:", daysError.message);
      }

      // Attach costing sheet as a document in the job folder
      const fileName = file_url.split("/").pop()?.split("?")[0] || "CostingSheet.xlsx";
      const { error: docError } = await supabase.from("job_documents").insert({
        job_id,
        document_type: "uploaded_file",
        label: "Costing Sheet",
        file_url,
        file_name: fileName,
        source: "auto",
        created_by: user_id || null,
      } as any);
      if (docError) console.error("doc insert error:", docError.message);

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
