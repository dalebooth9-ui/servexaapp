import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import {
  ClipboardList, Clock, FileText, MapPin, User, CheckCircle2, AlertTriangle,
  Ban, Send, Printer, Plus, Activity,
} from "lucide-react";
import JobSheetTemplates from "./JobSheetTemplates";
import CertificateOfConformity from "./CertificateOfConformity";
import { format } from "date-fns";
import { useToast } from "@/hooks/use-toast";
import jsPDF from "jspdf";

type ActivityEntry = {
  id: string;
  job_id: string;
  user_id: string | null;
  action: string;
  details: string | null;
  created_at: string;
};

type Visit = {
  id: string;
  scheduled_date: string;
  scheduled_time: string | null;
  status: string;
  engineer_id: string | null;
  notes: string | null;
  completed_at: string | null;
};

type Assignment = {
  engineer_id: string;
  assigned_at: string;
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  status_change: <Activity className="h-3.5 w-3.5 text-primary" />,
  visit_update: <Clock className="h-3.5 w-3.5 text-amber-500" />,
  submission: <FileText className="h-3.5 w-3.5 text-accent" />,
  note: <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" />,
};

const VISIT_STATUS_ICON: Record<string, React.ReactNode> = {
  upcoming: <Clock className="h-3 w-3" />,
  completed: <CheckCircle2 className="h-3 w-3 text-green-600" />,
  overdue: <AlertTriangle className="h-3 w-3 text-destructive" />,
  cancelled: <Ban className="h-3 w-3 text-muted-foreground" />,
  unscheduled: <AlertTriangle className="h-3 w-3 text-amber-500" />,
};

