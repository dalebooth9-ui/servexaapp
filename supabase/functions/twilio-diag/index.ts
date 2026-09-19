// Temporary diagnostic: inspects Twilio number webhook config and recent inbound messages.
// Supports ?action=fix to point the number's inbound webhook at whatsapp-webhook.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const num = Deno.env.get("TWILIO_WHATSAPP_NUMBER") ?? "";
  const secret = Deno.env.get("TWILIO_DIAG_SECRET") ?? "";
  if (req.headers.get("x-diag-secret") !== secret) {
    return new Response("forbidden", { status: 403, headers: cors });
  }
  const auth = `Basic ${btoa(`${sid}:${token}`)}`;
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;
  const webhook = `${Deno.env.get("SUPABASE_URL")}/functions/v1/whatsapp-webhook`;
  const action = new URL(req.url).searchParams.get("action");

  const out: Record<string, unknown> = { whatsappNumberConfigured: num, webhook };

  const numbersRes = await fetch(`${base}/IncomingPhoneNumbers.json?PageSize=20`, { headers: { Authorization: auth } });
  const numbersJson = await numbersRes.json();
  const numbers = numbersJson.incoming_phone_numbers ?? [];
  out.incomingNumbers = numbers.map((n: any) => ({
    sid: n.sid, phone: n.phone_number, smsUrl: n.sms_url, smsMethod: n.sms_method,
  }));

  const svcRes = await fetch("https://messaging.twilio.com/v1/Services?PageSize=20", { headers: { Authorization: auth } });
  const svcJson = await svcRes.json();
  out.messagingServices = (svcJson.services ?? []).map((s: any) => ({
    sid: s.sid, name: s.friendly_name, inboundRequestUrl: s.inbound_request_url,
    inboundMethod: s.inbound_method, useInboundWebhookOnNumber: s.use_inbound_webhook_on_number,
  }));

  const senderRes = await fetch("https://messaging.twilio.com/v2/Channels/Senders?PageSize=20", { headers: { Authorization: auth } });
  out.sendersStatus = senderRes.status;
  out.senders = await senderRes.json().catch(() => null);

  if (action === "fix") {
    const results: unknown[] = [];
    for (const n of numbers) {
      if (num && n.phone_number !== num) continue;
      const r = await fetch(`${base}/IncomingPhoneNumbers/${n.sid}.json`, {
        method: "POST",
        headers: { Authorization: auth, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ SmsUrl: webhook, SmsMethod: "POST" }).toString(),
      });
      results.push({ phone: n.phone_number, status: r.status, body: await r.json().then((j) => ({ smsUrl: j.sms_url, message: j.message })).catch(() => null) });
    }
    out.fix = results;
  }

  return new Response(JSON.stringify(out, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
});
