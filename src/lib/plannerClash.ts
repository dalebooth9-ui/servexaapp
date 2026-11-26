/** Gentle double-booking warnings. Never blocks; jobs marked two_engineer_ok are skipped. */
export interface ClashEntry { id: string; job_id: string; engineer_id: string; schedule_date: string }
export interface ClashJob { id: string; site_id: string | null; site_name: string; job_type: string; two_engineer_ok?: boolean }

const uk = (d: string) => `${d.slice(8, 10)}/${d.slice(5, 7)}`;
const weekKey = (d: string) => { const dt = new Date(`${d}T12:00:00Z`); const day = (dt.getUTCDay() + 6) % 7; dt.setUTCDate(dt.getUTCDate() - day); return dt.toISOString().slice(0, 10); };

/** Map of schedule entry id → warning text. */
export function findClashes(entries: ClashEntry[], jobs: ClashJob[], engName: (id: string) => string): Map<string, string> {
  const job = new Map(jobs.map((j) => [j.id, j]));
  const out = new Map<string, string>();
  for (const a of entries) {
    const ja = job.get(a.job_id); if (!ja?.site_id || ja.two_engineer_ok) continue;
    for (const b of entries) {
      if (a.id === b.id) continue;
      const jb = job.get(b.job_id); if (!jb || jb.site_id !== ja.site_id || jb.two_engineer_ok) continue;
      if (a.schedule_date === b.schedule_date && a.engineer_id !== b.engineer_id) {
        out.set(a.id, `${ja.site_name} is already booked for ${engName(b.engineer_id)} on ${uk(b.schedule_date)}`); break;
      }
      if (a.job_id !== b.job_id && ja.job_type && ja.job_type === jb.job_type && weekKey(a.schedule_date) === weekKey(b.schedule_date)) {
        out.set(a.id, `${ja.site_name} already has a ${ja.job_type} booked for ${engName(b.engineer_id)} on ${uk(b.schedule_date)}`); break;
      }
    }
  }
  return out;
}

/** Warning for a booking about to be saved (used in the save step). */
export function clashForNew(entry: Omit<ClashEntry, "id">, entries: ClashEntry[], jobs: ClashJob[], engName: (id: string) => string): string | null {
  return findClashes([{ ...entry, id: "__new__" }, ...entries], jobs, engName).get("__new__") || null;
}
