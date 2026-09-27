import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  ArrowLeft, Gauge, TrendingUp, Users, ShieldCheck, Wallet,
  PartyPopper, ClipboardCheck, AlertTriangle, Clock, FileWarning, Wrench,
} from "lucide-react";

const SYDNEY = "Australia/Sydney";
const todayStr = () => new Date().toLocaleDateString("en-CA", { timeZone: SYDNEY });
const plusDays = (n: number) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: SYDNEY });
const monthStart = () => todayStr().slice(0, 7) + "-01";
const weekStart = () => {
  const d = new Date();
  const day = (d.getDay() + 6) % 7; // Monday = 0
  return new Date(d.getTime() - day * 86400000).toLocaleDateString("en-CA", { timeZone: SYDNEY });
};
const money = (n: number) => `$${n.toLocaleString("en-AU", { maximumFractionDigits: 0 })}`;

type Stat = { label: string; value: string; hint?: string; alert?: boolean };

function StatCard({ stat }: { stat: Stat }) {
  return (
    <div className={`rounded-xl border p-4 ${stat.alert ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card"}`}>
      <p className="text-xs text-muted-foreground font-medium">{stat.label}</p>
      <p className={`text-xl font-bold mt-1 ${stat.alert ? "text-destructive" : "text-foreground"}`}>{stat.value}</p>
      {stat.hint && <p className="text-[11px] text-muted-foreground mt-1">{stat.hint}</p>}
    </div>
  );
}

