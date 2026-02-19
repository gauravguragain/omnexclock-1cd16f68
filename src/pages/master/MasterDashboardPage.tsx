import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Shield, TrendingUp, UserPlus, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell } from "recharts";
import { format, subMonths, startOfMonth } from "date-fns";

export default function MasterDashboardPage() {
  const [stats, setStats] = useState({ businesses: 0, users: 0, employees: 0, activeToday: 0 });
  const [businessGrowth, setBusinessGrowth] = useState<{ name: string; businesses: number; users: number }[]>([]);
  const [statusBreakdown, setStatusBreakdown] = useState<{ name: string; value: number; color: string }[]>([]);
  const [topBusinesses, setTopBusinesses] = useState<{ name: string; employees: number }[]>([]);
  const [recentBusinesses, setRecentBusinesses] = useState<{ name: string; code: string; created_at: string; status: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [bizRes, usersRes, employeesRes, clockRes] = await Promise.all([
        supabase.from("businesses").select("id, name, business_code, created_at, status").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id, created_at").order("created_at", { ascending: false }),
        supabase.from("employees").select("id, business_id, active").eq("active", true),
        supabase.from("clock_events").select("employee_id, timestamp").gte("timestamp", new Date().toISOString().split("T")[0]),
      ]);

      const businesses = bizRes.data || [];
      const profiles = usersRes.data || [];
      const employees = employeesRes.data || [];
      const todayClocks = clockRes.data || [];

      const uniqueActiveToday = new Set(todayClocks.map(c => c.employee_id)).size;

      setStats({
        businesses: businesses.length,
        users: profiles.length,
        employees: employees.length,
        activeToday: uniqueActiveToday,
      });

      setRecentBusinesses(businesses.slice(0, 5).map(b => ({
        name: b.name,
        code: b.business_code,
        created_at: b.created_at || "",
        status: b.status || "active",
      })));

      // Status breakdown
      const statusMap = { active: 0, suspended: 0, deactivated: 0 };
      businesses.forEach(b => {
        const s = (b.status || "active") as keyof typeof statusMap;
        if (s in statusMap) statusMap[s]++;
      });
      setStatusBreakdown([
        { name: "Active", value: statusMap.active, color: "hsl(142, 71%, 45%)" },
        { name: "Suspended", value: statusMap.suspended, color: "hsl(48, 96%, 53%)" },
        { name: "Deactivated", value: statusMap.deactivated, color: "hsl(0, 84%, 60%)" },
      ].filter(s => s.value > 0));

      // Monthly growth (last 6 months)
      const months: { name: string; businesses: number; users: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = format(d, "MMM yy");
        const bizCount = businesses.filter(b => {
          if (!b.created_at) return false;
          const bd = new Date(b.created_at);
          return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
        }).length;
        const userCount = profiles.filter(p => {
          if (!p.created_at) return false;
          const pd = new Date(p.created_at);
          return pd.getMonth() === d.getMonth() && pd.getFullYear() === d.getFullYear();
        }).length;
        months.push({ name: label, businesses: bizCount, users: userCount });
      }
      setBusinessGrowth(months);

      // Top businesses by employee count
      const bizEmployeeCount = new Map<string, number>();
      employees.forEach(e => {
        if (e.business_id) bizEmployeeCount.set(e.business_id, (bizEmployeeCount.get(e.business_id) || 0) + 1);
      });
      const bizNameMap = new Map(businesses.map(b => [b.id, b.name]));
      const sorted = [...bizEmployeeCount.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([id, count]) => ({ name: bizNameMap.get(id) || "Unknown", employees: count }));
      setTopBusinesses(sorted);

      setLoading(false);
    };
    load();
  }, []);

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

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Businesses", value: stats.businesses, icon: Building2, color: "text-primary" },
          { label: "Users", value: stats.users, icon: Users, color: "text-blue-400" },
          { label: "Employees", value: stats.employees, icon: UserPlus, color: "text-green-400" },
          { label: "Active Today", value: stats.activeToday, icon: Clock, color: "text-yellow-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-card border-border">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
              <Icon className={`h-4 w-4 ${color}`} />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-bold text-foreground">{value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Growth chart */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4 text-primary" />
              Growth (Last 6 Months)
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={businessGrowth}>
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
                <Bar dataKey="businesses" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} name="Businesses" />
                <Bar dataKey="users" fill="hsl(217, 91%, 60%)" radius={[4, 4, 0, 0]} name="Users" />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Status breakdown */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Business Status Breakdown</CardTitle>
          </CardHeader>
          <CardContent>
            {statusBreakdown.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data</p>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={statusBreakdown} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={70} strokeWidth={2} stroke="hsl(var(--card))">
                      {statusBreakdown.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2">
                  {statusBreakdown.map(s => (
                    <div key={s.name} className="flex items-center gap-2">
                      <div className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />
                      <span className="text-sm text-foreground">{s.name}: <strong>{s.value}</strong></span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Top businesses */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Top Businesses by Employees</CardTitle>
          </CardHeader>
          <CardContent>
            {topBusinesses.length === 0 ? (
              <p className="text-sm text-muted-foreground">No employee data yet</p>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={topBusinesses} layout="vertical">
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
                  <Bar dataKey="employees" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Recent businesses */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="text-sm font-medium text-foreground">Recently Registered</CardTitle>
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
                      <div>
                        <span className="text-sm font-medium text-foreground">{b.name}</span>
                        <span className="text-xs text-muted-foreground ml-2">{b.code}</span>
                      </div>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {b.created_at ? format(new Date(b.created_at), "MMM d, yyyy") : "—"}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
