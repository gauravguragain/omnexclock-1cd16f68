import { useState, useEffect, useMemo } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import WalkthroughTour from "@/components/WalkthroughTour";
import { portalTourSteps } from "@/components/tourSteps";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import NotificationBell from "@/components/NotificationBell";
import { useEmployeeNotifications } from "@/hooks/useNotifications";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Delete, CalendarRange, Clock, LogIn, LogOut, Coffee, User, FileText,
  MessageSquare, CalendarOff, Send, Plus, RefreshCw, CalendarIcon, Trash2, Pencil,
  History, CheckCircle2, XCircle, PartyPopper, ChevronDown, ChevronUp, Users, Baby,
  Smartphone, Monitor, Tablet, Download,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ausToday, toAusFormatted, toAusTime12, toAusDate, toAusLocaleString, ensureTime12 } from "@/lib/dateUtils";
import { format } from "date-fns";

/* ── types ───────────────────────────────────────────────── */

interface PortalShift {
  id: string;
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hours_worked: number | null;
  notes: string | null;
  week_start_date: string;
}

interface TimesheetEntry {
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  total_hours: number;
  net_hours: number;
}

interface EmployeeInfo {
  employee_id: string;
  employee_name: string;
  current_status: string;
  last_event_time: string | null;
}

/* ── helpers ──────────────────────────────────────────────── */

