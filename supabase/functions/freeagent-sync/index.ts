import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  faFetch,
  faPaged,
  FREEAGENT_API_BASE,
  FreeAgentApiError,
  getValidConnection,
  idFromUrl,
  logSync,
  orgCurrency,
  serviceClient,
  type FreeAgentConnection,
  type ServiceClient,
} from "../_shared/freeagent.ts";

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

const invoiceUrl = (id: string) => `${FREEAGENT_API_BASE}/invoices/${id}`;

/** Days between issue and due date, which is how FreeAgent stores terms. */
function paymentTermsInDays(issue: string | null, due: string | null): number {
  if (!issue || !due) return 30;
  const diff = Math.round(
    (new Date(due).getTime() - new Date(issue).getTime()) / 86_400_000,
  );
  return Number.isFinite(diff) && diff >= 0 ? diff : 30;
}

function contactName(c: any): string {
  const person = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return c.organisation_name || person || c.email || "Unnamed customer";
}

function contactAddress(c: any): string | null {
  const parts = [c.address1, c.address2, c.address3, c.town, c.region, c.postcode];
  const joined = parts.filter(Boolean).join(", ");
  return joined || null;
}

/** Find a FreeAgent contact by email, then by name; create if absent. */
async function findOrCreateContact(
  conn: FreeAgentConnection,
  opts: { name: string; email?: string | null; address?: string | null },
): Promise<string | null> {
  if (opts.email) {
    const res = await faFetch(
      conn,
      `/contacts?view=all&per_page=100&page=1`,
    );
    const wanted = opts.email.trim().toLowerCase();
    const hit = (res?.contacts || []).find(
      (c: any) => typeof c.email === "string" && c.email.trim().toLowerCase() === wanted,
    );
    if (hit?.url) return hit.url;
  }

  const byName = await faFetch(conn, `/contacts?view=all&per_page=100&page=1`);
  const target = opts.name.trim().toLowerCase();
  const exact = (byName?.contacts || []).find(
    (c: any) => contactName(c).trim().toLowerCase() === target,
  );
  if (exact?.url) return exact.url;

  const payload: Record<string, unknown> = {
    organisation_name: opts.name.slice(0, 255),
  };
  if (opts.email) payload.email = opts.email;
  if (opts.address) payload.address1 = opts.address.slice(0, 100);

  const created = await faFetch(conn, "/contacts", {
    method: "POST",
    body: { contact: payload },
  });
  return created?.contact?.url ?? null;
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

  // FreeAgent has no products/items API, so there is nothing to sync.
  if (action === "sync_products") {
    return json({
      success: false,
      unsupported: true,
      message: "FreeAgent does not support product sync",
    });
  }

  const result = await getValidConnection(svc, orgId);
  if ("error" in result) return json({ error: result.error }, 400);
  const conn = result.connection;

  try {
    // ================= SYNC INVOICE / ESTIMATE OUT =================
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

      const contactUrl = await findOrCreateContact(conn, {
        name: inv.customer_name,
        email: inv.customer_email,
        address: inv.customer_address,
      });
      if (!contactUrl) throw new Error("Could not find or create the customer in FreeAgent");

      const source = items.length
        ? items
        : [{
          description: inv.invoice_number,
          quantity: 1,
          unit_price: Number(inv.total) || 0,
        }];

      const lines = source.map((item: any) => ({
        description: (item.description || inv.invoice_number || "Item").toString().slice(0, 500),
        item_type: "Products",
        quantity: Number(item.quantity) || 1,
        price: Number(item.unit_price) || 0,
        sales_tax_rate: Number(inv.tax_rate) || 0,
      }));

      const datedOn = inv.issue_date || inv.created_at?.slice(0, 10) || today();

      const payload: Record<string, unknown> = {
        contact: contactUrl,
        dated_on: datedOn,
        reference: inv.invoice_number,
        currency,
        comments: inv.notes || undefined,
      };

      let entity: string;
      let wrapper: string;
      if (isQuote) {
        entity = "estimates";
        wrapper = "estimate";
        payload.estimate_type = "Quote";
        payload.estimate_items = lines;
      } else {
        entity = "invoices";
        wrapper = "invoice";
        payload.payment_terms_in_days = paymentTermsInDays(datedOn, inv.due_date);
        payload.invoice_items = lines;
      }

      let faId: string | null = null;
      if (inv.freeagent_invoice_id) {
        await faFetch(conn, `/${entity}/${inv.freeagent_invoice_id}`, {
          method: "PUT",
          body: { [wrapper]: payload },
        });
        faId = String(inv.freeagent_invoice_id);
      } else {
        const created = await faFetch(conn, `/${entity}`, {
          method: "POST",
          body: { [wrapper]: payload },
        });
        faId = idFromUrl(created?.[wrapper]?.url);
      }

      if (faId) {
        await svc.from("invoices").update({
          freeagent_invoice_id: faId,
          freeagent_synced_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      }

      await logSync(svc, {
        org_id: orgId,
        action,
        entity_type: isQuote ? "quote" : "invoice",
        entity_id: invoiceId,
      });
      return json({ success: true, freeagent_invoice_id: faId });
    }

    // ================= IMPORT CONTACTS =================
    if (action === "import_contacts") {
      const contacts = await faPaged(conn, "/contacts?view=active", "contacts");
      let imported = 0;
      let skipped = 0;

      for (const c of contacts) {
        const faId = idFromUrl(c.url);
        if (!faId) continue;

        const { data: existing } = await svc
          .from("customers")
          .select("id")
          .eq("org_id", orgId)
          .eq("freeagent_contact_id", faId)
          .maybeSingle();
        if (existing) {
          skipped++;
          continue;
        }

        const { error: insertErr } = await svc.from("customers").insert({
          org_id: orgId,
          name: contactName(c),
          email: c.email || null,
          phone: c.phone_number || c.mobile || null,
          address: contactAddress(c),
          freeagent_contact_id: faId,
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

    // ================= PULL UNPAID (OPEN) INVOICES =================
    if (action === "pull_invoices") {
      const remote = await faPaged(
        conn,
        "/invoices?view=open&nested_invoice_items=true",
        "invoices",
        { maxPages: 5 },
      );
      let created = 0;
      let updated = 0;

      for (const full of remote) {
        const faId = idFromUrl(full.url);
        if (!faId) continue;

        const dueDate = full.due_on || null;
        const status = String(full.status || "").toLowerCase();
        let localStatus = "sent";
        if (status === "paid") localStatus = "paid";
        else if (status === "overdue") localStatus = "overdue";
        else if (dueDate && new Date(dueDate) < new Date()) localStatus = "overdue";
        else if (status === "draft") localStatus = "draft";

        const { data: existing } = await svc
          .from("invoices")
          .select("id, status")
          .eq("org_id", orgId)
          .eq("freeagent_invoice_id", faId)
          .maybeSingle();

        if (existing) {
          if ((existing as any).status !== localStatus) {
            const upd: Record<string, unknown> = {
              status: localStatus,
              freeagent_synced_at: new Date().toISOString(),
            };
            if (localStatus === "paid") upd.paid_at = new Date().toISOString();
            await svc.from("invoices").update(upd).eq("id", (existing as any).id);
            updated++;
          }
          continue;
        }

        const lines: any[] = full.invoice_items || [];
        const netTotal = Number(full.net_value) ||
          lines.reduce((s, l) => s + (Number(l.quantity) || 1) * (Number(l.price) || 0), 0);
        const taxAmount = Number(full.sales_tax_value) || 0;
        const total = Number(full.total_value) || netTotal + taxAmount;

        // Contact name is a URL reference on the summary; fetch it when needed.
        let customerName = full.contact_name || "Unknown";
        let customerEmail: string | null = null;
        if (full.contact) {
          try {
            const c = await faFetch(conn, full.contact);
            if (c?.contact) {
              customerName = contactName(c.contact);
              customerEmail = c.contact.email || null;
            }
          } catch (e) {
            console.error("Failed to read FreeAgent contact:", full.contact, e);
          }
        }

        const { data: newInv, error: insertErr } = await svc
          .from("invoices")
          .insert({
            org_id: orgId,
            invoice_number: full.reference || `FA-${faId}`,
            customer_name: customerName,
            customer_email: customerEmail,
            status: localStatus,
            document_type: "invoice",
            subtotal: netTotal,
            tax_amount: taxAmount,
            tax_rate: netTotal > 0 ? Math.round((taxAmount / netTotal) * 100) : 0,
            total,
            due_date: dueDate,
            freeagent_invoice_id: faId,
            freeagent_synced_at: new Date().toISOString(),
            created_by: user.id,
            notes: full.comments || null,
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
          description: l.description || l.item_type || "",
          quantity: Number(l.quantity) || 1,
          unit_price: Number(l.price) || 0,
          amount: (Number(l.quantity) || 1) * (Number(l.price) || 0),
          sort_order: idx,
        }));
        if (lineRows.length) await svc.from("invoice_line_items").insert(lineRows);
        created++;
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "invoice" });
      return json({ success: true, created, updated, total: remote.length });
    }

    // ================= SYNC PAYMENT STATUS =================
    if (action === "sync_payments") {
      const { data: invoices } = await svc
        .from("invoices")
        .select("id, freeagent_invoice_id, status")
        .eq("org_id", orgId)
        .not("freeagent_invoice_id", "is", null)
        .neq("status", "paid")
        .neq("status", "cancelled");

      const list: any[] = invoices || [];
      if (!list.length) {
        return json({
          success: true,
          updated: 0,
          checked: 0,
          message: "No synced invoices to check",
        });
      }

      let updated = 0;
      for (const inv of list) {
        let remote: any;
        try {
          remote = await faFetch(conn, invoiceUrl(inv.freeagent_invoice_id));
        } catch (e) {
          console.error("Failed to read FreeAgent invoice:", inv.freeagent_invoice_id, e);
          continue;
        }
        const doc = remote?.invoice;
        if (!doc) continue;

        // FreeAgent marks an invoice Paid once a bank transaction is explained
        // against it; Draft/Open/Sent/Overdue all mean still outstanding.
        const status = String(doc.status || "").toLowerCase();
        const dueValue = Number(doc.due_value);

        let newStatus: string | null = null;
        if (status === "paid") newStatus = "paid";
        else if (Number.isFinite(dueValue) && dueValue === 0 && status !== "draft") {
          newStatus = "paid";
        } else if (status === "overdue") newStatus = "overdue";

        if (newStatus && newStatus !== inv.status) {
          const updates: Record<string, unknown> = {
            status: newStatus,
            freeagent_synced_at: new Date().toISOString(),
          };
          if (newStatus === "paid") updates.paid_at = new Date().toISOString();
          await svc.from("invoices").update(updates).eq("id", inv.id);
          updated++;
        }
      }

      await logSync(svc, { org_id: orgId, action, entity_type: "invoice" });
      return json({ success: true, updated, checked: list.length });
    }

    return json({ error: "Invalid action" }, 400);
  } catch (err: any) {
    const message = err instanceof FreeAgentApiError
      ? `FreeAgent rejected the request (${err.status}). ${err.detail.slice(0, 300)}`
      : err?.message || "Unexpected error";
    console.error("FreeAgent sync error:", message);
    await logSync(svc, {
      org_id: orgId,
      action,
      status: "error",
      error_message: message,
    });
    const status = err instanceof FreeAgentApiError ? (err.status === 429 ? 429 : 502) : 500;
    return json({ error: message }, status);
  }
});
