import {supabase} from '@/integrations/supabase/client';
import {accessPriorityLines,type AccessDetails} from './siteAccessRules';
export async function loadSiteAccess(siteId:string){const {data,error}=await supabase.from('site_access_info').select('*').eq('site_id',siteId).maybeSingle();if(error)throw error;return data;}
export async function saveSiteAccess(siteId:string,details:AccessDetails,confirm=false){const {data,error}=await supabase.rpc('save_site_access_info',{p_site_id:siteId,p_details:details as any,p_confirm:confirm});if(error)throw error;window.dispatchEvent(new CustomEvent('site-access-updated',{detail:siteId}));return data;}
export async function engineerAccessForPrint(input:{siteId?:string|null;jobId?:string|null;riserKey?:string|null;riserSheet?:boolean}){
 let siteId=input.siteId;if(!siteId&&input.jobId){const {data,error}=await supabase.from('jobs').select('site_id').eq('id',input.jobId).maybeSingle();if(error)throw error;siteId=data?.site_id;}if(!siteId)return null;
 const [row,settings]=await Promise.all([loadSiteAccess(siteId),supabase.from('app_settings').select('value').eq('key','print_access_codes').maybeSingle()]);if(settings.error)throw settings.error;if(!row)return input.riserKey?{lines:accessPriorityLines({},true,input.riserKey),cabinetKeys:input.riserKey}:null;
 // Riser sheets: never repeat the site's general notes on every riser.
 const details={...(row.details as AccessDetails),...(input.riserSheet?{notes:undefined}:{})} as AccessDetails;const codes=settings.data?.value!==false;
 return {lines:accessPriorityLines(details,codes,input.riserKey),cabinetKeys:input.riserKey||[details.cabinet_key_type,details.cabinet_key_held].filter(Boolean).join(' — ')};
}