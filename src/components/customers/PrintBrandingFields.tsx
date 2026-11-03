import {useEffect,useState} from 'react';
import {supabase} from '@/integrations/supabase/client';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Switch} from '@/components/ui/switch';
import {Button} from '@/components/ui/button';
import {Upload,Trash2} from 'lucide-react';
import {toast} from 'sonner';
import {buildOrgPathAsync} from '@/lib/orgStoragePath';
import {buildDurableRef,resolveToSignedUrl} from '@/lib/durableStorageRef';
export type PrintBrandingValues={print_logo_url:string;brand_colour:string;use_print_branding:boolean};
export default function PrintBrandingFields({value,onChange}:{value:PrintBrandingValues;onChange:(v:PrintBrandingValues)=>void}){
 const [busy,setBusy]=useState(false);
 const [preview,setPreview]=useState('');
 useEffect(()=>{let current=true;setPreview('');if(value.print_logo_url)resolveToSignedUrl(value.print_logo_url,'customer-logos').then(url=>{if(current)setPreview(url||'');});return()=>{current=false;};},[value.print_logo_url]);
 const upload=async(file?:File)=>{if(!file)return;if(!/^image\/(png|jpeg|webp)$/.test(file.type)){toast.error('Choose a PNG, JPEG or WebP image');return;}setBusy(true);try{const path=await buildOrgPathAsync(`print-logos/${crypto.randomUUID()}.${file.type.split('/')[1]}`);const {error}=await supabase.storage.from('customer-logos').upload(path,file);if(error)throw error;const {data}=supabase.storage.from('customer-logos').getPublicUrl(path);onChange({...value,print_logo_url:data.publicUrl});}catch(e:any){toast.error('Print logo not uploaded',{description:e.message});}finally{setBusy(false);}};
 return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Printed paperwork</h3><div className="flex items-center justify-between gap-3"><Label htmlFor="use-print-branding">Use customer branding on printed paperwork</Label><Switch id="use-print-branding" checked={value.use_print_branding} onCheckedChange={v=>onChange({...value,use_print_branding:v})}/></div><div className="flex items-center gap-3">{value.print_logo_url&&<img src={value.print_logo_url} alt="Print logo" className="h-12 w-28 object-contain bg-background"/>}<Label className="flex items-center gap-2 cursor-pointer border rounded-md px-3 py-2"><Upload className="h-4 w-4"/>Print logo<Input aria-label="Print logo" type="file" accept="image/png,image/jpeg,image/webp" className="sr-only" disabled={busy} onChange={e=>upload(e.target.files?.[0])}/></Label>{value.print_logo_url&&<Button size="icon" variant="ghost" title="Remove print logo" onClick={()=>onChange({...value,print_logo_url:''})}><Trash2 className="h-4 w-4"/></Button>}</div><div className="flex items-center gap-3"><Label htmlFor="print-brand-colour">Brand colour</Label><Input id="print-brand-colour" type="color" className="w-14 h-9 p-1" value={value.brand_colour||'#1f4e79'} onChange={e=>onChange({...value,brand_colour:e.target.value})}/></div></section>;
}