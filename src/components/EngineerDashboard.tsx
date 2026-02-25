import { useEffect, useState, useMemo } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTimeClock } from "@/hooks/useTimeClock";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin, Navigation, Clock, Briefcase, Loader2, LogIn, LogOut,
  Camera, FileText, MessageCircle, CheckCircle2, AlertTriangle, MessageSquare, Send, ChevronDown, ChevronUp, X
} from "lucide-react";
import { format } from "date-fns";

type ScheduledJob = {
  id: string;
  name: string;
  reference_number: string;
  address: string | null;
  status: string;
  priority: string;
  customer: string | null;
  distance_km: number | null;
};

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function priorityColor(p: string) {
  switch (p) {
    case "high": return "bg-destructive/10 text-destructive border-destructive/20";
    case "medium": return "bg-amber-500/10 text-amber-600 border-amber-500/20";
    default: return "bg-muted text-muted-foreground";
  }
}

function statusIcon(s: string) {
  switch (s) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-green-500" />;
    case "in_progress": return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    default: return <Briefcase className="h-4 w-4 text-muted-foreground" />;
  }
}

function formatElapsed(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type JobMessage = {
  id: string;
  content: string;
  sender_id: string;
  sender_name?: string;
  created_at: string;
  job_id: string;
  job_name?: string;
  job_reference?: string;
  read_by: string[];
};

export default function EngineerDashboard() {
  const { user, profile } = useAuth();
  const { isClockedIn, loading: clockLoading, acting, clockIn, clockOut, elapsedMinutes, currentPos } = useTimeClock();
  const [jobs, setJobs] = useState<ScheduledJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [geocoded, setGeocoded] = useState<Map<string, { lat: number; lng: number }>>(new Map());
  const [elapsed, setElapsed] = useState(elapsedMinutes);
  const [todayStats, setTodayStats] = useState({ submissions: 0, completed: 0 });
  const [whatsappNumber, setWhatsappNumber] = useState<string | null>(null);
  const [recentMessages, setRecentMessages] = useState<JobMessage[]>([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [expandedJobId, setExpandedJobId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<Record<string, JobMessage[]>>({});
  const [replyText, setReplyText] = useState<Record<string, string>>({});
  const [sendingReply, setSendingReply] = useState<string | null>(null);

  // Elapsed timer
  useEffect(() => {
    setElapsed(elapsedMinutes);
    if (!isClockedIn) return;
    const interval = setInterval(() => setElapsed((e) => e + 1), 60000);
    return () => clearInterval(interval);
  }, [isClockedIn, elapsedMinutes]);

  // Fetch today's jobs
  useEffect(() => {
    if (!user) return;
    const today = format(new Date(), "yyyy-MM-dd");

    const fetchJobs = async () => {
      setLoading(true);
      // Try scheduled jobs first
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("job_id")
        .eq("engineer_id", user.id)
        .eq("schedule_date", today);

      let jobIds: string[] = [];
      if (schedules && schedules.length > 0) {
        jobIds = schedules.map((s) => s.job_id);
      } else {
        // Fallback to assignments
        const { data: assignments } = await supabase
          .from("job_assignments")
          .select("job_id")
          .eq("engineer_id", user.id);
        jobIds = (assignments || []).map((a) => a.job_id);
      }

      if (jobIds.length > 0) {
        const { data: jobsData } = await supabase
          .from("jobs")
          .select("id, name, reference_number, address, status, priority, customer")
          .in("id", jobIds)
          .in("status", ["active", "scheduled", "in_progress"]);

        setJobs((jobsData || []).map((j) => ({ ...j, distance_km: null })));
      } else {
        setJobs([]);
      }
      setLoading(false);
    };

    const fetchStats = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const [subsRes, completedRes] = await Promise.all([
        supabase
          .from("submissions")
          .select("id", { count: "exact", head: true })
          .eq("engineer_id", user.id)
          .gte("created_at", todayStart.toISOString()),
        supabase
          .from("jobs")
          .select("id", { count: "exact", head: true })
          .eq("status", "completed")
          .in("id", jobs.map((j) => j.id)),
      ]);
      setTodayStats({
        submissions: subsRes.count || 0,
        completed: completedRes.count || 0,
      });
    };

    fetchJobs().then(fetchStats);
  }, [user]);

  // Fetch WhatsApp number
  useEffect(() => {
    supabase
      .from("app_settings")
      .select("value")
      .eq("key", "business_whatsapp_number")
      .single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string" && data.value !== "Not configured") {
          setWhatsappNumber(data.value);
        }
      });
  }, []);

  // Fetch recent messages across assigned jobs
  useEffect(() => {
    if (!user) return;
    const fetchMessages = async () => {
      setMessagesLoading(true);
      // Get all assigned job IDs
      const { data: assignments } = await supabase
        .from("job_assignments")
        .select("job_id")
        .eq("engineer_id", user.id);
      const allJobIds = (assignments || []).map((a: any) => a.job_id);
      if (allJobIds.length === 0) { setMessagesLoading(false); return; }

      // Fetch recent messages
      const { data: msgs } = await supabase
        .from("job_messages" as any)
        .select("id, content, sender_id, created_at, job_id, read_by")
        .in("job_id", allJobIds)
        .order("created_at", { ascending: false })
        .limit(50);

      if (!msgs) { setMessagesLoading(false); return; }

      // Fetch job names
      const { data: jobsData } = await supabase
        .from("jobs")
        .select("id, name, reference_number")
        .in("id", allJobIds);
      const jobMap: Record<string, { name: string; ref: string }> = {};
      (jobsData || []).forEach((j: any) => { jobMap[j.id] = { name: j.name, ref: j.reference_number }; });

      // Fetch sender names
      const senderIds = [...new Set((msgs as any[]).map((m: any) => m.sender_id))];
      const { data: profs } = await supabase
        .from("profiles")
        .select("user_id, full_name")
        .in("user_id", senderIds);
      const profMap: Record<string, string> = {};
      (profs || []).forEach((p: any) => { profMap[p.user_id] = p.full_name; });

      const mapped: JobMessage[] = (msgs as any[]).map((m: any) => ({
        id: m.id,
        content: m.content,
        sender_id: m.sender_id,
        sender_name: profMap[m.sender_id] || "Unknown",
        created_at: m.created_at,
        job_id: m.job_id,
        job_name: jobMap[m.job_id]?.name,
        job_reference: jobMap[m.job_id]?.ref,
        read_by: m.read_by || [],
      }));
      setRecentMessages(mapped);
      setMessagesLoading(false);
    };
    fetchMessages();
  }, [user]);

  const sendReply = async (jobId: string) => {
    const text = replyText[jobId]?.trim();
    if (!text || !user) return;
    setSendingReply(jobId);
    await supabase.from("job_messages" as any).insert({
      job_id: jobId,
      sender_id: user.id,
      content: text,
      read_by: [user.id],
    } as any);
    setReplyText((prev) => ({ ...prev, [jobId]: "" }));
    // Refresh thread
    const { data } = await supabase
      .from("job_messages" as any)
      .select("id, content, sender_id, created_at, job_id, read_by")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (data) {
      setThreadMessages((prev) => ({ ...prev, [jobId]: (data as any[]).map((m: any) => ({ ...m, sender_name: m.sender_id === user.id ? (profile?.full_name || "Me") : recentMessages.find(r => r.sender_id === m.sender_id)?.sender_name || "Unknown" })) }));
    }
    setSendingReply(null);
  };

  const openThread = async (jobId: string) => {
    if (expandedJobId === jobId) { setExpandedJobId(null); return; }
    setExpandedJobId(jobId);
    if (threadMessages[jobId]) return;
    const { data } = await supabase
      .from("job_messages" as any)
      .select("id, content, sender_id, created_at, job_id, read_by")
      .eq("job_id", jobId)
      .order("created_at", { ascending: true });
    if (data && user) {
      const senderIds = [...new Set((data as any[]).map((m: any) => m.sender_id))];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", senderIds);
      const pm: Record<string, string> = {};
      (profs || []).forEach((p: any) => { pm[p.user_id] = p.full_name; });
      setThreadMessages((prev) => ({
        ...prev,
        [jobId]: (data as any[]).map((m: any) => ({ ...m, sender_name: pm[m.sender_id] || "Unknown" })),
      }));
      // Mark all as read
      for (const m of (data as any[]).filter((m: any) => !m.read_by?.includes(user.id))) {
        await supabase.from("job_messages" as any).update({ read_by: [...(m.read_by || []), user.id] } as any).eq("id", m.id);
      }
      setRecentMessages((prev) => prev.map((msg) => msg.job_id === jobId ? { ...msg, read_by: [...msg.read_by, user.id] } : msg));
    }
  };

  // Geocode addresses
  useEffect(() => {
    if (!currentPos || jobs.length === 0) return;
    const toGeocode = jobs.filter((j) => j.address && !geocoded.has(j.id));
    if (toGeocode.length === 0) return;

    const geocodeAll = async () => {
      const results = new Map(geocoded);
      for (const job of toGeocode) {
        if (!job.address) continue;
        try {
          const res = await fetch(
            `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(job.address)}`
          );
          const data = await res.json();
          if (data?.[0]) {
            results.set(job.id, { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
          }
        } catch { /* skip */ }
      }
      setGeocoded(results);
    };
    geocodeAll();
  }, [jobs, currentPos]);

  const jobsWithDistance = useMemo(() => {
    if (!currentPos) return jobs;
    return jobs.map((j) => {
      const coords = geocoded.get(j.id);
      const dist = coords ? haversineKm(currentPos.lat, currentPos.lng, coords.lat, coords.lng) : null;
      return { ...j, distance_km: dist };
    }).sort((a, b) => {
      if (a.distance_km === null) return 1;
      if (b.distance_km === null) return -1;
      return a.distance_km - b.distance_km;
    });
  }, [jobs, geocoded, currentPos]);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return "Good morning";
    if (h < 17) return "Good afternoon";
    return "Good evening";
  };

  return (
    <div className="space-y-4 pb-6">
      {/* Greeting + Date */}
      <div>
        <h1 className="text-xl font-bold">
          {greeting()}, {profile?.full_name?.split(" ")[0] || "Engineer"}
        </h1>
        <p className="text-sm text-muted-foreground">
          {format(new Date(), "EEEE, d MMMM yyyy")}
        </p>
      </div>

      {/* Clock In/Out Card */}
      <Card className={isClockedIn
        ? "border-primary/30 bg-primary/5"
        : "border-muted"
      }>
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className={`rounded-full p-2.5 ${isClockedIn ? "bg-primary/10" : "bg-muted"}`}>
                <Clock className={`h-5 w-5 ${isClockedIn ? "text-primary" : "text-muted-foreground"}`} />
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {isClockedIn ? "Clocked In" : "Not Clocked In"}
                </p>
                {isClockedIn && (
                  <p className="text-xs text-muted-foreground font-mono">
                    {formatElapsed(elapsed)} today
                  </p>
                )}
              </div>
            </div>
            <Button
              size="sm"
              variant={isClockedIn ? "destructive" : "default"}
              onClick={isClockedIn ? clockOut : clockIn}
              disabled={acting || clockLoading}
              className="gap-1.5"
            >
              {acting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : isClockedIn ? (
                <LogOut className="h-4 w-4" />
              ) : (
                <LogIn className="h-4 w-4" />
              )}
              {isClockedIn ? "Clock Out" : "Clock In"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Quick Stats Row */}
      <div className="grid grid-cols-3 gap-2">
        <Card>
          <CardContent className="p-3 text-center">
            <Briefcase className="h-4 w-4 mx-auto mb-1 text-primary" />
            <p className="text-lg font-bold">{jobs.length}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Active Jobs</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <Camera className="h-4 w-4 mx-auto mb-1 text-accent" />
            <p className="text-lg font-bold">{todayStats.submissions}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Submissions</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <CheckCircle2 className="h-4 w-4 mx-auto mb-1 text-green-500" />
            <p className="text-lg font-bold">{todayStats.completed}</p>
            <p className="text-[10px] text-muted-foreground leading-tight">Completed</p>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex gap-2">
        <Link to="/jobs" className="flex-1">
          <Button variant="outline" size="sm" className="w-full gap-1.5">
            <Briefcase className="h-3.5 w-3.5" /> All Jobs
          </Button>
        </Link>
        {whatsappNumber && (
          <a
            href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1"
          >
            <Button variant="outline" size="sm" className="w-full gap-1.5">
              <MessageCircle className="h-3.5 w-3.5 text-green-500" /> Office
            </Button>
          </a>
        )}
      </div>

      {/* Nearest Job Highlight */}
      {currentPos && jobsWithDistance[0]?.distance_km !== null && (
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-sm">
              <Navigation className="h-4 w-4 text-primary shrink-0" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-muted-foreground">Nearest job</p>
                <p className="font-medium truncate">{jobsWithDistance[0].name}</p>
              </div>
              <Badge variant="outline" className="gap-1 shrink-0">
                <MapPin className="h-3 w-3" />
                {jobsWithDistance[0].distance_km!.toFixed(1)} km
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Today's Jobs List */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-base font-semibold">Today's Jobs</h2>
          <Badge variant="secondary" className="text-xs">
            {jobs.length}
          </Badge>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : jobsWithDistance.length === 0 ? (
          <Card>
            <CardContent className="py-8 text-center text-muted-foreground text-sm">
              No jobs scheduled for today.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {jobsWithDistance.map((job) => (
              <Link key={job.id} to={`/jobs/${job.id}`}>
                <Card className="hover:bg-accent/50 active:bg-accent/70 transition-colors">
                  <CardContent className="p-3">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {statusIcon(job.status)}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-0.5">
                          <span className="text-xs font-mono text-muted-foreground">
                            {job.reference_number}
                          </span>
                          <Badge
                            variant="outline"
                            className={`text-[10px] px-1.5 py-0 ${priorityColor(job.priority)}`}
                          >
                            {job.priority}
                          </Badge>
                        </div>
                        <p className="font-medium text-sm truncate">{job.name}</p>
                        {job.customer && (
                          <p className="text-xs text-muted-foreground truncate">{job.customer}</p>
                        )}
                        {job.address && (
                          <p className="text-xs text-muted-foreground/70 truncate mt-0.5">
                            <MapPin className="h-3 w-3 inline mr-0.5" />
                            {job.address}
                          </p>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        {job.distance_km !== null ? (
                          <span className="text-xs font-medium text-primary">
                            {job.distance_km.toFixed(1)} km
                          </span>
                        ) : job.address ? (
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        ) : null}
                      </div>
                     </div>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Job Messages Section */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-base font-semibold">Messages</h2>
          {recentMessages.filter((m) => !m.read_by.includes(user?.id || "")).length > 0 && (
            <Badge variant="destructive" className="text-xs">
              {recentMessages.filter((m) => !m.read_by.includes(user?.id || "")).length} unread
            </Badge>
          )}
        </div>

        {messagesLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : recentMessages.length === 0 ? (
          <Card>
            <CardContent className="py-6 text-center text-muted-foreground text-sm">
              No messages yet.
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-2">
            {/* Group by job */}
            {Array.from(new Map(recentMessages.map((m) => [m.job_id, m])).values()).map((latest) => {
              const jobId = latest.job_id;
              const jobMsgs = recentMessages.filter((m) => m.job_id === jobId);
              const unread = jobMsgs.filter((m) => !m.read_by.includes(user?.id || "") && m.sender_id !== user?.id).length;
              const isExpanded = expandedJobId === jobId;
              const thread = threadMessages[jobId] || [];

              return (
                <Card key={jobId} className={unread > 0 ? "border-primary/30" : ""}>
                  <CardContent className="p-0">
                    {/* Job header row - tap to expand */}
                    <button
                      className="w-full flex items-center gap-3 p-3 text-left hover:bg-muted/50 transition-colors rounded-lg"
                      onClick={() => openThread(jobId)}
                    >
                      <MessageSquare className={`h-4 w-4 shrink-0 ${unread > 0 ? "text-primary" : "text-muted-foreground"}`} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-mono text-muted-foreground">{latest.job_reference}</span>
                          {unread > 0 && (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{unread} new</Badge>
                          )}
                        </div>
                        <p className="text-sm font-medium truncate">{latest.job_name}</p>
                        <p className="text-xs text-muted-foreground truncate">
                          {latest.sender_id === user?.id ? "You" : latest.sender_name}: {latest.content.replace(/\[image:[^\]]+\]/, "📷 Image").replace(/\[doc:[^\|]+\|[^\]]+\]/, "📄 Document")}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 shrink-0">
                        <span className="text-[10px] text-muted-foreground">
                          {new Date(latest.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                        </span>
                        {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                      </div>
                    </button>

                    {/* Expanded thread */}
                    {isExpanded && (
                      <div className="border-t border-border px-3 pb-3 pt-2 space-y-3">
                        <div className="flex flex-col gap-2 max-h-52 overflow-y-auto pr-1">
                          {thread.map((msg) => {
                            const isMine = msg.sender_id === user?.id;
                            const imgMatch = msg.content.match(/\[image:(https?:\/\/[^\]]+)\]/);
                            const caption = imgMatch ? msg.content.replace(`[image:${imgMatch[1]}]`, "").trim() : null;
                            return (
                              <div key={msg.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                                <div className={`max-w-[85%] rounded-xl px-3 py-2 ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                                  {imgMatch ? (
                                    <div className="space-y-1">
                                      <img
                                        src={imgMatch[1]}
                                        alt="attachment"
                                        className="max-w-[160px] rounded-lg cursor-pointer"
                                        onClick={() => window.open(imgMatch[1], "_blank")}
                                      />
                                      {caption && <p className="text-xs">{caption}</p>}
                                    </div>
                                  ) : (
                                    <p className="text-sm">{msg.content}</p>
                                  )}
                                </div>
                                <p className="text-[10px] text-muted-foreground">
                                  {!isMine && <span className="font-medium">{msg.sender_name} · </span>}
                                  {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                                </p>
                              </div>
                            );
                          })}
                        </div>
                        {/* Reply input */}
                        <div className="flex gap-2">
                          <Textarea
                            value={replyText[jobId] || ""}
                            onChange={(e) => setReplyText((prev) => ({ ...prev, [jobId]: e.target.value }))}
                            placeholder="Reply..."
                            rows={1}
                            className="resize-none text-sm"
                            onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(jobId); } }}
                          />
                          <Button
                            size="icon"
                            className="shrink-0 self-end"
                            disabled={!replyText[jobId]?.trim() || sendingReply === jobId}
                            onClick={() => sendReply(jobId)}
                          >
                            {sendingReply === jobId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                          </Button>
                        </div>
                        <Link to={`/jobs/${jobId}`} className="block">
                          <Button variant="ghost" size="sm" className="w-full text-xs h-7">
                            View Full Job →
                          </Button>
                        </Link>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
