import * as React from 'https://esm.sh/react@18.3.1'
import { renderAsync } from 'https://esm.sh/@react-email/components@0.0.22?deps=react@18.3.1'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'
import { getEmailBranding } from '../_shared/customerEmail.ts'

// Configuration baked in at scaffold time — do NOT change these manually.
// To update, re-run the email domain setup flow.
const SITE_NAME = "Servexa"
// SENDER_DOMAIN is the verified sender subdomain FQDN (e.g., "notify.example.com").
// It MUST match the subdomain delegated to Lovable's nameservers — never the root domain.
// The email API looks up this exact domain; a mismatch causes "No email domain record found".
const SENDER_DOMAIN = "notify.vivafire.co.uk"
// FROM_DOMAIN is the domain shown in the From: header (e.g., "example.com").
// When display_from_root is enabled, this can be the root domain for cleaner branding,
// even though actual sending uses the subdomain above.
const FROM_DOMAIN = "vivafire.co.uk"

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
}

// Generate a cryptographically random 32-byte hex token
function generateToken(): string {
  const bytes = new Uint8Array(32)
  crypto.getRandomValues(bytes)
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// SHA-256 hex digest — used to store unsubscribe tokens at rest.
// Only the hash is persisted; the raw token only travels in the email URL.
async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input))
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

