import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, Shield, Clock } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

export default function MasterDashboardPage() {
  const [stats, setStats] = useState({ businesses: 0, users: 0 });
  const [businessGrowth, setBusinessGrowth] = useState<{ name: string; count: number }[]>([]);
  const [recentBusinesses, setRecentBusinesses] = useState<{ name: string; created_at: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      const [bizRes, usersRes] = await Promise.all([
        supabase.from("businesses").select("id, name, created_at").order("created_at", { ascending: false }),
        supabase.from("profiles").select("id", { count: "exact", head: true }),
      ]);

      const businesses = bizRes.data || [];

      setStats({
        businesses: businesses.length,
        users: usersRes.count || 0,
      });

      setRecentBusinesses(businesses.slice(0, 5).map(b => ({ name: b.name, created_at: b.created_at || "" })));

      // Monthly registration trend (last 6 months)
      const months: { name: string; count: number }[] = [];
      const now = new Date();
      for (let i = 5; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const label = d.toLocaleDateString("en-AU", { month: "short", year: "2-digit" });
        const count = businesses.filter(b => {
          if (!b.created_at) return false;
          const bd = new Date(b.created_at);
          return bd.getMonth() === d.getMonth() && bd.getFullYear() === d.getFullYear();
        }).length;
        months.push({ name: label, count });
      }
      setBusinessGrowth(months);
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

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registered Businesses</CardTitle>
            <Building2 className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.businesses}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Registered Users</CardTitle>
            <Users className="h-4 w-4 text-primary" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-foreground">{stats.users}</div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Platform Status</CardTitle>
            <Shield className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold text-green-500">Active</div>
          </CardContent>
        </Card>
      </div>

      {/* Business registration trend */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="text-sm font-medium text-foreground">Business Registrations (Last 6 Months)</CardTitle>
        </CardHeader>
        <CardContent>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={businessGrowth}>
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }} />
              <Tooltip contentStyle={{ backgroundColor: "hsl(var(--card))", border: "1px solid hsl(var(--border))", color: "hsl(var(--foreground))" }} />
              <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

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
