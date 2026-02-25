import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const XERO_API_URL = "https://api.xero.com/api.xro/2.0";
const XERO_TOKEN_URL = "https://identity.xero.com/connect/token";

async function getValidToken(supabase: any, userId: string): Promise<{ accessToken: string; tenantId: string } | null> {
  const { data: conn } = await supabase
    .from("xero_connections")
    .select("*")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!conn) return null;

  // Check if token is expired, refresh if needed
  if (new Date(conn.token_expires_at) < new Date()) {
    const XERO_CLIENT_ID = Deno.env.get("XERO_CLIENT_ID")!;
    const XERO_CLIENT_SECRET = Deno.env.get("XERO_CLIENT_SECRET")!;

    const refreshRes = await fetch(XERO_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${XERO_CLIENT_ID}:${XERO_CLIENT_SECRET}`)}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: conn.refresh_token,
      }),
    });

    if (!refreshRes.ok) {
      console.error("Token refresh failed:", await refreshRes.text());
      // Delete stale connection
      await supabase.from("xero_connections").delete().eq("id", conn.id);
      return null;
    }

    const tokens = await refreshRes.json();
    const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

    await supabase.from("xero_connections").update({
      access_token: tokens.access_token,
      refresh_token: tokens.refresh_token,
      token_expires_at: expiresAt,
    }).eq("id", conn.id);

    return { accessToken: tokens.access_token, tenantId: conn.tenant_id };
  }

  return { accessToken: conn.access_token, tenantId: conn.tenant_id };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const tokenData = await getValidToken(serviceClient, user.id);
  if (!tokenData) {
    return new Response(JSON.stringify({ error: "Xero not connected. Please connect Xero first." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { accessToken, tenantId } = tokenData;
  const body = await req.json();
  const action = body.action;

  const xeroHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "xero-tenant-id": tenantId,
    "Content-Type": "application/json",
    Accept: "application/json",
  };

  try {
    // ========== SYNC INVOICE OR QUOTE TO XERO ==========
    if (action === "sync_invoice") {
      const { invoiceId } = body;

      // Get invoice + line items
      const [invRes, itemsRes] = await Promise.all([
        serviceClient.from("invoices").select("*").eq("id", invoiceId).single(),
        serviceClient.from("invoice_line_items").select("*").eq("invoice_id", invoiceId).order("sort_order"),
      ]);

      if (!invRes.data) {
        return new Response(JSON.stringify({ error: "Invoice not found" }), {
          status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const inv = invRes.data;
      const items = itemsRes.data || [];
      const isQuote = inv.document_type === "quote";

      // Find or create Xero contact
      let contactId: string | null = null;
      if (inv.customer_email) {
        const searchRes = await fetch(`${XERO_API_URL}/Contacts?where=EmailAddress="${inv.customer_email}"`, {
          headers: xeroHeaders,
        });
        const searchData = await searchRes.json();
        if (searchData.Contacts?.length) {
          contactId = searchData.Contacts[0].ContactID;
        }
      }

      if (!contactId) {
        const createRes = await fetch(`${XERO_API_URL}/Contacts`, {
          method: "POST",
          headers: xeroHeaders,
          body: JSON.stringify({
            Contacts: [{
              Name: inv.customer_name,
              EmailAddress: inv.customer_email || undefined,
              Addresses: inv.customer_address ? [{ AddressType: "STREET", AddressLine1: inv.customer_address }] : [],
            }],
          }),
        });
        const createData = await createRes.json();
        contactId = createData.Contacts?.[0]?.ContactID;
      }

      const lineItemsPayload = items.map((item: any) => ({
        Description: item.description,
        Quantity: Number(item.quantity),
        UnitAmount: Number(item.unit_price),
        AccountCode: "200",
      }));

      let xeroRes: Response;
      let xeroResultId: string | null = null;

      if (isQuote) {
        // ---- XERO QUOTES API ----
        const quoteStatusMap: Record<string, string> = {
          draft: "DRAFT",
          sent: "SENT",
          accepted: "ACCEPTED",
          declined: "DECLINED",
        };

        const xeroQuote: any = {
          Contact: { ContactID: contactId },
          LineItems: lineItemsPayload,
          QuoteNumber: inv.invoice_number,
          Reference: inv.invoice_number,
          Status: quoteStatusMap[inv.status] || "DRAFT",
          CurrencyCode: "GBP",
          Title: inv.invoice_number,
          Summary: inv.notes || "",
        };

        if (inv.due_date) {
          xeroQuote.ExpiryDate = inv.due_date;
        }

        if (inv.xero_invoice_id) {
          xeroQuote.QuoteID = inv.xero_invoice_id;
          xeroRes = await fetch(`${XERO_API_URL}/Quotes/${inv.xero_invoice_id}`, {
            method: "POST",
            headers: xeroHeaders,
            body: JSON.stringify({ Quotes: [xeroQuote] }),
          });
        } else {
          xeroRes = await fetch(`${XERO_API_URL}/Quotes`, {
            method: "POST",
            headers: xeroHeaders,
            body: JSON.stringify({ Quotes: [xeroQuote] }),
          });
        }

        if (!xeroRes.ok) {
          const errText = await xeroRes.text();
          console.error("Xero quote sync failed:", errText);
          return new Response(JSON.stringify({ error: "Failed to sync quote to Xero", details: errText }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const xeroData = await xeroRes.json();
        xeroResultId = xeroData.Quotes?.[0]?.QuoteID;
      } else {
        // ---- XERO INVOICES API ----
        const statusMap: Record<string, string> = {
          draft: "DRAFT",
          sent: "AUTHORISED",
          paid: "AUTHORISED",
          overdue: "AUTHORISED",
          cancelled: "VOIDED",
        };

        const xeroInvoice: any = {
          Type: "ACCREC",
          Contact: { ContactID: contactId },
          LineItems: lineItemsPayload,
          Status: statusMap[inv.status] || "DRAFT",
          InvoiceNumber: inv.invoice_number,
          Reference: inv.invoice_number,
          CurrencyCode: "GBP",
        };

        if (inv.due_date) {
          xeroInvoice.DueDate = inv.due_date;
        }

        if (inv.xero_invoice_id) {
          xeroInvoice.InvoiceID = inv.xero_invoice_id;
          xeroRes = await fetch(`${XERO_API_URL}/Invoices/${inv.xero_invoice_id}`, {
            method: "POST",
            headers: xeroHeaders,
            body: JSON.stringify({ Invoices: [xeroInvoice] }),
          });
        } else {
          xeroRes = await fetch(`${XERO_API_URL}/Invoices`, {
            method: "POST",
            headers: xeroHeaders,
            body: JSON.stringify({ Invoices: [xeroInvoice] }),
          });
        }

        if (!xeroRes.ok) {
          const errText = await xeroRes.text();
          console.error("Xero invoice sync failed:", errText);
          return new Response(JSON.stringify({ error: "Failed to sync invoice to Xero", details: errText }), {
            status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }

        const xeroData = await xeroRes.json();
        xeroResultId = xeroData.Invoices?.[0]?.InvoiceID;
      }

      // Update local record with Xero ID
      if (xeroResultId) {
        await serviceClient.from("invoices").update({
          xero_invoice_id: xeroResultId,
          xero_synced_at: new Date().toISOString(),
        }).eq("id", invoiceId);
      }

      return new Response(JSON.stringify({ success: true, xero_invoice_id: xeroResultId }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== IMPORT CONTACTS FROM XERO ==========
    if (action === "import_contacts") {
      const contactsRes = await fetch(`${XERO_API_URL}/Contacts?where=IsCustomer=true`, {
        headers: xeroHeaders,
      });

      if (!contactsRes.ok) {
        return new Response(JSON.stringify({ error: "Failed to fetch Xero contacts" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const contactsData = await contactsRes.json();
      const contacts = contactsData.Contacts || [];
      let imported = 0;
      let skipped = 0;

      for (const contact of contacts) {
        // Check if already imported
        const { data: existing } = await serviceClient
          .from("customers")
          .select("id")
          .eq("xero_contact_id", contact.ContactID)
          .maybeSingle();

        if (existing) {
          skipped++;
          continue;
        }

        const email = contact.EmailAddress || null;
        const phone = contact.Phones?.find((p: any) => p.PhoneType === "DEFAULT")?.PhoneNumber || null;
        const address = contact.Addresses?.find((a: any) => a.AddressType === "STREET");
        const addressStr = address
          ? [address.AddressLine1, address.AddressLine2, address.City, address.Region, address.PostalCode]
              .filter(Boolean).join(", ")
          : null;

        await serviceClient.from("customers").insert({
          name: contact.Name,
          email,
          phone,
          address: addressStr,
          xero_contact_id: contact.ContactID,
          created_by: user.id,
        });
        imported++;
      }

      return new Response(JSON.stringify({ success: true, imported, skipped, total: contacts.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== PULL UNPAID INVOICES FROM XERO ==========
    if (action === "pull_invoices") {
      // Fetch all AUTHORISED (unpaid) invoices from Xero
      const xeroRes = await fetch(
        `${XERO_API_URL}/Invoices?Statuses=AUTHORISED,SUBMITTED&Type=ACCREC`,
        { headers: xeroHeaders }
      );

      if (!xeroRes.ok) {
        const errText = await xeroRes.text();
        console.error("Failed to fetch Xero invoices:", errText);
        return new Response(JSON.stringify({ error: "Failed to fetch invoices from Xero" }), {
          status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const xeroData = await xeroRes.json();
      const xeroInvoices = xeroData.Invoices || [];

      let created = 0;
      let updated = 0;

      for (const xi of xeroInvoices) {
        if (!xi.InvoiceID) continue;

        // Map Xero status to local status
        let localStatus = "sent";
        if (xi.Status === "PAID") localStatus = "paid";
        else if (xi.Status === "VOIDED") localStatus = "cancelled";
        else if (xi.AmountDue > 0 && xi.DueDateString && new Date(xi.DueDateString) < new Date()) {
          localStatus = "overdue";
        }

        // Check if we already have this invoice
        const { data: existing } = await serviceClient
          .from("invoices")
          .select("id, status")
          .eq("xero_invoice_id", xi.InvoiceID)
          .maybeSingle();

        if (existing) {
          // Update status if changed
          if (existing.status !== localStatus) {
            const upd: any = { status: localStatus, xero_synced_at: new Date().toISOString() };
            if (localStatus === "paid") upd.paid_at = new Date().toISOString();
            await serviceClient.from("invoices").update(upd).eq("id", existing.id);
            updated++;
          }
        } else {
          // Create new local invoice from Xero data
          const contactName = xi.Contact?.Name || "Unknown";
          const contactEmail = xi.Contact?.EmailAddress || null;
          const lineItems = xi.LineItems || [];
          const subtotal = Number(xi.SubTotal) || 0;
          const taxAmount = Number(xi.TotalTax) || 0;
          const total = Number(xi.Total) || 0;

          const { data: newInv, error: insertErr } = await serviceClient
            .from("invoices")
            .insert({
              invoice_number: xi.InvoiceNumber || `XERO-${xi.InvoiceID.slice(0, 8)}`,
              customer_name: contactName,
              customer_email: contactEmail,
              status: localStatus,
              document_type: "invoice",
              subtotal,
              tax_amount: taxAmount,
              tax_rate: subtotal > 0 ? Math.round((taxAmount / subtotal) * 100) : 0,
              total,
              due_date: xi.DueDateString || null,
              xero_invoice_id: xi.InvoiceID,
              xero_synced_at: new Date().toISOString(),
              created_by: user.id,
              notes: xi.Reference || null,
            })
            .select("id")
            .single();

          if (!insertErr && newInv && lineItems.length > 0) {
            const lineItemRows = lineItems.map((li: any, idx: number) => ({
              invoice_id: newInv.id,
              description: li.Description || "",
              quantity: Number(li.Quantity) || 1,
              unit_price: Number(li.UnitAmount) || 0,
              amount: Number(li.LineAmount) || 0,
              sort_order: idx,
            }));
            await serviceClient.from("invoice_line_items").insert(lineItemRows);
          }

          if (!insertErr) created++;
        }
      }

      return new Response(JSON.stringify({ success: true, created, updated, total: xeroInvoices.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ========== SYNC PAYMENT STATUS FROM XERO ==========
    if (action === "sync_payments") {
      // Get all invoices that have been synced to Xero
      const { data: invoices } = await serviceClient
        .from("invoices")
        .select("id, xero_invoice_id, status")
        .not("xero_invoice_id", "is", null)
        .neq("status", "paid")
        .neq("status", "cancelled");

      if (!invoices?.length) {
        return new Response(JSON.stringify({ success: true, updated: 0, message: "No synced invoices to check" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      let updated = 0;
      for (const inv of invoices) {
        const xeroRes = await fetch(`${XERO_API_URL}/Invoices/${inv.xero_invoice_id}`, {
          headers: xeroHeaders,
        });
        if (!xeroRes.ok) continue;

        const xeroData = await xeroRes.json();
        const xeroInv = xeroData.Invoices?.[0];
        if (!xeroInv) continue;

        let newStatus: string | null = null;
        if (xeroInv.Status === "PAID") newStatus = "paid";
        else if (xeroInv.Status === "VOIDED") newStatus = "cancelled";

        if (newStatus && newStatus !== inv.status) {
          const updates: any = { status: newStatus };
          if (newStatus === "paid") updates.paid_at = new Date().toISOString();
          await serviceClient.from("invoices").update(updates).eq("id", inv.id);
          updated++;
        }
      }

      return new Response(JSON.stringify({ success: true, updated, checked: invoices.length }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("Xero sync error:", err);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
