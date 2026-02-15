import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Clock, DollarSign, TrendingUp } from "lucide-react";

export default function DashboardPage() {
  const [stats, setStats] = useState({ totalEmployees: 0, activeToday: 0, totalHoursToday: 0, avgShift: 0 });

  useEffect(() => {
    const fetchStats = async () => {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [empRes, eventsRes] = await Promise.all([
        supabase.from("employees").select("id", { count: "exact" }).eq("active", true),
        supabase.from("clock_events").select("*").gte("timestamp", today.toISOString()),
      ]);

      const totalEmployees = empRes.count || 0;
      const todayEvents = eventsRes.data || [];
      const uniqueEmployees = new Set(todayEvents.map((e) => e.employee_id));

      // Calculate actual hours from clock_in/clock_out pairs per employee
      let totalHours = 0;
      const employeeHours = new Map<string, number>();

      for (const empId of uniqueEmployees) {
        const empEvents = todayEvents
          .filter((e) => e.employee_id === empId)
          .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

        let clockIn: Date | null = null;
        let breakStart: Date | null = null;
        let hours = 0;
        let breakMinutes = 0;

        for (const ev of empEvents) {
          const t = new Date(ev.timestamp);
          switch (ev.event_type) {
            case "clock_in":
              clockIn = t;
              break;
            case "clock_out":
              if (clockIn) {
                hours += (t.getTime() - clockIn.getTime()) / 3600000 - breakMinutes / 60;
                clockIn = null;
                breakMinutes = 0;
              }
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

        // If still clocked in, calculate up to now
        if (clockIn) {
          hours += (Date.now() - clockIn.getTime()) / 3600000 - breakMinutes / 60;
        }

        hours = Math.max(0, hours);
        employeeHours.set(empId, hours);
        totalHours += hours;
      }

      setStats({
        totalEmployees,
        activeToday: uniqueEmployees.size,
        totalHoursToday: Math.round(totalHours * 10) / 10,
        avgShift: uniqueEmployees.size > 0 ? Math.round((totalHours / uniqueEmployees.size) * 10) / 10 : 0,
      });
    };
    fetchStats();
  }, []);

  const cards = [
    { title: "Active Employees", value: stats.totalEmployees, icon: Users, color: "text-primary" },
    { title: "Clocked In Today", value: stats.activeToday, icon: Clock, color: "text-success" },
    { title: "Hours Today", value: stats.totalHoursToday, icon: TrendingUp, color: "text-warning" },
    { title: "Avg Shift (hrs)", value: stats.avgShift, icon: DollarSign, color: "text-primary" },
  ];

  return (
    <div className="space-y-6">
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
    </div>
  );
}