// Auth note: this function uses verify_jwt = true in config.toml, so Supabase's
// gateway validates the caller's JWT (anon or service_role) before the request
// reaches this code. No in-function auth check is needed.

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')

  if (!supabaseUrl || !supabaseServiceKey) {
    console.error('Missing required environment variables')
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Parse request body
  let templateName: string
  let recipientEmail: string
  let idempotencyKey: string
  let messageId: string
  let templateData: Record<string, any> = {}
  let sourceBody: Record<string, any> = {}
  try {
    const body = await req.json()
    sourceBody = body
    templateName = body.templateName || body.template_name
    recipientEmail = body.recipientEmail || body.recipient_email
    messageId = crypto.randomUUID()
    idempotencyKey = body.idempotencyKey || body.idempotency_key || messageId
    if (body.templateData && typeof body.templateData === 'object') {
      templateData = body.templateData
    }
  } catch {
    return new Response(
      JSON.stringify({ error: 'Invalid JSON in request body' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (!templateName) {
    return new Response(
      JSON.stringify({ error: 'templateName is required' }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 1. Look up template from registry (early — needed to resolve recipient)
  const template = TEMPLATES[templateName]

  if (!template) {
    console.error('Template not found in registry', { templateName })
    return new Response(
      JSON.stringify({
        error: `Template '${templateName}' not found. Available: ${Object.keys(TEMPLATES).join(', ')}`,
      }),
      {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Resolve effective recipient: template-level `to` takes precedence over
  // the caller-provided recipientEmail. This allows notification templates
  // to always send to a fixed address (e.g., site owner from env var).
  let effectiveRecipient = template.to || recipientEmail

  if (!effectiveRecipient) {
    return new Response(
      JSON.stringify({
        error: 'recipientEmail is required (unless the template defines a fixed recipient)',
      }),
      {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // Create Supabase client with service role (bypasses RLS)
  const supabase = createClient(supabaseUrl, supabaseServiceKey)
  let senderName = SITE_NAME
  let emailReplyTo: string | undefined
  if (templateName === 'renewal-reminder' || templateName === 'new-job-from-api') {
    const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '')
    const serviceCaller = !!token && token === supabaseServiceKey
    let callerOrg: string | null = null
    let callerAdmin = false
    if (token && !serviceCaller) {
      const { data: auth } = await supabase.auth.getUser(token)
      if (auth.user) {
        const caller = createClient(supabaseUrl, supabaseServiceKey, { global: { headers: { Authorization: `Bearer ${token}` } } })
        const { data: org } = await caller.rpc('get_user_org_id')
        const { data: allowed } = await caller.rpc('has_role', { _user_id: auth.user.id, _role: 'admin' })
        callerOrg = org
        callerAdmin = allowed === true
      }
    }
    let orgId: string | undefined
    if (templateName === 'renewal-reminder') {
      if (!serviceCaller && !callerAdmin) return new Response(JSON.stringify({ error: 'Company admin required' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const { data: schedule } = await supabase.from('site_service_schedules').select('org_id,customer_id').eq('id', sourceBody.schedule_id).maybeSingle()
      if (!schedule || (!serviceCaller && schedule.org_id !== callerOrg)) return new Response(JSON.stringify({ error: 'Renewal not found in your company' }), { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      const { data: customer } = await supabase.from('customers').select('email,renewal_reminders_opt_out').eq('id', schedule.customer_id).eq('org_id', schedule.org_id).maybeSingle()
      if (!customer?.email || customer.renewal_reminders_opt_out) return new Response(JSON.stringify({ error: 'Customer email unavailable or reminders opted out' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      orgId = schedule.org_id
      effectiveRecipient = customer.email
    } else {
      const { data: job } = await supabase.from('jobs').select('id,org_id,name,reference_number,customer,customer_id,priority,source').eq('id', sourceBody.job_id).eq('source', 'Email Triage').maybeSingle()
      let requestAllowed = false
      if (job && sourceBody.notification_token) {
        const { data: request } = await supabase.from('ops_notification_requests').select('job_id').eq('org_id', job.org_id).eq('job_id', job.id).eq('token', sourceBody.notification_token).maybeSingle()
        requestAllowed = !!request
      }
      if (!job || (!serviceCaller && !(callerAdmin && job.org_id === callerOrg) && !requestAllowed)) return new Response(JSON.stringify({ error: 'Job notification is not authorised' }), { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      orgId = job.org_id
      const { data: ops } = await supabase.from('email_branding').select('reply_to,from_address').eq('org_id', orgId).maybeSingle()
      const address = ops?.reply_to?.trim() || ops?.from_address?.trim()
      if (!address) return new Response(JSON.stringify({ error: 'Company ops address is not configured' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
      effectiveRecipient = address
      idempotencyKey = `new-job-${job.id}`
      const { data: customer } = await supabase.from('customers').select('name').eq('id', job.customer_id).eq('org_id', orgId).maybeSingle()
      templateData = { jobName: job.name || job.reference_number, customer: customer?.name || job.customer, priority: job.priority, source: job.source }
    }
    const branding = await getEmailBranding(orgId, supabase)
    senderName = branding.from_name || branding.company_name
    emailReplyTo = branding.reply_to
    templateData = { ...templateData, company_name: branding.company_name, logo_url: branding.logo_url, brand_color: branding.brand_color }
    // An organisation without a configured sender must not use Viva's transport identity.
    if (orgId !== '11111111-1111-1111-1111-111111111111') return new Response(JSON.stringify({ error: 'Email sending for this company requires its own verified sender configuration' }), { status: 422, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  // 2. Check suppression list (fail-closed: if we can't verify, don't send)
  const { data: suppressed, error: suppressionError } = await supabase
    .from('suppressed_emails')
    .select('id')
    .eq('email', effectiveRecipient.toLowerCase())
    .maybeSingle()

  if (suppressionError) {
    console.error('Suppression check failed — refusing to send', {
      error: suppressionError,
      effectiveRecipient,
    })
    return new Response(
      JSON.stringify({ error: 'Failed to verify suppression status' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  if (suppressed) {
    // Log the suppressed attempt
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'suppressed',
    })

    console.log('Email suppressed', { effectiveRecipient, templateName })
    return new Response(
      JSON.stringify({ success: false, reason: 'email_suppressed' }),
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  // 3. Generate a fresh unsubscribe token for this send.
  //    Only the SHA-256 hash is persisted; the raw token only ever lives in the
  //    outgoing email URL. Rotating per-send invalidates older links for the
  //    same recipient, which is an acceptable trade-off for at-rest hashing.
  const normalizedEmail = effectiveRecipient.toLowerCase()
  const unsubscribeToken = generateToken()
  const unsubscribeTokenHash = await sha256Hex(unsubscribeToken)

  const { error: tokenError } = await supabase
    .from('email_unsubscribe_tokens')
    .upsert(
      { token_hash: unsubscribeTokenHash, email: normalizedEmail, used_at: null },
      { onConflict: 'email' }
    )

  if (tokenError) {
    console.error('Failed to store unsubscribe token hash', {
      error: tokenError,
      email: normalizedEmail,
    })
    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to create unsubscribe token',
    })
    return new Response(
      JSON.stringify({ error: 'Failed to prepare email' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }


  // 4. Render React Email template to HTML and plain text
  const html = await renderAsync(
    React.createElement(template.component, templateData)
  )
  const plainText = await renderAsync(
    React.createElement(template.component, templateData),
    { plainText: true }
  )

  // Resolve subject — supports static string or dynamic function
  const resolvedSubject =
    typeof template.subject === 'function'
      ? template.subject(templateData)
      : template.subject

  // 5. Enqueue the pre-rendered email for async processing by the dispatcher.
  // The dispatcher (process-email-queue) handles sending, retries, and rate-limit backoff.

  // Log pending BEFORE enqueue so we have a record even if enqueue crashes
  await supabase.from('email_send_log').insert({
    message_id: messageId,
    template_name: templateName,
    recipient_email: effectiveRecipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabase.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: effectiveRecipient,
      from: `${senderName} <noreply@${FROM_DOMAIN}>`,
      ...(emailReplyTo ? { reply_to: emailReplyTo } : {}),
      sender_domain: SENDER_DOMAIN,
      subject: resolvedSubject,
      html,
      text: plainText,
      purpose: 'transactional',
      label: templateName,
      idempotency_key: idempotencyKey,
      unsubscribe_token: unsubscribeToken,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    console.error('Failed to enqueue email', {
      error: enqueueError,
      templateName,
      effectiveRecipient,
    })

    await supabase.from('email_send_log').insert({
      message_id: messageId,
      template_name: templateName,
      recipient_email: effectiveRecipient,
      status: 'failed',
      error_message: 'Failed to enqueue email',
    })

    return new Response(JSON.stringify({ error: 'Failed to enqueue email' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  console.log('Transactional email enqueued', { templateName, effectiveRecipient })

  return new Response(
    JSON.stringify({ success: true, queued: true }),
    {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    }
  )
})
