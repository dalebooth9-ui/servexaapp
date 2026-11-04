export const ACCESS_FIELDS = {key_location:'Keysafe or key location',access_codes:'Access code(s)',cabinet_key_type:'Cabinet / inlet box key type',cabinet_key_held:'Where the key is held',contact_name:'Contact name',contact_phone:'Contact phone',opening_hours:'Opening hours',parking:'Parking',restrictions:'Hazards or restrictions',notes:'Notes'} as const;
export const CABINET_KEY_OPTIONS=['JD key','Site keys','Both (JD key or site keys)'] as const;
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
 const norm=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
 const seen:string[]=[];const has=(s?:string|null)=>!!s&&seen.some(x=>x.includes(norm(s)));
 const add=(line:string,...src:(string|null|undefined)[])=>{out.push(line);src.forEach(s=>s&&seen.push(norm(s)));};
 // Key first, on one line: "Key: FB11, held at Reception"
 if(riserKey)add(`Cabinet key: ${riserKey}`,riserKey);
 else if(d.cabinet_key_type||d.cabinet_key_held)add(`Cabinet key: ${[d.cabinet_key_type,d.cabinet_key_held&&`held at ${d.cabinet_key_held}`].filter(Boolean).join(', ')}`,d.cabinet_key_type,d.cabinet_key_held);
 const code=d.access_codes?(codes?d.access_codes:'see site file'):'';
 const loc=d.key_location&&!has(d.key_location)?d.key_location:'';
 if(loc||code)add([loc&&`Keysafe/key: ${loc}`,code&&`Code: ${code}`].filter(Boolean).join(' · '),loc);
 if(d.contact_name||d.contact_phone)add(`Contact: ${[d.contact_name,d.contact_phone].filter(Boolean).join(' ')}`);
 if(d.restrictions)add(`Hazards: ${d.restrictions}`,d.restrictions);
 if(d.notes)add(`Notes: ${d.notes}`,d.notes);
 // Entry methods already mentioned elsewhere (e.g. "Pick keys up at reception") are dropped.
 const entry=(d.entry_methods||[]).filter(m=>!has(m));
 const tail=[entry.length&&`Entry: ${entry.join(', ')}`,d.opening_hours&&`Hours: ${d.opening_hours}`,d.parking&&`Parking: ${d.parking}`].filter(Boolean) as string[];
 if(tail.length)out.push(tail.join(' · '));
 return out;
}
export function accessNoteField(label:string){return /^(cabinet\s*(?:keys?|key type)|access(?:\s*(?:info|notes?|details))?)\s*:?$/i.test(label.trim());}
export function privateAccessField(label:string){return accessNoteField(label)||/^(?:access\s*codes?|entry\s*codes?|keysafe(?:\s*(?:code|location))?|key\s*location|inlet\s*(?:box\s*)?keys?)\s*:?$/i.test(label.trim());}