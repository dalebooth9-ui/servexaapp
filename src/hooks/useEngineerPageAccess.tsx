import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export function useEngineerPageAccess() {
  const { user, userRole } = useAuth();
  const [allowedPages, setAllowedPages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setAllowedPages([]);
      setLoading(false);
      return;
    }

    // Admins get all pages
    if (userRole === "admin") {
      setAllowedPages(["all"]);
      setLoading(false);
      return;
    }

    if (userRole === "engineer") {
      supabase
        .from("engineer_page_access")
        .select("page_slug")
        .eq("user_id", user.id)
        .then(({ data }) => {
          setAllowedPages((data ?? []).map((r) => r.page_slug));
          setLoading(false);
        });
      return;
    }

    setLoading(false);
  }, [user, userRole]);

  const hasAccess = (slug: string) => {
    if (userRole === "admin") return true;
    return allowedPages.includes(slug);
  };

  return { allowedPages, loading, hasAccess };
}
