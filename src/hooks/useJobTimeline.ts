import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type TimelineEventType =
  | "photo"
  | "checklist"
  | "status"
  | "note"
  | "remedial"
  | "assignment"
  | "document"
  | "gallery";

export type TimelineEvent = {
  id: string;
  type: TimelineEventType;
  title: string;
  detail?: string | null;
  userId?: string | null;
  userName: string;
  timestamp: string;
  photoPath?: string | null;
};

const PER_SOURCE_LIMIT = 200;

function isImageName(name?: string | null) {
  return !!name && /\.(jpe?g|png|gif|webp|heic|heif|bmp|avif)$/i.test(name);
}

function prettyStatus(s?: string | null) {
  if (!s) return "";
  return s.replace(/_/g, " ");
}

async function safe<T>(p: PromiseLike<{ data: T | null; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await p;
    if (error) return [];
    return (data as unknown as T[]) || [];
  } catch {
    return [];
  }
}

export function useJobTimeline(jobId?: string, pageSize = 20) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [visible, setVisible] = useState(pageSize);
  const reloadTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    if (!jobId) return;
    setLoading(true);

    const [activity, subs, defects, assignments, documents, checklists, galleries, messages] = await Promise.all([
      safe<any>(supabase.from("job_activity_log").select("id,action,details,user_id,created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("submissions").select("id,type,content,file_name,file_url,engineer_id,created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("defects").select("id,title,description,severity,status,reported_by,resolved_by,resolved_at,created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("job_assignments").select("id,engineer_id,assigned_at").eq("job_id", jobId).order("assigned_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("job_documents").select("id,label,file_name,document_type,created_by,created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("job_photo_checklists").select("id,status,created_by,created_at,updated_at,template_id").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("shared_galleries").select("id,title,created_by,created_at,expires_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
      safe<any>(supabase.from("job_messages").select("id,content,sender_id,created_at").eq("job_id", jobId).order("created_at", { ascending: false }).limit(PER_SOURCE_LIMIT)),
    ]);

    // Checklist completion percentages
    const checklistIds = checklists.map((c) => c.id);
    let completion = new Map<string, { done: number; total: number }>();
    if (checklistIds.length) {
      const responses = await safe<any>(
        supabase.from("job_photo_checklist_responses").select("id,checklist_id,photo_url,after_photo_url,text_value,is_pass").in("checklist_id", checklistIds),
      );
      const templateIds = Array.from(new Set(checklists.map((c) => c.template_id).filter(Boolean)));
      const items = templateIds.length
        ? await safe<any>(supabase.from("photo_checklist_items").select("id,template_id").in("template_id", templateIds))
        : [];
      const itemCountByTemplate = new Map<string, number>();
      for (const it of items) itemCountByTemplate.set(it.template_id, (itemCountByTemplate.get(it.template_id) || 0) + 1);
      completion = new Map(
        checklists.map((c) => {
          const done = responses.filter(
            (r) => r.checklist_id === c.id && (r.photo_url || r.after_photo_url || r.text_value || r.is_pass !== null),
          ).length;
          return [c.id, { done, total: itemCountByTemplate.get(c.template_id) || done }];
        }),
      );
    }

    // Template names
    const templateIds = Array.from(new Set(checklists.map((c) => c.template_id).filter(Boolean)));
    const templates = templateIds.length
      ? await safe<any>(supabase.from("photo_checklist_templates").select("id,name").in("id", templateIds))
      : [];
    const templateName = new Map(templates.map((t) => [t.id, t.name as string]));

    // Resolve user names
    const userIds = new Set<string>();
    const add = (v?: string | null) => { if (v) userIds.add(v); };
    activity.forEach((a) => add(a.user_id));
    subs.forEach((s) => add(s.engineer_id));
    defects.forEach((d) => { add(d.reported_by); add(d.resolved_by); });
    assignments.forEach((a) => add(a.engineer_id));
    documents.forEach((d) => add(d.created_by));
    checklists.forEach((c) => add(c.created_by));
    galleries.forEach((g) => add(g.created_by));
    messages.forEach((m) => add(m.sender_id));

    const profiles = userIds.size
      ? await safe<any>(supabase.from("profiles").select("user_id,full_name").in("user_id", Array.from(userIds)))
      : [];
    const nameByUser = new Map(profiles.map((p) => [p.user_id, (p.full_name as string) || ""]));
    const nameOf = (uid?: string | null) => (uid && nameByUser.get(uid)) || "Unknown user";

    const out: TimelineEvent[] = [];

    for (const a of activity) {
      if (a.action === "status_change") {
        out.push({
          id: `act:${a.id}`,
          type: "status",
          title: "Status changed",
          detail: a.details,
          userId: a.user_id,
          userName: nameOf(a.user_id),
          timestamp: a.created_at,
        });
      } else if (a.action !== "submission") {
        out.push({
          id: `act:${a.id}`,
          type: "status",
          title: prettyStatus(a.action) || "Job updated",
          detail: a.details,
          userId: a.user_id,
          userName: nameOf(a.user_id),
          timestamp: a.created_at,
        });
      }
    }

    for (const s of subs) {
      const photo = isImageName(s.file_name) || isImageName(s.file_url);
      if (photo) {
        out.push({
          id: `sub:${s.id}`,
          type: "photo",
          title: "Photo added",
          detail: s.content || s.file_name,
          userId: s.engineer_id,
          userName: nameOf(s.engineer_id),
          timestamp: s.created_at,
          photoPath: s.file_url,
        });
      } else if (s.file_url) {
        out.push({
          id: `sub:${s.id}`,
          type: "document",
          title: "File uploaded",
          detail: s.file_name || s.content,
          userId: s.engineer_id,
          userName: nameOf(s.engineer_id),
          timestamp: s.created_at,
        });
      } else if (s.content) {
        out.push({
          id: `sub:${s.id}`,
          type: "note",
          title: "Note added",
          detail: s.content,
          userId: s.engineer_id,
          userName: nameOf(s.engineer_id),
          timestamp: s.created_at,
        });
      }
    }

    for (const m of messages) {
      out.push({
        id: `msg:${m.id}`,
        type: "note",
        title: "Message posted",
        detail: m.content,
        userId: m.sender_id,
        userName: nameOf(m.sender_id),
        timestamp: m.created_at,
      });
    }

    for (const d of defects) {
      out.push({
        id: `def:${d.id}`,
        type: "remedial",
        title: "Remedial item created",
        detail: [d.title || d.description, d.severity ? `severity: ${d.severity}` : null].filter(Boolean).join(" — "),
        userId: d.reported_by,
        userName: nameOf(d.reported_by),
        timestamp: d.created_at,
      });
      if (d.resolved_at) {
        out.push({
          id: `def-res:${d.id}`,
          type: "remedial",
          title: "Remedial item resolved",
          detail: d.title || d.description,
          userId: d.resolved_by,
          userName: nameOf(d.resolved_by),
          timestamp: d.resolved_at,
        });
      }
    }

    for (const a of assignments) {
      out.push({
        id: `asg:${a.id}`,
        type: "assignment",
        title: "Engineer assigned",
        detail: nameOf(a.engineer_id),
        userId: a.engineer_id,
        userName: nameOf(a.engineer_id),
        timestamp: a.assigned_at,
      });
    }

    for (const d of documents) {
      out.push({
        id: `doc:${d.id}`,
        type: "document",
        title: "Document uploaded",
        detail: d.label || d.file_name || d.document_type,
        userId: d.created_by,
        userName: nameOf(d.created_by),
        timestamp: d.created_at,
      });
    }

    for (const c of checklists) {
      const stats = completion.get(c.id);
      const pct = stats && stats.total ? Math.round((stats.done / stats.total) * 100) : null;
      const name = templateName.get(c.template_id) || "Photo checklist";
      const done = c.status === "completed" || c.status === "complete";
      out.push({
        id: `chk:${c.id}`,
        type: "checklist",
        title: done ? "Photo checklist completed" : "Photo checklist started",
        detail: [name, pct !== null ? `${pct}% complete` : null].filter(Boolean).join(" — "),
        userId: c.created_by,
        userName: nameOf(c.created_by),
        timestamp: done ? c.updated_at || c.created_at : c.created_at,
      });
    }

    for (const g of galleries) {
      out.push({
        id: `gal:${g.id}`,
        type: "gallery",
        title: "Photo gallery link created",
        detail: g.title,
        userId: g.created_by,
        userName: nameOf(g.created_by),
        timestamp: g.created_at,
      });
    }

    out.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    setEvents(out);
    setLoading(false);
  }, [jobId]);

  useEffect(() => {
    setVisible(pageSize);
    void load();
  }, [load, pageSize]);

  // Near-real-time refresh
  useEffect(() => {
    if (!jobId) return;
    const scheduleReload = () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      reloadTimer.current = setTimeout(() => void load(), 1500);
    };
    const channel = supabase
      .channel(`job-timeline-${jobId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "submissions", filter: `job_id=eq.${jobId}` }, scheduleReload)
      .on("postgres_changes", { event: "*", schema: "public", table: "job_activity_log", filter: `job_id=eq.${jobId}` }, scheduleReload)
      .subscribe();
    return () => {
      if (reloadTimer.current) clearTimeout(reloadTimer.current);
      supabase.removeChannel(channel);
    };
  }, [jobId, load]);

  const pageEvents = useMemo(() => events.slice(0, visible), [events, visible]);

  return {
    events: pageEvents,
    total: events.length,
    hasMore: visible < events.length,
    loadMore: () => setVisible((v) => v + pageSize),
    loading,
    reload: load,
  };
}
