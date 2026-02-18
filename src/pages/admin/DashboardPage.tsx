import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, DollarSign, TrendingUp, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";
import { toAusDateKey, toAusTime12, toAusFormatted, toAusDisplayDate, ausStartOfToday, ausStartOfTomorrow, ausCurrentHour, ausStartOfDay, toAusDate } from "@/lib/dateUtils";

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
    // Get employee IDs for this business
    const { data: empData } = await supabase.from("employees").select("id").eq("business_id", business.id).eq("active", true);
    const empIds = (empData || []).map(e => e.id);
    if (empIds.length === 0) return 0;

    const { data: events } = await supabase
      .from("clock_events")
      .select("employee_id, event_type")
      .in("employee_id", empIds)
      .gte("created_at", todayISO)
      .order("created_at", { ascending: false });

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

    // This week stats: group by employee+date, calc hours per shift (matching timesheet)
    const todayKey = toLocalDateKey(new Date());
    const weekShiftMap = new Map<string, any[]>();
    for (const ev of thisWeekEvents) {
      const dateKey = toLocalDateKey(new Date(ev.timestamp));
      const key = `${ev.employee_id}-${dateKey}`;
      if (!weekShiftMap.has(key)) weekShiftMap.set(key, []);
      weekShiftMap.get(key)!.push(ev);
    }

    let totalHoursWeek = 0;
    let shiftCount = 0;
    for (const [key, evs] of weekShiftMap) {
      const dateKey = key.split("-").slice(-3).join("-"); // extract YYYY-MM-DD
      const isToday = dateKey === todayKey;
      const hours = calcHoursFromEvents(evs, isToday);
      totalHoursWeek += hours;
      shiftCount++;
    }

    const activeToday = await getCurrentlyClockedIn();

    setStats({
      totalEmployees,
      activeToday,
      totalHoursToday: totalHoursWeek.toFixed(2),
      avgShift: shiftCount > 0 ? (totalHoursWeek / shiftCount).toFixed(2) : "0.00",
    });

    // Weekly daily hours - use date key for reliable grouping
    const todayKeyWeekly = todayKey;
    const dailyMap = new Map<string, { events: Map<string, any[]> }>();
    for (const ev of weekEvents) {
      const key = toLocalDateKey(new Date(ev.timestamp));
      if (!dailyMap.has(key)) dailyMap.set(key, { events: new Map() });
      const dayData = dailyMap.get(key)!;
      if (!dayData.events.has(ev.employee_id)) dayData.events.set(ev.employee_id, []);
      dayData.events.get(ev.employee_id)!.push(ev);
    }

    const weekly: DailyHours[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      const key = toLocalDateKey(d);
      const label = toAusFormatted(d, { weekday: "short", day: "numeric", month: "short" });
      const isToday = key === todayKeyWeekly;
      const dayData = dailyMap.get(key);
      let dayHours = 0;
      let dayEmps = 0;
      if (dayData) {
        dayEmps = dayData.events.size;
        for (const evs of dayData.events.values()) {
          dayHours += calcHoursFromEvents(evs, isToday);
        }
      }
      weekly.push({ date: label, key, hours: roundHours(dayHours), employees: dayEmps });
    }
    setWeeklyData(weekly);

    // Employee breakdown (this week)
    const empWeekHours = new Map<string, number>();
    for (const ev of weekEvents) {
      if (!empWeekHours.has(ev.employee_id)) empWeekHours.set(ev.employee_id, 0);
    }
    const weekByEmp = new Map<string, any[]>();
    for (const ev of weekEvents) {
      if (!weekByEmp.has(ev.employee_id)) weekByEmp.set(ev.employee_id, []);
      weekByEmp.get(ev.employee_id)!.push(ev);
    }
    const breakdown: EmployeeBreakdown[] = [];
    for (const [empId, evs] of weekByEmp) {
      const h = calcHoursFromEvents(evs, true);
      breakdown.push({ name: empNameMap.get(empId) || (evs[0] as any).employees?.name || "Unknown", hours: roundHours(h) });
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
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map(({ title, value, icon: Icon, color }) => (
          <Card key={title}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Weekly Hours + Employee Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Weekly Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={weeklyData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                />
                <Bar dataKey="hours" name="Hours" fill="hsl(45, 60%, 53%)" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Employee Hours (This Week)</CardTitle>
          </CardHeader>
          <CardContent>
            {employeeBreakdown.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={employeeBreakdown} dataKey="hours" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, hours }) => `${name}: ${hours}h`} labelLine={false}>
                    {employeeBreakdown.map((_, i) => (
                      <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }} />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-center text-muted-foreground py-16">No data this week</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Hourly Activity + Recent Events */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Today's Cumulative Hours</CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={hourlyActivity}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="hour" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--foreground))" }}
                  content={({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const data = payload[0].payload as HourlyActivity;
                    return (
                      <div style={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, padding: "8px 12px", color: "hsl(var(--foreground))" }}>
                        <p className="font-medium text-sm">{data.hour}</p>
                        <p className="text-sm" style={{ color: "hsl(45, 60%, 53%)" }}>{data.cumulativeHours} hrs</p>
                        {data.employees.length > 0 && (
                          <p className="text-xs text-muted-foreground mt-1">{data.employees.join(", ")}</p>
                        )}
                      </div>
                    );
                  }}
                />
                <Area type="monotone" dataKey="cumulativeHours" name="Hours" stroke="hsl(45, 60%, 53%)" fill="hsl(45, 60%, 53%)" fillOpacity={0.2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium text-muted-foreground">Recent Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {recentEvents.length > 0 ? (
              <div className="space-y-3 max-h-[250px] overflow-y-auto">
                {recentEvents.map((ev, i) => (
                  <div key={i} className="flex items-center justify-between text-sm border-b border-border pb-2 last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{ev.name}</span>
                      <span className={`text-xs font-semibold ${eventTypeColors[ev.type] || ""}`}>
                        {eventTypeLabels[ev.type] || ev.type}
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {ev.time} · {ev.date}
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
