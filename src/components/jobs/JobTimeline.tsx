import { useEffect, useState } from "react";
import {
  AlertTriangle,
  ArrowRightLeft,
  Camera,
  CheckCircle,
  FileText,
  MessageSquare,
  Share2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { createSubmissionPhotoSignedUrl } from "@/lib/jobPhotos";
import { useJobTimeline, type TimelineEvent, type TimelineEventType } from "@/hooks/useJobTimeline";

const STYLES: Record<TimelineEventType, { Icon: typeof Camera; className: string }> = {
  photo: { Icon: Camera, className: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300" },
  checklist: { Icon: CheckCircle, className: "bg-green-100 text-green-700 dark:bg-green-950 dark:text-green-300" },
  status: { Icon: ArrowRightLeft, className: "bg-orange-100 text-orange-700 dark:bg-orange-950 dark:text-orange-300" },
  note: { Icon: MessageSquare, className: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300" },
  remedial: { Icon: AlertTriangle, className: "bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-300" },
  assignment: { Icon: UserPlus, className: "bg-teal-100 text-teal-700 dark:bg-teal-950 dark:text-teal-300" },
  document: { Icon: FileText, className: "bg-muted text-muted-foreground" },
  gallery: { Icon: Share2, className: "bg-indigo-100 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300" },
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  return (parts[0][0] + (parts[1]?.[0] || "")).toUpperCase();
}

function timeOfDay(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

function relative(iso: string) {
  const then = new Date(iso).getTime();
  const mins = Math.round((Date.now() - then) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.round(hrs / 24);
  if (days === 1) return `Yesterday at ${timeOfDay(iso)}`;
  if (days < 7) return `${days} days ago`;
  return new Date(iso).toLocaleDateString("en-GB");
}

function dayKey(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (dayKey(iso) === dayKey(today.toISOString())) return "Today";
  if (dayKey(iso) === dayKey(yesterday.toISOString())) return "Yesterday";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "long", year: "numeric" });
}

function PhotoThumb({ path, jobId }: { path: string; jobId: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    createSubmissionPhotoSignedUrl(path, jobId, 3600)
      .then((r) => { if (!cancelled) setUrl(r?.signedUrl || null); })
      .catch(() => { /* thumbnail is optional */ });
    return () => { cancelled = true; };
  }, [path, jobId]);
  if (!url) return null;
  return (
    <img
      src={url}
      alt=""
      loading="lazy"
      className="mt-2 h-20 w-20 rounded-md border object-cover sm:h-24 sm:w-24"
    />
  );
}

function EventRow({ event, jobId }: { event: TimelineEvent; jobId: string }) {
  const { Icon, className } = STYLES[event.type];
  return (
    <li className="relative pl-10 sm:pl-12">
      <span className={`absolute left-0 top-1 flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-background ${className}`}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="rounded-lg border bg-card p-3 shadow-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-sm font-medium">{event.title}</p>
          <span className="text-xs text-muted-foreground">{relative(event.timestamp)}</span>
        </div>
        {event.detail && (
          <p className="mt-1 whitespace-pre-wrap break-words text-sm text-muted-foreground line-clamp-4">{event.detail}</p>
        )}
        {event.type === "photo" && event.photoPath && <PhotoThumb path={event.photoPath} jobId={jobId} />}
        <div className="mt-2 flex items-center gap-2">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-muted text-[10px] font-semibold text-muted-foreground">
            {initials(event.userName)}
          </span>
          <span className="text-xs text-muted-foreground">{event.userName}</span>
        </div>
      </div>
    </li>
  );
}

export default function JobTimeline({ jobId }: { jobId: string }) {
  const { events, hasMore, loadMore, loading, total } = useJobTimeline(jobId, 20);

  if (loading && !events.length) {
    return <div className="h-24 w-full animate-pulse rounded-lg bg-muted/40" aria-hidden />;
  }

  if (!events.length) {
    return <p className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">No activity recorded on this job yet.</p>;
  }

  const groups: { label: string; items: TimelineEvent[] }[] = [];
  for (const ev of events) {
    const label = dayLabel(ev.timestamp);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(ev);
    else groups.push({ label, items: [ev] });
  }

  return (
    <div className="space-y-6">
      {groups.map((group) => (
        <div key={group.label}>
          <div className="mb-3 flex items-center gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{group.label}</h4>
            <span className="h-px flex-1 bg-border" />
          </div>
          <ul className="relative space-y-3 before:absolute before:left-[13px] before:top-0 before:h-full before:w-px before:bg-border">
            {group.items.map((ev) => (
              <EventRow key={ev.id} event={ev} jobId={jobId} />
            ))}
          </ul>
        </div>
      ))}

      {hasMore ? (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={loadMore}>
            Load more ({total - events.length} older)
          </Button>
        </div>
      ) : (
        <p className="text-center text-xs text-muted-foreground">End of timeline</p>
      )}
    </div>
  );
}
