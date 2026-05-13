import { useEffect, useState, useMemo } from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useTimeClock } from "@/hooks/useTimeClock";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  MapPin, Navigation, Clock, Briefcase, Loader2, LogIn, LogOut,
  Camera, CheckCircle2, MessageSquare, Send, ChevronDown, ChevronUp,
  Home, List, Bell, User, AlertTriangle, Phone, ExternalLink,
  ChevronRight, Zap, ArrowRight
} from "lucide-react";
import { format } from "date-fns";
import VehicleCheckSheet from "@/components/VehicleCheckSheet";
import VehicleCheckHistory from "@/components/VehicleCheckHistory";

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

function priorityBg(p: string) {
  switch (p) {
    case "high": return "bg-destructive";
    case "medium": return "bg-amber-500";
    default: return "bg-muted-foreground/40";
  }
}

function statusLabel(s: string) {
  switch (s) {
    case "completed": return { label: "Done", cls: "bg-green-500/15 text-green-700 dark:text-green-400" };
    case "in_progress": return { label: "In Progress", cls: "bg-primary/15 text-primary" };
    case "scheduled": return { label: "Scheduled", cls: "bg-blue-500/15 text-blue-700 dark:text-blue-400" };
    default: return { label: "Active", cls: "bg-muted text-muted-foreground" };
  }
}

function formatElapsed(mins: number) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

type Tab = "home" | "jobs" | "messages" | "profile";

