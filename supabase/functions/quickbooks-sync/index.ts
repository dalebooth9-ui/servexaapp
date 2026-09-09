import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  getValidConnection,
  logSync,
  orgCurrency,
  qbEscape,
  qbFetch,
  qbQueryPath,
  QbApiError,
  serviceClient,
  type QbConnection,
  type ServiceClient,
} from "../_shared/quickbooks.ts";

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

/** Find an existing QuickBooks customer by email, then name; create if absent. */
async function findOrCreateCustomer(
  conn: QbConnection,
  opts: { name: string; email?: string | null; address?: string | null },
): Promise<string | null> {
  if (opts.email) {
    const res = await qbFetch(
      conn,
      qbQueryPath(
        `SELECT Id FROM Customer WHERE PrimaryEmailAddr = '${qbEscape(opts.email)}' MAXRESULTS 1`,
      ),
    );
    const found = res?.QueryResponse?.Customer?.[0]?.Id;
    if (found) return found;
  }

  const byName = await qbFetch(
    conn,
    qbQueryPath(
      `SELECT Id FROM Customer WHERE DisplayName = '${qbEscape(opts.name)}' MAXRESULTS 1`,
    ),
  );
  const nameMatch = byName?.QueryResponse?.Customer?.[0]?.Id;
  if (nameMatch) return nameMatch;

  const payload: Record<string, unknown> = { DisplayName: opts.name };
  if (opts.email) payload.PrimaryEmailAddr = { Address: opts.email };
  if (opts.address) payload.BillAddr = { Line1: opts.address };

  const created = await qbFetch(conn, "/customer?minorversion=70", {
    method: "POST",
    body: payload,
  });
  return created?.Customer?.Id ?? null;
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

      const customerRef = await findOrCreateCustomer(conn, {
        name: inv.customer_name,
        email: inv.customer_email,
        address: inv.customer_address,
      });
      if (!customerRef) throw new Error("Could not find or create the customer in QuickBooks");

      // No account codes are set — QuickBooks applies the company defaults.
      const lines = items.map((item) => ({
        DetailType: "SalesItemLineDetail",
        Description: item.description || "",
        Amount: Number(item.amount ?? Number(item.quantity) * Number(item.unit_price)) || 0,
        SalesItemLineDetail: {
          Qty: Number(item.quantity) || 1,
          UnitPrice: Number(item.unit_price) || 0,
        },
      }));
      if (!lines.length) {
        lines.push({
          DetailType: "SalesItemLineDetail",
          Description: inv.invoice_number,
          Amount: Number(inv.total) || 0,
          SalesItemLineDetail: { Qty: 1, UnitPrice: Number(inv.total) || 0 },
        });
      }

      const payload: Record<string, unknown> = {
        CustomerRef: { value: customerRef },
        Line: lines,
        CurrencyRef: { value: currency },
        DocNumber: inv.invoice_number,
        PrivateNote: inv.notes || undefined,
      };
      if (inv.due_date) {
        if (isQuote) payload.ExpirationDate = inv.due_date;
        else payload.DueDate = inv.due_date;
      }

      const entity = isQuote ? "estimate" : "invoice";
      if (inv.quickbooks_invoice_id) {
        // Sparse update keeps QuickBooks-side fields we do not manage.
        payload.Id = inv.quickbooks_invoice_id;
        payload.sparse = true;
        const existing = await qbFetch(
          conn,
          `/${entity}/${inv.quickbooks_invoice_id}?minorversion=70`,
        );
        const syncToken = existing?.[isQuote ? "Estimate" : "Invoice"]?.SyncToken;
        if (syncToken !== undefined) payload.SyncToken = syncToken;
      }

      const res = await qbFetch(conn, `/${entity}?minorversion=70`, {
        method: "POST",
        body: payload,
      });
      const qbId = res?.[isQuote ? "Estimate" : "Invoice"]?.Id ?? null;

      if (qbId) {
        await svc.from("invoices").update({
          quickbooks_invoice_id: String(qbId),
          quickbooks_synced_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      }

      await logSync(svc, {
        org_id: orgId,
        action,
        entity_type: isQuote ? "quote" : "invoice",
        entity_id: invoiceId,
      });
      return json({ success: true, quickbooks_invoice_id: qbId ? String(qbId) : null });
    }

    // ================= IMPORT CONTACTS =================
    if (action === "import_contacts") {
      let start = 1;
      const pageSize = 100;
      let imported = 0;
      let skipped = 0;
      let total = 0;

      for (;;) {
        const res = await qbFetch(
          conn,
          qbQueryPath(
            `SELECT * FROM Customer WHERE Active = true STARTPOSITION ${start} MAXRESULTS ${pageSize}`,
          ),
        );
        const page: any[] = res?.QueryResponse?.Customer || [];
        if (!page.length) break;
        total += page.length;

        for (const c of page) {
          const { data: existing } = await svc
            .from("customers")
            .select("id")
            .eq("org_id", orgId)
            .eq("quickbooks_contact_id", String(c.Id))
            .maybeSingle();
          if (existing) {
            skipped++;
            continue;
          }

          const addr = c.BillAddr || c.ShipAddr;
          const addressStr = addr
            ? [addr.Line1, addr.Line2, addr.City, addr.CountrySubDivisionCode, addr.PostalCode]
              .filter(Boolean).join(", ")
            : null;

          const { error: insertErr } = await svc.from("customers").insert({
            org_id: orgId,
            name: c.DisplayName || c.CompanyName || "Unnamed customer",
            email: c.PrimaryEmailAddr?.Address || null,
            phone: c.PrimaryPhone?.FreeFormNumber || c.Mobile?.FreeFormNumber || null,
            address: addressStr,
            quickbooks_contact_id: String(c.Id),
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

        if (page.length < pageSize) break;
        start += pageSize;
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "customer" });
      return json({ success: true, imported, skipped, total });
    }

    // ================= PULL UNPAID INVOICES =================
    if (action === "pull_invoices") {
      const res = await qbFetch(
        conn,
        qbQueryPath("SELECT * FROM Invoice WHERE Balance > '0' MAXRESULTS 200"),
      );
      const qbInvoices: any[] = res?.QueryResponse?.Invoice || [];
      let created = 0;
      let updated = 0;

      for (const qi of qbInvoices) {
        if (!qi.Id) continue;
        const balance = Number(qi.Balance) || 0;
        const dueDate = qi.DueDate || null;
        let localStatus = "sent";
        if (balance === 0) localStatus = "paid";
        else if (dueDate && new Date(dueDate) < new Date()) localStatus = "overdue";

        const { data: existing } = await svc
          .from("invoices")
          .select("id, status")
          .eq("org_id", orgId)
          .eq("quickbooks_invoice_id", String(qi.Id))
          .maybeSingle();

        if (existing) {
          if ((existing as any).status !== localStatus) {
            const upd: Record<string, unknown> = {
              status: localStatus,
              quickbooks_synced_at: new Date().toISOString(),
            };
            if (localStatus === "paid") upd.paid_at = new Date().toISOString();
            await svc.from("invoices").update(upd).eq("id", (existing as any).id);
            updated++;
          }
          continue;
        }

        const subtotal = (qi.Line || [])
          .filter((l: any) => l.DetailType === "SalesItemLineDetail")
          .reduce((sum: number, l: any) => sum + (Number(l.Amount) || 0), 0);
        const total = Number(qi.TotalAmt) || 0;
        const taxAmount = Number(qi.TxnTaxDetail?.TotalTax) || Math.max(0, total - subtotal);

        const { data: newInv, error: insertErr } = await svc
          .from("invoices")
          .insert({
            org_id: orgId,
            invoice_number: qi.DocNumber || `QB-${String(qi.Id)}`,
            customer_name: qi.CustomerRef?.name || "Unknown",
            customer_email: qi.BillEmail?.Address || null,
            status: localStatus,
            document_type: "invoice",
            subtotal,
            tax_amount: taxAmount,
            tax_rate: subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 0,
            total,
            due_date: dueDate,
            quickbooks_invoice_id: String(qi.Id),
            quickbooks_synced_at: new Date().toISOString(),
            created_by: user.id,
            notes: qi.PrivateNote || null,
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

        const lineRows = (qi.Line || [])
          .filter((l: any) => l.DetailType === "SalesItemLineDetail")
          .map((l: any, idx: number) => ({
            invoice_id: (newInv as any).id,
            description: l.Description || l.SalesItemLineDetail?.ItemRef?.name || "",
            quantity: Number(l.SalesItemLineDetail?.Qty) || 1,
            unit_price: Number(l.SalesItemLineDetail?.UnitPrice) || 0,
            amount: Number(l.Amount) || 0,
            sort_order: idx,
          }));
        if (lineRows.length) await svc.from("invoice_line_items").insert(lineRows);
        created++;
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "invoice" });
      return json({ success: true, created, updated, total: qbInvoices.length });
    }

    // ================= SYNC PAYMENT STATUS =================
    if (action === "sync_payments") {
      const { data: invoices } = await svc
        .from("invoices")
        .select("id, quickbooks_invoice_id, status")
        .eq("org_id", orgId)
        .not("quickbooks_invoice_id", "is", null)
        .neq("status", "paid")
        .neq("status", "cancelled");

      const list: any[] = invoices || [];
      if (!list.length) {
        return json({ success: true, updated: 0, checked: 0, message: "No synced invoices to check" });
      }

      let updated = 0;
      for (const inv of list) {
        let qbInv: any;
        try {
          const res = await qbFetch(conn, `/invoice/${inv.quickbooks_invoice_id}?minorversion=70`);
          qbInv = res?.Invoice;
        } catch (e) {
          console.error("Failed to read QuickBooks invoice:", inv.quickbooks_invoice_id, e);
          continue;
        }
        if (!qbInv) continue;

        const balance = Number(qbInv.Balance);
        const voided = Number(qbInv.TotalAmt) === 0 &&
          typeof qbInv.PrivateNote === "string" &&
          qbInv.PrivateNote.toLowerCase().includes("voided");

        let newStatus: string | null = null;
        if (voided) newStatus = "cancelled";
        else if (Number.isFinite(balance) && balance === 0) newStatus = "paid";

        if (newStatus && newStatus !== inv.status) {
          const updates: Record<string, unknown> = {
            status: newStatus,
            quickbooks_synced_at: new Date().toISOString(),
          };
          if (newStatus === "paid") updates.paid_at = new Date().toISOString();
          await svc.from("invoices").update(updates).eq("id", inv.id);
          updated++;
        }
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "invoice" });
      return json({ success: true, updated, checked: list.length });
    }

    // ================= TWO-WAY PRODUCT / SERVICE SYNC =================
    if (action === "sync_products") {
      // --- Pull QuickBooks items into the price book ---
      const res = await qbFetch(
        conn,
        qbQueryPath("SELECT * FROM Item WHERE Active = true MAXRESULTS 500"),
      );
      const qbItems: any[] = res?.QueryResponse?.Item || [];
      let pulled = 0;
      let pullUpdated = 0;

      for (const item of qbItems) {
        if (!item.Id) continue;
        const { data: existing } = await svc
          .from("price_book_items")
          .select("id, unit_price, description")
          .eq("org_id", orgId)
          .eq("quickbooks_item_id", String(item.Id))
          .maybeSingle();

        const unitPrice = Number(item.UnitPrice) || 0;
        const description = item.Description || item.Name || "Untitled item";

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
        const { data: byCode } = await svc
          .from("price_book_items")
          .select("id")
          .eq("org_id", orgId)
          .is("quickbooks_item_id", null)
          .eq("code", item.Name || "")
          .maybeSingle();

        if (byCode) {
          await svc.from("price_book_items")
            .update({ quickbooks_item_id: String(item.Id), unit_price: unitPrice })
            .eq("id", (byCode as any).id);
          pullUpdated++;
          continue;
        }

        const { error: insertErr } = await svc.from("price_book_items").insert({
          org_id: orgId,
          code: item.Name || null,
          description,
          unit: "each",
          unit_price: unitPrice,
          quickbooks_item_id: String(item.Id),
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

      // --- Push local price book items that QuickBooks does not have ---
      const { data: locals } = await svc
        .from("price_book_items")
        .select("id, code, description, unit_price")
        .eq("org_id", orgId)
        .eq("is_active", true)
        .is("quickbooks_item_id", null);

      let pushed = 0;
      const pushErrors: string[] = [];

      if ((locals || []).length) {
        // Service items need an income account; use the company's own rather
        // than a hardcoded code.
        let incomeAccountId: string | null = null;
        try {
          const accRes = await qbFetch(
            conn,
            qbQueryPath("SELECT Id FROM Account WHERE AccountType = 'Income' MAXRESULTS 1"),
          );
          incomeAccountId = accRes?.QueryResponse?.Account?.[0]?.Id ?? null;
        } catch (e) {
          console.error("Income account lookup failed:", e);
        }

        if (!incomeAccountId) {
          pushErrors.push("No income account found in QuickBooks — cannot create items.");
        } else {
          for (const local of locals as any[]) {
            const name = (local.code || local.description || "").toString().slice(0, 100).trim();
            if (!name) continue;
            try {
              const createRes = await qbFetch(conn, "/item?minorversion=70", {
                method: "POST",
                body: {
                  Name: name,
                  Description: local.description || undefined,
                  Type: "Service",
                  UnitPrice: Number(local.unit_price) || 0,
                  IncomeAccountRef: { value: incomeAccountId },
                },
              });
              const newId = createRes?.Item?.Id;
              if (newId) {
                await svc.from("price_book_items")
                  .update({ quickbooks_item_id: String(newId) })
                  .eq("id", local.id);
                pushed++;
              }
            } catch (e) {
              const message = e instanceof QbApiError ? e.detail.slice(0, 300) : String(e);
              console.error("Item push failed:", name, message);
              pushErrors.push(`${name}: ${message}`);
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
    const message = err instanceof QbApiError
      ? `QuickBooks rejected the request (${err.status}). ${err.detail.slice(0, 300)}`
      : err?.message || "Unexpected error";
    console.error("QuickBooks sync error:", message);
    await logSync(svc, {
      org_id: orgId,
      action,
      status: "error",
      error_message: message,
    });
    const status = err instanceof QbApiError ? (err.status === 429 ? 429 : 502) : 500;
    return json({ error: message }, status);
  }
});
