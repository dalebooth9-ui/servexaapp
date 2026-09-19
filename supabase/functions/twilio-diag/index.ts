// Temporary diagnostic: inspects Twilio number webhook config and recent inbound messages.
const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "*" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const sid = Deno.env.get("TWILIO_ACCOUNT_SID") ?? "";
  const token = Deno.env.get("TWILIO_AUTH_TOKEN") ?? "";
  const num = Deno.env.get("TWILIO_WHATSAPP_NUMBER") ?? "";
  const secret = Deno.env.get("CRON_SECRET") ?? "";
  if (req.headers.get("x-diag-secret") !== secret) {
    return new Response("forbidden", { status: 403, headers: cors });
  }
  const auth = `Basic ${btoa(`${sid}:${token}`)}`;
  const base = `https://api.twilio.com/2010-04-01/Accounts/${sid}`;

  const out: Record<string, unknown> = {
    accountSidPrefix: sid.slice(0, 6),
    whatsappNumberConfigured: num,
  };

  const numbers = await fetch(`${base}/IncomingPhoneNumbers.json?PageSize=20`, { headers: { Authorization: auth } });
  const numbersJson = await numbers.json();
  out.incomingNumbers = (numbersJson.incoming_phone_numbers ?? []).map((n: any) => ({
    phone: n.phone_number,
    smsUrl: n.sms_url,
    smsMethod: n.sms_method,
    smsFallbackUrl: n.sms_fallback_url,
    statusCallback: n.status_callback,
  }));
  out.numbersStatus = numbers.status;

  const inbound = await fetch(`${base}/Messages.json?PageSize=20`, { headers: { Authorization: auth } });
  const inboundJson = await inbound.json();
  out.recentMessages = (inboundJson.messages ?? []).map((m: any) => ({
    sid: m.sid,
    direction: m.direction,
    from: m.from,
    to: m.to,
    status: m.status,
    numMedia: m.num_media,
    errorCode: m.error_code,
    dateSent: m.date_sent,
  }));

  return new Response(JSON.stringify(out, null, 2), {
    headers: { ...cors, "Content-Type": "application/json" },
  });
});
