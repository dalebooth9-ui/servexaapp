import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import {
  format, addMonths, subMonths, startOfMonth, endOfMonth,
  eachDayOfInterval, isSameMonth, isSameDay, parseISO, isWithinInterval,
  startOfDay, endOfDay, addDays,
} from "date-fns";
import {
  ChevronLeft, ChevronRight, CalendarDays, Plus, Check, X,
  AlertTriangle, Palmtree, Stethoscope, Building, CalendarIcon,
  Trash2,
} from "lucide-react";
import { format as dateFnsFormat } from "date-fns";

interface LeaveEntry {
  id: string;
  engineer_id: string;
  leave_type: "holiday" | "sick" | "bank_holiday";
  start_date: string;
  end_date: string;
  notes: string | null;
  status: "pending" | "approved" | "rejected";
  requested_by: string;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  profiles?: { full_name: string } | null;
}

interface Engineer {
  user_id: string;
  full_name: string;
}

const LEAVE_TYPE_CONFIG = {
  holiday: { label: "Holiday", icon: Palmtree, color: "bg-blue-500/20 text-blue-700 border-blue-500/30 dark:text-blue-300" },
  sick: { label: "Sick Leave", icon: Stethoscope, color: "bg-red-500/20 text-red-700 border-red-500/30 dark:text-red-300" },
  bank_holiday: { label: "Bank Holiday", icon: Building, color: "bg-purple-500/20 text-purple-700 border-purple-500/30 dark:text-purple-300" },
};

