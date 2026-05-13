import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const norm = (s: string) => (s ?? "").trim().toLowerCase();

export function useEngineerPageAccess() {
  const { user, userRole } = useAuth();
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [hasAnyRows, setHasAnyRows] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAllowedPages([]);
      setHasAnyRows(true);
      setLoading(false);
      return;
    }

    // Admins get all pages
    if (userRole === "admin") {
      setAllowedPages(["all"]);
      setHasAnyRows(true);
      setLoading(false);
      return;
    }

    if (userRole === "engineer") {
      supabase
        .from("engineer_page_access")
        .select("page_slug")
        .eq("user_id", user.id)
        .then(({ data }) => {
          const rows = data ?? [];
          setAllowedPages(rows.map((r) => norm(r.page_slug)));
          setHasAnyRows(rows.length > 0);
          setLoading(false);
        });
      return;
    }

    setLoading(false);
  }, [user, userRole]);

  const hasAccess = (slug: string) => {
    if (userRole === "admin") return true;
    // Setup-incomplete fallback: if engineer has no access rows configured,
    // default to allow rather than silently bouncing back to /.
    if (userRole === "engineer" && !hasAnyRows) return true;
    return allowedPages.includes(norm(slug));
  };

  return { allowedPages, loading, hasAccess, hasAnyRows };
}
