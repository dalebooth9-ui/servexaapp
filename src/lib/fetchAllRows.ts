import { supabase } from "@/integrations/supabase/client";

export const FETCH_PAGE_SIZE = 1000;

/**
 * Fetch every row of a table, paging with .range() in blocks of 1000 until a
 * block returns fewer than 1000 rows. Ordered by `orderColumn` (default "id")
 * so paging is stable. The backend caps each request at 1000 rows regardless
 * of .limit(), so any lookup that may exceed that must use this.
 */
export async function fetchAllRows<T = any>(
  table: string,
  columns: string,
  orderColumn: string = "id",
  client: any = supabase,
): Promise<T[]> {
  const out: T[] = [];
  for (let from = 0; ; from += FETCH_PAGE_SIZE) {
    const { data, error } = await client
      .from(table)
      .select(columns)
      .order(orderColumn, { ascending: true })
      .range(from, from + FETCH_PAGE_SIZE - 1);
    if (error) throw error;
    const rows = (data || []) as T[];
    out.push(...rows);
    if (rows.length < FETCH_PAGE_SIZE) break;
  }
  return out;
}
