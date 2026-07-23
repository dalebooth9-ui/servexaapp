import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/**
 * Engineer-page-access hook.
 *
 * Strict role-based behaviour:
 * - Admins: always allowed everywhere (default-allow).
 * - Engineers: ONLY pages with an explicit row in `engineer_page_access`
 *   are allowed. No row → deny (AccessRoute will redirect to "/").
 *   Slugs are normalised (trim + lowercase) on both sides of the compare.
 */
export function useEngineerPageAccess() {
  const { user, userRole, isPreviewingAsEngineer, previewEngineerId, effectiveUserId } = useAuth();
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [hasAnyRows, setHasAnyRows] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

  // Generic preview (no specific engineer) — allow everything so the admin
  // can walk the full engineer UX. Specific engineer preview loads that
  // engineer's real access rows.
  const genericPreview = isPreviewingAsEngineer && !previewEngineerId;

  useEffect(() => {
    if (!user) {
      setAllowedPages([]);
      setHasAnyRows(false);
      setLoading(false);
      return;
    }

    if (userRole === "admin") {
      setAllowedPages(["all"]);
      setHasAnyRows(true);
      setLoading(false);
      return;
    }

    if (genericPreview) {
      setAllowedPages(["all"]);
      setHasAnyRows(true);
      setLoading(false);
      return;
    }

    if (userRole === "engineer") {
      const targetId = effectiveUserId ?? user.id;
      supabase
        .from("engineer_page_access")
        .select("page_slug")
        .eq("user_id", targetId)
        .then(({ data }) => {
          const rows = data ?? [];
          setAllowedPages(rows.map((r) => norm(r.page_slug)));
          setHasAnyRows(rows.length > 0);
          setLoading(false);
        });
      return;
    }

    setLoading(false);
  }, [user, userRole, effectiveUserId, genericPreview]);

  const hasAccess = (slug: string) => {
    if (userRole === "admin") return true;
    if (genericPreview) return true;
    if (userRole !== "engineer") return false;
    return allowedPages.includes(norm(slug));
  };

  return { allowedPages, loading, hasAccess, hasAnyRows };
}

