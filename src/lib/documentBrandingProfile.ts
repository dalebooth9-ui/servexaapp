import type {RgbTriple} from '@/lib/extractLogoColors';
import {getGeneratingOrgFallbackLogoUrl,getGeneratingOrgBranding,getGeneratingOrgWatermarkUrl} from '@/lib/generatingOrgBranding';
import {resolveToSignedUrl} from '@/lib/durableStorageRef';
import {printBrandingChoice,printColourChoice,type PrintCustomer} from './printBrandingRules';
import {loadHeaderLogo} from './loadHeaderLogo';
import {requireCurrentOrgId} from './tenantQueries';
import {watermarkTint} from './watermarkTint';
export type DocumentBrandingProfile={logoUrl:string;logoImage:HTMLImageElement|null;accentColor:RgbTriple;isCustomerBranded:boolean;companyName?:string;companySubtitle?:string;footerText?:string;servicedBy?:string;watermarkUrl:string|null};
export type BrandingInput={template?:{branding?:{company_name?:string;company_subtitle?:string;logo_url?:string;footer_text?:string}|null}|null;customer?:PrintCustomer|null;jobId?:string|null;siteId?:string|null};
export function parseHexColor(hex?:string|null):RgbTriple|null{if(!hex)return null;let h=hex.trim().replace(/^#/,'');if(h.length===3)h=h.split('').map(c=>c+c).join('');return /^[a-f0-9]{6}$/i.test(h)?[parseInt(h.slice(0,2),16),parseInt(h.slice(2,4),16),parseInt(h.slice(4,6),16)]:null;}
async function image(url:string){if(!url)return null;const img=new Image();img.crossOrigin='anonymous';try{await new Promise<void>((ok,no)=>{img.onload=()=>ok();img.onerror=()=>no();img.src=url;});return img;}catch{return null;}}
export async function resolvePrintCustomer(input:BrandingInput):Promise<PrintCustomer|null>{
 const {supabase}=await import('@/integrations/supabase/client');const orgId=await requireCurrentOrgId();let id=input.customer?.id;let siteId=input.siteId;
 if(input.jobId){const {data,error}=await supabase.from('jobs').select('customer_id,site_id').eq('org_id',orgId).eq('id',input.jobId).maybeSingle();if(error)throw error;if(!data)throw new Error('Job is not available in this company.');id=data.customer_id||id;siteId=data.site_id||siteId;}
 if(!id&&siteId){const seen=new Set<string>();while(siteId&&!seen.has(siteId)){seen.add(siteId);const {data,error}=await supabase.from('customer_sites').select('customer_id').eq('org_id',orgId).eq('site_id',siteId).order('id').limit(1);if(error)throw error;if(data?.[0]){id=data[0].customer_id;break;}const parent=await supabase.from('sites').select('parent_id').eq('org_id',orgId).eq('id',siteId).maybeSingle();if(parent.error)throw parent.error;siteId=parent.data?.parent_id;}}
 if(id){const {data,error}=await supabase.from('customers').select('id,name,logo_url,print_logo_url,brand_colour,use_print_branding').eq('org_id',orgId).eq('id',id).maybeSingle();if(error)throw error;return data||null;}
 if(input.customer?.name){const {data,error}=await supabase.from('customers').select('id,name,logo_url,print_logo_url,brand_colour,use_print_branding').eq('org_id',orgId).eq('name',input.customer.name).limit(2);if(error)throw error;if(data?.length===1)return data[0];}
 return null;
}
/** Produce a single-colour transparent logo watermark, removing white paper pixels. */
export function tintedPrintWatermark(img:HTMLImageElement,colour:RgbTriple):string{
 const scale=Math.min(1,1000/Math.max(img.naturalWidth,img.naturalHeight));const c=document.createElement('canvas');c.width=Math.max(1,Math.round(img.naturalWidth*scale));c.height=Math.max(1,Math.round(img.naturalHeight*scale));const ctx=c.getContext('2d');if(!ctx)return '';ctx.drawImage(img,0,0,c.width,c.height);const pixels=ctx.getImageData(0,0,c.width,c.height);
 for(let i=0;i<pixels.data.length;i+=4){const d=pixels.data;const paper=Math.min(d[i],d[i+1],d[i+2])>235;d[i+3]=paper?0:d[i+3];d[i]=colour[0];d[i+1]=colour[1];d[i+2]=colour[2];}ctx.putImageData(pixels,0,0);return c.toDataURL('image/png');
}
export async function resolveDocumentBrandingProfile(input:BrandingInput):Promise<DocumentBrandingProfile>{
 const [customer,orgLogo,org,flame]=await Promise.all([resolvePrintCustomer(input),getGeneratingOrgFallbackLogoUrl(),getGeneratingOrgBranding(),getGeneratingOrgWatermarkUrl()]);const choice=printBrandingChoice(customer,orgLogo);
 const loaded=await loadHeaderLogo(choice.logoUrl,orgLogo,async raw=>{const url=(await resolveToSignedUrl(raw).catch(()=>null))||raw;const img=await image(url);return img?{url,img}:null;});
 const logoImage=loaded.image?.img||null;const logoUrl=loaded.image?.url||'';
 if((choice.logoUrl||orgLogo)&&!logoImage)throw new Error('Header logo could not be loaded. Please retry before printing.');
 const orgColour=parseHexColor(printColourChoice(null,org))||[128,128,128] as RgbTriple;
 const accentColor=(choice.enabled?parseHexColor(choice.colour):null)||orgColour;
 const sourceUrl=flame?((await resolveToSignedUrl(flame).catch(()=>null))||flame):'';
 const source=await image(sourceUrl);
 const watermarkColour=watermarkTint((choice.enabled?parseHexColor(customer?.brand_colour):null)||parseHexColor(org.primaryColor));
 const watermarkUrl=source?tintedPrintWatermark(source,watermarkColour):null;
 return {logoUrl,logoImage,accentColor,isCustomerBranded:choice.enabled,companyName:choice.enabled?customer?.name||org.name||undefined:org.name||undefined,companySubtitle:input.template?.branding?.company_subtitle,footerText:choice.enabled&&/viva/i.test(input.template?.branding?.footer_text||'')?undefined:input.template?.branding?.footer_text,servicedBy:undefined,watermarkUrl};
}