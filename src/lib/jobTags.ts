/** Fixed job tags with chip colours. Remedial/SOS/Priority shade weekly-sheet rows pink. */
export const JOB_TAGS = [
  { key: "remedial", label: "Remedial", chip: "bg-pink-100 text-pink-800 border-pink-300 dark:bg-pink-950 dark:text-pink-200", pink: true },
  { key: "sos", label: "SOS", chip: "bg-red-100 text-red-800 border-red-300 dark:bg-red-950 dark:text-red-200", pink: true },
  { key: "materials", label: "Materials needed", chip: "bg-amber-100 text-amber-900 border-amber-300 dark:bg-amber-950 dark:text-amber-200", pink: false },
  { key: "quote_follow_up", label: "Quote follow-up", chip: "bg-sky-100 text-sky-900 border-sky-300 dark:bg-sky-950 dark:text-sky-200", pink: false },
  { key: "priority", label: "Priority", chip: "bg-purple-100 text-purple-900 border-purple-300 dark:bg-purple-950 dark:text-purple-200", pink: true },
] as const;
export type JobTagKey = typeof JOB_TAGS[number]["key"];
export const tagInfo = (k: string) => JOB_TAGS.find((t) => t.key === k);
export const hasPinkTag = (tags: string[] | null | undefined) => (tags || []).some((t) => tagInfo(t)?.pink);
