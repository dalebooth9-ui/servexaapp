import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { DEFAULT_ENGINEER_PAGES } from "@/lib/engineerPages";

const norm = (s: string) => (s ?? "").trim().toLowerCase();

/**
 * Engineer-page-access hook.
 *
 * Strict role-based behaviour:
 * - Admins: always allowed everywhere (default-allow).
 * - Engineers: ONLY pages with an explicit row in `engineer_page_access`
 *   are allowed. No row → deny (AccessRoute will redirect to "/").
 *   Slugs are normalised (trim + lowercase) on both sides of the compare.
 * - Generic preview (admin previewing engineer role without picking a
 *   specific engineer): grant the realistic DEFAULT engineer page set so
 *   the admin sees the true engineer surface — not "everything".
 */
export function useEngineerPageAccess() {
  const { user, userRole, isPreviewingAsEngineer, previewEngineerId, effectiveUserId } = useAuth();
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [hasAnyRows, setHasAnyRows] = useState<boolean>(false);
  const [loading, setLoading] = useState(true);

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
      // Realistic default engineer surface, not "allow all".
      const defaults = DEFAULT_ENGINEER_PAGES.map(norm);
      setAllowedPages(defaults);
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
    if (userRole !== "engineer") return false;
    return allowedPages.includes(norm(slug));
  };

  return { allowedPages, loading, hasAccess, hasAnyRows };
}


