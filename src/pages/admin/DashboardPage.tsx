import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, DollarSign, TrendingUp, Activity } from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, AreaChart, Area,
} from "recharts";

interface DailyHours {
  date: string;
  key: string;
  hours: number;
  employees: number;
}

const toLocalDateKey = (d: Date) => {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
};

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
  const [stats, setStats] = useState({ totalEmployees: 0, activeToday: 0, totalHoursToday: 0, avgShift: 0 });
  const [weeklyData, setWeeklyData] = useState<DailyHours[]>([]);
  const [employeeBreakdown, setEmployeeBreakdown] = useState<EmployeeBreakdown[]>([]);
  const [hourlyActivity, setHourlyActivity] = useState<HourlyActivity[]>([]);
  const [recentEvents, setRecentEvents] = useState<any[]>([]);

  useEffect(() => {
    fetchAll();

    const channel = supabase
      .channel("dashboard-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "clock_events" }, () => {
        fetchAll();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const calcHoursFromEvents = (events: any[], allowOpen = false) => {
    let hours = 0;
    let clockIn: Date | null = null;
    let breakStart: Date | null = null;
    let breakMinutes = 0;

    for (const ev of events) {
      const t = new Date(ev.timestamp);
      switch (ev.event_type) {
        case "clock_in":
          clockIn = t;
          breakMinutes = 0;
          breakStart = null;
          break;
        case "clock_out":
          if (clockIn) {
            hours += (t.getTime() - clockIn.getTime()) / 3600000 - breakMinutes / 60;
            clockIn = null;
            breakMinutes = 0;
          }
          break;
        case "break_start": breakStart = t; break;
        case "break_end":
          if (breakStart) {
            breakMinutes += (t.getTime() - breakStart.getTime()) / 60000;
            breakStart = null;
          }
          break;
      }
    }
    // Only count open shifts if allowOpen (i.e. for today's stats, not historical)
    if (clockIn && allowOpen) {
      const endTime = breakStart ? breakStart.getTime() : Date.now();
      hours += (endTime - clockIn.getTime()) / 3600000 - breakMinutes / 60;
    }
    return Math.max(0, hours);
  };

  const getCurrentlyClockedIn = (events: any[]) => {
    // Track last event per employee
    const lastEvent = new Map<string, string>();
    for (const ev of events) {
      lastEvent.set(ev.employee_id, ev.event_type);
    }
    let count = 0;
    for (const type of lastEvent.values()) {
      if (type === "clock_in" || type === "break_start" || type === "break_end") count++;
    }
    return count;
  };

  const fetchAll = async () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);
    weekAgo.setHours(0, 0, 0, 0);

    const [empRes, todayEventsRes, weekEventsRes, recentRes] = await Promise.all([
      supabase.from("employees").select("id, name", { count: "exact" }).eq("active", true),
      supabase.from("clock_events").select("*").gte("created_at", today.toISOString()).order("created_at"),
      supabase.from("clock_events").select("*, employees(name)").gte("created_at", weekAgo.toISOString()).order("created_at"),
      supabase.from("clock_events").select("*, employees(name)").order("created_at", { ascending: false }).limit(10),
    ]);

    const totalEmployees = empRes.count || 0;
    const todayEvents = todayEventsRes.data || [];
    const weekEvents = weekEventsRes.data || [];
    const employees = empRes.data || [];
    const empNameMap = new Map(employees.map((e) => [e.id, e.name]));

    // Today stats
    const uniqueToday = new Set(todayEvents.map((e) => e.employee_id));
    const todayByEmp = new Map<string, any[]>();
    for (const ev of todayEvents) {
      if (!todayByEmp.has(ev.employee_id)) todayByEmp.set(ev.employee_id, []);
      todayByEmp.get(ev.employee_id)!.push(ev);
    }
    let totalHoursToday = 0;
    for (const evs of todayByEmp.values()) {
      totalHoursToday += calcHoursFromEvents(evs, true); // allowOpen for today
    }

    setStats({
      totalEmployees,
      activeToday: getCurrentlyClockedIn(todayEvents),
      totalHoursToday: roundHours(totalHoursToday),
      avgShift: uniqueToday.size > 0 ? roundHours(totalHoursToday / uniqueToday.size) : 0,
    });

    // Weekly daily hours - use date key for reliable grouping
    const todayKey = toLocalDateKey(new Date());
    const dailyMap = new Map<string, { events: Map<string, any[]> }>();
    for (const ev of weekEvents) {
      const key = toLocalDateKey(new Date(ev.created_at));
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
      const label = d.toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short" });
      const isToday = key === todayKey;
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
      const hourEnd = new Date(today);
      hourEnd.setHours(h + 1, 0, 0, 0);
      const cutoff = Math.min(hourEnd.getTime(), Date.now());
      
      // Calculate total hours worked up to this hour
      let totalHoursUpTo = 0;
      const activeEmps: Set<string> = new Set();
      
      for (const [empId, evs] of todayByEmp) {
        let clockIn: Date | null = null;
        let breakStart: Date | null = null;
        let breakMin = 0;
        let empHours = 0;
        
        for (const ev of evs) {
          const t = new Date(ev.timestamp);
          if (t.getTime() > cutoff) break;
          switch (ev.event_type) {
            case "clock_in": clockIn = t; breakMin = 0; breakStart = null; break;
            case "clock_out":
              if (clockIn) {
                empHours += (t.getTime() - clockIn.getTime()) / 3600000 - breakMin / 60;
                clockIn = null; breakMin = 0;
              }
              break;
            case "break_start": breakStart = t; break;
            case "break_end":
              if (breakStart) { breakMin += (t.getTime() - breakStart.getTime()) / 60000; breakStart = null; }
              break;
          }
        }
        if (clockIn && cutoff > clockIn.getTime()) {
          const endT = breakStart ? Math.min(breakStart.getTime(), cutoff) : cutoff;
          empHours += (endT - clockIn.getTime()) / 3600000 - breakMin / 60;
        }
        empHours = Math.max(0, empHours);
        if (empHours > 0) {
          totalHoursUpTo += empHours;
          const empName = empNameMap.get(empId) || "Unknown";
          activeEmps.add(empName);
        }
      }
      
      // Only show hours up to current time
      if (hourEnd.getTime() <= Date.now() || h <= new Date().getHours()) {
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
        time: new Date(ev.created_at).toLocaleTimeString("en-AU", { hour: "2-digit", minute: "2-digit", hour12: true }),
        date: new Date(ev.created_at).toLocaleDateString("en-AU"),
      }))
    );
  };

  const cards = [
    { title: "Active Employees", value: stats.totalEmployees, icon: Users, color: "text-primary" },
    { title: "Clocked In Today", value: stats.activeToday, icon: Clock, color: "text-success" },
    { title: "Hours Today", value: stats.totalHoursToday, icon: TrendingUp, color: "text-warning" },
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
