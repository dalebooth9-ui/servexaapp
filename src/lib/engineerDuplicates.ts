import { namesLookAlike } from "./similarName";

type Person = { user_id: string; full_name: string | null; phone?: string | null };

const phoneKey = (p?: string | null) => { const d = (p || "").replace(/\D/g, ""); return d.length >= 9 ? d.slice(-10) : ""; };
const baseName = (n?: string | null) => (n || "").replace(/\(.*?\)/g, " ").trim();

/** Warnings for people who share a phone number or have a near-identical name. Display only. */
export function engineerDuplicateWarnings(people: Person[]): Record<string, string> {
  const out: Record<string, string[]> = {};
  const add = (id: string, msg: string) => { (out[id] ||= []).includes(msg) || out[id].push(msg); };
  for (let i = 0; i < people.length; i++) for (let j = i + 1; j < people.length; j++) {
    const a = people[i], b = people[j];
    const pa = phoneKey(a.phone);
    if (pa && pa === phoneKey(b.phone)) { add(a.user_id, `Same phone as ${b.full_name}`); add(b.user_id, `Same phone as ${a.full_name}`); }
    if (baseName(a.full_name) && namesLookAlike(baseName(a.full_name), baseName(b.full_name))) { add(a.user_id, `Similar name to ${b.full_name}`); add(b.user_id, `Similar name to ${a.full_name}`); }
  }
  return Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.join("; ")]));
}
