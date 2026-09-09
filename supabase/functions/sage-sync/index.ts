import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  defaultTaxRateId,
  getValidConnection,
  logSync,
  orgCurrency,
  SageApiError,
  sageFetch,
  sageItems,
  sagePaged,
  salesLedgerAccountId,
  serviceClient,
  type SageConnection,
  type ServiceClient,
} from "../_shared/sage.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const ACTIONS = [
  "sync_invoice",
  "import_contacts",
  "pull_invoices",
  "sync_payments",
  "sync_products",
] as const;
type Action = typeof ACTIONS[number];

const today = () => new Date().toISOString().slice(0, 10);

function addressOf(contact: any): string | null {
  const a = contact?.main_address || contact?.addresses?.[0];
  if (!a) return null;
  const parts = [a.address_line_1, a.address_line_2, a.city, a.region, a.postal_code];
  const joined = parts.filter(Boolean).join(", ");
  return joined || null;
}

/** Find a Sage customer contact by email, then name; create if absent. */
async function findOrCreateContact(
  conn: SageConnection,
  opts: { name: string; email?: string | null; address?: string | null },
): Promise<string | null> {
  if (opts.email) {
    const res = await sageFetch(
      conn,
      `/contacts?contact_type_id=CUSTOMER&email=${encodeURIComponent(opts.email)}&items_per_page=1&page=1`,
    );
    const found = sageItems(res)[0]?.id;
    if (found) return found;
  }

  const byName = await sageFetch(
    conn,
    `/contacts?contact_type_id=CUSTOMER&search=${encodeURIComponent(opts.name)}&items_per_page=20&page=1`,
  );
  const exact = sageItems(byName).find(
    (c: any) => typeof c.name === "string" && c.name.trim().toLowerCase() === opts.name.trim().toLowerCase(),
  );
  if (exact?.id) return exact.id;

  const payload: Record<string, unknown> = {
    name: opts.name,
    contact_type_ids: ["CUSTOMER"],
  };
  if (opts.email) payload.email = opts.email;
  if (opts.address) {
    payload.main_address = { address_line_1: opts.address.slice(0, 100), is_main_address: true };
  }

  const created = await sageFetch(conn, "/contacts", {
    method: "POST",
    body: { contact: payload },
  });
  return created?.id ?? null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) return json({ error: "Unauthorized" }, 401);

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return json({ error: "Unauthorized" }, 401);

  const svc: ServiceClient = serviceClient();
  const [{ data: profile }, { data: roles }] = await Promise.all([
    svc.from("profiles").select("org_id").eq("user_id", user.id).maybeSingle(),
    svc.from("user_roles").select("role").eq("user_id", user.id),
  ]);
  const orgId = (profile as any)?.org_id as string | undefined;
  const isAdmin = (roles || []).some(
    (r: any) => r.role === "admin" || r.role === "platform_admin",
  );
  if (!orgId) return json({ error: "No organisation found for this user" }, 400);
  if (!isAdmin) return json({ error: "Only organisation admins can run accounting syncs" }, 403);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const action = body?.action as Action;
  if (!ACTIONS.includes(action)) {
    return json({ error: `Invalid action. Expected one of: ${ACTIONS.join(", ")}` }, 400);
  }

  const result = await getValidConnection(svc, orgId);
  if ("error" in result) return json({ error: result.error }, 400);
  const conn = result.connection;

  try {
    // ================= SYNC INVOICE / QUOTE OUT =================
    if (action === "sync_invoice") {
      const invoiceId = body?.invoiceId;
      if (typeof invoiceId !== "string" || !invoiceId) {
        return json({ error: "invoiceId is required" }, 400);
      }

      const [invRes, itemsRes] = await Promise.all([
        svc.from("invoices").select("*").eq("id", invoiceId).eq("org_id", orgId).maybeSingle(),
        svc.from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
      ]);

      const inv: any = invRes.data;
      if (!inv) return json({ error: "Invoice not found" }, 404);
      const items: any[] = itemsRes.data || [];
      const isQuote = inv.document_type === "quote";
      const currency = await orgCurrency(svc, orgId);

      const contactId = await findOrCreateContact(conn, {
        name: inv.customer_name,
        email: inv.customer_email,
        address: inv.customer_address,
      });
      if (!contactId) throw new Error("Could not find or create the customer in Sage");

      // Ledger account and tax rate come from the business's own setup —
      // nothing is hardcoded.
      const [ledgerAccountId, taxRateId] = await Promise.all([
        salesLedgerAccountId(conn),
        defaultTaxRateId(conn),
      ]);
      if (!ledgerAccountId) {
        throw new Error(
          "No sales ledger account found in Sage. Add one in Sage, then try again.",
        );
      }

      const source = items.length
        ? items
        : [{
          description: inv.invoice_number,
          quantity: 1,
          unit_price: Number(inv.total) || 0,
        }];

      const lines = source.map((item: any) => {
        const line: Record<string, unknown> = {
          description: (item.description || inv.invoice_number || "Item").toString().slice(0, 200),
          quantity: Number(item.quantity) || 1,
          unit_price: Number(item.unit_price) || 0,
          ledger_account_id: ledgerAccountId,
        };
        if (taxRateId) line.tax_rate_id = taxRateId;
        return line;
      });

      const entity = isQuote ? "sales_quotes" : "sales_invoices";
      const wrapper = isQuote ? "sales_quote" : "sales_invoice";
      const linesKey = isQuote ? "quote_lines" : "invoice_lines";

      const payload: Record<string, unknown> = {
        contact_id: contactId,
        date: inv.issue_date || inv.created_at?.slice(0, 10) || today(),
        reference: inv.invoice_number,
        notes: inv.notes || undefined,
        currency_id: currency,
        [linesKey]: lines,
      };
      if (inv.due_date) {
        if (isQuote) payload.expiry_date = inv.due_date;
        else payload.due_date = inv.due_date;
      }

      let sageId: string | null = null;
      if (inv.sage_invoice_id) {
        const updated = await sageFetch(conn, `/${entity}/${inv.sage_invoice_id}`, {
          method: "PUT",
          body: { [wrapper]: payload },
        });
        sageId = updated?.id ?? inv.sage_invoice_id;
      } else {
        const created = await sageFetch(conn, `/${entity}`, {
          method: "POST",
          body: { [wrapper]: payload },
        });
        sageId = created?.id ?? null;
      }

      if (sageId) {
        await svc.from("invoices").update({
          sage_invoice_id: String(sageId),
          sage_synced_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      }

      await logSync(svc, {
        org_id: orgId,
        action,
        entity_type: isQuote ? "quote" : "invoice",
        entity_id: invoiceId,
      });
      return json({ success: true, sage_invoice_id: sageId ? String(sageId) : null });
    }

    // ================= IMPORT CONTACTS =================
    if (action === "import_contacts") {
      const contacts = await sagePaged(conn, "/contacts?contact_type_id=CUSTOMER");
      let imported = 0;
      let skipped = 0;

      for (const c of contacts) {
        if (!c.id) continue;
        const { data: existing } = await svc
          .from("customers")
          .select("id")
          .eq("org_id", orgId)
          .eq("sage_contact_id", String(c.id))
          .maybeSingle();
        if (existing) {
          skipped++;
          continue;
        }

        const { error: insertErr } = await svc.from("customers").insert({
          org_id: orgId,
          name: c.name || c.reference || "Unnamed customer",
          email: c.email || c.main_contact_person?.email || null,
          phone: c.telephone || c.mobile || c.main_contact_person?.telephone || null,
          address: addressOf(c),
          sage_contact_id: String(c.id),
          created_by: user.id,
        });
        if (insertErr) {
          console.error("Customer insert failed:", insertErr);
          await logSync(svc, {
            org_id: orgId,
            action,
            entity_type: "customer",
            status: "error",
            error_message: insertErr.message,
          });
        } else {
          imported++;
        }
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "customer" });
      return json({ success: true, imported, skipped, total: contacts.length });
    }

    // ================= PULL UNPAID INVOICES =================
    if (action === "pull_invoices") {
      const summaries = await sagePaged(conn, "/sales_invoices?status_id=UNPAID", { maxPages: 5 });
      let created = 0;
      let updated = 0;

      for (const summary of summaries) {
        if (!summary.id) continue;

        const { data: existing } = await svc
          .from("invoices")
          .select("id, status")
          .eq("org_id", orgId)
          .eq("sage_invoice_id", String(summary.id))
          .maybeSingle();

        const dueDate = summary.due_date || null;
        const outstanding = Number(summary.outstanding_amount ?? summary.total_amount) || 0;
        let localStatus = "sent";
        if (outstanding === 0) localStatus = "paid";
        else if (dueDate && new Date(dueDate) < new Date()) localStatus = "overdue";

        if (existing) {
          if ((existing as any).status !== localStatus) {
            const upd: Record<string, unknown> = {
              status: localStatus,
              sage_synced_at: new Date().toISOString(),
            };
            if (localStatus === "paid") upd.paid_at = new Date().toISOString();
            await svc.from("invoices").update(upd).eq("id", (existing as any).id);
            updated++;
          }
          continue;
        }

        // Summaries omit the lines, so read the full document.
        let full: any = summary;
        try {
          full = await sageFetch(conn, `/sales_invoices/${summary.id}`);
        } catch (e) {
          console.error("Failed to read Sage invoice:", summary.id, e);
        }

        const lines: any[] = full.invoice_lines || [];
        const netTotal = Number(full.net_amount) ||
          lines.reduce((s, l) => s + (Number(l.net_amount) || 0), 0);
        const taxAmount = Number(full.tax_amount) || 0;
        const total = Number(full.total_amount) || netTotal + taxAmount;

        const { data: newInv, error: insertErr } = await svc
          .from("invoices")
          .insert({
            org_id: orgId,
            invoice_number: full.displayed_as || full.reference || `SAGE-${String(full.id)}`,
            customer_name: full.contact_name || full.contact?.displayed_as || "Unknown",
            customer_email: full.contact?.email || null,
            status: localStatus,
            document_type: "invoice",
            subtotal: netTotal,
            tax_amount: taxAmount,
            tax_rate: netTotal > 0 ? Math.round((taxAmount / netTotal) * 100) : 0,
            total,
            due_date: dueDate,
            sage_invoice_id: String(full.id),
            sage_synced_at: new Date().toISOString(),
            created_by: user.id,
            notes: full.notes || null,
          })
          .select("id")
          .maybeSingle();

        if (insertErr) {
          console.error("Invoice insert failed:", insertErr);
          await logSync(svc, {
            org_id: orgId,
            action,
            entity_type: "invoice",
            status: "error",
            error_message: insertErr.message,
          });
          continue;
        }

        const lineRows = lines.map((l: any, idx: number) => ({
          invoice_id: (newInv as any).id,
          description: l.description || l.displayed_as || "",
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.unit_price) || 0,
          amount: Number(l.net_amount) || 0,
          sort_order: idx,
        }));
        if (lineRows.length) await svc.from("invoice_line_items").insert(lineRows);
        created++;
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "invoice" });
      return json({ success: true, created, updated, total: summaries.length });
    }

    // ================= SYNC PAYMENT STATUS =================
    if (action === "sync_payments") {
      const { data: invoices } = await svc
        .from("invoices")
        .select("id, sage_invoice_id, status")
        .eq("org_id", orgId)
        .not("sage_invoice_id", "is", null)
        .neq("status", "paid")
        .neq("status", "cancelled");

      const list: any[] = invoices || [];
      if (!list.length) {
        return json({ success: true, updated: 0, checked: 0, message: "No synced invoices to check" });
      }

      let updated = 0;
      for (const inv of list) {
        let sageInv: any;
        try {
          sageInv = await sageFetch(conn, `/sales_invoices/${inv.sage_invoice_id}`);
        } catch (e) {
          console.error("Failed to read Sage invoice:", inv.sage_invoice_id, e);
          continue;
        }
        if (!sageInv) continue;

        const statusId = String(sageInv.status?.id || sageInv.status_id || "").toUpperCase();
        const outstanding = Number(sageInv.outstanding_amount);

        let newStatus: string | null = null;
        if (statusId === "VOID" || sageInv.voided_at) newStatus = "cancelled";
        else if (statusId === "PAID") newStatus = "paid";
        else if (Number.isFinite(outstanding) && outstanding === 0) newStatus = "paid";

        if (newStatus && newStatus !== inv.status) {
          const updates: Record<string, unknown> = {
            status: newStatus,
            sage_synced_at: new Date().toISOString(),
          };
          if (newStatus === "paid") updates.paid_at = new Date().toISOString();
          await svc.from("invoices").update(updates).eq("id", inv.id);
          updated++;
        }
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "invoice" });
      return json({ success: true, updated, checked: list.length });
    }

    // ================= TWO-WAY PRODUCT SYNC =================
    if (action === "sync_products") {
      // --- Pull Sage products into the price book ---
      const products = await sagePaged(conn, "/products", { maxPages: 5 });
      let pulled = 0;
      let pullUpdated = 0;

      const priceOf = (p: any): number =>
        Number(p.sales_price ?? p.sales_prices?.[0]?.price ?? p.price ?? 0) || 0;

      for (const p of products) {
        if (!p.id) continue;
        const description = p.description || p.displayed_as || p.item_code || "Untitled item";
        const unitPrice = priceOf(p);

        const { data: existing } = await svc
          .from("price_book_items")
          .select("id, unit_price, description")
          .eq("org_id", orgId)
          .eq("sage_product_id", String(p.id))
          .maybeSingle();

        if (existing) {
          if (
            Number((existing as any).unit_price) !== unitPrice ||
            (existing as any).description !== description
          ) {
            await svc.from("price_book_items")
              .update({ unit_price: unitPrice, description })
              .eq("id", (existing as any).id);
            pullUpdated++;
          }
          continue;
        }

        // Adopt a matching un-linked price book row rather than duplicating it.
        if (p.item_code) {
          const { data: byCode } = await svc
            .from("price_book_items")
            .select("id")
            .eq("org_id", orgId)
            .is("sage_product_id", null)
            .eq("code", p.item_code)
            .maybeSingle();
          if (byCode) {
            await svc.from("price_book_items")
              .update({ sage_product_id: String(p.id), unit_price: unitPrice })
              .eq("id", (byCode as any).id);
            pullUpdated++;
            continue;
          }
        }

        const { error: insertErr } = await svc.from("price_book_items").insert({
          org_id: orgId,
          code: p.item_code || null,
          description,
          unit: "each",
          unit_price: unitPrice,
          sage_product_id: String(p.id),
          created_by: user.id,
        });
        if (insertErr) {
          console.error("Price book insert failed:", insertErr);
          await logSync(svc, {
            org_id: orgId,
            action,
            entity_type: "product",
            status: "error",
            error_message: insertErr.message,
          });
        } else {
          pulled++;
        }
      }

      // --- Push local price book items Sage does not have ---
      const { data: locals } = await svc
        .from("price_book_items")
        .select("id, code, description, unit_price")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .is("sage_product_id", null);

      let pushed = 0;
      const pushErrors: string[] = [];

      if ((locals || []).length) {
        const ledgerAccountId = await salesLedgerAccountId(conn);
        if (!ledgerAccountId) {
          pushErrors.push("No sales ledger account found in Sage — cannot create products.");
        } else {
          for (const local of locals as any[]) {
            const itemCode = (local.code || local.description || "").toString().slice(0, 30).trim();
            if (!itemCode) continue;
            const productPayload: Record<string, unknown> = {
              item_code: itemCode,
              description: (local.description || itemCode).toString().slice(0, 200),
              sales_ledger_account_id: ledgerAccountId,
              sales_price: Number(local.unit_price) || 0,
            };
            try {
              let created: any;
              try {
                created = await sageFetch(conn, "/products", {
                  method: "POST",
                  body: { product: productPayload },
                });
              } catch (e) {
                // Some Sage regions reject an inline price; retry without it.
                if (e instanceof SageApiError && e.status >= 400 && e.status < 500) {
                  delete productPayload.sales_price;
                  created = await sageFetch(conn, "/products", {
                    method: "POST",
                    body: { product: productPayload },
                  });
                } else {
                  throw e;
                }
              }
              const newId = created?.id;
              if (newId) {
                await svc.from("price_book_items")
                  .update({ sage_product_id: String(newId) })
                  .eq("id", local.id);
                pushed++;
              }
            } catch (e) {
              const message = e instanceof SageApiError ? e.detail.slice(0, 300) : String(e);
              console.error("Product push failed:", itemCode, message);
              pushErrors.push(`${itemCode}: ${message}`);
              await logSync(svc, {
                org_id: orgId,
                action,
                entity_type: "product",
                entity_id: local.id,
                status: "error",
                error_message: message,
              });
            }
          }
        }
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "product" });
      return json({
        success: true,
        pulled,
        pull_updated: pullUpdated,
        pushed,
        push_errors: pushErrors.slice(0, 5),
      });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err: any) {
    const message = err instanceof SageApiError
      ? `Sage rejected the request (${err.status}). ${err.detail.slice(0, 300)}`
      : err?.message || "Unexpected error";
    console.error("Sage sync error:", message);
    await logSync(svc, {
      org_id: orgId,
      action,
      status: "error",
      error_message: message,
    });
    const status = err instanceof SageApiError ? (err.status === 429 ? 429 : 502) : 500;
    return json({ error: message }, status);
  }
});
