import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type SetupStepId =
  | "company"
  | "engineers"
  | "customer"
  | "site"
  | "templates"
  | "job"
  | "whatsapp";

export interface SetupStep {
  id: SetupStepId;
  index: number; // 1-based
  title: string;
  description: string;
  href: string; // page to visit (query param ?setup=<index> added by caller)
  spotlightSelector?: string; // CSS selector for a button/element to spotlight
  spotlightInstruction: string; // one-line instruction shown in the banner
}

export const SETUP_STEPS: SetupStep[] = [
  {
    id: "company",
    index: 1,
    title: "Company details",
    description: "Add your company name, logo and brand colour.",
    href: "/settings",
    spotlightSelector: '[data-setup="company-details"]',
    spotlightInstruction: "Enter your company name, upload your logo, and pick a brand colour.",
  },
  {
    id: "engineers",
    index: 2,
    title: "Add your engineers",
    description: "Invite engineers and add their WhatsApp numbers (+44 format).",
    href: "/engineers",
    spotlightSelector: '[data-setup="add-engineer"]',
    spotlightInstruction: "Click 'Add Engineer' and include their WhatsApp number in +44… format.",
  },
  {
    id: "customer",
    index: 3,
    title: "Add your first customer",
    description: "Customers are the top of every job.",
    href: "/customers",
    spotlightSelector: '[data-setup="add-customer"]',
    spotlightInstruction: "Click 'Add Customer' to create your first customer.",
  },
  {
    id: "site",
    index: 4,
    title: "Add a site for that customer",
    description: "Sites belong to customers. Tip: use 'Scan Asset List' to import assets from paperwork.",
    href: "/sites",
    spotlightSelector: '[data-setup="add-site"]',
    spotlightInstruction: "Add a site under the customer. You can then use 'Scan Asset List' to import assets from paperwork.",
  },
  {
    id: "templates",
    index: 5,
    title: "Choose job sheet templates",
    description: "Pick from the template library so engineers have the right forms.",
    href: "/industry-templates",
    spotlightSelector: '[data-setup="template-library"]',
    spotlightInstruction: "Browse the template library and add the sheets your engineers will use.",
  },
  {
    id: "job",
    index: 6,
    title: "Create your first job",
    description: "Create a job linked to the customer and site.",
    href: "/jobs",
    spotlightSelector: '[data-setup="add-job"]',
    spotlightInstruction: "Click 'New Job' to create your first job.",
  },
  {
    id: "whatsapp",
    index: 7,
    title: "File a photo via WhatsApp",
    description: "Send a photo from an engineer's WhatsApp with the job name in the caption.",
    href: "/settings",
    spotlightInstruction:
      "Message your Servexa WhatsApp number with a photo and a caption like: 'Cedartree Court — pump replaced, all tested OK'.",
  },
];

export type SetupState = {
  loading: boolean;
  orgId: string | null;
  completed: Record<SetupStepId, boolean>;
  completedCount: number;
  total: number;
  allDone: boolean;
  dismissed: boolean;
  dismiss: () => void;
  reopen: () => void;
  refresh: () => Promise<void>;
  nextStep: SetupStep | null;
};

const dismissKey = (orgId: string) => `setup-guide-dismissed:${orgId}`;

export function useSetupProgress(): SetupState {
  const { user, userRole } = useAuth();
  const [orgId, setOrgId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [completed, setCompleted] = useState<Record<SetupStepId, boolean>>({
    company: false, engineers: false, customer: false, site: false,
    templates: false, job: false, whatsapp: false,
  });
  const [dismissed, setDismissed] = useState(false);

  const load = useCallback(async () => {
    if (!user || userRole !== "admin") { setLoading(false); return; }
    setLoading(true);

    // Resolve org
    const { data: orgIdData } = await supabase.rpc("get_user_org_id");
    const oid = (orgIdData as string) || null;
    setOrgId(oid);
    setDismissed(oid ? localStorage.getItem(dismissKey(oid)) === "true" : false);

    // Run checks in parallel
    const orgQ = oid
      ? supabase.from("organisations").select("name, logo_url").eq("id", oid).maybeSingle()
      : Promise.resolve({ data: null } as any);

    const [orgRes, engRes, custRes, siteRes, tmplRes, jobRes, waRes] = await Promise.all([
      orgQ,
      supabase.from("user_roles").select("id", { count: "exact", head: true }).eq("role", "engineer"),
      supabase.from("customers").select("id", { count: "exact", head: true }),
      supabase.from("sites").select("id", { count: "exact", head: true }),
      supabase.from("job_sheet_templates").select("id", { count: "exact", head: true }),
      supabase.from("jobs").select("id", { count: "exact", head: true }),
      supabase.from("submissions").select("id", { count: "exact", head: true })
        .not("whatsapp_message_id", "is", null),
    ]);

    const org = (orgRes as any).data as { name?: string; logo_url?: string | null } | null;

    setCompleted({
      company: !!(org?.name && org.name.trim() && org.logo_url),
      engineers: (engRes.count ?? 0) > 0,
      customer: (custRes.count ?? 0) > 0,
      site: (siteRes.count ?? 0) > 0,
      templates: (tmplRes.count ?? 0) > 0,
      job: (jobRes.count ?? 0) > 0,
      whatsapp: (waRes.count ?? 0) > 0,
    });
    setLoading(false);
  }, [user, userRole]);

  useEffect(() => { load(); }, [load]);

  const completedCount = Object.values(completed).filter(Boolean).length;
  const total = SETUP_STEPS.length;
  const allDone = completedCount === total;
  const nextStep = SETUP_STEPS.find((s) => !completed[s.id]) ?? null;

  return {
    loading, orgId, completed, completedCount, total, allDone,
    dismissed,
    dismiss: () => {
      if (orgId) localStorage.setItem(dismissKey(orgId), "true");
      setDismissed(true);
    },
    reopen: () => {
      if (orgId) localStorage.removeItem(dismissKey(orgId));
      setDismissed(false);
    },
    refresh: load,
    nextStep,
  };
}
