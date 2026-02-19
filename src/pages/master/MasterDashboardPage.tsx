import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Shield, Clock, UserCheck, Activity } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";

interface BusinessStat {
  name: string;
  employees: number;
  clockEvents: number;
}

export default function MasterDashboardPage() {
  const [stats, setStats] = useState({ businesses: 0, users: 0, employees: 0, clockEventsToday: 0, activeEmployees: 0 });
  const [businessStats, setBusinessStats] = useState<BusinessStat[]>([]);
  const [recentBusinesses, setRecentBusinesses] = useState<{ name: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);

      const [bizRes, usersRes, empRes, activeEmpRes, clockRes] = await Promise.all([
        supabase.from("businesses").select("id, name, created_at").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
        supabase.from("employees").select("id, business_id", { count: "exact" }),
        supabase.from("employees").select("id", { count: "exact", head: true }).eq("active", true),
        supabase.from("clock_events").select("id", { count: "exact", head: true }).gte("timestamp", todayStart.toISOString()),
      ]);

      const businesses = bizRes.data || [];
      const employees = empRes.data || [];

      setStats({
        businesses: businesses.length,
        users: usersRes.count || 0,
        employees: empRes.count || 0,
        activeEmployees: activeEmpRes.count || 0,
        clockEventsToday: clockRes.count || 0,
      });

      setRecentBusinesses(businesses.slice(0, 5).map(b => ({ name: b.name, created_at: b.created_at || "" })));

      // Build per-business employee counts
      const bizMap = new Map<string, { name: string; employees: number }>();
      businesses.forEach(b => bizMap.set(b.id, { name: b.name, employees: 0 }));
      employees.forEach(e => {
        if (e.business_id && bizMap.has(e.business_id)) {
          bizMap.get(e.business_id)!.employees++;
        }
      });

      setBusinessStats(
        Array.from(bizMap.values())
          .sort((a, b) => b.employees - a.employees)
          .slice(0, 10)
          .map(b => ({ ...b, clockEvents: 0 }))
      );

      setLoading(false);
    };
    load();
  }, []);

  const COLORS = ["hsl(43, 72%, 52%)", "hsl(200, 70%, 50%)", "hsl(150, 60%, 45%)", "hsl(280, 60%, 55%)", "hsl(10, 70%, 55%)"];

  const pieData = businessStats.filter(b => b.employees > 0).slice(0, 5).map(b => ({
    name: b.name.length > 15 ? b.name.slice(0, 15) + "…" : b.name,
    value: b.employees,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Shield className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Master Dashboard</h1>
        <p className="text-muted-foreground">Platform overview for OmnexClock</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
        {[
          { label: "Businesses", value: stats.businesses, icon: Building2, color: "text-primary" },
          { label: "Users", value: stats.users, icon: Users, color: "text-primary" },
          { label: "Total Employees", value: stats.employees, icon: UserCheck, color: "text-primary" },
          { label: "Active Employees", value: stats.activeEmployees, icon: Activity, color: "text-green-500" },
          { label: "Clock Events Today", value: stats.clockEventsToday, icon: Clock, color: "text-primary" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold text-foreground">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Bar chart: employees per business */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Employees per Business</CardTitle>
          </CardHeader>
          <CardContent>
            {businessStats.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={businessStats.map(b => ({ name: b.name.length > 12 ? b.name.slice(0, 12) + "…" : b.name, employees: b.employees }))}>
                  <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="employees" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie chart: employee distribution */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Employee Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={250}>
                <PieChart>
                  <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} label={({ name, value }) => `${name}: ${value}`}>
                    {pieData.map((_, i) => (
                      <Cell key={i} fill={COLORS[i % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent businesses */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">Recently Registered Businesses</CardTitle>
        </CardHeader>
        <CardContent>
          {recentBusinesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No businesses yet</p>
          ) : (
            <div className="space-y-2">
              {recentBusinesses.map((b, i) => (
                <div key={i} className="flex items-center justify-between py-2 border-b border-border last:border-0">
                  <div className="flex items-center gap-2">
                    <Building2 className="h-4 w-4 text-primary" />
                    <span className="text-sm font-medium text-foreground">{b.name}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">
                    {b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
