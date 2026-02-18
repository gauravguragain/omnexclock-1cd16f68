import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Delete, CalendarRange, Clock, LogIn, LogOut, Coffee, User, FileText,
} from "lucide-react";
import { ausToday, toAusFormatted, toAusTime12 } from "@/lib/dateUtils";

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

/* ── component ───────────────────────────────────────────── */

export default function PortalPage() {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [shifts, setShifts] = useState<PortalShift[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const handleNumpadClick = (num: string) => {
    if (code.length < 4) setCode(prev => prev + num);
  };

  const handleLogin = async () => {
    if (!/^\d{4}$/.test(code)) {
      toast({ title: "Invalid Code", description: "Please enter your 4-digit employee code.", variant: "destructive" });
      setCode("");
      return;
    }

    setLoading(true);
    try {
      const { data: statusData } = await supabase.rpc("get_employee_status", { _employee_code: code });
      if (!statusData || statusData.length === 0) {
        toast({ title: "Invalid Code", description: "Employee not found.", variant: "destructive" });
        setCode("");
        setLoading(false);
        return;
      }

      setEmployeeInfo(statusData[0] as EmployeeInfo);
      setEmployeeCode(code);

      const [shiftsRes, tsRes] = await Promise.all([
        supabase.rpc("get_employee_shifts", { _employee_code: code }),
        supabase.rpc("get_employee_timesheets", { _employee_code: code }),
      ]);

      setShifts((shiftsRes.data as PortalShift[]) || []);
      setTimesheets((tsRes.data as TimesheetEntry[]) || []);
      setAuthenticated(true);
    } catch {
      toast({ title: "Error", description: "Unable to load portal.", variant: "destructive" });
    }
    setLoading(false);
  };

  const handleLogout = () => {
    setAuthenticated(false);
    setCode("");
    setEmployeeCode("");
    setEmployeeInfo(null);
    setShifts([]);
    setTimesheets([]);
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

  /* ── group shifts by week ── */
  const shiftsByWeek = useMemo(() => {
    const weeks: Record<string, PortalShift[]> = {};
    for (const s of shifts) {
      const key = s.week_start_date;
      if (!weeks[key]) weeks[key] = [];
      weeks[key].push(s);
    }
    return Object.entries(weeks).sort(([a], [b]) => a.localeCompare(b));
  }, [shifts]);

  /* ── timesheet totals ── */
  const timesheetTotalHours = useMemo(() => {
    return timesheets.reduce((sum, t) => sum + (t.net_hours || 0), 0);
  }, [timesheets]);

  /* ── total scheduled hours this week ── */
  const thisWeekHours = useMemo(() => {
    const monday = getMonday(new Date());
    const mondayStr = monday.toISOString().slice(0, 10);
    return shifts
      .filter(s => s.week_start_date === mondayStr)
      .reduce((sum, s) => sum + (s.hours_worked ?? calcNetHours(s.start_time, s.end_time, s.break_minutes)), 0);
  }, [shifts]);

  /* ── LOGIN SCREEN ── */
  if (!authenticated) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center mb-6">
          <img src="/logo.jpeg" alt="Pro Regal Pavilion" className="h-16 w-16 mx-auto rounded-lg object-cover mb-2" />
          <h1 className="text-xl font-bold gold-text">Employee Portal</h1>
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
            <div className="grid grid-cols-3 gap-2">
              {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map(n => (
                <Button key={n} variant="secondary" className="h-16 text-2xl font-bold" onClick={() => handleNumpadClick(n)}>
                  {n}
                </Button>
              ))}
              <Button variant="secondary" className="h-16" onClick={() => setCode("")}>
                <ArrowLeft className="h-6 w-6" />
              </Button>
              <Button variant="secondary" className="h-16 text-2xl font-bold" onClick={() => handleNumpadClick("0")}>
                0
              </Button>
              <Button variant="secondary" className="h-16" onClick={() => setCode(p => p.slice(0, -1))}>
                <Delete className="h-6 w-6" />
              </Button>
            </div>
            <Button className="w-full h-14 text-lg" onClick={handleLogin} disabled={code.length !== 4 || loading}>
              {loading ? "Loading..." : "View My Portal"}
            </Button>
          </CardContent>
        </Card>

        <p className="mt-8 text-xs text-muted-foreground">© 2024 Omnex Ventures Pty. Ltd. All rights reserved.</p>
      </div>
    );
  }

  /* ── PORTAL DASHBOARD ── */
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur border-b border-border px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src="/logo.jpeg" alt="Logo" className="h-8 w-8 rounded-lg object-cover" />
            <div>
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-primary" />
                <span className="font-semibold text-foreground">{employeeInfo?.employee_name}</span>
              </div>
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
          <Button variant="outline" size="sm" onClick={handleLogout}>
            <LogOut className="mr-1.5 h-3.5 w-3.5" /> Exit
          </Button>
        </div>
      </header>

      {/* Content */}
      <main className="max-w-3xl mx-auto p-4 space-y-4">
        {/* Summary cards */}
        <div className="grid grid-cols-2 gap-3">
          <Card>
            <CardContent className="p-4 text-center">
              <p className="text-xs text-muted-foreground mb-1">This Week</p>
              <p className="text-2xl font-mono font-bold text-foreground">{thisWeekHours.toFixed(1)}h</p>
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
        <Tabs defaultValue="roster" className="w-full">
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="roster" className="gap-1.5">
              <CalendarRange className="h-3.5 w-3.5" /> Roster
            </TabsTrigger>
            <TabsTrigger value="timesheets" className="gap-1.5">
              <FileText className="h-3.5 w-3.5" /> Timesheets
            </TabsTrigger>
          </TabsList>

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
                        <Badge variant="outline" className="font-mono text-xs">{weekTotal.toFixed(1)}h</Badge>
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
                              {(shift.hours_worked ?? calcNetHours(shift.start_time, shift.end_time, shift.break_minutes)).toFixed(1)}h
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
                {/* Summary */}
                <Card>
                  <CardContent className="p-3 flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">Total worked</span>
                    <span className="font-mono font-bold text-foreground">{timesheetTotalHours.toFixed(1)}h</span>
                  </CardContent>
                </Card>

                {/* Timesheet rows */}
                {timesheets.map((ts) => {
                  const d = new Date(ts.work_date + "T00:00:00");
                  const dayName = toAusFormatted(d, { weekday: "short" });
                  const dateLabel = toAusFormatted(d, { day: "numeric", month: "short" });
                  const isActive = ts.clock_in && !ts.clock_out;

                  return (
                    <Card key={ts.work_date} className={isActive ? "border-warning/40" : ""}>
                      <CardContent className="p-3">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground">{dayName}</span>
                            <span className="text-xs text-muted-foreground">{dateLabel}</span>
                            {isActive && (
                              <Badge className="bg-warning/15 text-warning text-[10px] px-1.5 py-0">Active</Badge>
                            )}
                          </div>
                          <span className="font-mono font-semibold text-foreground text-sm">
                            {ts.net_hours.toFixed(1)}h
                          </span>
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
                            {ts.break_minutes}m break · {ts.total_hours.toFixed(1)}h gross
                          </p>
                        )}
                      </CardContent>
                    </Card>
                  );
                })}
              </>
            )}
          </TabsContent>
        </Tabs>
      </main>

      <footer className="text-center py-6">
        <p className="text-xs text-muted-foreground">© 2024 Omnex Ventures Pty. Ltd. All rights reserved.</p>
      </footer>
    </div>
  );
}
