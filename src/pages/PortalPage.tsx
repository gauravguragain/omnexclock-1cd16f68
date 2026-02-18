import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import {
  ArrowLeft, Delete, CalendarRange, Clock, LogIn, LogOut, Coffee, User,
} from "lucide-react";

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

interface ClockEvent {
  id: string;
  event_type: string;
  event_timestamp: string;
  photo_url: string | null;
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

const EVENT_CONFIG: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  clock_in: { label: "Clock In", icon: <LogIn className="h-4 w-4" />, color: "bg-success/15 text-success" },
  clock_out: { label: "Clock Out", icon: <LogOut className="h-4 w-4" />, color: "bg-destructive/15 text-destructive" },
  break_start: { label: "Break Start", icon: <Coffee className="h-4 w-4" />, color: "bg-warning/15 text-warning" },
  break_end: { label: "Break End", icon: <Clock className="h-4 w-4" />, color: "bg-primary/15 text-primary" },
};

/* ── component ───────────────────────────────────────────── */

export default function PortalPage() {
  const { toast } = useToast();
  const [code, setCode] = useState("");
  const [authenticated, setAuthenticated] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [shifts, setShifts] = useState<PortalShift[]>([]);
  const [clockHistory, setClockHistory] = useState<ClockEvent[]>([]);
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

      // Fetch shifts and clock history in parallel
      const [shiftsRes, clockRes] = await Promise.all([
        supabase.rpc("get_employee_shifts", { _employee_code: code }),
        supabase.rpc("get_employee_clock_history", { _employee_code: code }),
      ]);

      setShifts((shiftsRes.data as PortalShift[]) || []);
      setClockHistory((clockRes.data as ClockEvent[]) || []);
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
    setClockHistory([]);
  };

  // Auto-logout after 5 minutes of inactivity
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

  /* ── group clock events by date ── */
  const clockByDate = useMemo(() => {
    const dates: Record<string, ClockEvent[]> = {};
    for (const e of clockHistory) {
      const dateKey = new Date(e.event_timestamp).toLocaleDateString("en-AU");
      if (!dates[dateKey]) dates[dateKey] = [];
      dates[dateKey].push(e);
    }
    return Object.entries(dates);
  }, [clockHistory]);

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
            {currentTime.toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
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
                const today = new Date().toISOString().slice(0, 10);
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
            <TabsTrigger value="history" className="gap-1.5">
              <Clock className="h-3.5 w-3.5" /> Clock History
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
                          {ws.toLocaleDateString("en-AU", { day: "numeric", month: "short" })} – {we.toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
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
                              {new Date(shift.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
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

          {/* CLOCK HISTORY TAB */}
          <TabsContent value="history" className="space-y-4 mt-4">
            {clockByDate.length === 0 ? (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                  <p>No clock events in the last 14 days.</p>
                </CardContent>
              </Card>
            ) : (
              clockByDate.map(([dateStr, events]) => (
                <Card key={dateStr}>
                  <CardHeader className="pb-2 px-4 pt-4">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{dateStr}</CardTitle>
                  </CardHeader>
                  <CardContent className="px-4 pb-4 space-y-1.5">
                    {events.map(ev => {
                      const cfg = EVENT_CONFIG[ev.event_type] || EVENT_CONFIG.clock_in;
                      const time = new Date(ev.event_timestamp);
                      return (
                        <div key={ev.id} className="flex items-center gap-3 rounded-lg bg-secondary/50 px-3 py-2">
                          <div className={`flex items-center justify-center h-8 w-8 rounded-full ${cfg.color}`}>
                            {cfg.icon}
                          </div>
                          <div className="flex-1">
                            <p className="text-sm font-medium text-foreground">{cfg.label}</p>
                          </div>
                          <p className="text-sm font-mono text-muted-foreground">
                            {time.toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true })}
                          </p>
                        </div>
                      );
                    })}
                  </CardContent>
                </Card>
              ))
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
