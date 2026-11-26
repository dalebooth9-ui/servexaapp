import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { JOB_TAGS } from "@/lib/jobTags";
import { cn } from "@/lib/utils";

export interface JobFlagsValue {
  time_window: string; call_ahead_minutes: string; access_contact_name: string; access_contact_phone: string;
  access_notes: string; customer_po: string; tags: string[];
}
export const emptyFlags: JobFlagsValue = { time_window: "", call_ahead_minutes: "", access_contact_name: "", access_contact_phone: "", access_notes: "", customer_po: "", tags: [] };

export function flagsFromJob(j: any): JobFlagsValue {
  return {
    time_window: j?.time_window || "", call_ahead_minutes: j?.call_ahead_minutes ? String(j.call_ahead_minutes) : "",
    access_contact_name: j?.access_contact_name || "", access_contact_phone: j?.access_contact_phone || "",
    access_notes: j?.access_notes || "", customer_po: j?.customer_po || "", tags: j?.tags || [],
  };
}
export function flagsToUpdate(v: JobFlagsValue) {
  const t = (s: string) => s.trim() || null;
  const m = parseInt(v.call_ahead_minutes);
  return { time_window: t(v.time_window), call_ahead_minutes: m > 0 ? m : null, access_contact_name: t(v.access_contact_name),
    access_contact_phone: t(v.access_contact_phone), access_notes: t(v.access_notes), customer_po: t(v.customer_po), tags: v.tags };
}

export function TagChips({ tags, className }: { tags?: string[] | null; className?: string }) {
  if (!tags?.length) return null;
  return <span className={cn("inline-flex flex-wrap gap-1", className)}>{tags.map((k) => { const t = JOB_TAGS.find((x) => x.key === k); return t ? <span key={k} className={cn("rounded border px-1 py-0 text-[9px] font-semibold leading-4", t.chip)}>{t.label}</span> : null; })}</span>;
}

export default function JobFlagsFields({ value, onChange, idPrefix = "jf" }: { value: JobFlagsValue; onChange: (v: JobFlagsValue) => void; idPrefix?: string }) {
  const set = (k: keyof JobFlagsValue, v: any) => onChange({ ...value, [k]: v });
  const toggle = (k: string) => set("tags", value.tags.includes(k) ? value.tags.filter((x) => x !== k) : [...value.tags, k]);
  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1"><Label htmlFor={`${idPrefix}-tw`} className="text-xs">Time window</Label>
          <Input id={`${idPrefix}-tw`} placeholder="e.g. 9am-12pm or early start 7am" value={value.time_window} onChange={(e) => set("time_window", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`${idPrefix}-ca`} className="text-xs">Call ahead (minutes before)</Label>
          <Input id={`${idPrefix}-ca`} type="number" min={0} step={15} placeholder="e.g. 60" value={value.call_ahead_minutes} onChange={(e) => set("call_ahead_minutes", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`${idPrefix}-cn`} className="text-xs">Access contact name</Label>
          <Input id={`${idPrefix}-cn`} value={value.access_contact_name} onChange={(e) => set("access_contact_name", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`${idPrefix}-cp`} className="text-xs">Access contact phone</Label>
          <Input id={`${idPrefix}-cp`} type="tel" value={value.access_contact_phone} onChange={(e) => set("access_contact_phone", e.target.value)} /></div>
        <div className="space-y-1"><Label htmlFor={`${idPrefix}-po`} className="text-xs">PO number</Label>
          <Input id={`${idPrefix}-po`} value={value.customer_po} onChange={(e) => set("customer_po", e.target.value)} /></div>
      </div>
      <div className="space-y-1"><Label htmlFor={`${idPrefix}-an`} className="text-xs">Access notes</Label>
        <Textarea id={`${idPrefix}-an`} rows={2} value={value.access_notes} onChange={(e) => set("access_notes", e.target.value)} /></div>
      <div className="space-y-1"><Label className="text-xs">Tags</Label>
        <div className="flex flex-wrap gap-2">{JOB_TAGS.map((t) => (
          <button key={t.key} type="button" aria-pressed={value.tags.includes(t.key)} onClick={() => toggle(t.key)}
            className={cn("rounded-full border px-2.5 py-1 text-xs font-medium", value.tags.includes(t.key) ? t.chip : "bg-background text-muted-foreground")}>{t.label}</button>
        ))}</div></div>
    </div>
  );
}
