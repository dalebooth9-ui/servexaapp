import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface JobRamsStatus {
  loading: boolean;
  required: boolean;
  categoryName?: string | null;
  ramsCount: number;
  documents: Array<{
    kind: "rams" | "generic_rams" | "rams_documents";
    id: string;
    name: string;
    version: number;
    signoffs: number;
  }>;
  totalSignoffs: number;
  refetch: () => void;
}

/**
 * Aggregates RAMS status for a job across the three RAMS tables plus
 * `job_categories.rams_required`. Used by JobDetail banner, planner card
 * indicators, and the engineer mobile gate.
 */
export function useJobRamsStatus(jobId?: string | null): JobRamsStatus {
  const [state, setState] = useState<Omit<JobRamsStatus, "refetch">>({
    loading: true,
    required: false,
    categoryName: null,
    ramsCount: 0,
    documents: [],
    totalSignoffs: 0,
  });

  const refetch = useCallback(async () => {
    if (!jobId) {
      setState({ loading: false, required: false, ramsCount: 0, documents: [], totalSignoffs: 0 });
      return;
    }
    setState((s) => ({ ...s, loading: true }));

    const { data: job } = await supabase
      .from("jobs")
      .select("id, category")
      .eq("id", jobId)
      .maybeSingle();

    let required = false;
    let categoryName: string | null = null;
    if (job?.category) {
      const { data: cat } = await supabase
        .from("job_categories" as any)
        .select("name, slug, rams_required")
        .eq("slug", job.category)
        .maybeSingle();
      required = !!(cat as any)?.rams_required;
      categoryName = (cat as any)?.name || null;
    }

    const [ramsRes, genRes, docsRes, signoffRes] = await Promise.all([
      supabase.from("rams" as any).select("id, works_description, version").eq("job_id", jobId),
      supabase.from("generic_rams" as any).select("id, description").eq("job_id", jobId),
      supabase.from("rams_documents" as any).select("id, rams_type, contract_job_name").eq("job_id", jobId),
      supabase.from("rams_signoffs" as any).select("rams_kind, rams_id, engineer_id").eq("job_id", jobId),
    ]);

    const signoffs = ((signoffRes.data as any) || []) as Array<{ rams_kind: string; rams_id: string; engineer_id: string }>;
    const countFor = (kind: string, id: string) => signoffs.filter((s) => s.rams_kind === kind && s.rams_id === id).length;

    const documents: JobRamsStatus["documents"] = [];
    ((ramsRes.data as any) || []).forEach((r: any) =>
      documents.push({ kind: "rams", id: r.id, name: r.works_description || "RAMS", version: r.version || 1, signoffs: countFor("rams", r.id) }),
    );
    ((genRes.data as any) || []).forEach((r: any) =>
      documents.push({ kind: "generic_rams", id: r.id, name: r.description || "Generic RAMS", version: 1, signoffs: countFor("generic_rams", r.id) }),
    );
    ((docsRes.data as any) || []).forEach((r: any) =>
      documents.push({
        kind: "rams_documents",
        id: r.id,
        name: r.contract_job_name || r.rams_type || "RAMS",
        version: 1,
        signoffs: countFor("rams_documents", r.id),
      }),
    );

    setState({
      loading: false,
      required,
      categoryName,
      ramsCount: documents.length,
      documents,
      totalSignoffs: signoffs.length,
    });
  }, [jobId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { ...state, refetch };
}
