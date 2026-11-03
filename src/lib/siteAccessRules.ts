export const ACCESS_FIELDS = {key_location:'Keysafe or key location',access_codes:'Access code(s)',cabinet_key_type:'Cabinet / inlet box key type',cabinet_key_held:'Where the key is held',contact_name:'Contact name',contact_phone:'Contact phone',opening_hours:'Opening hours',parking:'Parking',restrictions:'Hazards or restrictions',notes:'Notes'} as const;
export const ENTRY_METHODS=['Reception','Keysafe','Intercom','Fob','Call ahead','Escorted'];
export type AccessDetails=Partial<Record<keyof typeof ACCESS_FIELDS,string>> & {entry_methods?:string[]};
export function accessPrintLines(details:AccessDetails,audience:'engineer'|'customer',codes=true):string[]{
 if(audience!=='engineer')return [];
 const lines:string[]=[];if(details.entry_methods?.length)lines.push(`How to get in: ${details.entry_methods.join(', ')}`);
 for(const [key,label] of Object.entries(ACCESS_FIELDS)){const value=details[key as keyof typeof ACCESS_FIELDS];if(value)lines.push(`${label}: ${key==='access_codes'&&!codes?'see site file':value}`);}return lines;
}
export function accessNoteField(label:string){return /^(cabinet\s*(?:keys?|key type)|access(?:\s*(?:info|notes?|details))?)\s*:?$/i.test(label.trim());}
export function privateAccessField(label:string){return accessNoteField(label)||/^(?:access\s*codes?|entry\s*codes?|keysafe(?:\s*(?:code|location))?|key\s*location|inlet\s*(?:box\s*)?keys?)\s*:?$/i.test(label.trim());}