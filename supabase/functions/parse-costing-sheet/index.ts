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

Below is CSV data converted from a costing/quote spreadsheet. Extract every materials/parts/labour line item with ACCURATE quantities and PER-UNIT prices.

STEP 1 — IDENTIFY COLUMNS BEFORE EXTRACTING:
Scan the first 30 rows to locate the header row. Map these column meanings:
  • DESCRIPTION column — labelled "Description", "Item", "Material", "Part", or the leftmost text column
  • QUANTITY column — labelled "Qty", "Quantity", "No.", "No. Off", "Nos", "Nr", "Units", or contains small whole numbers (1–500)
  • UNIT COST column — labelled "Unit Cost", "Cost", "Cost ea", "Cost each", "Buy", "Net Cost"
  • UNIT SELL column — labelled "Unit Price", "Sell", "Sell ea", "Rate", "Price", "Unit Sell"
  • TOTAL/EXTENDED column — labelled "Total", "Extended", "Line Total", "Amount", "Sub Total" — usually the rightmost number column

Once mapped, USE THE SAME COLUMNS for every line. Do NOT swap meanings between rows.

STEP 2 — APPLY THESE RULES PER LINE:
- Quantities are WHOLE NUMBERS of physical items (e.g. 4, 8, 16). NEVER use 1 as a fallback if the cell has a real number — read it carefully.
- If the quantity column is genuinely empty for a line, return null (system defaults to 1).
- If the spreadsheet shows quantity 0, return 0 (do NOT change to 1).
- unit_cost and sell_price are ALWAYS per ONE unit, never the line total.
- If only a Total column exists: per_unit = total ÷ quantity.
- Cross-check: quantity × unit_cost should approximately equal the Total column. If wildly off, you've mis-read a column — re-map and try again.
- Strip £, $, commas, and spaces from numbers (e.g. "1,234.50" → 1234.50). Output raw numbers, NO thousands separators.
- Skip header rows, total/subtotal rows, VAT rows, blank rows, and section headings (e.g. "MATERIALS", "LABOUR").
- Extract EVERY line item — do not stop early. If there are 50 line items, return 50.

EXAMPLES:
- Row "Flanges, 4, £14.50, £58.00" → quantity=4, unit_cost=14.50, sell_price=14.50
- Row "Labour, 8, £750, £6000" → quantity=8, unit_cost=750, sell_price=750
- Row "Pipe 4 galv, 17, , 12.30, 209.10" → quantity=17, unit_cost=0, sell_price=12.30

ALSO EXTRACT:
- allocated_days: number of days on site / labour days. Look for "Days on site", "Allocated days", "Labour days", "Installation days", or sum the day-quantities of labour rows.

Respond with ONLY valid JSON (no markdown, no commentary):
{
  "parts": [
    {"name": "65mm Dry Riser Inlet Box", "quantity": 4, "unit_cost": 145.00, "sell_price": 195.00}
  ],
  "allocated_days": 3
}

If no days found, use null. If no parts found, use empty array.

CSV data (full sheet — read it all):
${csvText.slice(0, 40000)}`;

  const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${lovableApiKey}`,
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [{ role: "user", content: prompt }],
      max_tokens: 16000,
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
    .map((p: any) => {
      // Only default to 1 if quantity is genuinely absent (null/undefined), not if it's 0
      const rawQty = p.quantity;
      const qty = rawQty == null || rawQty === "" ? 1 : Math.max(Number(rawQty) || 0, 0);
      return {
        name: String(p.name).trim(),
        quantity: qty,
        unit_cost: Math.max(Number(p.unit_cost) || 0, 0),
        sell_price: Math.max(Number(p.sell_price) || Number(p.unit_cost) || 0, 0),
      };
    });

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
