import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Users, Clock, DollarSign, TrendingUp, Activity, Sparkles } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import { toAusDateKey, toAusTime12, toAusFormatted, toAusDisplayDate, ausStartOfToday, ausStartOfTomorrow, ausCurrentHour, ausStartOfDay, toAusDate } from "@/lib/dateUtils";
import { computeTimesheetEntries, filterApprovedEntries } from "@/lib/timesheetUtils";

interface DailyHours {
  date: string;
  key: string;
  hours: number;
  employees: number;
}

const toLocalDateKey = (d: Date) => toAusDateKey(d);

const roundHours = (h: number) => Math.round(h * 100) / 100;

interface EmployeeBreakdown {
  name: string;
  hours: number;
}

interface HourlyActivity {
  hour: string;
  cumulativeHours: number;
  employees: string[];
}

const CHART_COLORS = [
  "hsl(45, 60%, 53%)", // gold
  "hsl(142, 71%, 45%)", // green
  "hsl(217, 91%, 60%)", // blue
  "hsl(0, 84%, 60%)", // red
  "hsl(280, 67%, 55%)", // purple
  "hsl(30, 90%, 55%)", // orange
];

export default function DashboardPage() {
  const { business } = useBusiness();
  const { isSuperAdminOf } = useAuth();
  const navigate = useNavigate();
  const { businessCode } = useParams();
  const [stats, setStats] = useState({ totalEmployees: 0, activeToday: 0, totalHoursToday: "0.00", avgShift: "0.00" });
  const [weeklyData, setWeeklyData] = useState<DailyHours[]>([]);
  const [employeeBreakdown, setEmployeeBreakdown] = useState<EmployeeBreakdown[]>([]);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    if (!business) return;
    fetchAll();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_events" }, () => {
        fetchAll();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "timesheet_approvals" }, () => {
        fetchAll();
      })
      .subscribe();

    const interval = setInterval(fetchAll, 10000);

    return () => {
      clearInterval(interval);
      supabase.removeChannel(channel);
    };
  }, [business]);

  // Match timesheet calculation: earliest clock_in, latest clock_out, summed breaks
  const calcHoursFromEvents = (events: any[], allowOpen = false) => {
    let earliestClockIn: Date | null = null;
    let latestClockOut: Date | null = null;
    let breakMinutes = 0;
    let breakStart: Date | null = null;

    for (const ev of events) {
      const t = new Date(ev.timestamp);
      switch (ev.event_type) {
        case "clock_in":
          if (!earliestClockIn || t < earliestClockIn) earliestClockIn = t;
          break;
        case "clock_out":
          if (!latestClockOut || t > latestClockOut) latestClockOut = t;
          break;
        case "break_start":
          breakStart = t;
          break;
        case "break_end":
          if (breakStart) {
            breakMinutes += (t.getTime() - breakStart.getTime()) / 60000;
            breakStart = null;
          }
          break;
      }
    }

    if (!earliestClockIn) return 0;

    let totalHours: number;
    if (latestClockOut) {
      totalHours = (latestClockOut.getTime() - earliestClockIn.getTime()) / 3600000;
    } else if (allowOpen) {
      // Open shift: count up to now (minus any active break)
      const endTime = breakStart ? breakStart.getTime() : Date.now();
      totalHours = (endTime - earliestClockIn.getTime()) / 3600000;
    } else {
      return 0;
    }

    const netHours = totalHours - breakMinutes / 60;
    return Math.max(0, netHours);
  };

  const getCurrentlyClockedIn = async () => {
    if (!business) return 0;
    const todayISO = ausStartOfToday();
    const tomorrowISO = ausStartOfTomorrow();
    // Get employee IDs for this business
    const { data: empData } = await supabase.from("employees").select("id").eq("business_id", business.id).eq("active", true);
    const empIds = (empData || []).map(e => e.id);
    if (empIds.length === 0) return 0;

    // Use timestamp (actual event time) not created_at to match live status logic
    const { data: events } = await supabase
      .from("clock_events")
      .select("employee_id, event_type")
      .in("employee_id", empIds)
      .gte("timestamp", todayISO)
      .lt("timestamp", tomorrowISO)
      .order("timestamp", { ascending: false });

    if (!events) return 0;

    const seen = new Map<string, string>();
    for (const ev of events) {
      if (!seen.has(ev.employee_id)) {
        seen.set(ev.employee_id, ev.event_type);
      }
    }
    let count = 0;
    for (const type of seen.values()) {
      if (type === "clock_in" || type === "break_start" || type === "break_end") count++;
    }
    return count;
  };

  const fetchAll = async () => {
    const todayISO = ausStartOfToday();
    const tomorrowISO = ausStartOfTomorrow();

    // Week start (Monday) — compute from Aus today
    const now = new Date();
    const dayOfWeek = now.getDay();
    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
    const weekStartDate = new Date(now);
    weekStartDate.setDate(now.getDate() + mondayOffset);
    const weekStartISO = ausStartOfToday(); // We'll use date-key based approach instead

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    const weekAgoKey = toLocalDateKey(weekAgo);
    const weekAgoISO = ausStartOfDay(toAusDate(weekAgo));

    // For this-week events, compute Monday's ISO
    const mondayDate = new Date(now);
    mondayDate.setDate(now.getDate() + mondayOffset);
    mondayDate.setHours(0, 0, 0, 0);
    const sundayDate = new Date(mondayDate);
    sundayDate.setDate(mondayDate.getDate() + 7);
    const mondayISO = ausStartOfDay(toAusDate(mondayDate));
    const sundayISO = ausStartOfDay(toAusDate(sundayDate));

    const [empRes, todayEventsRes, weekEventsRes, thisWeekEventsRes, recentRes] = await Promise.all([
      supabase.from("employees").select("id, name", { count: "exact" }).eq("active", true).eq("business_id", business!.id),
      supabase.from("clock_events").select("*").gte("timestamp", todayISO).lt("timestamp", tomorrowISO).order("timestamp"),
      supabase.from("clock_events").select("*, employees!inner(name, business_id)").eq("employees.business_id", business!.id).gte("timestamp", weekAgoISO).order("timestamp"),
      supabase.from("clock_events").select("*, employees!inner(name, business_id)").eq("employees.business_id", business!.id).gte("timestamp", mondayISO).lt("timestamp", sundayISO).order("timestamp"),
      supabase.from("clock_events").select("*, employees!inner(name, business_id)").eq("employees.business_id", business!.id).order("created_at", { ascending: false }).limit(10),
    ]);

    const totalEmployees = empRes.count || 0;
    const todayEvents = todayEventsRes.data || [];
    const weekEvents = weekEventsRes.data || [];
    const thisWeekEvents = thisWeekEventsRes.data || [];
    const employees = empRes.data || [];
    const empNameMap = new Map(employees.map((e) => [e.id, e.name]));

    // Today stats for todayByEmp (used by hourly chart)
    const todayByEmp = new Map<string, any[]>();
    for (const ev of todayEvents) {
      if (!todayByEmp.has(ev.employee_id)) todayByEmp.set(ev.employee_id, []);
      todayByEmp.get(ev.employee_id)!.push(ev);
    }

    // This week stats: use shared timesheet computation on this-week events, filtered by approved
    const todayKey = toLocalDateKey(new Date());

    // Fetch approved timesheets for this week
    const mondayStr = toAusDate(mondayDate);
    const sundayStr = toAusDate(sundayDate);
    const { data: approvedTimesheets } = await supabase
      .from("timesheet_approvals")
      .select("employee_id, date")
      .eq("approved", true)
      .gte("date", mondayStr)
      .lt("date", sundayStr);

    const approvedSet = new Set(
      (approvedTimesheets || []).map((a) => `${a.employee_id}-${a.date}`)
    );

    // Compute timesheet entries from this week's events using shared utility
    const thisWeekTimesheets = computeTimesheetEntries(thisWeekEvents);
    const approvedThisWeek = filterApprovedEntries(thisWeekTimesheets, approvedSet);

    let totalHoursWeek = 0;
    let shiftCount = 0;
    for (const entry of approvedThisWeek) {
      totalHoursWeek += entry.net_hours;
      shiftCount++;
    }

    const activeToday = await getCurrentlyClockedIn();

    setStats({
      totalEmployees,
      activeToday,
      totalHoursToday: totalHoursWeek.toFixed(2),
      avgShift: shiftCount > 0 ? (totalHoursWeek / shiftCount).toFixed(2) : "0.00",
    });

    // Weekly daily hours - use approved timesheet data from shared utility
    // Fetch approvals for the last 7 days
    const weekAgoStr = toAusDate(weekAgo);
    const todayStr = toAusDate(new Date());
    const { data: weekApprovals } = await supabase
      .from("timesheet_approvals")
      .select("employee_id, date")
      .eq("approved", true)
      .gte("date", weekAgoStr)
      .lte("date", todayStr);

    const weekApprovedSet = new Set(
      (weekApprovals || []).map((a) => `${a.employee_id}-${a.date}`)
    );

    const weekTimesheets = computeTimesheetEntries(weekEvents);
    const approvedWeekEntries = filterApprovedEntries(weekTimesheets, weekApprovedSet);

    // Group approved entries by date
    const dailyApprovedMap = new Map<string, { hours: number; employees: Set<string> }>();
    for (const entry of approvedWeekEntries) {
      if (!dailyApprovedMap.has(entry.date)) {
        dailyApprovedMap.set(entry.date, { hours: 0, employees: new Set() });
      }
      const day = dailyApprovedMap.get(entry.date)!;
      day.hours += entry.net_hours;
      day.employees.add(entry.employee_id);
    }

    const weekly: DailyHours[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toLocalDateKey(d);
      const label = toAusFormatted(d, { weekday: "short", day: "numeric", month: "short" });
      const dayData = dailyApprovedMap.get(key);
      weekly.push({
        date: label,
        key,
        hours: roundHours(dayData?.hours || 0),
        employees: dayData?.employees.size || 0,
      });
    }
    setWeeklyData(weekly);

    // Employee breakdown (this week) - only from approved timesheets using shared utility
    const breakdown: EmployeeBreakdown[] = [];
    const empHoursMap = new Map<string, number>();
    for (const entry of approvedThisWeek) {
      const current = empHoursMap.get(entry.employee_id) || 0;
      empHoursMap.set(entry.employee_id, current + entry.net_hours);
    }
    for (const [empId, hours] of empHoursMap) {
      if (hours > 0) {
        breakdown.push({ name: empNameMap.get(empId) || "Unknown", hours: roundHours(hours) });
      }
    }
    breakdown.sort((a, b) => b.hours - a.hours);
    setEmployeeBreakdown(breakdown);

    // Hourly cumulative hours (today) with employee names
    const hourlyData: HourlyActivity[] = [];
    let cumulative = 0;
    for (let h = 5; h <= 23; h++) {
      const hourEnd = new Date();
      hourEnd.setHours(h + 1, 0, 0, 0);
      const cutoff = Math.min(hourEnd.getTime(), Date.now());
      
      // Calculate total hours worked up to this hour
      let totalHoursUpTo = 0;
      const activeEmps: Set<string> = new Set();
      
      for (const [empId, evs] of todayByEmp) {
        // Match timesheet: earliest clock_in, latest clock_out up to cutoff
        let earliestIn: Date | null = null;
        let latestOut: Date | null = null;
        let breakMin = 0;
        let brkStart: Date | null = null;

        for (const ev of evs) {
          const t = new Date(ev.timestamp);
          if (t.getTime() > cutoff) continue;
          switch (ev.event_type) {
            case "clock_in":
              if (!earliestIn || t < earliestIn) earliestIn = t;
              break;
            case "clock_out":
              if (!latestOut || t > latestOut) latestOut = t;
              break;
            case "break_start": brkStart = t; break;
            case "break_end":
              if (brkStart) { breakMin += (t.getTime() - brkStart.getTime()) / 60000; brkStart = null; }
              break;
          }
        }

        let empHours = 0;
        if (earliestIn) {
          const endTime = latestOut ? latestOut.getTime() : (brkStart ? Math.min(brkStart.getTime(), cutoff) : cutoff);
          empHours = Math.max(0, (endTime - earliestIn.getTime()) / 3600000 - breakMin / 60);
        }
        if (empHours > 0) {
          totalHoursUpTo += empHours;
          const empName = empNameMap.get(empId) || "Unknown";
          activeEmps.add(empName);
        }
      }
      
      // Only show hours up to current time
      if (hourEnd.getTime() <= Date.now() || h <= ausCurrentHour()) {
        hourlyData.push({
          hour: `${h.toString().padStart(2, "0")}:00`,
          cumulativeHours: roundHours(totalHoursUpTo),
          employees: Array.from(activeEmps),
        });
      }
    }
    setHourlyActivity(hourlyData);

    // Recent events
    setRecentEvents(
      (recentRes.data || []).map((ev) => ({
        name: (ev.employees as any)?.name || "Unknown",
        type: ev.event_type,
        time: toAusTime12(new Date(ev.created_at)),
        date: toAusDisplayDate(new Date(ev.created_at)),
      }))
    );
  };

  const cards = [
    { title: "Active Employees", value: stats.totalEmployees, icon: Users, color: "text-primary" },
    { title: "Clocked In Now", value: stats.activeToday, icon: Clock, color: "text-success" },
    { title: "Hours This Week", value: stats.totalHoursToday, icon: TrendingUp, color: "text-warning" },
    { title: "Avg Shift (hrs)", value: stats.avgShift, icon: Activity, color: "text-primary" },
  ];

  const eventTypeLabels: Record<string, string> = {
    clock_in: "Clock In",
    clock_out: "Clock Out",
    break_start: "Break Start",
    break_end: "Break End",
  };

  const eventTypeColors: Record<string, string> = {
    clock_in: "text-success",
    clock_out: "text-destructive",
    break_start: "text-warning",
    break_end: "text-primary",
  };

  return (
    <div className="space-y-3 md:space-y-5">
      {/* AI Assistant CTA — Super Admin only */}
      {business && isSuperAdminOf(business.id) && (
        <Card className="border-primary/20 bg-gradient-to-r from-primary/5 to-transparent cursor-pointer hover:border-primary/40 transition-colors" onClick={() => navigate(`/b/${businessCode}/admin/ai-assistant`)}>
          <CardContent className="flex items-center gap-3 py-3 px-4">
            <div className="h-10 w-10 rounded-xl bg-primary/10 flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-foreground">AI Assistant</p>
              <p className="text-xs text-muted-foreground truncate">Ask anything about your business data</p>
            </div>
            <Button size="sm" variant="outline" className="flex-shrink-0 text-xs border-primary/30 text-primary hover:bg-primary/10">
              Open
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Stats Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 stagger-children">
        {cards.map(({ title, value, icon: Icon, color }, index) => (
          <Card key={title} className="border-border/30 stat-card group">
            <CardHeader className="flex flex-row items-center justify-between pb-1 px-3 pt-3 sm:px-4 sm:pt-4">
              <CardTitle className="text-[10px] sm:text-[11px] font-medium text-muted-foreground/80 uppercase tracking-wider leading-tight">{title}</CardTitle>
              <div className="h-8 w-8 rounded-lg bg-secondary/60 flex items-center justify-center group-hover:scale-110 group-hover:bg-primary/10 transition-all duration-300">
                <Icon className={`h-3.5 w-3.5 ${color} transition-colors duration-300`} />
              </div>
            </CardHeader>
            <CardContent className="px-3 pb-3 sm:px-4 sm:pb-4">
              <p className="text-xl sm:text-2xl lg:text-3xl font-bold tracking-tight tabular-smooth">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Hours + Employee Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-4">
        <Card className="border-border/30">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Weekly Hours</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px]">
              <BarChart data={weeklyData} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={0} angle={-30} textAnchor="end" height={45} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={35} />
                <Tooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload?.length) return null;
                    return (
                      <div style={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                        <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 13, fontWeight: 500, marginBottom: 2 }}>{label}</p>
                        {payload.map((p: any, i: number) => (
                          <p key={i} style={{ color: "hsl(var(--popover-foreground))", fontSize: 12 }}>{p.name}: {p.value}</p>
                        ))}
                      </div>
                    );
                  }}
                />
                <Bar dataKey="hours" name="Hours" fill="hsl(45, 60%, 53%)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Employee Hours (This Week)</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            {employeeBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={260} className="sm:!h-[280px]">
                <PieChart>
                  <Pie
                    data={employeeBreakdown}
                    dataKey="hours"
                    nameKey="name"
                    cx="50%"
                    cy="45%"
                    innerRadius={45}
                    outerRadius={85}
                    paddingAngle={3}
                    label={false}
                    labelLine={false}
                    stroke="hsl(var(--background))"
                    strokeWidth={2}
                  >
                    {employeeBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    content={({ active, payload }) => {
                      if (!active || !payload?.length) return null;
                      const d = payload[0];
                      return (
                        <div style={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                          <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 13, fontWeight: 500 }}>{d.name}</p>
                          <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 12 }}>{d.value}h</p>
                        </div>
                      );
                    }}
                  />
                  <Legend
                    layout="horizontal"
                    align="center"
                    verticalAlign="bottom"
                    iconType="circle"
                    iconSize={8}
                    formatter={(value: string) => {
                      const item = employeeBreakdown.find(e => e.name === value);
                      return <span style={{ color: "hsl(var(--foreground))", fontSize: 11 }}>{value} <span style={{ color: "hsl(var(--muted-foreground))" }}>({item?.hours ?? 0}h)</span></span>;
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-16">No data this week</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly Activity + Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-2.5 md:gap-4">
        <Card className="border-border/30">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Today's Cumulative Hours</CardTitle>
          </CardHeader>
          <CardContent className="px-2 sm:px-6">
            <ResponsiveContainer width="100%" height={200} className="sm:!h-[250px]">
              <AreaChart data={hourlyActivity} margin={{ left: -10, right: 4, top: 4, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" strokeOpacity={0.5} />
                <XAxis dataKey="hour" tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} interval={2} />
                <YAxis tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }} width={35} />
                <Tooltip
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as HourlyActivity;
                    return (
                      <div style={{ backgroundColor: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 10, padding: "10px 14px", boxShadow: "0 8px 24px rgba(0,0,0,0.3)" }}>
                        <p style={{ color: "hsl(var(--popover-foreground))", fontSize: 13, fontWeight: 500 }}>{data.hour}</p>
                        <p style={{ color: "hsl(45, 60%, 53%)", fontSize: 12 }}>{data.cumulativeHours} hrs</p>
                        {data.employees.length > 0 && (
                          <p style={{ color: "hsl(var(--muted-foreground))", fontSize: 11, marginTop: 4 }}>{data.employees.join(", ")}</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="cumulativeHours" name="Hours" stroke="hsl(45, 60%, 53%)" fill="hsl(45, 60%, 53%)" fillOpacity={0.15} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-border/30">
          <CardHeader className="pb-2 md:pb-4">
            <CardTitle className="text-xs md:text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length > 0 ? (
              <div className="space-y-1 max-h-[250px] overflow-y-auto scrollbar-hide">
                {recentEvents.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between text-sm py-2.5 px-3 rounded-lg hover:bg-secondary/30 transition-all duration-200 table-row-interactive"
                    style={{ animationDelay: `${i * 30}ms` }}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="font-medium text-foreground truncate">{ev.name}</span>
                      <span className={`text-[11px] font-semibold shrink-0 ${eventTypeColors[ev.type] || ""}`}>
                        {eventTypeLabels[ev.type] || ev.type}
                      </span>
                    </div>
                    <div className="text-[11px] text-muted-foreground/70 shrink-0 ml-2">
                      {ev.time}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center text-muted-foreground py-16">No recent activity</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
