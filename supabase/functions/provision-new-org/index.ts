// Provisions a fresh organisation for a newly-confirmed sign-up.
// Idempotent per user_id.
//
// Called by the client immediately after the user completes email confirmation
// and signs in for the first time. Uses service role so it can bypass RLS
// while atomically creating the org, membership, roles, intake secret and
// (optionally) seed templates.
//
// Body: { user_id?: string (defaults to caller) }
// The caller must be authenticated; if user_id is omitted we provision for
// the caller.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const CANONICAL_SEED_ORG = "11111111-1111-1111-1111-111111111111"; // Viva

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40) || "org";
}

async function uniqueSlug(svc: ReturnType<typeof createClient>, base: string): Promise<string> {
  let slug = base;
  let n = 1;
  while (true) {
    const { data } = await svc.from("organisations").select("id").eq("slug", slug).maybeSingle();
    if (!data) return slug;
    n += 1;
    slug = `${base}-${n}`;
    if (n > 50) return `${base}-${crypto.randomUUID().slice(0, 8)}`;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return new Response("Unauthorized", { status: 401, headers: corsHeaders });
    const uid = claims.claims.sub as string;

    const svc = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Idempotency: already provisioned?
    const { data: existingProfile } = await svc.from("profiles").select("org_id").eq("user_id", uid).maybeSingle();
    if ((existingProfile as any)?.org_id) {
      return new Response(JSON.stringify({ status: "already_provisioned", org_id: (existingProfile as any).org_id }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Read user metadata from auth
    const { data: userRes, error: uerr } = await svc.auth.admin.getUserById(uid);
    if (uerr || !userRes.user) return new Response("User not found", { status: 400, headers: corsHeaders });
    const meta = (userRes.user.user_metadata ?? {}) as Record<string, unknown>;
    if (meta.signup_flow !== "invite_code") {
      return new Response(JSON.stringify({ status: "not_a_signup", message: "This user did not use the invite-gated signup flow." }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const orgName = String(meta.org_name ?? "").trim();
    const fullName = String(meta.full_name ?? "").trim();
    const code = String(meta.signup_code ?? "").trim();
    const seed = meta.seed_templates !== false;
    if (!orgName || !code) return new Response("Missing org name or invite code", { status: 400, headers: corsHeaders });

    // Validate + consume invite code atomically.
    const { data: invite } = await svc.from("platform_invite_codes").select("*").eq("code", code).maybeSingle();
    const inv = invite as any;
    if (!inv || !inv.is_active || (inv.expires_at && new Date(inv.expires_at) < new Date()) || inv.uses >= inv.max_uses) {
      return new Response(JSON.stringify({ error: "Invite code invalid or exhausted" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const newUses = inv.uses + 1;
    await svc.from("platform_invite_codes").update({
      uses: newUses,
      is_active: newUses < inv.max_uses,
    }).eq("id", inv.id);

    // Create org — persist any founder/promo price locked in by the invite code.
    const baseSlug = slugify(orgName);
    const slug = await uniqueSlug(svc, baseSlug);
    const scanEmail = `${slug}-scan@intake.servexaapp.com`;
    const intakeEmail = `${slug}-po@intake.servexaapp.com`;
    const { data: orgIns, error: orgErr } = await svc.from("organisations").insert({
      name: orgName,
      slug,
      status: "active",
      plan: "pro_monthly",
      plan_status: "trialing",
      created_by: uid,
      intake_email: intakeEmail,
      scan_intake_email: scanEmail,
      promo_price_pence: inv.price_override_pence ?? null,
      promo_price_note: inv.price_override_note ?? null,
      user_band: "band_1_10",
    }).select("id").single();
    if (orgErr) throw orgErr;
    const orgId = (orgIns as any).id as string;

    // Intake secret
    const secret = crypto.randomUUID().replace(/-/g, "");
    const secretHash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(secret))
      .then((buf) => Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join(""));
    await svc.from("org_intake_secrets").insert({ org_id: orgId, secret_hash: secretHash, label: "default", created_by: uid });

    // Profile
    await svc.from("profiles").upsert({ user_id: uid, org_id: orgId, full_name: fullName || userRes.user.email || "Owner" }, { onConflict: "user_id" });

    // Membership + admin role
    await svc.from("organisation_members").insert({
      org_id: orgId, user_id: uid, role: "admin", status: "active", invited_email: userRes.user.email,
    });
    await svc.from("user_roles").insert({ user_id: uid, role: "admin", org_id: orgId }).then(() => {}, () => {});

    // Empty billing shell
    await svc.from("organisation_billing").upsert({
      org_id: orgId, plan_code: "pro_monthly", subscription_status: "incomplete",
    }, { onConflict: "org_id" });

    // Seed templates (structure only, no branding/data)
    let seededCount = 0;
    if (seed) {
      const { data: templates } = await svc.from("job_sheet_templates")
        .select("id,name,description,category,job_category,fields,footer_text,status")
        .eq("org_id", CANONICAL_SEED_ORG)
        .eq("status", "published");
      const rows = ((templates as any[]) ?? []).map((t) => ({
        org_id: orgId,
        name: t.name,
        description: t.description,
        category: t.category,
        job_category: t.job_category,
        fields: t.fields,
        branding: {},
        footer_text: t.footer_text,
        status: "draft", // land as drafts for review
      }));
      if (rows.length) {
        const { error: seedErr } = await svc.from("job_sheet_templates").insert(rows);
        if (!seedErr) seededCount = rows.length;
        else console.error("seed insert failed", seedErr);
      }
    }

    // Signup intent completion
    await svc.from("signup_intents").update({
      completed_at: new Date().toISOString(), org_id: orgId, user_id: uid,
    }).eq("email", userRes.user.email!).is("completed_at", null);

    return new Response(JSON.stringify({
      status: "provisioned",
      org_id: orgId,
      slug,
      scan_intake_email: scanEmail,
      intake_email: intakeEmail,
      seed_templates_cloned: seededCount,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("provision-new-org error", err);
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
