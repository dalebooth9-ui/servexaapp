import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

export interface TranscriptResult {
  id: string;
  transcript: string;
  summary: string;
  suggested_remedials: { description: string; severity: string; seq: number }[];
  duration_seconds: number | null;
}

export function useMediaTranscription() {
  const [transcribing, setTranscribing] = useState(false);
  const [result, setResult] = useState<TranscriptResult | null>(null);
  const { toast } = useToast();

  const transcribe = async (opts: {
    file_path: string;
    job_id?: string;
    survey_id?: string;
    bucket?: string;
  }): Promise<TranscriptResult | null> => {
    setTranscribing(true);
    setResult(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error("Not signed in");

      const res = await supabase.functions.invoke("transcribe-media", {
        body: {
          file_path: opts.file_path,
          job_id: opts.job_id || null,
          survey_id: opts.survey_id || null,
          bucket: opts.bucket || "submissions",
        },
      });

      if (res.error) throw new Error(res.error.message || "Transcription failed");
      if ((res.data as any)?.error) throw new Error((res.data as any).error);

      const data = res.data as TranscriptResult;
      setResult({ ...data, suggested_remedials: data.suggested_remedials || [] });
      return data;
    } catch (err: any) {
      toast({ title: "Transcription failed", description: err.message, variant: "destructive" });
      return null;
    } finally {
      setTranscribing(false);
    }
  };

  const addRemedialsToJob = async (
    jobId: string,
    remedials: { description: string; severity: string }[],
    userId: string,
    orgId?: string,
  ) => {
    // Continue the job's existing sequence so new items append to the checklist.
    const { data: existing } = await supabase
      .from("job_remedial_items" as any)
      .select("seq")
      .eq("job_id", jobId)
      .order("seq", { ascending: false })
      .limit(1);
    const startSeq = ((existing?.[0] as any)?.seq ?? -1) + 1;

    const inserts = remedials.map((r, i) => ({
      job_id: jobId,
      org_id: orgId || null,
      description: r.description,
      seq: startSeq + i,
      status: "pending",
      source: "ai_transcription",
      created_by: userId,
    }));

    const { error } = await supabase.from("job_remedial_items" as any).insert(inserts as any);
    if (error) {
      toast({ title: "Failed to add remedials", description: error.message, variant: "destructive" });
      return false;
    }
    toast({ title: `${remedials.length} remedial item(s) added to the job` });
    return true;
  };

  return { transcribe, transcribing, result, setResult, addRemedialsToJob };
}
