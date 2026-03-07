/**
 * Generates an AI job brief for a given job and saves it to jobs.brief.
 * Fire-and-forget: call without awaiting from job creation handlers.
 */
import { supabase } from "@/integrations/supabase/client";

interface JobBriefInput {
  id: string;
  name?: string;
  reference_number?: string;
  category?: string;
  priority?: string;
  customer?: string;
  address?: string;
  job_type?: string;
  status?: string;
  due_date?: string;
  visual_qty?: number;
  pressure_test_qty?: number;
  other_service_type?: string;
}

export async function generateAndSaveAiBrief(job: JobBriefInput): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
    const resp = await fetch(`${SUPABASE_URL}/functions/v1/ai-job-brief`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
        "x-stream-mode": "false", // non-streaming mode
      },
      body: JSON.stringify({ job, stream: false }),
    });

    if (!resp.ok) return;

    const data = await resp.json();
    const brief = data?.content ?? data?.choices?.[0]?.message?.content;
    if (!brief) return;

    // Save brief to the job record
    await supabase.from("jobs").update({ brief } as any).eq("id", job.id);
  } catch {
    // Silently fail — brief generation is best-effort
  }
}
