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

      setStats({
        totalEmployees,
        activeToday: uniqueEmployees.size,
        totalHoursToday: Math.round(todayEvents.length * 1.5),
        avgShift: uniqueEmployees.size > 0 ? Math.round((todayEvents.length * 1.5) / uniqueEmployees.size * 10) / 10 : 0,
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
