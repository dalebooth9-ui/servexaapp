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
    // Convert to array-of-arrays so column positions are preserved exactly,
    // then render as a fixed-width table with explicit column letters (A, B, C...)
    // and 1-based row numbers. This prevents the AI from mis-aligning columns
    // when cells are blank (which CSV silently collapses).
    const aoa = XLSX.utils.sheet_to_json<any[]>(sheet, {
      header: 1,
      defval: "",
      blankrows: false,
      raw: true,
    });
    if (!aoa.length) continue;
    const maxCols = aoa.reduce((m, r) => Math.max(m, r.length), 0);
    const colLetters = Array.from({ length: maxCols }, (_, i) => {
      let n = i, s = "";
      do { s = String.fromCharCode(65 + (n % 26)) + s; n = Math.floor(n / 26) - 1; } while (n >= 0);
      return s;
    });
    const lines: string[] = [];
    lines.push(`=== Sheet: ${sheetName} (${aoa.length} rows x ${maxCols} cols) ===`);
    lines.push(`Columns: ${colLetters.join(" | ")}`);
    aoa.forEach((row, idx) => {
      const cells = colLetters.map((L, i) => {
        const v = row[i];
        const s = v == null ? "" : String(v).replace(/\s+/g, " ").trim();
        return `${L}=${s}`;
      });
      lines.push(`Row ${idx + 1}: ${cells.join(" | ")}`);
    });
    texts.push(lines.join("\n"));
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

  const prompt = `You are a precise spreadsheet data extractor for a fire protection company's costing sheet.

The data below is the FULL spreadsheet rendered with one row per line. Each cell is shown as
"<COLUMN_LETTER>=<value>" so column positions are unambiguous (blank cells included).

TASK: extract EVERY materials / parts / labour LINE ITEM with the EXACT quantity and PER-UNIT prices.

=== STEP 1 — Lock the column map (do this ONCE per sheet, then NEVER swap) ===
Find the header row (usually within the first 30 rows). Identify exactly which column letter
holds each of these meanings — write them down mentally before extracting any data:
  • DESC_COL — labelled "Description", "Item", "Material", "Part", or the leftmost text column with item names
  • QTY_COL — labelled "Qty", "Quantity", "No.", "No. Off", "Nos", "Nr", "Units", "Off"
  • CHINA_COST_COL — labelled "China", "China Cost", "China £", "China Price", "Import Cost",
    "Purchase", "Buy", "Net Cost" — the lower (purchase) per-unit price. This is our COST.
  • UK_COST_COL — labelled "UK", "UK Cost", "UK £", "UK Price", "Sell", "Sell ea", "Rate",
    "Unit Price", "Unit Sell", "Sell £" — the higher (sell) per-unit price. This is our SELL.
  • If only ONE per-unit price column exists, use it as BOTH china_cost and uk_cost.
  • TOTAL_COL — labelled "Total", "Extended", "Line Total", "Amount", "Sub Total", "Total £"

Once you have these column letters, EVERY line item MUST read its quantity from QTY_COL,
its china_cost from CHINA_COST_COL and its uk_cost from UK_COST_COL. Do NOT guess from value ranges.
The UK price is normally HIGHER than the China price — if they're reversed, you've swapped the columns.

=== STEP 2 — Per-line rules ===
- quantity = the raw number in QTY_COL for that row. Whole numbers (1, 4, 8, 17, 100…). DO NOT default to 1
  if a real number is present. Only return null if QTY_COL is genuinely empty for that row.
- If QTY_COL shows 0, return 0 (do NOT bump to 1).
- china_cost / uk_cost are ALWAYS per single unit, never the line total.
- If only TOTAL_COL exists (no per-unit column): per_unit = total ÷ quantity (apply to both).
- SANITY CHECK every line: quantity × uk_cost should be within 1% of TOTAL_COL.
  If it isn't, you have read the wrong column — re-check the column map and try again BEFORE outputting.
- Strip £, $, commas, spaces from numbers ("1,234.50" → 1234.50). No thousands separators in output.
- Skip: header rows, blank rows, section titles ("MATERIALS", "LABOUR"), subtotal/total/VAT rows,
  rows where DESC_COL is empty.
- Extract EVERY data row. If there are 50, return 50.

=== STEP 3 — Allocated days ===
Find labour days on site. Look for "Days on site", "Allocated days", "Labour days",
"Installation days", or sum the day-quantities of labour rows.

=== Output ===
Respond with ONLY valid JSON, no markdown, no commentary:
{
  "column_map": {"desc": "B", "qty": "D", "china_cost": "E", "uk_cost": "F", "total": "G"},
  "parts": [
    {"name": "65mm Dry Riser Inlet Box", "quantity": 4, "china_cost": 95.00, "uk_cost": 145.00}
  ],
  "allocated_days": 3
}

(column_map is for your own discipline — include it so you commit to one mapping.)

=== Spreadsheet data ===
${csvText.slice(0, 60000)}`;

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
      temperature: 0,
    }),
  });

  if (!aiRes.ok) {
    const errText = await aiRes.text();
    throw new Error(`AI extraction failed ${aiRes.status}: ${errText.slice(0, 200)}`);
  }

  const aiData = await aiRes.json();
  const finishReason = aiData?.choices?.[0]?.finish_reason;
  const raw = aiData?.choices?.[0]?.message?.content ?? "";
  if (finishReason && finishReason !== "stop") {
    console.warn(`AI extraction finish_reason=${finishReason} — output may be truncated`);
  }
  const cleaned = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  const parsed = JSON.parse(cleaned);

  const parts = (Array.isArray(parsed.parts) ? parsed.parts : [])
    .filter((p: any) => p?.name && typeof p.name === "string" && p.name.trim().length > 0)
    .map((p: any) => {
      // Quantity 0 must be preserved exactly. Only treat truly missing values
      // (null/undefined/"") as 0 — never default to 1, since the spreadsheet
      // explicitly shows 0 for unused line items.
      const rawQty = p.quantity;
      const qty =
        rawQty == null || rawQty === ""
          ? 0
          : Math.max(Number(rawQty) || 0, 0);
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
