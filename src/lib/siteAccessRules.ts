export const ACCESS_FIELDS = {key_location:'Keysafe or key location',access_codes:'Access code(s)',cabinet_key_type:'Cabinet / inlet box key type',cabinet_key_held:'Where the key is held',contact_name:'Contact name',contact_phone:'Contact phone',opening_hours:'Opening hours',parking:'Parking',restrictions:'Hazards or restrictions',notes:'Notes'} as const;
export const ENTRY_METHODS=['Reception','Keysafe','Intercom','Fob','Call ahead','Escorted'];
export type AccessDetails=Partial<Record<keyof typeof ACCESS_FIELDS,string>> & {entry_methods?:string[]};
export function accessPrintLines(details:AccessDetails,audience:'engineer'|'customer',codes=true):string[]{
 if(audience!=='engineer')return [];
 const lines:string[]=[];if(details.entry_methods?.length)lines.push(`How to get in: ${details.entry_methods.join(', ')}`);
 for(const [key,label] of Object.entries(ACCESS_FIELDS)){const value=details[key as keyof typeof ACCESS_FIELDS];if(value)lines.push(`${label}: ${key==='access_codes'&&!codes?'see site file':value}`);}return lines;
}
/** Engineer print lines in importance order: key type, key held, key location + code, contact, hazards, notes, then the rest. */
export function accessPriorityLines(details:AccessDetails,codes=true,riserKey?:string|null):string[]{
 const d=details||{};const out:string[]=[];
 if(riserKey)out.push(`Riser key: ${riserKey}`);
 else{if(d.cabinet_key_type)out.push(`Key type: ${d.cabinet_key_type}`);if(d.cabinet_key_held)out.push(`Key held: ${d.cabinet_key_held}`);}
 const code=d.access_codes?(codes?d.access_codes:'see site file'):'';
 if(d.key_location||code)out.push([d.key_location&&`Keysafe/key: ${d.key_location}`,code&&`Code: ${code}`].filter(Boolean).join(' · '));
 if(d.contact_name||d.contact_phone)out.push(`Contact: ${[d.contact_name,d.contact_phone].filter(Boolean).join(' ')}`);
 if(d.restrictions)out.push(`Hazards: ${d.restrictions}`);
 if(d.notes)out.push(`Notes: ${d.notes}`);
 if(d.entry_methods?.length)out.push(`Entry: ${d.entry_methods.join(', ')}`);
 if(d.opening_hours)out.push(`Hours: ${d.opening_hours}`);
 if(d.parking)out.push(`Parking: ${d.parking}`);
 return out;
}
export function accessNoteField(label:string){return /^(cabinet\s*(?:keys?|key type)|access(?:\s*(?:info|notes?|details))?)\s*:?$/i.test(label.trim());}
export function privateAccessField(label:string){return accessNoteField(label)||/^(?:access\s*codes?|entry\s*codes?|keysafe(?:\s*(?:code|location))?|key\s*location|inlet\s*(?:box\s*)?keys?)\s*:?$/i.test(label.trim());}