function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${m} ${ampm}`;
}

function calcNetHours(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60;
  return Math.max(0, (mins - breakMin) / 60);
}

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function fmtTimestamp(ts: string | null): string {
  if (!ts) return "—";
  return toAusTime12(new Date(ts));
}

/* ── portal notification wrapper ─────────────────────────── */
function PortalNotifications({ employeeCode, businessCode }: { employeeCode: string | null; businessCode: string | null }) {
  const { notifications, unreadCount, markRead, markAllRead } = useEmployeeNotifications(employeeCode, businessCode);
  return (
    <NotificationBell
      notifications={notifications}
      unreadCount={unreadCount}
      onMarkRead={markRead}
      onMarkAllRead={markAllRead}
    />
  );
}

/* ── Event Card (reusable) ────────────────────────────────── */
function EventCard({ ev }: { ev: any }) {
  const [expanded, setExpanded] = useState(false);

  const totalGuests = (ev.adult_guests || 0) + (ev.kids_guests || 0);
  const activeBadges = [
    ev.cold_sparkles && "✨ Cold Sparkles",
    ev.dry_ice && "🌫️ Dry Ice",
    ev.red_carpet && "🔴 Red Carpet",
    ev.smoke_machine && "💨 Smoke Machine",
    ev.decor_access && "🎨 Decor Access",
    ev.live_stall && "🍳 Live Stall",
  ].filter(Boolean) as string[];

  const viewPdf = (urlOrPath: string) => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const storagePathMatch = urlOrPath.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?event-runsheets\/([^?#]+)/);

    // Normalize any stored storage URL to plain object path
    const rawPath = storagePathMatch ? decodeURIComponent(storagePathMatch[1]) : urlOrPath;

    // Truly external URL (not our runsheet storage)
    if (rawPath.startsWith("http") && !storagePathMatch) {
      window.open(rawPath, "_blank", "noopener,noreferrer");
      return;
    }

    const normalizedPath = rawPath.split("?")[0].trim();
    const encodedPath = normalizedPath
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");

    // event-runsheets bucket is public; avoid signed URL endpoint to prevent 404 on filenames with spaces/parentheses
    const url = `${supabaseUrl}/storage/v1/object/public/event-runsheets/${encodedPath}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const detailRow = (label: string, value: string | null | undefined) => {
    if (!value) return null;
    return (
      <div className="flex justify-between text-xs py-0.5">
        <span className="text-muted-foreground">{label}</span>
        <span className="font-semibold text-foreground text-right">{value}</span>
      </div>
    );
  };

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/30 overflow-hidden">
      {/* Summary - always visible */}
      <button
        className="w-full px-3 py-2.5 text-left flex items-center gap-2 hover:bg-secondary/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        {/* Left: type badge + host name */}
        <div className="flex items-center gap-1.5 flex-1 min-w-0 overflow-hidden">
          {ev.event_type && (
            <Badge variant="outline" className="text-[10px] shrink-0 max-w-[80px] truncate">{ev.event_type}</Badge>
          )}
          {ev.host_name ? (
            <span className="text-xs font-medium text-foreground truncate">{ev.host_name}</span>
          ) : !ev.event_type ? (
            <span className="text-xs text-muted-foreground italic">Event</span>
          ) : null}
        </div>
        {/* Right: time + guests + chevron — never shrinks into left content */}
        <div className="flex items-center gap-1.5 shrink-0">
          {ev.event_time && (
            <span className="text-[10px] text-muted-foreground flex items-center gap-0.5 whitespace-nowrap">
              <Clock className="h-3 w-3" /> {ev.event_time}
            </span>
          )}
          {totalGuests > 0 && (
            <span className="text-[10px] text-muted-foreground whitespace-nowrap">
              <Users className="h-3 w-3 inline" /> {totalGuests}
            </span>
          )}
          {expanded ? <ChevronUp className="h-3.5 w-3.5 text-muted-foreground" /> : <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />}
        </div>
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-3 pt-1 border-t border-border/30 space-y-2.5">
          {/* Client Details */}
          {(ev.host_name || ev.host_contact_number) && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Client Details</p>
              {detailRow("Host Name", ev.host_name)}
              {detailRow("Contact", ev.host_contact_number)}
            </div>
          )}

          {/* Event Info */}
          <div className="space-y-0.5">
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Event Info</p>
            {detailRow("Event Time", ev.event_time)}
            {detailRow("Event Space", ev.event_space)}
            {detailRow("Event Type", ev.event_type)}
            {detailRow("Bev Package", ev.bev_package)}
            {detailRow("Banquet Tier", ev.banquet_tier)}
          </div>

          {/* Guest & Table Setup */}
          {(totalGuests > 0 || ev.num_tables > 0) && (
            <div className="space-y-0.5">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Guest Setup</p>
              {detailRow("Adult Guests", ev.adult_guests > 0 ? String(ev.adult_guests) : null)}
              {detailRow("Kids Guests", ev.kids_guests > 0 ? String(ev.kids_guests) : null)}
              {detailRow("Total Guests", totalGuests > 0 ? String(totalGuests) : null)}
              {detailRow("Tables", ev.num_tables > 0 ? `${ev.num_tables} (${ev.chairs_per_table || 8} chairs each)` : null)}
              {detailRow("Tablecloth", ev.tablecloth_color === "black" ? "⬛ Black" : ev.tablecloth_color === "white" ? "⬜ White" : ev.tablecloth_color)}
            </div>
          )}

          {/* Equipment */}
          {activeBadges.length > 0 && (
            <div className="space-y-1">
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Equipment</p>
              <div className="flex flex-wrap gap-1.5">
                {activeBadges.map(b => <Badge key={b} variant="secondary" className="text-[10px]">{b}</Badge>)}
              </div>
            </div>
          )}

          {/* Live Stall Details */}
          {ev.live_stall && ev.live_stall_details && (
            <div className="text-xs">
              <span className="text-muted-foreground">Live Stall Details: </span>
              <span className="text-foreground">{ev.live_stall_details}</span>
            </div>
          )}

          {/* Notes */}
          {ev.notes && <p className="text-xs text-muted-foreground italic">📝 {ev.notes}</p>}

          {/* View Runsheet PDF */}
          {ev.runsheet_url && (
            <button
              onClick={(e) => { e.stopPropagation(); viewPdf(ev.runsheet_url); }}
              className="flex items-center gap-1.5 text-xs text-primary hover:underline mt-1"
            >
              <FileText className="h-3.5 w-3.5" /> View Runsheet PDF
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Today Tab ───────────────────────────────────────────── */
function TodayTab({ employeeCode, businessCode, shifts, employeeName, businessName }: {
  employeeCode: string;
  businessCode: string | null;
  shifts: PortalShift[];
  employeeName: string;
  businessName: string;
}) {
  const [allEvents, setAllEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSupervisorOrManager, setIsSupervisorOrManager] = useState(false);
  const todayStr = ausToday();

  useEffect(() => {
    const fetchEvents = async () => {
      setLoading(true);
      const bizCode = businessCode?.toUpperCase() || null;

      // Resolve business_id once if we have a bizCode, then run both queries in parallel
      let empQuery = supabase.from("employees_public" as any).select("job_title").eq("employee_code", employeeCode).eq("active", true) as any;
      if (bizCode) {
        const { data: bizData } = await supabase.from("businesses_public" as any).select("id").eq("business_code", bizCode).maybeSingle() as { data: { id: string } | null };
        if (bizData) empQuery = empQuery.eq("business_id", bizData.id);
      }

      const [{ data: empData }, { data: eventsData }] = await Promise.all([
        empQuery.maybeSingle(),
        supabase.rpc("get_employee_day_events", { _employee_code: employeeCode, _business_code: businessCode }),
      ]);

      const jobTitle = (empData?.job_title || "").toLowerCase();
      setIsSupervisorOrManager(jobTitle === "supervisor" || jobTitle === "manager");
      setAllEvents(eventsData || []);
      setLoading(false);
    };
    fetchEvents();
  }, [employeeCode, businessCode, todayStr]);

  const todayShifts = shifts.filter(s => s.date === todayStr);
  const hasShiftToday = todayShifts.length > 0;

  // For supervisors/managers: group events by date for the week view
  const todayEvents = allEvents.filter((e: any) => e.date === todayStr);

  // Get current week's Monday
  const today = new Date();
  const monday = getMonday(today);
  const weekDates: string[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    weekDates.push(d.toISOString().split("T")[0]);
  }
  const weekEvents = allEvents.filter((e: any) => weekDates.includes(e.date));

  // Group week events by date
  const eventsByDate = weekEvents.reduce((acc: Record<string, any[]>, ev: any) => {
    if (!acc[ev.date]) acc[ev.date] = [];
    acc[ev.date].push(ev);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      {/* Today's Shift */}
      <Card>
        <CardHeader className="pb-2 px-4 pt-4">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <Clock className="h-4 w-4 text-primary" /> Today's Shift
          </CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          {hasShiftToday ? (
            <div className="space-y-2">
              {todayShifts.map(s => (
                <div key={s.id} className="flex items-center justify-between rounded-lg bg-primary/10 border border-primary/20 px-3 py-2.5">
                  <div>
                    <span className="font-semibold text-sm text-foreground">{formatTime12(s.start_time)} – {formatTime12(s.end_time)}</span>
                    <span className="text-xs text-muted-foreground ml-2">{s.break_minutes}m break</span>
                  </div>
                  <span className="font-mono text-sm font-bold">{(s.hours_worked ?? calcNetHours(s.start_time, s.end_time, s.break_minutes)).toFixed(2)}h</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-3">No shift scheduled for today.</p>
          )}
        </CardContent>
      </Card>

      {/* Event Details - Week view for Supervisor/Manager, Day view for others */}
      {isSupervisorOrManager ? (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PartyPopper className="h-4 w-4 text-primary" /> This Week's Event Setup
              <Badge variant="outline" className="text-[10px] ml-auto">Full Week Access</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-3">Loading...</p>
            ) : weekEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No events this week.</p>
            ) : (
              <div className="space-y-4">
                {weekDates.map(dateStr => {
                  const eventsForDay = eventsByDate[dateStr];
                  if (!eventsForDay || eventsForDay.length === 0) return null;
                  const dayLabel = new Date(dateStr + "T00:00:00").toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
                  const isToday = dateStr === todayStr;
                  // Sort events by event_time ascending
                  const sortedEvents = [...eventsForDay].sort((a: any, b: any) => {
                    if (!a.event_time && !b.event_time) return 0;
                    if (!a.event_time) return 1;
                    if (!b.event_time) return -1;
                    return a.event_time.localeCompare(b.event_time);
                  });
                  return (
                    <div key={dateStr}>
                      <p className={cn("text-xs font-semibold mb-1.5", isToday ? "text-primary" : "text-muted-foreground")}>
                        {dayLabel} {isToday && <span className="text-primary">(Today)</span>}
                      </p>
                      <div className="space-y-2">
                        {sortedEvents.map((ev: any) => <EventCard key={ev.id} ev={ev} />)}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      ) : hasShiftToday ? (
        <Card>
          <CardHeader className="pb-2 px-4 pt-4">
            <CardTitle className="text-sm font-medium flex items-center gap-2">
              <PartyPopper className="h-4 w-4 text-primary" /> Today's Event Setup
            </CardTitle>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            {loading ? (
              <p className="text-xs text-muted-foreground text-center py-3">Loading...</p>
            ) : todayEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-3">No event details for today.</p>
            ) : (
              <div className="space-y-3">
                {[...todayEvents].sort((a: any, b: any) => {
                  if (!a.event_time && !b.event_time) return 0;
                  if (!a.event_time) return 1;
                  if (!b.event_time) return -1;
                  return a.event_time.localeCompare(b.event_time);
                }).map((ev: any) => <EventCard key={ev.id} ev={ev} />)}
              </div>
            )}
          </CardContent>
        </Card>
      ) : null}

    </div>
  );
}

/* ── component ───────────────────────────────────────────── */

export default function PortalPage() {
  const { runAction } = useActionLock();
  const { toast } = useToast();
  const { businessCode: urlBusinessCode } = useParams();
  const { applyTheme, resetTheme } = useBusiness();
  const [code, setCode] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [shifts, setShifts] = useState<PortalShift[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [businessName, setBusinessName] = useState("");
  const [businessLogo, setBusinessLogo] = useState<string | null>(null);

  // Forum state
  const [forumPosts, setForumPosts] = useState<any[]>([]);
  const [selectedForumPost, setSelectedForumPost] = useState<any | null>(null);
  const [forumComments, setForumComments] = useState<any[]>([]);
  const [newComment, setNewComment] = useState("");
  const [myReactions, setMyReactions] = useState<Set<string>>(new Set());
  const [commentLoading, setCommentLoading] = useState(false);

  // Request state
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [requestOpen, setRequestOpen] = useState(false);
  const [reqType, setReqType] = useState<"leave" | "unavailability">("leave");
  const [reqStartDate, setReqStartDate] = useState<Date | undefined>();
  const [reqEndDate, setReqEndDate] = useState<Date | undefined>();
  const [reqIsRecurring, setReqIsRecurring] = useState(false);
  const [reqDays, setReqDays] = useState<string[]>([]);
  const [reqRecurringStart, setReqRecurringStart] = useState<Date | undefined>();
  const [reqRecurringEnd, setReqRecurringEnd] = useState<Date | undefined>();
  const [reqReason, setReqReason] = useState("");
  const [reqStartTime, setReqStartTime] = useState("");
  const [reqEndTime, setReqEndTime] = useState("");
  const [reqSaving, setReqSaving] = useState(false);

  const [editingRequestId, setEditingRequestId] = useState<string | null>(null);

  // Timesheet approval & history state
  const [timesheetApprovals, setTimesheetApprovals] = useState<Map<string, boolean>>(new Map());
  const [tsHistoryDialog, setTsHistoryDialog] = useState(false);
  const [tsHistoryDate, setTsHistoryDate] = useState<string>("");
  const [tsHistoryLogs, setTsHistoryLogs] = useState<any[]>([]);
  const [tsHistoryLoading, setTsHistoryLoading] = useState(false);
  const [accessInfoOpen, setAccessInfoOpen] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState("iphone");
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Load business from URL param
  useEffect(() => {
    if (!urlBusinessCode) return;
    const loadBusiness = async () => {
      const { data } = await supabase
        .from("businesses_public" as any)
        .select("name, logo_url, theme")
        .eq("business_code", urlBusinessCode.toUpperCase())
        .maybeSingle() as { data: { name: string; logo_url: string | null; theme: any } | null };
      if (data) {
        setBusinessName(data.name);
        setBusinessLogo(data.logo_url);
        if (data.theme) {
          applyTheme(data.theme as any);
        }
      }
    };
    loadBusiness();
    return () => { resetTheme(); };
  }, [urlBusinessCode]);

  const handleNumpadClick = (num: string) => {
    if (code.length < 4) setCode(prev => prev + num);
  };

  const fetchPortalData = async (employeeCodeValue: string) => {
    const bizCode = urlBusinessCode?.toUpperCase() || null;

    // Step 1: Resolve employee_id directly from employees_public (no RLS, most reliable)
    let empQuery = supabase.from("employees_public" as any).select("id, business_id").eq("employee_code", employeeCodeValue).eq("active", true) as any;
    if (bizCode) {
      const { data: bizRow } = await supabase.from("businesses_public" as any).select("id").eq("business_code", bizCode).maybeSingle() as { data: { id: string } | null };
      if (bizRow) empQuery = empQuery.eq("business_id", bizRow.id);
    }
    const { data: empRow } = await empQuery.maybeSingle();
    const resolvedEmpId: string | null = empRow?.id || null;

    // Step 2: Fetch everything in parallel — use direct table query for shifts (avoids RPC overload issues)
    const shiftsPromise = resolvedEmpId
      ? supabase
          .from("shifts")
          .select("id, date, day_of_week, start_time, end_time, break_minutes, hours_worked, notes, week_start_date")
          .eq("employee_id", resolvedEmpId)
          .eq("status", "published")
          .order("date")
          .order("start_time")
      : Promise.resolve({ data: [] });

    const [statusRes, shiftsRes, tsRes, forumRes, requestsRes, approvalsRes] = await Promise.all([
      supabase.rpc("get_employee_status", { _employee_code: employeeCodeValue, _business_code: bizCode }),
      shiftsPromise,
      supabase.rpc("get_employee_timesheets", { _employee_code: employeeCodeValue, _business_code: bizCode }),
      supabase.rpc("get_forum_posts", { _employee_code: employeeCodeValue, _business_code: bizCode }),
      supabase.rpc("get_employee_requests", { _employee_code: employeeCodeValue, _business_code: bizCode }),
      supabase.rpc("get_employee_timesheet_approvals", { _employee_code: employeeCodeValue, _business_code: bizCode }),
    ]);

    if (!statusRes.data || statusRes.data.length === 0) {
      return false;
    }

    const info = statusRes.data[0] as EmployeeInfo;
    setEmployeeInfo(info);
    setEmployeeCode(employeeCodeValue);
    setShifts((shiftsRes.data as PortalShift[]) || []);
    setTimesheets((tsRes.data as TimesheetEntry[]) || []);
    setForumPosts(forumRes.data || []);
    setMyRequests(requestsRes.data || []);

    const approvalMap = new Map<string, boolean>();
    for (const a of (approvalsRes.data || []) as any[]) {
      approvalMap.set(a.approval_date, a.is_approved);
    }
    setTimesheetApprovals(approvalMap);

    return true;
  };

  const handleLogin = async () => {
    if (!/^\d{4}$/.test(code)) {
      toast({ title: "Invalid Code", description: "Please enter your 4-digit employee code.", variant: "destructive" });
      setCode("");
      return;
    }

    await runAction(async () => {
      setLoading(true);
      try {
        const ok = await fetchPortalData(code);
        if (!ok) {
          toast({ title: "Invalid Code", description: "Employee not found.", variant: "destructive" });
          setLoading(false);
          return;
        }
        setAuthenticated(true);
      } catch {
        toast({ title: "Error", description: "Unable to load portal.", variant: "destructive" });
      }
      setLoading(false);
    });
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setCode("");
    setEmployeeCode("");
    setEmployeeInfo(null);
    setShifts([]);
    setTimesheets([]);
  };

  const openTsHistory = async (workDate: string) => {
    setTsHistoryDate(workDate);
    setTsHistoryDialog(true);
    setTsHistoryLoading(true);
    try {
      const { data } = await supabase.rpc("get_employee_timesheet_history", {
        _employee_code: employeeCode,
        _date: workDate,
        _business_code: urlBusinessCode?.toUpperCase() || null,
      });
      setTsHistoryLogs(data || []);
    } catch {
      setTsHistoryLogs([]);
    } finally {
      setTsHistoryLoading(false);
    }
  };

  // Forum helpers
  const loadForumPost = async (post: any) => {
    setSelectedForumPost(post);
    setCommentLoading(true);
    const bizCode = urlBusinessCode?.toUpperCase() || null;
    const [commentsRes, reactionsRes] = await Promise.all([
      supabase.rpc("get_forum_comments", { _employee_code: employeeCode, _post_id: post.id, _business_code: bizCode }),
      supabase.rpc("get_my_reactions", { _employee_code: employeeCode, _post_id: post.id, _business_code: bizCode }),
    ]);
    setForumComments(commentsRes.data || []);
    setMyReactions(new Set((reactionsRes.data || []).map((r: any) => r.reaction)));
    setCommentLoading(false);
  };

  const sendComment = async () => {
    if (!newComment.trim() || !selectedForumPost) return;
    await runAction(async () => {
      const bizCode = urlBusinessCode?.toUpperCase() || null;
      await supabase.rpc("add_forum_comment", { _employee_code: employeeCode, _post_id: selectedForumPost.id, _content: newComment.trim(), _business_code: bizCode });
      setNewComment("");
      loadForumPost(selectedForumPost);
      const { data } = await supabase.rpc("get_forum_posts", { _employee_code: employeeCode, _business_code: bizCode });
      setForumPosts(data || []);
    });
  };

  const toggleReaction = async (emoji: string) => {
    if (!selectedForumPost) return;
    const bizCode = urlBusinessCode?.toUpperCase() || null;
    await supabase.rpc("toggle_forum_reaction", { _employee_code: employeeCode, _post_id: selectedForumPost.id, _reaction: emoji, _business_code: bizCode });
    // Refresh
    const [reactionsRes, postsRes] = await Promise.all([
      supabase.rpc("get_my_reactions", { _employee_code: employeeCode, _post_id: selectedForumPost.id, _business_code: bizCode }),
      supabase.rpc("get_forum_posts", { _employee_code: employeeCode, _business_code: bizCode }),
    ]);
    setMyReactions(new Set((reactionsRes.data || []).map((r: any) => r.reaction)));
    setForumPosts(postsRes.data || []);
    // Update selected post reaction counts
    const updated = (postsRes.data || []).find((p: any) => p.id === selectedForumPost.id);
    if (updated) setSelectedForumPost(updated);
  };

  // Request helpers
  const DAYS_OF_WEEK = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

  const submitRequest = async () => {
    await runAction(async () => {
      setReqSaving(true);
      const bizCode = urlBusinessCode?.toUpperCase() || null;
      const params: any = {
        _employee_code: employeeCode,
        _request_type: reqType,
        _business_code: bizCode,
        _is_recurring: reqIsRecurring,
        _reason: reqReason.trim() || null,
        _start_time: reqType === "unavailability" && reqStartTime && reqStartTime !== "none" ? reqStartTime : null,
        _end_time: reqType === "unavailability" && reqEndTime && reqEndTime !== "none" ? reqEndTime : null,
      };
      if (reqIsRecurring) {
        params._recurring_days = reqDays;
        params._recurring_start_date = reqRecurringStart ? format(reqRecurringStart, "yyyy-MM-dd") : null;
        params._recurring_end_date = reqRecurringEnd ? format(reqRecurringEnd, "yyyy-MM-dd") : null;
      } else {
        params._start_date = reqStartDate ? format(reqStartDate, "yyyy-MM-dd") : null;
        params._end_date = reqEndDate ? format(reqEndDate, "yyyy-MM-dd") : null;
      }
      if (editingRequestId) {
        const updateParams: any = {
          ...params,
          _request_id: editingRequestId,
        };
        const { data } = await supabase.rpc("update_employee_request", updateParams);
        if (data) {
          toast({ title: "Request Updated" });
          setRequestOpen(false);
          resetRequestForm();
          const { data: updated } = await supabase.rpc("get_employee_requests", { _employee_code: employeeCode, _business_code: bizCode });
          setMyRequests(updated || []);
        } else {
          toast({ title: "Error", description: "Failed to update request.", variant: "destructive" });
        }
      } else {
        const { data } = await supabase.rpc("submit_employee_request", params);
        if (data) {
          toast({ title: "Request Submitted", description: "Your request has been sent for admin approval." });
          setRequestOpen(false);
          resetRequestForm();
          const { data: updated } = await supabase.rpc("get_employee_requests", { _employee_code: employeeCode, _business_code: bizCode });
          setMyRequests(updated || []);
        } else {
          toast({ title: "Error", description: "Failed to submit request.", variant: "destructive" });
        }
      }
      setReqSaving(false);
    });
  };

  const resetRequestForm = () => {
    setReqType("leave");
    setReqStartDate(undefined);
    setReqEndDate(undefined);
    setReqIsRecurring(false);
    setReqDays([]);
    setReqRecurringStart(undefined);
    setReqRecurringEnd(undefined);
    setReqReason("");
    setReqStartTime("");
    setReqEndTime("");
    setEditingRequestId(null);
  };

  const deleteRequest = async (requestId: string) => {
    await runAction(async () => {
      const bizCode = urlBusinessCode?.toUpperCase() || null;
      const { data } = await supabase.rpc("delete_employee_request", { _employee_code: employeeCode, _request_id: requestId, _business_code: bizCode });
      if (data) {
        toast({ title: "Request deleted" });
        const { data: updated } = await supabase.rpc("get_employee_requests", { _employee_code: employeeCode, _business_code: bizCode });
        setMyRequests(updated || []);
      } else {
        toast({ title: "Error", description: "Failed to delete request.", variant: "destructive" });
      }
    });
  };

  const openEditRequest = (req: any) => {
    setEditingRequestId(req.id);
    setReqType(req.request_type);
    setReqIsRecurring(req.is_recurring);
    setReqReason(req.reason || "");
    setReqStartTime(req.start_time || "");
    setReqEndTime(req.end_time || "");
    if (req.is_recurring) {
      setReqDays(req.recurring_days || []);
      setReqRecurringStart(req.recurring_start_date ? new Date(req.recurring_start_date + "T00:00:00") : undefined);
      setReqRecurringEnd(req.recurring_end_date ? new Date(req.recurring_end_date + "T00:00:00") : undefined);
      setReqStartDate(undefined);
      setReqEndDate(undefined);
    } else {
      setReqStartDate(req.start_date ? new Date(req.start_date + "T00:00:00") : undefined);
      setReqEndDate(req.end_date ? new Date(req.end_date + "T00:00:00") : undefined);
      setReqDays([]);
      setReqRecurringStart(undefined);
      setReqRecurringEnd(undefined);
    }
    setRequestOpen(true);
  };

  const statusBadge = (status: string) => {
    switch (status) {
      case "pending": return <Badge variant="outline" className="text-warning border-warning/30 text-[10px] px-1.5 py-0">Pending</Badge>;
      case "approved": return <Badge variant="outline" className="text-success border-success/30 text-[10px] px-1.5 py-0">Approved</Badge>;
      case "rejected": return <Badge variant="outline" className="text-destructive border-destructive/30 text-[10px] px-1.5 py-0">Rejected</Badge>;
      default: return <Badge variant="outline" className="text-[10px] px-1.5 py-0">{status}</Badge>;
    }
  };

  useEffect(() => {
    if (!authenticated) return;
    let timeout: NodeJS.Timeout;
    const reset = () => {
      clearTimeout(timeout);
      timeout = setTimeout(handleLogout, 5 * 60 * 1000);
    };
    reset();
    window.addEventListener("click", reset);
    window.addEventListener("keydown", reset);
    return () => {
      clearTimeout(timeout);
      window.removeEventListener("click", reset);
      window.removeEventListener("keydown", reset);
    };
  }, [authenticated]);

  // Keep portal data synced with admin actions
  useEffect(() => {
    if (!authenticated || !employeeCode) return;

    let cancelled = false;
    const refresh = async () => {
      try {
        const ok = await fetchPortalData(employeeCode);
        if (!ok && !cancelled) handleLogout();
      } catch {
        // silently ignore intermittent network errors during auto-refresh
      }
    };

    const intervalId = setInterval(refresh, 15000);
    const onFocus = () => { void refresh(); };
    const onVisibility = () => {
      if (document.visibilityState === "visible") void refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authenticated, employeeCode, urlBusinessCode]);

  /* ── group shifts by week — only show current week ── */
  const shiftsByWeek = useMemo(() => {
    const todayStr = ausToday();
    const [y, m, d] = todayStr.split("-").map(Number);
    const todayDate = new Date(y, m - 1, d);
    const mondayDate = getMonday(todayDate);
    const mondayStr = `${mondayDate.getFullYear()}-${String(mondayDate.getMonth() + 1).padStart(2, "0")}-${String(mondayDate.getDate()).padStart(2, "0")}`;

    const weeks: Record<string, PortalShift[]> = {};
    for (const s of shifts) {
      // Only include current week and future weeks
      if (s.week_start_date < mondayStr) continue;
      const key = s.week_start_date;
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(s);
    }
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  /* ── timesheet totals (removed overall — per-week only) ── */

  /* ── total scheduled hours this week ── */
  const thisWeekHours = useMemo(() => {
    const mondayStr = (() => {
      const todayStr = ausToday();
      const [y, m, d] = todayStr.split("-").map(Number);
      const today = new Date(y, m - 1, d);
      const mon = getMonday(today);
      return `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
    })();
    return shifts
      .filter(s => s.week_start_date === mondayStr)
      .reduce((sum, s) => sum + (s.hours_worked ?? calcNetHours(s.start_time, s.end_time, s.break_minutes)), 0);
  }, [shifts]);

  /* ── LOGIN SCREEN ── */
  if (!authenticated) {
    return (
      <div className="min-h-[100dvh] bg-background flex flex-col items-center justify-center p-4 standalone-top-pad overflow-y-auto">
        <div className="text-center mb-6">
          {businessLogo ? (
            <img src={businessLogo} alt={businessName} className="h-16 w-16 mx-auto rounded-lg object-cover mb-2" />
          ) : (
            <div className="h-16 w-16 mx-auto rounded-lg bg-primary/15 flex items-center justify-center mb-2">
              <User className="h-8 w-8 text-primary" />
            </div>
          )}
          <h1 className="text-xl font-bold gold-text">{businessName || "Employee Portal"}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {toAusFormatted(currentTime, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
          </p>
        </div>

        <Card className="w-full max-w-sm gold-border border gold-glow">
          <CardContent className="p-6 space-y-4">
            <p className="text-center text-sm text-muted-foreground">Enter your 4-digit employee code</p>
            <Input
              value={code}
              readOnly
              className="text-center text-3xl tracking-[0.5em] font-mono h-16 bg-surface"
              placeholder="••••"
            />
            {/* Touch-optimized numpad */}
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(n => (
                <Button key={n} variant="secondary" className="h-14 sm:h-16 text-2xl font-bold touch-active btn-press select-none" onClick={() => handleNumpadClick(n)}>
                  {n}
                </Button>
              ))}
              <Button variant="secondary" className="h-14 sm:h-16 touch-active btn-press select-none" onClick={() => setCode("")}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <Button variant="secondary" className="h-14 sm:h-16 text-2xl font-bold touch-active btn-press select-none" onClick={() => handleNumpadClick("0")}>
                0
              </Button>
              <Button variant="secondary" className="h-14 sm:h-16 touch-active btn-press select-none" onClick={() => setCode(p => p.slice(0, -1))}>
                <Delete className="h-6 w-6" />
              </Button>
            </div>
            <Button className="w-full h-14 text-lg touch-active btn-press" onClick={handleLogin} disabled={code.length !== 4 || loading}>
              {loading ? "Loading..." : "View My Portal"}
            </Button>
          </CardContent>
        </Card>

        <div className="mt-6 flex flex-col items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-1.5 touch-active"
            onClick={() => {
              localStorage.removeItem("omnexclock_portal_business_code");
              window.location.href = "/portal";
            }}
          >
            <RefreshCw className="h-3.5 w-3.5" /> Change Business
          </Button>
          <p className="text-xs text-muted-foreground">© 2024 Omnex Ventures Pty. Ltd.</p>
        </div>
      </div>
    );
  }

  /* ── PORTAL DASHBOARD ── */
  return (
    <div className="h-dvh bg-background standalone-top-pad flex flex-col" style={{ overflow: "hidden" }}>
      {/* Header */}
      <header className="shrink-0 z-30 bg-card/80 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            {businessLogo ? (
              <img src={businessLogo} alt={businessName} className="h-8 w-8 rounded-lg object-cover" />
            ) : (
              <img src="/omnex-logo.jpg" alt="Logo" className="h-8 w-8 rounded-full object-cover" />
            )}
            <div>
              <button
                className="flex items-center gap-2 hover:opacity-80 transition-opacity"
                onClick={() => setAccessInfoOpen(true)}
              >
                <User className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{employeeInfo?.employee_name}</span>
                <Download className="h-3 w-3 text-muted-foreground" />
              </button>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] px-1.5 py-0 font-mono">{employeeCode}</Badge>
                <Badge className={`text-[10px] px-1.5 py-0 ${
                  employeeInfo?.current_status === "clocked_in" ? "bg-success/15 text-success" :
                  employeeInfo?.current_status === "on_break" ? "bg-warning/15 text-warning" :
                  "bg-muted text-muted-foreground"
                }`}>
                  {employeeInfo?.current_status === "clocked_in" ? "Clocked In" :
                   employeeInfo?.current_status === "on_break" ? "On Break" : "Clocked Out"}
                </Badge>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <PortalNotifications employeeCode={employeeCode} businessCode={urlBusinessCode?.toUpperCase() || null} />
            <Button variant="outline" size="sm" onClick={handleLogout}>
              <LogOut className="mr-1.5 h-3.5 w-3.5" /> Exit
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="flex-1 overflow-y-auto overscroll-none scroll-native" style={{ WebkitOverflowScrolling: "touch", overflowY: "auto" }}>
       <div className="max-w-3xl mx-auto p-4 space-y-4 pb-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">This Week</p>
              <p className="text-2xl font-mono font-bold text-foreground">{thisWeekHours.toFixed(2)}h</p>
              <p className="text-xs text-muted-foreground">scheduled</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">Next Shift</p>
              {(() => {
                const today = ausToday();
                const next = shifts.find(s => s.date >= today);
                if (!next) return <p className="text-sm text-muted-foreground mt-2">No upcoming shifts</p>;
                return (
                  <>
                    <p className="text-lg font-semibold text-foreground">{next.day_of_week.slice(0, 3)}</p>
                    <p className="text-xs text-muted-foreground">{formatTime12(next.start_time)} – {formatTime12(next.end_time)}</p>
                  </>
                );
              })()}
            </CardContent>
          </Card>
        </div>

        {/* Tabs */}
        <Tabs defaultValue="today" className="w-full">
          <TabsList className="w-full grid grid-cols-5 h-11">
            <TabsTrigger value="today" className="gap-1 text-xs touch-active py-2.5">
              <Clock className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Today</span>
            </TabsTrigger>
            <TabsTrigger value="roster" className="gap-1 text-xs touch-active py-2.5" data-tour="portal-roster">
              <CalendarRange className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Roster</span>
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-1 text-xs touch-active py-2.5" data-tour="portal-timesheets">
              <FileText className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Time</span>
            </TabsTrigger>
            <TabsTrigger value="forum" className="gap-1 text-xs touch-active py-2.5" data-tour="portal-forum">
              <MessageSquare className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Forum</span>
            </TabsTrigger>
            <TabsTrigger value="requests" className="gap-1 text-xs touch-active py-2.5" data-tour="portal-requests">
              <CalendarOff className="h-3.5 w-3.5" /> <span className="hidden xs:inline">Requests</span>
            </TabsTrigger>
          </TabsList>

          {/* TODAY TAB */}
          <TabsContent value="today" className="space-y-4 mt-4">
            <TodayTab employeeCode={employeeCode} businessCode={urlBusinessCode?.toUpperCase() || null} shifts={shifts} employeeName={employeeInfo?.employee_name || ""} businessName={businessName} />
          </TabsContent>

          {/* ROSTER TAB */}
          <TabsContent value="roster" className="space-y-4 mt-4">
            {shiftsByWeek.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <CalendarRange className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No published shifts found.</p>
                </CardContent>
              </Card>
            ) : (
              shiftsByWeek.map(([weekStart, weekShifts]) => {
                const ws = new Date(weekStart + "T00:00:00");
                const we = new Date(ws);
                we.setDate(we.getDate() + 6);
                const weekTotal = weekShifts.reduce(
                  (sum, s) => sum + (s.hours_worked ?? calcNetHours(s.start_time, s.end_time, s.break_minutes)), 0
                );
                return (
                  <Card key={weekStart}>
                    <CardHeader className="pb-2 px-4 pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-medium text-muted-foreground">
                          {toAusFormatted(ws, { day: "numeric", month: "short" })} – {toAusFormatted(we, { day: "numeric", month: "short" })}
                        </CardTitle>
                        <Badge variant="outline" className="font-mono text-xs">{weekTotal.toFixed(2)}h</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="px-4 pb-4 space-y-2">
                      {weekShifts.map(shift => (
                        <div key={shift.id} className="flex items-center justify-between rounded-lg bg-secondary/50 px-3 py-2.5">
                          <div>
                            <p className="text-sm font-medium text-foreground">{shift.day_of_week}</p>
                            <p className="text-xs text-muted-foreground">
                              {toAusFormatted(new Date(shift.date + "T00:00:00"), { day: "numeric", month: "short" })}
                            </p>
                          </div>
                          <div className="text-right">
                            <p className="text-sm font-medium text-foreground">
                              {formatTime12(shift.start_time)} – {formatTime12(shift.end_time)}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(shift.hours_worked ?? calcNetHours(shift.start_time, shift.end_time, shift.break_minutes)).toFixed(2)}h
                              {shift.break_minutes > 0 && ` · ${shift.break_minutes}m brk`}
                            </p>
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  </Card>
                );
              })
            )}
          </TabsContent>

          {/* TIMESHEETS TAB */}
          <TabsContent value="timesheets" className="space-y-3 mt-4">
            {timesheets.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No timesheet entries found.</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Timesheets grouped by week */}
                {(() => {
                  // Group timesheets by week (Mon-Sun)
                  const weekGroups: Record<string, TimesheetEntry[]> = {};
                  for (const ts of timesheets) {
                    const d = new Date(ts.work_date + "T00:00:00");
                    const mon = getMonday(d);
                    const key = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, "0")}-${String(mon.getDate()).padStart(2, "0")}`;
                    if (!weekGroups[key]) weekGroups[key] = [];
                    weekGroups[key].push(ts);
                  }
                  const sortedWeeks = Object.entries(weekGroups).sort(([a], [b]) => b.localeCompare(a));

                  return sortedWeeks.map(([weekStart, weekEntries]) => {
                    const ws = new Date(weekStart + "T00:00:00");
                    const we = new Date(ws);
                    we.setDate(we.getDate() + 6);
                    const weekTotal = weekEntries.reduce((sum, t) => sum + (t.net_hours || 0), 0);
                    const todayStr = ausToday();
                    const todayMon = (() => { const td = new Date(todayStr + "T00:00:00"); const m = getMonday(td); return `${m.getFullYear()}-${String(m.getMonth() + 1).padStart(2, "0")}-${String(m.getDate()).padStart(2, "0")}`; })();
                    const isCurrentWeek = weekStart === todayMon;

                    return (
                      <Collapsible key={weekStart} defaultOpen={isCurrentWeek}>
                        <CollapsibleTrigger className="w-full">
                          <Card className={isCurrentWeek ? "border-primary/30" : ""}>
                            <CardContent className="p-3 flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <CalendarRange className="h-3.5 w-3.5 text-primary" />
                                <span className="text-sm font-medium text-foreground">
                                  {toAusFormatted(ws, { day: "numeric", month: "short" })} – {toAusFormatted(we, { day: "numeric", month: "short" })}
                                </span>
                                {isCurrentWeek && <Badge className="bg-primary/15 text-primary text-[10px] px-1.5 py-0">This Week</Badge>}
                              </div>
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className="font-mono text-xs">{weekTotal.toFixed(2)}h</Badge>
                                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform [[data-state=open]_&]:rotate-180" />
                              </div>
                            </CardContent>
                          </Card>
                        </CollapsibleTrigger>
                        <CollapsibleContent className="space-y-2 mt-2">
                          {weekEntries.map((ts) => {
                            const d = new Date(ts.work_date + "T00:00:00");
                            const dayName = toAusFormatted(d, { weekday: "short" });
                            const dateLabel = toAusFormatted(d, { day: "numeric", month: "short" });
                            const isActive = !!ts.clock_in && !ts.clock_out;
                            const isApproved = isActive ? false : timesheetApprovals.get(ts.work_date);

                            return (
                              <Card key={ts.work_date} className={isActive ? "border-warning/40" : isApproved ? "border-success/30" : ""}>
                                <CardContent className="p-3">
                                  <div className="flex items-center justify-between mb-2">
                                    <div className="flex items-center gap-2">
                                      {isApproved === true ? (
                                        <CheckCircle2 className="h-4 w-4 text-success" />
                                      ) : isApproved === false ? (
                                        <XCircle className="h-4 w-4 text-muted-foreground" />
                                      ) : null}
                                      <span className="text-sm font-medium text-foreground">{dayName}</span>
                                      <span className="text-xs text-muted-foreground">{dateLabel}</span>
                                      {isActive && (
                                        <Badge className="bg-warning/15 text-warning text-[10px] px-1.5 py-0">Active</Badge>
                                      )}
                                      {isApproved === true && (
                                        <Badge className="bg-success/15 text-success text-[10px] px-1.5 py-0">Approved</Badge>
                                      )}
                                      {isApproved === false && (
                                        <Badge variant="outline" className="text-muted-foreground text-[10px] px-1.5 py-0">Pending</Badge>
                                      )}
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={() => openTsHistory(ts.work_date)}
                                        className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                                      >
                                        <History className="h-3.5 w-3.5" />
                                      </Button>
                                      <span className="font-mono font-semibold text-foreground text-sm">
                                        {ts.net_hours.toFixed(2)}h
                                      </span>
                                    </div>
                                  </div>
                                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                    <div className="flex items-center gap-1.5">
                                      <LogIn className="h-3 w-3 text-success" />
                                      <span className="text-muted-foreground">In:</span>
                                      <span className="text-foreground font-mono">{fmtTimestamp(ts.clock_in)}</span>
                                    </div>
                                    <div className="flex items-center gap-1.5">
                                      <LogOut className="h-3 w-3 text-destructive" />
                                      <span className="text-muted-foreground">Out:</span>
                                      <span className="text-foreground font-mono">{fmtTimestamp(ts.clock_out)}</span>
                                    </div>
                                    {(ts.break_start || ts.break_end) && (
                                      <>
                                        <div className="flex items-center gap-1.5">
                                          <Coffee className="h-3 w-3 text-warning" />
                                          <span className="text-muted-foreground">Break:</span>
                                          <span className="text-foreground font-mono">{fmtTimestamp(ts.break_start)}</span>
                                        </div>
                                        <div className="flex items-center gap-1.5">
                                          <Clock className="h-3 w-3 text-primary" />
                                          <span className="text-muted-foreground">Resume:</span>
                                          <span className="text-foreground font-mono">{fmtTimestamp(ts.break_end)}</span>
                                        </div>
                                      </>
                                    )}
                                  </div>
                                  {ts.break_minutes > 0 && (
                                    <p className="text-[10px] text-muted-foreground mt-1.5">
                                      {ts.break_minutes}m break · {ts.total_hours.toFixed(2)}h gross
                                    </p>
                                  )}
                                </CardContent>
                              </Card>
                            );
                          })}
                        </CollapsibleContent>
                      </Collapsible>
                    );
                  });
                })()}
              </>
            )}
          </TabsContent>

          {/* FORUM TAB */}
          <TabsContent value="forum" className="space-y-3 mt-4">
            {forumPosts.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No announcements yet.</p>
                </CardContent>
              </Card>
            ) : (
              forumPosts.map((post: any) => (
                <Card key={post.id} className="cursor-pointer hover:border-primary/30 transition-colors" onClick={() => loadForumPost(post)}>
                  <CardContent className="p-4">
                    <h3 className="font-semibold text-foreground text-sm">{post.title}</h3>
                    <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{post.content}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      <span className="text-[10px] text-muted-foreground">
                        {toAusLocaleString(new Date(post.created_at), { day: "numeric", month: "short" })}
                      </span>
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        <MessageSquare className="h-2.5 w-2.5 mr-0.5" /> {post.comment_count}
                      </Badge>
                      {post.reaction_counts && Object.entries(post.reaction_counts as Record<string, number>).map(([emoji, count]) => (
                        <Badge key={emoji} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {emoji} {count}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>

          {/* REQUESTS TAB */}
          <TabsContent value="requests" className="space-y-3 mt-4">
            <Button size="sm" className="w-full" onClick={() => { resetRequestForm(); setRequestOpen(true); }}>
              <Plus className="mr-1.5 h-4 w-4" /> Submit Request
            </Button>
            {myRequests.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <CalendarOff className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No requests submitted yet.</p>
                </CardContent>
              </Card>
            ) : (
              myRequests.map((req: any) => (
                <Card key={req.id}>
                  <CardContent className="p-3 space-y-1">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        {statusBadge(req.status)}
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 capitalize">
                          {req.is_recurring && <RefreshCw className="h-2.5 w-2.5 mr-0.5" />}
                          {req.request_type}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-1">
                        {req.status === "pending" && (
                          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditRequest(req)}>
                            <Pencil className="h-3.5 w-3.5" />
                          </Button>
                        )}
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" onClick={() => {
                          if (window.confirm("Are you sure you want to delete this request?")) {
                            deleteRequest(req.id);
                          }
                        }}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                    <p className="text-sm text-foreground">
                      {req.is_recurring
                        ? `Every ${(req.recurring_days || []).join(", ")}${req.recurring_start_date ? ` (${new Date(req.recurring_start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – ${new Date(req.recurring_end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })})` : ""}`
                        : req.start_date
                          ? `${new Date(req.start_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}${req.end_date && req.end_date !== req.start_date ? ` – ${new Date(req.end_date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}` : ""}`
                          : "—"}
                      {req.start_time && req.end_time && ` · ${formatTime12(req.start_time)} – ${formatTime12(req.end_time)}`}
                    </p>
                    {req.reason && <p className="text-xs text-muted-foreground">{req.reason}</p>}
                    {req.admin_note && <p className="text-xs text-muted-foreground italic">Admin: {req.admin_note}</p>}
                  </CardContent>
                </Card>
              ))
            )}
          </TabsContent>
        </Tabs>

        {/* Forum Post Detail Dialog */}
        <Dialog open={!!selectedForumPost} onOpenChange={(open) => { if (!open) setSelectedForumPost(null); }}>
          <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="text-base">{selectedForumPost?.title}</DialogTitle>
            </DialogHeader>
            <p className="text-sm text-foreground whitespace-pre-wrap">{selectedForumPost?.content}</p>

            {/* Reactions */}
            <div className="flex gap-2 flex-wrap">
              {["👍", "❤️", "😂", "🎉"].map(emoji => (
                <Button
                  key={emoji}
                  variant={myReactions.has(emoji) ? "default" : "outline"}
                  size="sm"
                  className="h-8 text-base"
                  onClick={() => toggleReaction(emoji)}
                >
                  {emoji} {selectedForumPost?.reaction_counts?.[emoji] || 0}
                </Button>
              ))}
            </div>

            {/* Comments */}
            <div className="space-y-2">
              <Label className="text-xs text-muted-foreground">Comments</Label>
              {commentLoading ? (
                <p className="text-xs text-muted-foreground text-center py-4">Loading...</p>
              ) : forumComments.length === 0 ? (
                <p className="text-xs text-muted-foreground text-center py-4">No comments yet. Be the first!</p>
              ) : (
                forumComments.map((c: any) => (
                  <div key={c.id} className="rounded-lg bg-secondary/50 px-3 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-foreground">{c.employee_name}</span>
                      <span className="text-[10px] text-muted-foreground">
                        {toAusLocaleString(new Date(c.created_at), { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}
                      </span>
                    </div>
                    <p className="text-sm text-foreground mt-0.5">{c.content}</p>
                  </div>
                ))
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Write a comment..."
                  value={newComment}
                  onChange={e => setNewComment(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && sendComment()}
                  className="flex-1"
                />
                <Button size="sm" onClick={sendComment} disabled={!newComment.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Submit Request Dialog */}
        <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>{editingRequestId ? "Edit Request" : "Submit Request"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select value={reqType} onValueChange={(v) => setReqType(v as "leave" | "unavailability")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leave">Leave</SelectItem>
                    <SelectItem value="unavailability">Unavailability</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {reqType === "unavailability" && (
                <div className="flex items-center gap-2">
                  <Checkbox checked={reqIsRecurring} onCheckedChange={(c) => setReqIsRecurring(!!c)} id="recurring" />
                  <Label htmlFor="recurring" className="text-sm cursor-pointer">Recurring (weekly)</Label>
                </div>
              )}

              {reqIsRecurring ? (
                <>
                  <div className="space-y-2">
                    <Label>Days of Week</Label>
                    <div className="flex flex-wrap gap-2">
                      {DAYS_OF_WEEK.map(day => (
                        <Button
                          key={day}
                          variant={reqDays.includes(day) ? "default" : "outline"}
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => setReqDays(prev => prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day])}
                        >
                          {day.slice(0, 3)}
                        </Button>
                      ))}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-2">
                      <Label className="text-xs">From Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reqRecurringStart && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {reqRecurringStart ? format(reqRecurringStart, "dd MMM yyyy") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={reqRecurringStart} onSelect={setReqRecurringStart} /></PopoverContent>
                      </Popover>
                    </div>
                    <div className="space-y-2">
                      <Label className="text-xs">To Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reqRecurringEnd && "text-muted-foreground")}>
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {reqRecurringEnd ? format(reqRecurringEnd, "dd MMM yyyy") : "Pick date"}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={reqRecurringEnd} onSelect={setReqRecurringEnd} /></PopoverContent>
                      </Popover>
                    </div>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Start Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reqStartDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {reqStartDate ? format(reqStartDate, "dd MMM yyyy") : "Pick date"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={reqStartDate} onSelect={setReqStartDate} /></PopoverContent>
                    </Popover>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">End Date</Label>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className={cn("w-full justify-start text-left font-normal", !reqEndDate && "text-muted-foreground")}>
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {reqEndDate ? format(reqEndDate, "dd MMM yyyy") : "Same as start"}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={reqEndDate} onSelect={setReqEndDate} /></PopoverContent>
                    </Popover>
                  </div>
                </div>
              )}

              {reqType === "unavailability" && (
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-2">
                    <Label className="text-xs">Start Time (optional)</Label>
                    <Select value={reqStartTime} onValueChange={setReqStartTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="All day" />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        <SelectItem value="none">All day</SelectItem>
                        {Array.from({ length: 48 }, (_, i) => {
                          const h = Math.floor(i / 2);
                          const m = i % 2 === 0 ? "00" : "30";
                          const val = `${String(h).padStart(2, "0")}:${m}`;
                          return <SelectItem key={val} value={val}>{formatTime12(val)}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label className="text-xs">End Time (optional)</Label>
                    <Select value={reqEndTime} onValueChange={setReqEndTime}>
                      <SelectTrigger>
                        <SelectValue placeholder="All day" />
                      </SelectTrigger>
                      <SelectContent className="max-h-48">
                        <SelectItem value="none">All day</SelectItem>
                        {Array.from({ length: 48 }, (_, i) => {
                          const h = Math.floor(i / 2);
                          const m = i % 2 === 0 ? "00" : "30";
                          const val = `${String(h).padStart(2, "0")}:${m}`;
                          return <SelectItem key={val} value={val}>{formatTime12(val)}</SelectItem>;
                        })}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label>Reason (optional)</Label>
                <Textarea placeholder="Reason for your request..." value={reqReason} onChange={e => setReqReason(e.target.value)} rows={2} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setRequestOpen(false)}>Cancel</Button>
              <Button onClick={submitRequest} disabled={reqSaving}>{reqSaving ? "Saving..." : editingRequestId ? "Update" : "Submit"}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
       </div>
      </main>

      {/* Timesheet History Dialog */}
      <Dialog open={tsHistoryDialog} onOpenChange={setTsHistoryDialog}>
        <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="h-5 w-5 text-primary" />
              Edit History
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              {tsHistoryDate && toAusFormatted(new Date(tsHistoryDate + "T00:00:00"), { weekday: "long", day: "numeric", month: "short", year: "numeric" })}
            </p>
          </DialogHeader>
          {tsHistoryLoading ? (
            <p className="text-sm text-muted-foreground text-center py-4">Loading...</p>
          ) : tsHistoryLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No edit history found.</p>
          ) : (
            <div className="space-y-3">
              {tsHistoryLogs.map((log: any, i: number) => {
                const d = log.log_details as any;
                const actionLabels: Record<string, string> = {
                  timesheet_edit: "Edited",
                  timesheet_add: "Added",
                  timesheet_delete: "Deleted",
                  timesheet_approve: "Approved",
                  timesheet_unapprove: "Approval Revoked",
                };
                return (
                  <div key={i} className="border border-border rounded-lg p-3 space-y-2">
                    <div className="flex items-center justify-between">
                      <Badge variant="outline" className="text-xs">{actionLabels[log.log_action] || log.log_action}</Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(log.log_timestamp).toLocaleString("en-AU", { dateStyle: "medium", timeStyle: "short" })}
                      </span>
                    </div>
                    {d?.comment && (
                      <p className="text-sm text-foreground"><span className="text-muted-foreground">Comment:</span> {d.comment}</p>
                    )}
                    {d?.previous && d?.updated && (
                      <div className="grid grid-cols-2 gap-2 text-xs">
                        <div className="space-y-1">
                          <p className="font-medium text-muted-foreground">Before</p>
                          {d.previous.clock_in && <p>In: {ensureTime12(d.previous.clock_in)}</p>}
                          {d.previous.clock_out && <p>Out: {ensureTime12(d.previous.clock_out)}</p>}
                          {d.previous.break_start && <p>Break: {ensureTime12(d.previous.break_start)}</p>}
                          {d.previous.break_end && <p>Resume: {ensureTime12(d.previous.break_end)}</p>}
                        </div>
                        <div className="space-y-1">
                          <p className="font-medium text-muted-foreground">After</p>
                          {d.updated.clock_in && <p>In: {ensureTime12(d.updated.clock_in)}</p>}
                          {d.updated.clock_out && <p>Out: {ensureTime12(d.updated.clock_out)}</p>}
                          {d.updated.break_start && <p>Break: {ensureTime12(d.updated.break_start)}</p>}
                          {d.updated.break_end && <p>Resume: {ensureTime12(d.updated.break_end)}</p>}
                        </div>
                      </div>
                    )}
                    {d?.times && (
                      <div className="text-xs space-y-1">
                        {d.times.clock_in && <p>In: {d.times.clock_in}</p>}
                        {d.times.clock_out && <p>Out: {d.times.clock_out}</p>}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* Portal Access / PWA Install Instructions Dialog */}
      <Dialog open={accessInfoOpen} onOpenChange={setAccessInfoOpen}>
        <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Download className="h-5 w-5 text-primary" />
              Install Employee Portal
            </DialogTitle>
            <p className="text-sm text-muted-foreground">
              Add OmnexClock to your home screen for quick access — works like a native app.
            </p>
          </DialogHeader>

          <div className="space-y-4">
            {/* Portal URL */}
            <div className="rounded-lg bg-secondary/50 border border-border/60 p-3 space-y-1.5">
              <p className="text-xs font-medium text-foreground">Portal URL</p>
              <p className="font-mono text-xs text-primary break-all select-all">https://omnexclock.lovable.app/portal</p>
              <p className="text-[10px] text-muted-foreground">
                Business Code: <span className="font-mono font-bold text-foreground">{urlBusinessCode?.toUpperCase() || "—"}</span>
              </p>
            </div>

            {/* Device selector */}
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select your device</Label>
              <Select value={selectedDevice} onValueChange={setSelectedDevice}>
                <SelectTrigger className="bg-card">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border border-border z-[200]">
                  <SelectItem value="iphone">
                    <div className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> iPhone (Safari)</div>
                  </SelectItem>
                  <SelectItem value="android">
                    <div className="flex items-center gap-2"><Smartphone className="h-4 w-4" /> Android (Chrome)</div>
                  </SelectItem>
                  <SelectItem value="ipad">
                    <div className="flex items-center gap-2"><Tablet className="h-4 w-4" /> iPad (Safari)</div>
                  </SelectItem>
                  <SelectItem value="desktop">
                    <div className="flex items-center gap-2"><Monitor className="h-4 w-4" /> Desktop (Chrome / Edge)</div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Instructions based on device */}
            <div className="rounded-lg border border-border/60 bg-card p-4 space-y-3">
              {selectedDevice === "iphone" && (
                <>
                  <p className="text-sm font-semibold text-foreground">iPhone — Safari</p>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4">
                    <li>Open <span className="font-mono text-primary">Safari</span> (this must be Safari, not Chrome)</li>
                    <li>Navigate to <span className="font-mono text-primary break-all">https://omnexclock.lovable.app/portal</span></li>
                    <li>Tap the <span className="font-semibold text-foreground">Share</span> button (square with an arrow pointing up) at the bottom of the screen</li>
                    <li>Scroll down and tap <span className="font-semibold text-foreground">"Add to Home Screen"</span></li>
                    <li>Tap <span className="font-semibold text-foreground">"Add"</span> in the top-right corner</li>
                    <li>The app icon will appear on your home screen — tap it to launch the portal full-screen</li>
                  </ol>
                </>
              )}
              {selectedDevice === "android" && (
                <>
                  <p className="text-sm font-semibold text-foreground">Android — Chrome</p>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4">
                    <li>Open <span className="font-mono text-primary">Google Chrome</span></li>
                    <li>Navigate to <span className="font-mono text-primary break-all">https://omnexclock.lovable.app/portal</span></li>
                    <li>Tap the <span className="font-semibold text-foreground">three-dot menu</span> (⋮) in the top-right corner</li>
                    <li>Tap <span className="font-semibold text-foreground">"Add to Home screen"</span> or <span className="font-semibold text-foreground">"Install app"</span></li>
                    <li>Confirm by tapping <span className="font-semibold text-foreground">"Add"</span> or <span className="font-semibold text-foreground">"Install"</span></li>
                    <li>The app will appear on your home screen and in your app drawer</li>
                  </ol>
                </>
              )}
              {selectedDevice === "ipad" && (
                <>
                  <p className="text-sm font-semibold text-foreground">iPad — Safari</p>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4">
                    <li>Open <span className="font-mono text-primary">Safari</span> on your iPad</li>
                    <li>Navigate to <span className="font-mono text-primary break-all">https://omnexclock.lovable.app/portal</span></li>
                    <li>Tap the <span className="font-semibold text-foreground">Share</span> button (square with arrow) — it may be in the top-right or bottom bar depending on your iPad layout</li>
                    <li>Tap <span className="font-semibold text-foreground">"Add to Home Screen"</span></li>
                    <li>Tap <span className="font-semibold text-foreground">"Add"</span> to confirm</li>
                    <li>Launch the app from your home screen for a full-screen experience</li>
                  </ol>
                </>
              )}
              {selectedDevice === "desktop" && (
                <>
                  <p className="text-sm font-semibold text-foreground">Desktop — Chrome / Edge</p>
                  <ol className="text-xs text-muted-foreground space-y-2 list-decimal pl-4">
                    <li>Open <span className="font-mono text-primary">Google Chrome</span> or <span className="font-mono text-primary">Microsoft Edge</span></li>
                    <li>Navigate to <span className="font-mono text-primary break-all">https://omnexclock.lovable.app/portal</span></li>
                    <li>Click the <span className="font-semibold text-foreground">install icon</span> (⊕) in the address bar, or click the three-dot menu → <span className="font-semibold text-foreground">"Install OmnexClock"</span></li>
                    <li>Click <span className="font-semibold text-foreground">"Install"</span> in the prompt</li>
                    <li>The app will open in its own window and appear in your Start menu / Dock</li>
                  </ol>
                </>
              )}
            </div>

            <p className="text-[10px] text-muted-foreground/70">
              💡 Your employee code is confidential. Do not share it with others. Once installed, you'll be remembered on this device.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <footer className="text-center py-6">
        <p className="text-xs text-muted-foreground">© {new Date().getFullYear()} Omnex Ventures Pty. Ltd. All rights reserved.</p>
      </footer>

      {/* First-time employee walkthrough */}
      <WalkthroughTour
        steps={portalTourSteps}
        storageKey={`portal-tour-seen-${urlBusinessCode}`}
      />
    </div>
  );
}
