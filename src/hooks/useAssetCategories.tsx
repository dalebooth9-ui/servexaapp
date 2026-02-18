import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface AssetCategory {
  id: string;
  name: string;
  slug: string;
  sort_order: number;
}

export function useAssetCategories() {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchCategories = async () => {
    const { data } = await supabase
      .from("asset_categories" as any)
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