export default function JobSheet({ jobId, job }: { jobId: string; job: any }) {
  const { user } = useAuth();
  const { toast } = useToast();
  const [activities, setActivities] = useState<ActivityEntry[]>([]);
  const [visits, setVisits] = useState<Visit[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const [newNote, setNewNote] = useState("");
  const [adding, setAdding] = useState(false);
  const [templateResponses, setTemplateResponses] = useState<any[]>([]);
  const [templates, setTemplates] = useState<any[]>([]);
  const sheetRef = useRef<HTMLDivElement>(null);

  const fetchAll = async () => {
    const [actRes, visitRes, assignRes, respRes, tplRes] = await Promise.all([
      supabase
        .from("job_activity_log")
        .select("*")
        .eq("job_id", jobId)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("job_visits")
        .select("id, scheduled_date, scheduled_time, status, engineer_id, notes, completed_at")
        .eq("job_id", jobId)
        .order("scheduled_date", { ascending: true }),
      supabase
        .from("job_assignments")
        .select("engineer_id, assigned_at")
        .eq("job_id", jobId),
      supabase
        .from("job_sheet_responses")
        .select("*")
        .eq("job_id", jobId)
        .eq("status", "submitted")
        .order("submitted_at", { ascending: true }),
      supabase
        .from("job_sheet_templates")
        .select("*"),
    ]);
    setActivities((actRes.data as ActivityEntry[]) || []);
    setVisits((visitRes.data as Visit[]) || []);
    setAssignments((assignRes.data as Assignment[]) || []);
    setTemplateResponses(respRes.data || []);
    setTemplates(tplRes.data || []);

    // Fetch profile names for all user_ids
    const userIds = new Set<string>();
    (actRes.data || []).forEach((a: any) => a.user_id && userIds.add(a.user_id));
    (assignRes.data || []).forEach((a: any) => a.engineer_id && userIds.add(a.engineer_id));
    (visitRes.data || []).forEach((v: any) => v.engineer_id && userIds.add(v.engineer_id));
    (respRes.data || []).forEach((r: any) => r.submitted_by && userIds.add(r.submitted_by));
    if (userIds.size > 0) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", Array.from(userIds));
      const map: Record<string, string> = {};
      (profs || []).forEach((p) => { map[p.user_id] = p.full_name; });
      setProfiles(map);
    }
  };

  useEffect(() => { fetchAll(); }, [jobId]);

  // Realtime for activity log
  useEffect(() => {
    const channel = supabase
      .channel(`job_sheet_${jobId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "job_activity_log", filter: `job_id=eq.${jobId}` }, () => fetchAll())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [jobId]);

  const handleAddNote = async () => {
    if (!newNote.trim()) return;
    setAdding(true);
    const { error } = await supabase.from("job_activity_log").insert({
      job_id: jobId,
      user_id: user?.id || null,
      action: "note",
      details: newNote.trim(),
    } as any);
    if (error) {
      toast({ title: "Error", description: "Failed to add note.", variant: "destructive" });
    } else {
      setNewNote("");
      fetchAll();
    }
    setAdding(false);
  };

  const handleExportPdf = async () => {
    const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
    const margin = 15;
    const pageWidth = doc.internal.pageSize.getWidth();
    const maxWidth = pageWidth - margin * 2;
    let y = margin;

    const checkPage = (needed: number) => { if (y + needed > 270) { doc.addPage(); y = margin; } };

    // Helper: fetch image from storage and return data URL
    const fetchImageDataUrl = async (path: string): Promise<string | null> => {
      try {
        const { data: urlData } = await supabase.storage
          .from("submissions")
          .createSignedUrl(path, 60);
        if (!urlData?.signedUrl) return null;
        const response = await fetch(urlData.signedUrl);
        const blob = await response.blob();
        return new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
      } catch {
        return null;
      }
    };

    // Header
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("JOB SHEET", margin, y + 6);
    y += 12;

    doc.setFontSize(10);
    doc.setFont("helvetica", "normal");
    doc.text(`Reference: ${job.reference_number}`, margin, y);
    y += 5;
    doc.text(`Job: ${job.name}`, margin, y);
    y += 5;
    if (job.customer) { doc.text(`Customer: ${job.customer}`, margin, y); y += 5; }
    if (job.address) { doc.text(`Address: ${job.address}`, margin, y); y += 5; }
    doc.text(`Status: ${job.status} | Priority: ${job.priority} | Type: ${job.job_type || "one_off"}`, margin, y);
    y += 5;
    doc.text(`Created: ${format(new Date(job.created_at), "dd/MM/yyyy HH:mm")}`, margin, y);
    y += 8;

    // Engineers
    if (assignments.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("ASSIGNED ENGINEERS", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      assignments.forEach((a) => {
        doc.text(`• ${profiles[a.engineer_id] || "Unknown"} (since ${format(new Date(a.assigned_at), "dd/MM/yyyy")})`, margin + 2, y);
        y += 4.5;
      });
      y += 3;
    }

    // Visits
    if (visits.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("SCHEDULED VISITS", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      visits.forEach((v) => {
        const eng = v.engineer_id ? profiles[v.engineer_id] || "Unknown" : "Unassigned";
        doc.text(`• ${format(new Date(v.scheduled_date), "dd/MM/yyyy")} ${v.scheduled_time || ""} — ${eng} — ${v.status}`, margin + 2, y);
        y += 4.5;
        if (y > 270) { doc.addPage(); y = margin; }
      });
      y += 3;
    }

    // Completed Template Reports
    if (templateResponses.length > 0) {
      for (const resp of templateResponses) {
        checkPage(20);
        const tpl = templates.find((t: any) => t.id === resp.template_id);
        if (!tpl) continue;
        const fields = (typeof tpl.fields === "string" ? JSON.parse(tpl.fields) : tpl.fields) as any[];
        const responses = resp.responses as Record<string, any>;

        doc.setFont("helvetica", "bold");
        doc.setFontSize(10);
        doc.text(`REPORT: ${tpl.name.toUpperCase()}`, margin, y);
        y += 4;
        doc.setFontSize(8);
        doc.setFont("helvetica", "normal");
        const submitter = resp.submitted_by ? profiles[resp.submitted_by] || "Unknown" : "Unknown";
        doc.text(`Submitted by ${submitter}${resp.submitted_at ? " on " + format(new Date(resp.submitted_at), "dd/MM/yyyy HH:mm") : ""}`, margin, y);
        y += 5;
        doc.setFontSize(10);

        const sections = [...new Set(fields.map((f: any) => f.section || "General"))];
        for (const section of sections) {
          checkPage(10);
          doc.setFont("helvetica", "bold");
          doc.setFontSize(9);
          doc.text(section, margin + 2, y);
          y += 4;
          doc.setFont("helvetica", "normal");
          doc.setFontSize(10);

          const sectionFields = fields.filter((f: any) => (f.section || "General") === section);
          for (const field of sectionFields) {
            checkPage(8);
            const val = responses[field.id];

            if (field.type === "photo" && val && typeof val === "string" && val.startsWith("template-photos/")) {
              // Embed photo inline
              doc.text(`${field.label}:`, margin + 4, y);
              y += 4;
              const dataUrl = await fetchImageDataUrl(val);
              if (dataUrl) {
                checkPage(45);
                try {
                  doc.addImage(dataUrl, "JPEG", margin + 4, y, 50, 37.5);
                  y += 40;
                } catch {
                  doc.text("[Photo could not be embedded]", margin + 8, y);
                  y += 4.5;
                }
              } else {
                doc.text("[Photo unavailable]", margin + 8, y);
                y += 4.5;
              }
            } else {
              let displayVal = "";
              if (field.type === "checkbox") {
                const normalizedVal = typeof val === "string" ? val.toLowerCase().trim() : "";
                displayVal = normalizedVal === "yes" || normalizedVal === "true" || val === true
                  ? "Yes"
                  : normalizedVal === "no" || normalizedVal === "false" || val === false
                  ? "No"
                  : normalizedVal === "n/a" || normalizedVal === "na"
                  ? "N/A"
                  : val != null && val !== ""
                  ? String(val)
                  : "—";
              } else {
                displayVal = val != null && val !== "" ? String(val) : "—";
              }
              doc.text(`${field.label}: ${displayVal}`, margin + 4, y, { maxWidth: 165 });
              y += 4.5;
            }
          }
          y += 1;
        }
        y += 3;
      }
    }

    // Activity
    if (activities.length > 0) {
      doc.setFont("helvetica", "bold");
      doc.text("ACTIVITY LOG", margin, y);
      y += 5;
      doc.setFont("helvetica", "normal");
      activities.forEach((a) => {
        if (y > 270) { doc.addPage(); y = margin; }
        const who = a.user_id ? profiles[a.user_id] || "" : "System";
        doc.text(`${format(new Date(a.created_at), "dd/MM HH:mm")} | ${who} | ${a.action}: ${a.details || ""}`, margin + 2, y, { maxWidth: 170 });
        y += 4.5;
      });
    }

    doc.save(`job-sheet-${job.reference_number}.pdf`);
    toast({ title: "Job sheet exported" });
  };

  const completedVisits = visits.filter((v) => v.status === "completed").length;
  const totalVisits = visits.length;

  return (
    <div ref={sheetRef} className="space-y-4">
      {/* Summary strip */}
      <div className="flex flex-wrap items-center gap-3">
        <Badge variant="outline" className="gap-1 text-xs">
          <User className="h-3 w-3" /> {assignments.length} Engineer{assignments.length !== 1 ? "s" : ""}
        </Badge>
        <Badge variant="outline" className="gap-1 text-xs">
          <Clock className="h-3 w-3" /> {completedVisits}/{totalVisits} Visits
        </Badge>
        <Badge variant="outline" className="gap-1 text-xs">
          <Activity className="h-3 w-3" /> {activities.length} Events
        </Badge>
        <div className="ml-auto">
          <Button variant="outline" size="sm" onClick={handleExportPdf}>
            <Printer className="mr-1.5 h-3.5 w-3.5" /> Export Job Sheet
          </Button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        {/* Visit summary + Templates */}
        <div className="space-y-4">
          <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <ClipboardList className="h-4 w-4" /> Visit Progress
            </CardTitle>
          </CardHeader>
          <CardContent>
            {visits.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">No visits scheduled.</p>
            ) : (
              <div className="space-y-2">
                {/* Progress bar */}
                <div className="flex items-center gap-3 mb-3">
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${totalVisits > 0 ? (completedVisits / totalVisits) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="text-xs font-medium text-muted-foreground whitespace-nowrap">
                    {completedVisits}/{totalVisits}
                  </span>
                </div>
                {visits.map((v) => (
                  <div key={v.id} className="flex items-center gap-2 text-sm py-1 border-b last:border-0 border-border/50">
                    {VISIT_STATUS_ICON[v.status] || <Clock className="h-3 w-3" />}
                    <span className="font-medium whitespace-nowrap">{format(new Date(v.scheduled_date), "dd MMM yyyy")}</span>
                    {v.scheduled_time && <span className="text-muted-foreground">{v.scheduled_time}</span>}
                    <span className="text-muted-foreground">—</span>
                    <span className="text-muted-foreground truncate">
                      {v.engineer_id ? profiles[v.engineer_id] || "Unknown" : "Unassigned"}
                    </span>
                    <Badge variant="secondary" className="ml-auto text-[10px] capitalize">{v.status}</Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

          {/* Job Sheet Templates */}
          <JobSheetTemplates jobId={jobId} />
          {/* Certificate of Conformity (installation jobs) */}
          <CertificateOfConformity jobId={jobId} />
        </div>

        {/* Activity timeline */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2">
              <Activity className="h-4 w-4" /> Activity Timeline
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {/* Add note */}
            <div className="px-4 pb-3">
              <div className="flex gap-2">
                <Textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Add a note to the job sheet..."
                  rows={2}
                  className="text-sm"
                />
                <Button size="sm" onClick={handleAddNote} disabled={adding || !newNote.trim()} className="self-end">
                  <Send className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
            <Separator />
            <ScrollArea className="h-[340px]">
              {activities.length === 0 ? (
                <p className="text-sm text-muted-foreground py-8 text-center">No activity yet.</p>
              ) : (
                <div className="relative px-4 py-3">
                  {/* Timeline line */}
                  <div className="absolute left-[26px] top-0 bottom-0 w-px bg-border" />
                  {activities.map((a) => (
                    <div key={a.id} className="relative flex gap-3 pb-4 last:pb-0">
                      <div className="relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border bg-card">
                        {ACTION_ICON[a.action] || <Activity className="h-3.5 w-3.5 text-muted-foreground" />}
                      </div>
                      <div className="flex-1 min-w-0 pt-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium capitalize">
                            {a.action.replace("_", " ")}
                          </span>
                          {a.user_id && profiles[a.user_id] && (
                            <span className="text-[10px] text-muted-foreground">by {profiles[a.user_id]}</span>
                          )}
                        </div>
                        {a.details && (
                          <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{a.details}</p>
                        )}
                        <span className="text-[10px] text-muted-foreground/70">
                          {format(new Date(a.created_at), "dd MMM yyyy, HH:mm")}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
