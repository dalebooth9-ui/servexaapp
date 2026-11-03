import {Button} from '@/components/ui/button';
import {saveSiteAccess} from '@/lib/siteAccess';
import {accessNoteField} from '@/lib/siteAccessRules';
import {toast} from 'sonner';
export default function SaveAccessNote({siteId,label,value}:{siteId?:string|null;label:string;value:unknown}){if(!siteId||!accessNoteField(label)||typeof value!=='string'||!value.trim())return null;return <Button type="button" size="sm" variant="outline" onClick={async()=>{try{await saveSiteAccess(siteId,{[/cabinet/i.test(label)?'cabinet_key_held':'notes']:value},true);toast.success('Saved to site file');}catch{toast.error('Not saved to site file. Please retry.');}}}>Save to site file</Button>;}