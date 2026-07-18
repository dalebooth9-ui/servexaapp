import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type RamsLibraryKind = "whole" | "block";

export interface RamsLibraryItem {
  id: string;
  org_id: string;
  kind: RamsLibraryKind;
  block_type: string | null;
  work_types: string[];
  name: string;
  description: string | null;
  payload: any;
  source_rams_kind: string | null;
  source_rams_id: string | null;
  archived: boolean;
  created_by: string;
  created_at: string;
  updated_at: string;
}

interface Options {
  kind?: RamsLibraryKind;
  workType?: string;
  includeArchived?: boolean;
}

/**
 * Reads the org's RAMS Library. Admins can pass `includeArchived` to also
 * surface retired items. Filtering by `workType` matches items tagged with
 * that work type or with no tags (generic blocks apply to everything).
 */
export function useRamsLibrary({ kind, workType, includeArchived = false }: Options = {}) {
  const [items, setItems] = useState<RamsLibraryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    let q = supabase.from("rams_library_items" as any).select("*").order("name", { ascending: true });
    if (kind) q = q.eq("kind", kind);
    if (!includeArchived) q = q.eq("archived", false);
    const { data, error } = await q;
    if (error) setError(error.message);
    let rows = ((data as any) || []) as RamsLibraryItem[];
    if (workType) {
      rows = rows.filter((r) => !r.work_types?.length || r.work_types.includes(workType));
    }
    setItems(rows);
    setLoading(false);
  }, [kind, workType, includeArchived]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { items, loading, error, refetch };
}
