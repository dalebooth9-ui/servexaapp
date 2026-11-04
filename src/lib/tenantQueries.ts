import {supabase} from '@/integrations/supabase/client';
import {fetchAllRows} from './fetchAllRows';

/** Use the server's current company, never a client-supplied company id. */
export async function requireCurrentOrgId(client: any = supabase): Promise<string> {
  const {data,error} = await client.rpc('get_user_org_id');
  if (error) throw error;
  if (!data) throw new Error('Sign in to a company before continuing.');
  return data;
}
export async function fetchOrgRows<T = any>(table:string,columns:string,orderColumn='id',client:any=supabase,orgId?:string):Promise<T[]> {
  const currentOrg=orgId || await requireCurrentOrgId(client);
  return fetchAllRows<T>(table,columns,orderColumn,client,currentOrg);
}