export default function EngineerDashboard() {
  const { user, profile } = useAuth();
  const navigate = useNavigate();
  const { isClockedIn, loading: clockLoading, acting, clockIn, clockOut, elapsedMinutes, currentPos } = useTimeClock();

  const [activeTab, setActiveTab] = useState<Tab>("home");
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
  const [notifications, setNotifications] = useState<any[]>([]);
  const [vehicleCheckDone, setVehicleCheckDone] = useState<boolean | null>(null);

  // Check today's vehicle check
  useEffect(() => {
    if (!user) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const load = async () => {
      const { data } = await supabase
        .from("vehicle_checks")
        .select("status")
        .eq("engineer_id", user.id)
        .eq("check_date", today)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      setVehicleCheckDone(data?.status === "accepted");
    };
    load();
    const channel = supabase
      .channel("vehicle-checks-dashboard")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "vehicle_checks", filter: `engineer_id=eq.${user.id}` },
        () => load()
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user]);

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
      const { data: schedules } = await supabase
        .from("job_schedule")
        .select("job_id")
        .eq("engineer_id", user.id)
        .eq("schedule_date", today);
      let jobIds: string[] = [];
      if (schedules && schedules.length > 0) {
        jobIds = schedules.map((s) => s.job_id);
      } else {
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
      const [subsRes] = await Promise.all([
        supabase.from("submissions").select("id", { count: "exact", head: true })
          .eq("engineer_id", user.id).gte("created_at", todayStart.toISOString()),
      ]);
      setTodayStats({ submissions: subsRes.count || 0, completed: 0 });
    };
    fetchJobs().then(fetchStats);
  }, [user]);

  // Fetch WhatsApp
  useEffect(() => {
    supabase.from("app_settings").select("value").eq("key", "business_whatsapp_number").single()
      .then(({ data }) => {
        if (data?.value && typeof data.value === "string" && data.value !== "Not configured") {
          setWhatsappNumber(data.value);
        }
      });
  }, []);

  // Fetch messages
  useEffect(() => {
    if (!user) return;
    const fetchMessages = async () => {
      setMessagesLoading(true);
      const { data: assignments } = await supabase.from("job_assignments").select("job_id").eq("engineer_id", user.id);
      const allJobIds = (assignments || []).map((a: any) => a.job_id);
      if (allJobIds.length === 0) { setMessagesLoading(false); return; }
      const { data: msgs } = await supabase.from("job_messages" as any)
        .select("id, content, sender_id, created_at, job_id, read_by")
        .in("job_id", allJobIds).order("created_at", { ascending: false }).limit(50);
      if (!msgs) { setMessagesLoading(false); return; }
      const { data: jobsData } = await supabase.from("jobs").select("id, name, reference_number").in("id", allJobIds);
      const jobMap: Record<string, { name: string; ref: string }> = {};
      (jobsData || []).forEach((j: any) => { jobMap[j.id] = { name: j.name, ref: j.reference_number }; });
      const senderIds = [...new Set((msgs as any[]).map((m: any) => m.sender_id))];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", senderIds);
      const profMap: Record<string, string> = {};
      (profs || []).forEach((p: any) => { profMap[p.user_id] = p.full_name; });
      const mapped: JobMessage[] = (msgs as any[]).map((m: any) => ({
        id: m.id, content: m.content, sender_id: m.sender_id,
        sender_name: profMap[m.sender_id] || "Unknown", created_at: m.created_at,
        job_id: m.job_id, job_name: jobMap[m.job_id]?.name,
        job_reference: jobMap[m.job_id]?.ref, read_by: m.read_by || [],
      }));
      setRecentMessages(mapped);
      setMessagesLoading(false);
    };
    fetchMessages();
  }, [user]);

  // Fetch notifications
  useEffect(() => {
    if (!user) return;
    supabase.from("notifications").select("*").eq("user_id", user.id).eq("read", false)
      .order("created_at", { ascending: false }).limit(10)
      .then(({ data }) => setNotifications(data || []));
  }, [user]);

  const sendReply = async (jobId: string) => {
    const text = replyText[jobId]?.trim();
    if (!text || !user) return;
    setSendingReply(jobId);
    await supabase.from("job_messages" as any).insert({ job_id: jobId, sender_id: user.id, content: text, read_by: [user.id] } as any);
    setReplyText((prev) => ({ ...prev, [jobId]: "" }));
    const { data } = await supabase.from("job_messages" as any)
      .select("id, content, sender_id, created_at, job_id, read_by").eq("job_id", jobId).order("created_at", { ascending: true });
    if (data) {
      setThreadMessages((prev) => ({
        ...prev,
        [jobId]: (data as any[]).map((m: any) => ({
          ...m,
          sender_name: m.sender_id === user.id ? (profile?.full_name || "Me") : recentMessages.find(r => r.sender_id === m.sender_id)?.sender_name || "Unknown"
        })),
      }));
    }
    setSendingReply(null);
  };

  const openThread = async (jobId: string) => {
    if (expandedJobId === jobId) { setExpandedJobId(null); return; }
    setExpandedJobId(jobId);
    if (threadMessages[jobId]) return;
    const { data } = await supabase.from("job_messages" as any)
      .select("id, content, sender_id, created_at, job_id, read_by").eq("job_id", jobId).order("created_at", { ascending: true });
    if (data && user) {
      const senderIds = [...new Set((data as any[]).map((m: any) => m.sender_id))];
      const { data: profs } = await supabase.from("profiles").select("user_id, full_name").in("user_id", senderIds);
      const pm: Record<string, string> = {};
      (profs || []).forEach((p: any) => { pm[p.user_id] = p.full_name; });
      setThreadMessages((prev) => ({
        ...prev,
        [jobId]: (data as any[]).map((m: any) => ({ ...m, sender_name: pm[m.sender_id] || "Unknown" })),
      }));
      for (const m of (data as any[]).filter((m: any) => !m.read_by?.includes(user.id))) {
        await supabase.from("job_messages" as any).update({ read_by: [...(m.read_by || []), user.id] } as any).eq("id", m.id);
      }
      setRecentMessages((prev) => prev.map((msg) => msg.job_id === jobId ? { ...msg, read_by: [...msg.read_by, user.id] } : msg));
    }
  };

  // Geocode
  useEffect(() => {
    if (!currentPos || jobs.length === 0) return;
    const toGeocode = jobs.filter((j) => j.address && !geocoded.has(j.id));
    if (toGeocode.length === 0) return;
    const geocodeAll = async () => {
      const results = new Map(geocoded);
      for (const job of toGeocode) {
        if (!job.address) continue;
        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(job.address)}`);
          const data = await res.json();
          if (data?.[0]) results.set(job.id, { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) });
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
    if (h < 12) return "Morning";
    if (h < 17) return "Afternoon";
    return "Evening";
  };

  const unreadCount = recentMessages.filter((m) => !m.read_by.includes(user?.id || "") && m.sender_id !== user?.id).length;
  const firstName = profile?.full_name?.split(" ")[0] || "Engineer";

  // ── Tab: Home ──────────────────────────────────────────────
  const HomeTab = () => (
    <div className="space-y-5 pb-2">
      {/* Hero greeting */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{format(new Date(), "EEEE, d MMM")}</p>
          <h1 className="text-2xl font-bold tracking-tight">{greeting()}, {firstName} 👋</h1>
        </div>
        <button
          onClick={() => setActiveTab("profile")}
          className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg active:scale-95 transition-transform"
        >
          {firstName[0]}
        </button>
      </div>

      {/* Clock In/Out — BIG touch target */}
      <button
        onClick={isClockedIn ? clockOut : clockIn}
        disabled={acting || clockLoading}
        className={`w-full rounded-2xl p-5 flex items-center justify-between transition-all active:scale-[0.98] ${
          isClockedIn
            ? "bg-destructive/10 border-2 border-destructive/30"
            : "bg-primary/10 border-2 border-primary/30"
        }`}
      >
        <div className="flex items-center gap-4">
          <div className={`rounded-xl p-3 ${isClockedIn ? "bg-destructive/15" : "bg-primary/15"}`}>
            {acting || clockLoading
              ? <Loader2 className={`h-6 w-6 animate-spin ${isClockedIn ? "text-destructive" : "text-primary"}`} />
              : isClockedIn
                ? <LogOut className="h-6 w-6 text-destructive" />
                : <LogIn className="h-6 w-6 text-primary" />}
          </div>
          <div className="text-left">
            <p className={`font-bold text-base ${isClockedIn ? "text-destructive" : "text-primary"}`}>
              {isClockedIn ? "Tap to Clock Out" : "Tap to Clock In"}
            </p>
            {isClockedIn
              ? <p className="text-sm text-muted-foreground font-mono">{formatElapsed(elapsed)} on the clock</p>
              : <p className="text-sm text-muted-foreground">Start your shift</p>}
          </div>
        </div>
        <div className={`h-3 w-3 rounded-full ${isClockedIn ? "bg-destructive animate-pulse" : "bg-muted-foreground/30"}`} />
      </button>

      {/* Stats row */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: <Briefcase className="h-5 w-5" />, value: jobs.length, label: "Jobs Today", color: "text-primary" },
          { icon: <Camera className="h-5 w-5" />, value: todayStats.submissions, label: "Submissions", color: "text-amber-500" },
          { icon: <CheckCircle2 className="h-5 w-5" />, value: todayStats.completed, label: "Completed", color: "text-green-500" },
        ].map(({ icon, value, label, color }) => (
          <div key={label} className="rounded-2xl border bg-card p-4 text-center">
            <div className={`${color} flex justify-center mb-2`}>{icon}</div>
            <p className="text-2xl font-bold">{value}</p>
            <p className="text-[11px] text-muted-foreground mt-0.5 leading-tight">{label}</p>
          </div>
        ))}
      </div>

      {/* Map — always visible */}
      <div className="rounded-2xl overflow-hidden border bg-card">
        <div className="flex items-center justify-between px-4 pt-3 pb-2">
          <div className="flex items-center gap-2">
            <MapPin className="h-4 w-4 text-primary" />
            <span className="font-semibold text-sm">Today's Locations</span>
            {jobsWithDistance.filter(j => j.address).length > 0 && (
              <span className="text-[10px] bg-primary/10 text-primary rounded-full px-2 py-0.5 font-medium">
                {jobsWithDistance.filter(j => j.address).length} job{jobsWithDistance.filter(j => j.address).length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {jobsWithDistance.filter(j => j.address).length > 0 && (
            <a
              href={`https://www.google.com/maps/dir/${jobsWithDistance.filter(j => j.address).map(j => encodeURIComponent(j.address!)).join("/")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-primary font-medium flex items-center gap-1 active:opacity-70"
            >
              Full Route <Navigation className="h-3 w-3" />
            </a>
          )}
        </div>
        {jobsWithDistance.filter(j => j.address).length > 0 ? (
          <iframe
            key={jobsWithDistance.filter(j => j.address).map(j => j.id).join(",")}
            title="Job locations"
            width="100%"
            height="220"
            loading="lazy"
            style={{ border: 0 }}
            src={`https://maps.google.com/maps?q=${encodeURIComponent(jobsWithDistance.filter(j => j.address)[0].address!)}&output=embed&z=12`}
          />
        ) : (
          <div className="h-[180px] flex flex-col items-center justify-center text-muted-foreground gap-2 bg-muted/20">
            <MapPin className="h-8 w-8 opacity-30" />
            <p className="text-xs">No job addresses to map</p>
          </div>
        )}
      </div>

      {/* Nearest job */}
      {currentPos && jobsWithDistance[0] && jobsWithDistance[0].distance_km != null && (
        <Link to={`/jobs/${jobsWithDistance[0].id}`}>
          <div className="rounded-2xl border border-primary/20 bg-primary/5 p-4 flex items-center gap-3 active:scale-[0.98] transition-transform">
            <div className="rounded-xl bg-primary/15 p-2.5">
              <Navigation className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Nearest Job</p>
              <p className="font-semibold truncate">{jobsWithDistance[0].name}</p>
              <p className="text-xs text-muted-foreground truncate">{jobsWithDistance[0].address}</p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-lg font-bold text-primary">{jobsWithDistance[0].distance_km!.toFixed(1)}</p>
              <p className="text-xs text-muted-foreground">km</p>
            </div>
          </div>
        </Link>
      )}

      {/* Today's jobs preview (first 3) */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-bold text-base">Today's Jobs</h2>
          <button onClick={() => setActiveTab("jobs")} className="text-sm text-primary font-medium flex items-center gap-1">
            See all <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
        {loading ? (
          <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
        ) : jobsWithDistance.length === 0 ? (
          <div className="rounded-2xl border bg-card p-6 text-center">
            <Briefcase className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">No jobs scheduled today</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {jobsWithDistance.slice(0, 3).map((job) => (
              <JobCard key={job.id} job={job} />
            ))}
            {jobsWithDistance.length > 3 && (
              <button
                onClick={() => setActiveTab("jobs")}
                className="w-full rounded-2xl border border-dashed py-3 text-sm text-muted-foreground flex items-center justify-center gap-2 active:bg-muted/50 transition-colors"
              >
                +{jobsWithDistance.length - 3} more jobs <ChevronRight className="h-4 w-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* WhatsApp quick action */}
      {whatsappNumber && (
        <a
          href={`https://wa.me/${whatsappNumber.replace(/[^0-9]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-3 rounded-2xl border bg-card p-4 active:scale-[0.98] transition-transform"
        >
          <div className="rounded-xl bg-accent p-2.5">
            <Phone className="h-5 w-5 text-accent-foreground" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-sm">Contact Office</p>
            <p className="text-xs text-muted-foreground">WhatsApp the team</p>
          </div>
          <ExternalLink className="h-4 w-4 text-muted-foreground" />
        </a>
      )}
    </div>
  );

  // ── Tab: Jobs ──────────────────────────────────────────────
  const JobsTab = () => (
    <div className="space-y-4 pb-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">My Jobs</h2>
        <Badge variant="secondary" className="text-sm px-3 py-1">{jobs.length}</Badge>
      </div>
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : jobsWithDistance.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <Briefcase className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-medium text-muted-foreground">No jobs assigned</p>
        </div>
      ) : (
        <div className="space-y-3">
          {jobsWithDistance.map((job) => (
            <JobCard key={job.id} job={job} expanded />
          ))}
        </div>
      )}
    </div>
  );

  // ── Tab: Messages ──────────────────────────────────────────
  const MessagesTab = () => (
    <div className="space-y-4 pb-2">
      <div className="flex items-center justify-between">
        <h2 className="text-xl font-bold">Messages</h2>
        {unreadCount > 0 && <Badge variant="destructive">{unreadCount} unread</Badge>}
      </div>
      {messagesLoading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-7 w-7 animate-spin text-muted-foreground" /></div>
      ) : recentMessages.length === 0 ? (
        <div className="rounded-2xl border bg-card p-10 text-center">
          <MessageSquare className="h-10 w-10 mx-auto mb-3 text-muted-foreground/30" />
          <p className="font-medium text-muted-foreground">No messages yet</p>
        </div>
      ) : (
        <div className="space-y-3">
          {Array.from(new Map(recentMessages.map((m) => [m.job_id, m])).values()).map((latest) => {
            const jobId = latest.job_id;
            const jobMsgs = recentMessages.filter((m) => m.job_id === jobId);
            const unread = jobMsgs.filter((m) => !m.read_by.includes(user?.id || "") && m.sender_id !== user?.id).length;
            const isExpanded = expandedJobId === jobId;
            const thread = threadMessages[jobId] || [];
            return (
              <div key={jobId} className={`rounded-2xl border bg-card overflow-hidden ${unread > 0 ? "border-primary/40" : ""}`}>
                <button
                  className="w-full flex items-center gap-3 p-4 text-left active:bg-muted/50 transition-colors"
                  onClick={() => openThread(jobId)}
                >
                  <div className={`rounded-xl p-2.5 shrink-0 ${unread > 0 ? "bg-primary/15" : "bg-muted"}`}>
                    <MessageSquare className={`h-5 w-5 ${unread > 0 ? "text-primary" : "text-muted-foreground"}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-xs font-mono text-muted-foreground">{latest.job_reference}</span>
                      {unread > 0 && <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{unread}</Badge>}
                    </div>
                    <p className="font-semibold text-sm truncate">{latest.job_name}</p>
                    <p className="text-xs text-muted-foreground truncate">
                      {latest.sender_id === user?.id ? "You" : latest.sender_name}: {latest.content.replace(/\[image:[^\]]+\]/, "📷 Photo").replace(/\[doc:[^\|]+\|[^\]]+\]/, "📄 Document")}
                    </p>
                  </div>
                  <div className="shrink-0 flex flex-col items-end gap-1">
                    <span className="text-[11px] text-muted-foreground">
                      {new Date(latest.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}
                    </span>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-muted-foreground" /> : <ChevronDown className="h-4 w-4 text-muted-foreground" />}
                  </div>
                </button>

                {isExpanded && (
                  <div className="border-t border-border px-4 pb-4 pt-3 space-y-3">
                    <div className="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
                      {thread.map((msg) => {
                        const isMine = msg.sender_id === user?.id;
                        const imgMatch = msg.content.match(/\[image:(https?:\/\/[^\]]+)\]/);
                        const caption = imgMatch ? msg.content.replace(`[image:${imgMatch[1]}]`, "").trim() : null;
                        return (
                          <div key={msg.id} className={`flex flex-col gap-0.5 ${isMine ? "items-end" : "items-start"}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2.5 ${isMine ? "bg-primary text-primary-foreground" : "bg-muted"}`}>
                              {imgMatch ? (
                                <div className="space-y-1">
                                  <img src={imgMatch[1]} alt="attachment" className="max-w-[180px] rounded-xl cursor-pointer" onClick={() => window.open(imgMatch[1], "_blank")} />
                                  {caption && <p className="text-sm">{caption}</p>}
                                </div>
                              ) : (
                                <p className="text-sm leading-relaxed">{msg.content}</p>
                              )}
                            </div>
                            <p className="text-[10px] text-muted-foreground px-1">
                              {!isMine && <span className="font-medium">{msg.sender_name} · </span>}
                              {new Date(msg.created_at).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex gap-2 items-end">
                      <Textarea
                        value={replyText[jobId] || ""}
                        onChange={(e) => setReplyText((prev) => ({ ...prev, [jobId]: e.target.value }))}
                        placeholder="Type a reply..."
                        rows={1}
                        className="resize-none text-sm rounded-xl flex-1"
                        onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendReply(jobId); } }}
                      />
                      <Button
                        size="icon"
                        className="shrink-0 h-10 w-10 rounded-xl"
                        disabled={!replyText[jobId]?.trim() || sendingReply === jobId}
                        onClick={() => sendReply(jobId)}
                      >
                        {sendingReply === jobId ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Link to={`/jobs/${jobId}`}>
                      <Button variant="ghost" size="sm" className="w-full text-xs rounded-xl h-9 gap-1">
                        Open Full Job <ExternalLink className="h-3.5 w-3.5" />
                      </Button>
                    </Link>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  // ── Tab: Profile ───────────────────────────────────────────
  const ProfileTab = () => (
    <div className="space-y-4 pb-2">
      <h2 className="text-xl font-bold">Profile</h2>
      <div className="rounded-2xl border bg-card p-5 flex items-center gap-4">
        <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center text-primary font-bold text-2xl">
          {firstName[0]}
        </div>
        <div>
          <p className="font-bold text-lg">{profile?.full_name || "Engineer"}</p>
          <p className="text-sm text-muted-foreground">{user?.email}</p>
        </div>
      </div>

      <div className="space-y-2">
        {[
          { icon: <Briefcase className="h-5 w-5" />, label: "All Jobs", action: () => navigate("/jobs") },
          { icon: <Clock className="h-5 w-5" />, label: "Timesheet", action: () => navigate("/engineers") },
          { icon: <User className="h-5 w-5" />, label: "My Profile", action: () => navigate("/engineers") },
        ].map(({ icon, label, action }) => (
          <button
            key={label}
            onClick={action}
            className="w-full flex items-center gap-4 rounded-2xl border bg-card px-4 py-4 text-left active:bg-muted/50 transition-colors"
          >
            <div className="rounded-xl bg-muted p-2.5 text-muted-foreground">{icon}</div>
            <span className="font-medium flex-1">{label}</span>
            <ChevronRight className="h-5 w-5 text-muted-foreground" />
          </button>
        ))}
      </div>

      <div className="space-y-2 pt-2">
        <h3 className="text-sm font-semibold px-1">Vehicle check history</h3>
        <VehicleCheckHistory />
      </div>
    </div>
  );

  const tabContent = {
    home: <HomeTab />,
    jobs: <JobsTab />,
    messages: <MessagesTab />,
    profile: <ProfileTab />,
  };

  return (
    <div className="flex flex-col h-full">
      {/* Vehicle check hard block */}
      {vehicleCheckDone === false && (
        <div className="fixed inset-0 z-[60] bg-background overflow-y-auto">
          <div className="max-w-lg mx-auto px-4 pt-6">
            <VehicleCheckSheet onAccepted={() => setVehicleCheckDone(true)} />
          </div>
        </div>
      )}

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto px-1 pt-2 pb-24">
        {tabContent[activeTab]}
      </div>

      {/* Bottom navigation bar */}
      <div className="fixed bottom-0 left-0 right-0 z-50 bg-background/95 backdrop-blur-sm border-t border-border safe-area-bottom">
        <div className="flex items-center justify-around px-2 py-2 max-w-lg mx-auto">
          {([
            { id: "home" as Tab, icon: <Home className="h-5 w-5" />, label: "Home", badge: null as number | null },
            { id: "jobs" as Tab, icon: <List className="h-5 w-5" />, label: "Jobs", badge: jobs.length > 0 ? jobs.length : null },
            { id: "messages" as Tab, icon: <MessageSquare className="h-5 w-5" />, label: "Messages", badge: unreadCount > 0 ? unreadCount : null },
            { id: "profile" as Tab, icon: <User className="h-5 w-5" />, label: "Profile", badge: null as number | null },
          ]).map(({ id, icon, label, badge }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id as Tab)}
              className={`relative flex flex-col items-center gap-1 px-4 py-2 rounded-xl min-w-[64px] transition-all active:scale-95 ${
                activeTab === id
                  ? "text-primary"
                  : "text-muted-foreground"
              }`}
            >
              {activeTab === id && (
                <div className="absolute inset-0 bg-primary/10 rounded-xl" />
              )}
              <div className="relative">
                {icon}
                {badge != null && (
                  <span className="absolute -top-1.5 -right-1.5 h-4 min-w-4 rounded-full bg-destructive text-[10px] text-destructive-foreground font-bold flex items-center justify-center px-0.5">
                    {badge > 9 ? "9+" : badge}
                  </span>
                )}
              </div>
              <span className={`text-[10px] font-medium relative ${activeTab === id ? "text-primary" : ""}`}>{label}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Job Card Component ─────────────────────────────────────
function JobCard({ job, expanded = false }: { job: ScheduledJob; expanded?: boolean }) {
  const { label, cls } = statusLabel(job.status);
  return (
    <Link to={`/jobs/${job.id}`}>
      <div className="rounded-2xl border bg-card overflow-hidden active:scale-[0.98] transition-transform">
        {/* Priority strip */}
        <div className={`h-1 w-full ${priorityBg(job.priority)}`} />
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-1 flex-wrap">
                <span className="text-xs font-mono text-muted-foreground">{job.reference_number}</span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${cls}`}>{label}</span>
              </div>
              <p className="font-semibold text-sm leading-snug">{job.name}</p>
              {job.customer && (
                <p className="text-xs text-muted-foreground mt-0.5 truncate">{job.customer}</p>
              )}
              {job.address && (
                <p className="text-xs text-muted-foreground/70 truncate mt-1 flex items-center gap-1">
                  <MapPin className="h-3 w-3 shrink-0" />{job.address}
                </p>
              )}
            </div>
            <div className="shrink-0 flex flex-col items-end gap-1">
              {job.distance_km !== null ? (
                <div className="text-right">
                  <p className="text-base font-bold text-primary">{job.distance_km.toFixed(1)}</p>
                  <p className="text-[10px] text-muted-foreground">km</p>
                </div>
              ) : job.address ? (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              ) : null}
              <ChevronRight className="h-4 w-4 text-muted-foreground mt-1" />
            </div>
          </div>

          {/* Action buttons row */}
          {expanded && (
            <div className="flex gap-2 mt-3 pt-3 border-t border-border">
              <Link to={`/jobs/${job.id}`} className="flex-1" onClick={(e) => e.stopPropagation()}>
                <div className="flex items-center justify-center gap-1.5 rounded-xl bg-primary/10 text-primary text-xs font-semibold py-2.5 active:bg-primary/20 transition-colors">
                  <Zap className="h-3.5 w-3.5" /> Open Job
                </div>
              </Link>
              {job.address && (
                <a
                  href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center justify-center gap-1.5 rounded-xl bg-muted text-muted-foreground text-xs font-semibold py-2.5 active:bg-muted/70 transition-colors">
                    <Navigation className="h-3.5 w-3.5" /> Navigate
                  </div>
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </Link>
  );
}
