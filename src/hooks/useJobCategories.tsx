import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface JobCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export function useJobCategories() {
  const [categories, setCategories] = useState<JobCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("job_categories" as any)
      .select("*")
      .order("sort_order", { ascending: true });
    setCategories((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    fetchCategories();
  }, []);

  return { categories, loading, refetch: fetchCategories };
}