export default function OperationsPage() {
  const { businessCode } = useParams();
  const { user, isOwnerOf, loading: authLoading } = useAuth();
  const { business, loading: bizLoading } = useBusiness();
  const [loading, setLoading] = useState(true);
  const [sales, setSales] = useState<Stat[]>([]);
  const [workforce, setWorkforce] = useState<Stat[]>([]);
  const [compliance, setCompliance] = useState<Stat[]>([]);
  const [finance, setFinance] = useState<Stat[]>([]);

  const allowed = business ? isOwnerOf(business.id) : false;

  useEffect(() => {
    if (!business || !allowed) return;
    const bid = business.id;
    const today = todayStr();
    const in7 = plusDays(7);
    const in30 = plusDays(30);
    const mStart = monthStart();
    const wStart = weekStart();

    const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
      try { return await fn(); } catch { return fallback; }
    };
    const db: any = supabase;
    const count = async (build: () => any): Promise<number | null> =>
      safe(async () => {
        const { count, error } = await build();
        if (error) throw error;
        return count ?? 0;
      }, null);

    (async () => {
      // ---- Sales & events ----
      const leads = await safe(async () => {
        const { data, error } = await db.from("crm_leads").select("status").eq("business_id", bid);
        if (error) throw error;
        return data || [];
      }, [] as { status: string }[]);
      const activeStages = ["new", "contacted", "inspection_booked", "inspected", "deposit_received", "menu_selected", "invoice_sent", "runsheet_sent"];
      const activeLeads = leads.filter(l => activeStages.includes(l.status)).length;
      const confirmedLeads = leads.filter(l => ["deposit_received", "menu_selected", "invoice_sent", "runsheet_sent", "full_payment_received"].includes(l.status)).length;
      const upcomingEvents = await count(() => db.from("crm_bookings").select("id", { count: "exact", head: true }).eq("business_id", bid).gte("event_date", today));
      const upcomingInspections = await count(() => db.from("crm_inspections").select("id", { count: "exact", head: true }).eq("business_id", bid).gte("proposed_at", today));
      setSales([
        { label: "Active leads in pipeline", value: String(activeLeads), hint: `${leads.length} total leads` },
        { label: "Confirmed bookings (pipeline)", value: String(confirmedLeads) },
        { label: "Upcoming events", value: upcomingEvents === null ? "—" : String(upcomingEvents), hint: "From today onwards" },
        { label: "Upcoming inspections", value: upcomingInspections === null ? "—" : String(upcomingInspections) },
      ]);

      // ---- Workforce ----
      const clockedToday = await count(() => db.from("clock_events").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("event_type", "clock_in").gte("created_at", today));
      const shiftsThisWeek = await count(() => db.from("shifts").select("id", { count: "exact", head: true }).eq("business_id", bid).gte("shift_date", wStart));
      const pendingTimesheets = await count(() => db.from("timesheet_approvals").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("status", "pending"));
      const pendingRequests = await count(() => db.from("employee_requests").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("status", "pending"));
      setWorkforce([
        { label: "Clock-ins today", value: clockedToday === null ? "—" : String(clockedToday) },
        { label: "Shifts rostered this week", value: shiftsThisWeek === null ? "—" : String(shiftsThisWeek), hint: `Week of ${wStart}` },
        { label: "Timesheets awaiting approval", value: pendingTimesheets === null ? "—" : String(pendingTimesheets), alert: (pendingTimesheets ?? 0) > 0 },
        { label: "Staff requests pending", value: pendingRequests === null ? "—" : String(pendingRequests), alert: (pendingRequests ?? 0) > 0 },
      ]);

      // ---- Compliance ----
      const logsToday = await count(() => db.from("fsl_entries").select("id", { count: "exact", head: true }).eq("business_id", bid).gte("created_at", today));
      const activeForms = await count(() => db.from("fsl_forms").select("id", { count: "exact", head: true }).eq("business_id", bid).eq("active", true));
      const maintenanceDue = await count(() => db.from("service_maintenance_tasks").select("id", { count: "exact", head: true }).eq("business_id", bid).lte("next_service_date", in7));
      const docsExpiring = await count(() => db.from("employee_documents").select("id", { count: "exact", head: true }).eq("business_id", bid).lte("expiry_date", in30).gte("expiry_date", today));
      setCompliance([
        { label: "Food safety logs today", value: logsToday === null ? "—" : String(logsToday), hint: `${activeForms ?? "—"} active forms` },
        { label: "Maintenance due in 7 days", value: maintenanceDue === null ? "—" : String(maintenanceDue), alert: (maintenanceDue ?? 0) > 0 },
        { label: "Staff documents expiring (30d)", value: docsExpiring === null ? "—" : String(docsExpiring), alert: (docsExpiring ?? 0) > 0 },
      ]);

      // ---- Finance ----
      const outstanding = await safe(async () => {
        const { data, error } = await db.from("invoices").select("total").eq("business_id", bid).neq("status", "paid");
        if (error) throw error;
        return (data || []).reduce((s, r: any) => s + (Number(r.total) || 0), 0);
      }, null as number | null);
      const paidThisMonth = await safe(async () => {
        const { data, error } = await db.from("invoices").select("total").eq("business_id", bid).eq("status", "paid").gte("created_at", mStart);
        if (error) throw error;
        return (data || []).reduce((s, r: any) => s + (Number(r.total) || 0), 0);
      }, null as number | null);
      const payrollThisWeek = await count(() => db.from("payroll_entries").select("id", { count: "exact", head: true }).eq("business_id", bid).gte("created_at", wStart));
      setFinance([
        { label: "Outstanding invoices", value: outstanding === null ? "—" : money(outstanding), alert: (outstanding ?? 0) > 0 },
        { label: "Invoiced paid this month", value: paidThisMonth === null ? "—" : money(paidThisMonth), hint: `Since ${mStart}` },
        { label: "Payroll entries this week", value: payrollThisWeek === null ? "—" : String(payrollThisWeek) },
      ]);

      setLoading(false);
    })();
  }, [business?.id, allowed]);

  if (authLoading || bizLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="h-10 w-10 rounded-xl skeleton-shimmer" /></div>;
  }
  if (!user) return <Navigate to="/auth" replace />;
  if (!business) return <Navigate to="/hub" replace />;
  if (!allowed) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">Owners only</h1>
          <p className="text-muted-foreground">The Operations overview is restricted to business owners.</p>
          <Link to="/hub"><Button variant="outline">Back to home</Button></Link>
        </div>
      </div>
    );
  }

  const sections: { title: string; icon: React.ReactNode; stats: Stat[] }[] = [
    { title: "Sales & Events", icon: <PartyPopper className="h-4 w-4 text-primary" />, stats: sales },
    { title: "Workforce", icon: <Users className="h-4 w-4 text-primary" />, stats: workforce },
    { title: "Compliance & Risk", icon: <ShieldCheck className="h-4 w-4 text-primary" />, stats: compliance },
    { title: "Finance", icon: <Wallet className="h-4 w-4 text-primary" />, stats: finance },
  ];

  return (
    <div className="min-h-[100dvh] bg-background standalone-top-pad safe-x">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link to="/hub">
            <Button variant="ghost" size="icon" aria-label="Back to home"><ArrowLeft className="h-5 w-5" /></Button>
          </Link>
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center">
              <Gauge className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Operations</h1>
              <p className="text-xs text-muted-foreground">{business.name} · owner overview · {todayStr()}</p>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl skeleton-shimmer" />)}
          </div>
        ) : (
          sections.map(s => (
            <Card key={s.title} className="border-border/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">{s.icon}{s.title}</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {s.stats.map(st => <StatCard key={st.label} stat={st} />)}
              </CardContent>
            </Card>
          ))
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          Read-only overview. Red cards need attention. Data refreshes each time you open this page.
        </p>
      </div>
    </div>
  );
}