const STATUS_CONFIG = {
  pending: { label: "Pending", class: "bg-amber-500/20 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  approved: { label: "Approved", class: "bg-green-500/20 text-green-700 dark:text-green-300 border-green-500/30" },
  rejected: { label: "Rejected", class: "bg-red-500/20 text-red-700 dark:text-red-300 border-red-500/30" },
};

export default function LeaveCalendar() {
  const { user, userRole } = useAuth();
  const { toast } = useToast();
  const isAdmin = userRole === "admin";

  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [leaveEntries, setLeaveEntries] = useState<LeaveEntry[]>([]);
  const [engineers, setEngineers] = useState<Engineer[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedEngineer, setSelectedEngineer] = useState<string>("all");

  // Request dialog
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqEngineerId, setReqEngineerId] = useState("");
  const [reqLeaveType, setReqLeaveType] = useState<"holiday" | "sick" | "bank_holiday">("holiday");
  const [reqStartDate, setReqStartDate] = useState<Date | undefined>();
  const [reqEndDate, setReqEndDate] = useState<Date | undefined>();
  const [reqNotes, setReqNotes] = useState("");
  const [reqStartOpen, setReqStartOpen] = useState(false);
  const [reqEndOpen, setReqEndOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Detail / review dialog
  const [selectedLeave, setSelectedLeave] = useState<LeaveEntry | null>(null);
  const [reviewLoading, setReviewLoading] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    const monthStart = format(startOfMonth(currentMonth), "yyyy-MM-dd");
    const monthEnd = format(endOfMonth(currentMonth), "yyyy-MM-dd");

    const [leaveRes, profilesRes, rolesRes] = await Promise.all([
      supabase
        .from("engineer_leave" as any)
        .select("*, profiles(full_name)")
        .gte("end_date", monthStart)
        .lte("start_date", monthEnd)
        .order("start_date"),
      supabase.from("profiles").select("user_id, full_name").order("full_name"),
      supabase.from("user_roles").select("user_id").eq("role", "engineer"),
    ]);

    const engineerIds = new Set((rolesRes.data || []).map((r: any) => r.user_id));
    const engList = (profilesRes.data || []).filter((p: any) => engineerIds.has(p.user_id));
    setEngineers(engList);

    setLeaveEntries((leaveRes.data as any[] || []) as LeaveEntry[]);
    setLoading(false);
  }, [currentMonth]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Set default engineer for non-admin
  useEffect(() => {
    if (!isAdmin && user) setReqEngineerId(user.id);
  }, [isAdmin, user]);

  const handleRequestLeave = async () => {
    if (!reqStartDate || !reqEndDate || !reqEngineerId) return;
    if (reqEndDate < reqStartDate) {
      toast({ title: "Invalid dates", description: "End date must be on or after start date.", variant: "destructive" });
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("engineer_leave" as any).insert({
      engineer_id: reqEngineerId,
      leave_type: reqLeaveType,
      start_date: format(reqStartDate, "yyyy-MM-dd"),
      end_date: format(reqEndDate, "yyyy-MM-dd"),
      notes: reqNotes.trim() || null,
      status: isAdmin ? "approved" : "pending",
      requested_by: user!.id,
    });
    setSubmitting(false);
    if (error) {
      toast({ title: "Error", description: "Failed to submit leave request.", variant: "destructive" });
    } else {
      toast({ title: isAdmin ? "Leave added" : "Request submitted", description: isAdmin ? "Leave has been added." : "Your request is pending approval." });
      setRequestOpen(false);
      setReqStartDate(undefined);
      setReqEndDate(undefined);
      setReqNotes("");
      fetchData();
    }
  };

  const handleReview = async (status: "approved" | "rejected") => {
    if (!selectedLeave) return;
    setReviewLoading(true);
    const { error } = await (supabase.from("engineer_leave" as any) as any)
      .update({ status, reviewed_by: user!.id, reviewed_at: new Date().toISOString() })
      .eq("id", selectedLeave.id);
    setReviewLoading(false);
    if (error) {
      toast({ title: "Error", description: "Failed to update leave status.", variant: "destructive" });
    } else {
      toast({ title: `Leave ${status}`, description: `The leave request has been ${status}.` });
      setSelectedLeave(null);
      fetchData();
    }
  };

  const handleDelete = async (id: string) => {
    const { error } = await (supabase.from("engineer_leave" as any) as any).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: "Failed to delete leave.", variant: "destructive" });
    } else {
      toast({ title: "Leave removed" });
      setSelectedLeave(null);
      fetchData();
    }
  };

  // Calendar helpers
  const monthDays = eachDayOfInterval({
    start: startOfMonth(currentMonth),
    end: endOfMonth(currentMonth),
  });

  const filteredLeave = leaveEntries.filter((l) => {
    if (selectedEngineer !== "all" && l.engineer_id !== selectedEngineer) return false;
    return true;
  });

  const getLeaveForDay = (day: Date) =>
    filteredLeave.filter((l) => {
      if (l.status === "rejected") return false;
      try {
        return isWithinInterval(startOfDay(day), {
          start: startOfDay(parseISO(l.start_date)),
          end: endOfDay(parseISO(l.end_date)),
        });
      } catch { return false; }
    });

  const pendingCount = leaveEntries.filter((l) => l.status === "pending").length;

  // Padding days before month starts
  const firstDayOfWeek = startOfMonth(currentMonth).getDay(); // 0=Sun
  const paddingDays = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // Mon start

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CalendarDays className="h-6 w-6 text-primary" />
            Leave Calendar
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isAdmin ? "Manage engineer holidays and leave requests" : "View and request your leave"}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAdmin && pendingCount > 0 && (
            <Badge variant="destructive" className="gap-1">
              <AlertTriangle className="h-3 w-3" /> {pendingCount} pending
            </Badge>
          )}
          <Button onClick={() => setRequestOpen(true)} size="sm" className="gap-1.5">
            <Plus className="h-4 w-4" />
            {isAdmin ? "Add Leave" : "Request Leave"}
          </Button>
        </div>
      </div>

      <Tabs defaultValue="calendar">
        <TabsList>
          <TabsTrigger value="calendar">Calendar</TabsTrigger>
          <TabsTrigger value="list">
            List {isAdmin && pendingCount > 0 && <span className="ml-1 rounded-full bg-destructive text-destructive-foreground text-[10px] px-1.5">{pendingCount}</span>}
          </TabsTrigger>
        </TabsList>

        {/* Calendar Tab */}
        <TabsContent value="calendar" className="mt-4 space-y-4">
          {/* Controls */}
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => subMonths(m, 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="font-semibold text-lg min-w-[150px] text-center">
                {format(currentMonth, "MMMM yyyy")}
              </span>
              <Button variant="outline" size="icon" onClick={() => setCurrentMonth((m) => addMonths(m, 1))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            {isAdmin && (
              <Select value={selectedEngineer} onValueChange={setSelectedEngineer}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="All engineers" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All engineers</SelectItem>
                  {engineers.map((e) => (
                    <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* Calendar Grid */}
          <Card>
            <CardContent className="p-4">
              {/* Day headers */}
              <div className="grid grid-cols-7 mb-2">
                {["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map((d) => (
                  <div key={d} className="text-center text-xs font-semibold text-muted-foreground py-2">{d}</div>
                ))}
              </div>
              {/* Days */}
              <div className="grid grid-cols-7 gap-1">
                {/* Padding */}
                {Array.from({ length: paddingDays }).map((_, i) => (
                  <div key={`pad-${i}`} />
                ))}
                {monthDays.map((day) => {
                  const dayLeave = getLeaveForDay(day);
                  const isToday = isSameDay(day, new Date());
                  const isWeekend = day.getDay() === 0 || day.getDay() === 6;
                  return (
                    <div
                      key={day.toISOString()}
                      className={cn(
                        "min-h-[72px] rounded-lg border p-1.5 text-xs transition-colors",
                        isToday ? "border-primary bg-primary/5" : "border-border",
                        isWeekend ? "bg-muted/30" : "bg-card",
                        dayLeave.length > 0 && "cursor-pointer hover:border-primary/50"
                      )}
                      onClick={() => {
                        if (dayLeave.length === 1) setSelectedLeave(dayLeave[0]);
                      }}
                    >
                      <div className={cn(
                        "font-semibold mb-1 text-center h-5 w-5 rounded-full flex items-center justify-center mx-auto text-[11px]",
                        isToday ? "bg-primary text-primary-foreground" : "text-foreground"
                      )}>
                        {format(day, "d")}
                      </div>
                      <div className="space-y-0.5">
                        {dayLeave.slice(0, 3).map((l) => {
                          const cfg = LEAVE_TYPE_CONFIG[l.leave_type];
                          return (
                            <div
                              key={l.id}
                              onClick={(e) => { e.stopPropagation(); setSelectedLeave(l); }}
                              className={cn(
                                "truncate rounded px-1 py-0.5 border text-[10px] font-medium cursor-pointer hover:opacity-80",
                                cfg.color,
                                l.status === "pending" && "opacity-60 italic"
                              )}
                              title={`${l.profiles?.full_name || "Engineer"} - ${cfg.label}${l.status === "pending" ? " (pending)" : ""}`}
                            >
                              {isAdmin ? (l.profiles?.full_name?.split(" ")[0] || "Eng") : cfg.label}
                            </div>
                          );
                        })}
                        {dayLeave.length > 3 && (
                          <div className="text-[10px] text-muted-foreground text-center">+{dayLeave.length - 3} more</div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Legend */}
          <div className="flex items-center gap-4 flex-wrap text-xs text-muted-foreground">
            {Object.entries(LEAVE_TYPE_CONFIG).map(([key, cfg]) => (
              <div key={key} className="flex items-center gap-1.5">
                <span className={cn("h-3 w-3 rounded border", cfg.color)} />
                {cfg.label}
              </div>
            ))}
            <div className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded border opacity-60 bg-muted" />
              Pending (italic)
            </div>
          </div>
        </TabsContent>

        {/* List Tab */}
        <TabsContent value="list" className="mt-4">
          <div className="space-y-2">
            {loading ? (
              <div className="text-center py-12 text-muted-foreground text-sm">Loading...</div>
            ) : filteredLeave.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground text-sm">No leave entries for this month.</div>
            ) : (
              [...filteredLeave]
                .sort((a, b) => a.start_date.localeCompare(b.start_date))
                .map((l) => {
                  const cfg = LEAVE_TYPE_CONFIG[l.leave_type];
                  const statusCfg = STATUS_CONFIG[l.status];
                  const Icon = cfg.icon;
                  const days = Math.round(
                    (parseISO(l.end_date).getTime() - parseISO(l.start_date).getTime()) / 86400000
                  ) + 1;
                  return (
                    <div
                      key={l.id}
                      className="flex items-center justify-between gap-3 rounded-lg border bg-card px-4 py-3 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => setSelectedLeave(l)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className={cn("p-2 rounded-md border", cfg.color)}>
                          <Icon className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-sm truncate">
                            {l.profiles?.full_name || "Engineer"}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {format(parseISO(l.start_date), "dd MMM yyyy")}
                            {l.start_date !== l.end_date && ` → ${format(parseISO(l.end_date), "dd MMM yyyy")}`}
                            {" · "}{days} day{days !== 1 ? "s" : ""}
                          </div>
                          {l.notes && <div className="text-xs text-muted-foreground truncate mt-0.5 italic">{l.notes}</div>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Badge variant="outline" className={cn("text-[10px]", cfg.color)}>{cfg.label}</Badge>
                        <Badge variant="outline" className={cn("text-[10px]", statusCfg.class)}>{statusCfg.label}</Badge>
                        {isAdmin && l.status === "pending" && (
                          <div className="flex gap-1">
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-green-600 hover:text-green-700 hover:bg-green-50"
                              onClick={(e) => { e.stopPropagation(); setSelectedLeave(l); }}>
                              <Check className="h-3.5 w-3.5" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-7 w-7 text-red-600 hover:text-red-700 hover:bg-red-50"
                              onClick={(e) => { e.stopPropagation(); setSelectedLeave(l); }}>
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
            )}
          </div>
        </TabsContent>
      </Tabs>

      {/* Request / Add Leave Dialog */}
      <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-primary" />
              {isAdmin ? "Add Leave" : "Request Leave"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {isAdmin && (
              <div className="space-y-2">
                <Label>Engineer</Label>
                <Select value={reqEngineerId} onValueChange={setReqEngineerId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select engineer" />
                  </SelectTrigger>
                  <SelectContent>
                    {engineers.map((e) => (
                      <SelectItem key={e.user_id} value={e.user_id}>{e.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={reqLeaveType} onValueChange={(v) => setReqLeaveType(v as any)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(LEAVE_TYPE_CONFIG).map(([key, cfg]) => (
                    <SelectItem key={key} value={key}>{cfg.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Popover open={reqStartOpen} onOpenChange={setReqStartOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reqStartDate && "text-muted-foreground")}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {reqStartDate ? format(reqStartDate, "dd/MM/yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={reqStartDate}
                      onSelect={(d) => { setReqStartDate(d); setReqStartOpen(false); }}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Popover open={reqEndOpen} onOpenChange={setReqEndOpen}>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reqEndDate && "text-muted-foreground")}>
                      <CalendarIcon className="h-4 w-4 mr-2" />
                      {reqEndDate ? format(reqEndDate, "dd/MM/yyyy") : "Pick date"}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={reqEndDate}
                      onSelect={(d) => { setReqEndDate(d); setReqEndOpen(false); }}
                      disabled={(d) => reqStartDate ? d < reqStartDate : false}
                      className="pointer-events-auto"
                    />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Notes <span className="text-muted-foreground font-normal">(optional)</span></Label>
              <Textarea
                placeholder="Any additional details..."
                value={reqNotes}
                onChange={(e) => setReqNotes(e.target.value)}
                rows={2}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
            <Button
              onClick={handleRequestLeave}
              disabled={submitting || !reqEngineerId || !reqStartDate || !reqEndDate}
            >
              {submitting ? "Submitting..." : isAdmin ? "Add Leave" : "Submit Request"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leave Detail / Review Dialog */}
      {selectedLeave && (
        <Dialog open={!!selectedLeave} onOpenChange={(o) => !o && setSelectedLeave(null)}>
          <DialogContent className="sm:max-w-sm">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {(() => {
                  const cfg = LEAVE_TYPE_CONFIG[selectedLeave.leave_type];
                  const Icon = cfg.icon;
                  return <><Icon className="h-4 w-4 text-primary" />{cfg.label}</>;
                })()}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Engineer</span>
                <span className="font-medium">{selectedLeave.profiles?.full_name || "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Dates</span>
                <span className="font-medium">
                  {format(parseISO(selectedLeave.start_date), "dd MMM yyyy")}
                  {selectedLeave.start_date !== selectedLeave.end_date &&
                    ` → ${format(parseISO(selectedLeave.end_date), "dd MMM yyyy")}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Duration</span>
                <span className="font-medium">
                  {Math.round((parseISO(selectedLeave.end_date).getTime() - parseISO(selectedLeave.start_date).getTime()) / 86400000) + 1} day(s)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <Badge variant="outline" className={cn("text-[10px]", STATUS_CONFIG[selectedLeave.status].class)}>
                  {STATUS_CONFIG[selectedLeave.status].label}
                </Badge>
              </div>
              {selectedLeave.notes && (
                <div className="rounded-md bg-muted/50 p-2 text-muted-foreground italic text-xs">{selectedLeave.notes}</div>
              )}
            </div>
            <DialogFooter className="flex-col gap-2 sm:flex-row">
              {isAdmin && selectedLeave.status === "pending" && (
                <>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50 flex-1"
                    onClick={() => handleReview("rejected")}
                    disabled={reviewLoading}
                  >
                    <X className="h-4 w-4 mr-1" /> Reject
                  </Button>
                  <Button
                    className="flex-1 bg-green-600 hover:bg-green-700"
                    onClick={() => handleReview("approved")}
                    disabled={reviewLoading}
                  >
                    <Check className="h-4 w-4 mr-1" /> Approve
                  </Button>
                </>
              )}
              {isAdmin && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                  onClick={() => handleDelete(selectedLeave.id)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" /> Delete
                </Button>
              )}
              {!isAdmin && selectedLeave.status === "pending" && selectedLeave.engineer_id === user?.id && (
                <Button
                  variant="outline"
                  className="text-red-600 border-red-200 hover:bg-red-50"
                  onClick={() => handleDelete(selectedLeave.id)}
                >
                  <Trash2 className="h-4 w-4 mr-1" /> Cancel Request
                </Button>
              )}
              <Button variant="outline" onClick={() => setSelectedLeave(null)}>Close</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
