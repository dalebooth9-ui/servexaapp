import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { customerCatalogue, priceSuggestions } from "../_shared/remedialPricing.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const SYSTEM = `You are a UK fire-protection estimator drafting REMEDIAL QUOTE LINES from defect records.

You will be given DEFECTS (the only facts you may use) and a PRICE BOOK (the only prices that exist).

HARD RULES:
1. Use ONLY the defect records provided. Never invent a defect, a location, a measurement, a quantity or a price.
2. NEVER write a price or a rate. You may only reference a price book item by its exact "ref". If nothing in the price book clearly covers the line, set price_ref to null.
3. Quantity: only state a number when the defect text states it (e.g. "1x padlock", "2 heads"). Otherwise use 1 and, if the true count is unknown or the defect implies "unknown quantity", add a short flag.
4. SPLIT BY LOCATION: where defects name different levels, floors, risers or rooms, write a SEPARATE line per location, e.g. "Supply & fit outlet padlock and strap — Level 2" and "... — Level 4". Do not merge locations into one line.
5. GROUP sensibly by system/area (e.g. "Dry riser — outlets", "Sprinkler — heads", "Access & investigation"). Every line belongs to exactly one group.
6. Write plain, quotable British English descriptions in the trade's voice ("Supply & fit…", "Attend site to…", "Replace…"). Keep each under about 20 words.
7. Anything ambiguous, unmeasurable or requiring a survey → still write the line, but set flag to a short note (e.g. "quantity not stated on report", "survey required to confirm extent"). Never guess.
8. Every line must cite the defect_ids it came from. Every supplied defect must appear in at least one line.
9. Investigation/return-visit defects become an attendance line, not a materials line.`;

const TOOL = {
  type: "function",
  function: {
    name: "draft_quote_lines",
    description: "Return grouped remedial quote lines built only from the supplied defects.",
    parameters: {
      type: "object",
      properties: {
        summary: { type: "string", description: "One sentence describing the scope of the draft." },
        lines: {
          type: "array",
          items: {
            type: "object",
            properties: {
              group: { type: "string", description: "Group heading, e.g. 'Dry riser — outlets'." },
              description: { type: "string", description: "Quotable line description including the location suffix where relevant." },
              quantity: { type: "number", description: "Only a count stated in the defect text, else 1." },
              price_ref: { type: ["string", "null"], description: "Exact ref of a price book item, or null when nothing matches." },
              alternative_price_ref: { type: ["string", "null"], description: "Second plausible item ref when the works could mean either item. Inlet box needs securing: Bracket or Padlocks & straps. Otherwise null." },
              flag: { type: ["string", "null"], description: "Short ambiguity note for the estimator, or null." },
              defect_ids: { type: "array", items: { type: "string" } },
            },
            required: ["group", "description", "quantity", "price_ref", "alternative_price_ref", "flag", "defect_ids"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "lines"],
      additionalProperties: false,
    },
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);
  const token = authHeader.replace("Bearer ", "");

  // Caller-scoped client: every read and write below runs under the signed-in
  // user's RLS, so org scoping is enforced by the database, not by this code.
  const db = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );

  const { data: claims, error: claimsError } = await db.auth.getClaims(token);
  if (claimsError || !claims?.claims) return json({ error: "Unauthorized" }, 401);

  try {
    const body = await req.json();
    const defectIds: string[] = Array.isArray(body?.defect_ids) ? body.defect_ids.slice(0, 40) : [];
    if (defectIds.length === 0) return json({ error: "Select at least one defect." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return json({ error: "AI is not configured." }, 500);

    // ---- 1. Load the defects (RLS-scoped) -------------------------------
    const { data: defects, error: defErr } = await db
      .from("defects")
      .select("id, title, description, severity, category, location_on_site, bs_standard_reference, site_id, job_id, quote_id, source_kind")
      .in("id", defectIds);
    if (defErr) return json({ error: defErr.message }, 400);
    if (!defects || defects.length === 0) return json({ error: "No matching defects found." }, 404);
    if (defects.some((d: any) => d.quote_id)) {
      return json({ error: "One or more of those defects is already on a quote." }, 400);
    }

    const { data: customerId, error: customerError } = await db.rpc("defect_customer_for_quote", { p_defect: defects[0].id });
    if (customerError) return json({ error: customerError.message }, 400);
    // ---- 2. Load the price book (RLS-scoped and customer-first) ----------
    const priceRows: any[] = [];
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db.from("price_book_items").select("*").eq("is_active", true).order("id").range(offset, offset+999);
      if (error) throw error;
      priceRows.push(...(data || [])); if (!data || data.length<1000) break;
    }
    const effectivePrices = customerCatalogue(priceRows, customerId);
    const [{ data: pb }, { data: parts }] = await Promise.all([
      Promise.resolve({ data: effectivePrices }),
      db.from("parts_library").select("id, name, part_number, category, sell_price").limit(400),
    ]);

    type Cat = { ref: string; label: string; unit: string; price: number; priceNeeded?: boolean };
    const catalogue: Cat[] = [
      ...(pb || []).map((p: any) => ({
        ref: `PB:${p.id}`,
        label: [p.code, p.description, p.category].filter(Boolean).join(" — "),
        unit: p.unit || "each",
        price: Number(p.unit_price) || 0,
        priceNeeded: p.price_needed,
      })),
      ...(parts || []).map((p: any) => ({
        ref: `PL:${p.id}`,
        label: [p.part_number, p.name, p.category].filter(Boolean).join(" — "),
        unit: "each",
        price: Number(p.sell_price) || 0,
      })),
    ].filter((c) => c.label.trim().length > 0);
    const catByRef = new Map(catalogue.map((c) => [c.ref, c]));

    // ---- 3. Ask the model for descriptions + groupings only -------------
    const defectBlock = defects
      .map((d: any, i: number) =>
        [
          `DEFECT ${i + 1} (id: ${d.id})`,
          `title: ${d.title}`,
          d.description ? `notes: ${d.description}` : null,
          d.location_on_site ? `location: ${d.location_on_site}` : null,
          d.category ? `system: ${d.category}` : null,
          d.severity ? `severity: ${d.severity}` : null,
          d.bs_standard_reference ? `standard: ${d.bs_standard_reference}` : null,
        ].filter(Boolean).join("\n"),
      )
      .join("\n\n");

    const priceBlock = catalogue.length
      ? catalogue.map((c) => `${c.ref} | ${c.label} | per ${c.unit}`).join("\n")
      : "(the price book is empty — set price_ref to null on every line)";

    const aiResp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3.8-flash",
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: `## DEFECTS\n${defectBlock}\n\n## PRICE BOOK (ref | item | unit — no prices shown, and you must not state any)\n${priceBlock}` },
        ],
        tools: [TOOL],
        tool_choice: { type: "function", function: { name: "draft_quote_lines" } },
        stream: false,
      }),
    });

    if (!aiResp.ok) {
      if (aiResp.status === 429) return json({ error: "The AI is busy right now. Please try again in a moment." }, 429);
      if (aiResp.status === 402) return json({ error: "AI credits have run out. Top up to keep using AI drafting." }, 402);
      console.error("gateway error", aiResp.status, await aiResp.text());
      return json({ error: "The AI could not draft this quote. Please try again." }, 502);
    }

    const payload = await aiResp.json();
    const rawArgs = payload?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
    let drafted: any = null;
    try { drafted = rawArgs ? JSON.parse(rawArgs) : null; } catch { /* handled below */ }
    if (!drafted?.lines?.length) return json({ error: "The AI returned no usable lines. Please try again." }, 502);

    // ---- 4. Validate every line against the supplied facts --------------
    const allowedIds = new Set(defects.map((d: any) => d.id));
    const lines = (drafted.lines as any[])
      .filter((l) => typeof l?.description === "string" && l.description.trim())
      .slice(0, 60)
      .map((l) => {
        const suggestions = priceSuggestions(l.description, effectivePrices);
        const refs = Array.from(new Set([l.price_ref, l.alternative_price_ref, ...suggestions.map(p => `PB:${p.id}`)].filter((ref): ref is string => typeof ref === "string" && catByRef.has(ref)))).slice(0,2);
        const cat = refs.length === 1 ? catByRef.get(refs[0]) : undefined;
        const qtyRaw = Number(l.quantity);
        const quantity = Number.isFinite(qtyRaw) && qtyRaw > 0 ? Math.min(Math.round(qtyRaw * 100) / 100, 999) : 1;
        const sources = Array.isArray(l.defect_ids) ? l.defect_ids.filter((id: string) => allowedIds.has(id)) : [];
        const group = typeof l.group === "string" ? l.group.trim() : "";
        return {
          description: group ? `${group}: ${l.description.trim()}` : l.description.trim(),
          quantity,
          // Prices NEVER come from the model — only from the price book row.
          unit_price: cat && !cat.priceNeeded ? cat.price : 0,
          price_match: refs.length > 1 ? "choice_needed" : cat && !cat.priceNeeded ? "matched" : "unmatched",
          price_book_item_id: cat?.ref.startsWith('PB:') ? cat.ref.slice(3) : null,
          price_candidates: refs.length > 1 ? refs.filter(r => r.startsWith('PB:')).map(r => r.slice(3)) : [],
          ai_flag: typeof l.flag === "string" && l.flag.trim() ? l.flag.trim() : null,
          source_defect_ids: sources,
        };
      });

    if (lines.length === 0) return json({ error: "The AI returned no usable lines. Please try again." }, 502);

    // ---- 5. Create the DRAFT quote through the existing RPC -------------
    // draft_quote_from_defects enforces admin role, single site, org scoping,
    // quote numbering and links the defects to the quote.
    const { data: quoteId, error: rpcErr } = await db.rpc("draft_quote_from_defects" as any, {
      _defect_ids: defects.map((d: any) => d.id),
    });
    if (rpcErr || !quoteId) return json({ error: rpcErr?.message || "Could not create the draft quote." }, 400);

    const { data: quote } = await db.from("invoices").select("id, org_id, tax_rate").eq("id", quoteId as string).single();

    // Replace the RPC's one-line-per-defect placeholder with the AI draft.
    await db.from("invoice_line_items").delete().eq("invoice_id", quoteId as string);
    const { error: insErr } = await db.from("invoice_line_items").insert(
      lines.map((l, idx) => ({
        invoice_id: quoteId as string,
        org_id: quote?.org_id ?? null,
        description: l.description,
        quantity: l.quantity,
        unit_price: l.unit_price,
        amount: Number((l.quantity * l.unit_price).toFixed(2)),
        sort_order: idx,
        price_match: l.price_match,
        ai_flag: l.ai_flag,
        source_defect_ids: l.source_defect_ids,
        price_book_item_id: l.price_book_item_id,
        price_candidates: l.price_candidates,
      })) as any,
    );
    if (insErr) return json({ error: insErr.message }, 400);

    const subtotal = lines.reduce((s, l) => s + l.quantity * l.unit_price, 0);
    const taxRate = Number(quote?.tax_rate) || 0;
    const taxAmount = subtotal * (taxRate / 100);
    const unpriced = lines.filter((l) => l.price_match === "unmatched").length;
    const flagged = lines.filter((l) => l.ai_flag).length;

    await db.from("invoices").update({
      subtotal: subtotal.toFixed(2),
      tax_amount: taxAmount.toFixed(2),
      total: (subtotal + taxAmount).toFixed(2),
      ai_drafted: true,
      ai_draft_notes: [
        `AI-drafted from ${defects.length} defect${defects.length === 1 ? "" : "s"} on ${new Date().toLocaleDateString("en-GB")}.`,
        unpriced ? `${unpriced} line${unpriced === 1 ? "" : "s"} had no price book match.` : "All lines matched the price book.",
        flagged ? `${flagged} line${flagged === 1 ? "" : "s"} flagged for checking.` : null,
      ].filter(Boolean).join(" "),
      notes: drafted.summary && typeof drafted.summary === "string" ? drafted.summary.trim().slice(0, 500) : null,
    } as any).eq("id", quoteId as string);
    const { error: chargesError } = await db.rpc("refresh_quote_charges", { p_quote: quoteId });
    if (chargesError) throw chargesError;

    return json({
      invoice_id: quoteId,
      line_count: lines.length,
      unpriced_count: unpriced,
      flagged_count: flagged,
    });
  } catch (e) {
    console.error("ai-draft-defect-quote error:", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});
