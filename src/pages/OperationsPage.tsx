import { useLiveSync } from "@/hooks/useLiveSync";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, Gauge, ArrowUpRight, ArrowDownRight, AlertTriangle, FileSpreadsheet, FileText, RefreshCw } from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, PieChart, Pie, Cell, Legend, LineChart, Line,
} from "recharts";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { loadOperations, presetRange, previousRange, type OpsData, type Range, type RangePreset } from "@/lib/operationsData";
import EventsDashboard from "@/features/events/EventsDashboard";
import ReportBuilder from "@/features/operations/ReportBuilder";

const money = (n: number) => `$${(n || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const num = (n: number) => (n || 0).toLocaleString("en-AU", { maximumFractionDigits: 2 });
const fmtDate = (s: string) => new Date(s + "T12:00:00Z").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
const P = "hsl(var(--primary))";
const MUTED = "hsl(var(--muted-foreground))";
const PIE = [P, "hsl(var(--success))", "hsl(var(--warning))", "hsl(var(--destructive))", MUTED, "hsl(var(--accent-foreground))"];
const tip = { contentStyle: { background: "hsl(var(--popover))", border: "1px solid hsl(var(--border))", borderRadius: 8, color: "hsl(var(--popover-foreground))", fontSize: 12 } };

function delta(cur: number, prev: number) {
  if (!prev) return cur ? null : 0;
  return Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10;
}

function Kpi({ label, value, cur, prev, invert, alert, hint }: { label: string; value: string; cur?: number; prev?: number; invert?: boolean; alert?: boolean; hint?: string }) {
  const d = cur !== undefined && prev !== undefined ? delta(cur, prev) : undefined;
  const good = d !== undefined && d !== null && (invert ? d < 0 : d > 0);
  return (
    <div className={`rounded-xl border p-4 ${alert ? "border-destructive/40 bg-destructive/5" : "border-border/60 bg-card"}`}>
      <p className="text-xs text-muted-foreground font-medium">{label}</p>
      <p className={`text-xl font-bold mt-1 tabular-nums ${alert ? "text-destructive" : "text-foreground"}`}>{value}</p>
      {d !== undefined && (
        <p className={`text-[11px] mt-1 flex items-center gap-1 ${d === 0 || d === null ? "text-muted-foreground" : good ? "text-success" : "text-destructive"}`}>
          {d !== null && d > 0 && <ArrowUpRight className="h-3 w-3" />}
          {d !== null && d < 0 && <ArrowDownRight className="h-3 w-3" />}
          {d === null ? "New vs previous period" : `${d > 0 ? "+" : ""}${d}% vs previous`}
        </p>
      )}
      {hint && <p className="text-[11px] text-muted-foreground mt-1">{hint}</p>}
    </div>
  );
}

function Panel({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <Card className={`border-border/50 ${className}`}>
      <CardHeader className="pb-2"><CardTitle className="text-sm font-semibold">{title}</CardTitle></CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function Empty() { return <p className="text-xs text-muted-foreground py-8 text-center">No data for this period</p>; }

function DataTable({ cols, rows }: { cols: string[]; rows: (string | number)[][] }) {
  if (!rows.length) return <Empty />;
  return (
    <div className="overflow-x-auto -mx-2">
      <table className="w-full text-xs">
        <thead><tr className="border-b border-border">{cols.map(c => <th key={c} className="text-left font-medium text-muted-foreground px-2 py-2 whitespace-nowrap">{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i} className="border-b border-border/40">{r.map((v, j) => <td key={j} className="px-2 py-1.5 whitespace-nowrap tabular-nums text-foreground">{v}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export default function OperationsPage() {
  const { businessCode } = useParams();
  const { user, isOwnerOf, isMaster, isApproved, isAdminOf, isSuperAdminOf, isSalesManagerOf, loading: authLoading } = useAuth();
  const { business: ctxBusiness, loading: bizLoading } = useBusiness();
  const [urlBusiness, setUrlBusiness] = useState<{ id: string; name: string } | null>(null);
  const [urlBizLoading, setUrlBizLoading] = useState(false);
  const [preset, setPreset] = useState<RangePreset>("month");
  const [range, setRange] = useState<Range>(presetRange("month"));
  const [data, setData] = useState<OpsData | null>(null);
  const [prev, setPrev] = useState<OpsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (ctxBusiness?.business_code === businessCode || !businessCode || !user) return;
    setUrlBizLoading(true);
    (supabase as any).from("businesses").select("id, name").eq("business_code", businessCode).maybeSingle()
      .then(({ data }: any) => { setUrlBusiness(data || null); setUrlBizLoading(false); });
  }, [ctxBusiness, businessCode, user]);

  const business = ctxBusiness?.business_code === businessCode ? ctxBusiness : urlBusiness;
  const allowed = isMaster || (business ? isOwnerOf(business.id) : false);
  const canOpenSales = !!business && isApproved && (isAdminOf(business.id) || isSuperAdminOf(business.id) || isSalesManagerOf(business.id));

  useEffect(() => {
    if (!business || !allowed || range.from > range.to) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([loadOperations(business.id, range), loadOperations(business.id, previousRange(range))]).then(([a, b]) => {
      if (cancelled) return;
      setData(a); setPrev(b); setLoading(false);
    });
    return () => { cancelled = true; };
  }, [business?.id, allowed, range.from, range.to, tick]);

  useLiveSync(["crm_bookings","crm_leads","crm_payments","crm_inspections","crm_tasks","catering_deliveries","invoices","clock_events","shifts"], allowed ? business?.id : undefined, () => setTick(t => t + 1));

  const alerts = useMemo(() => {
    if (!data) return [] as { text: string; level: "high" | "med" }[];
    const a: { text: string; level: "high" | "med" }[] = [];
    const c = data.compliance, l = data.labour, s = data.sales, rv = data.revenue;
    if (c.fslOut) a.push({ text: `${c.fslOut} food safety readings out of range this period`, level: "high" });
    if (c.maintOverdue.length) a.push({ text: `${c.maintOverdue.length} maintenance items overdue`, level: "high" });
    if (c.docsExpired.length) a.push({ text: `${c.docsExpired.length} staff documents expired`, level: "high" });
    if (rv.overdueBalances.length) a.push({ text: `${rv.overdueBalances.length} bookings with balance past due date`, level: "high" });
    if (c.docsExpiring.length) a.push({ text: `${c.docsExpiring.length} staff documents expire within 30 days`, level: "med" });
    if (c.maintDue14.length) a.push({ text: `${c.maintDue14.length} maintenance items due within 14 days`, level: "med" });
    if (c.docsPending.length) a.push({ text: `${c.docsPending.length} staff documents awaiting verification`, level: "med" });
    if (l.unapprovedDays) a.push({ text: `${l.unapprovedDays} timesheet days not yet approved`, level: "med" });
    if (l.pendingRequests) a.push({ text: `${l.pendingRequests} staff leave/availability requests pending`, level: "med" });
    if (s.overdueTasks.length) a.push({ text: `${s.overdueTasks.length} sales tasks overdue`, level: "med" });
    if (c.ordersPending) a.push({ text: `${c.ordersPending} stock orders in progress`, level: "med" });
    if (l.labourPct > 35) a.push({ text: `Labour cost is ${l.labourPct}% of revenue`, level: "high" });
    if (l.lateArrivals) a.push({ text: `${l.lateArrivals} late clock-ins (5+ min after rostered start)`, level: "med" });
    return a;
  }, [data]);

  const exportExcel = () => {
    if (!data || !business) return;
    const wb = XLSX.utils.book_new();
    const add = (name: string, rows: any[]) => XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: "No data" }]), name);
    add("Summary", [
      { Metric: "Period", Value: `${data.range.from} to ${data.range.to}` },
      { Metric: "Total revenue", Value: data.revenue.total }, { Metric: "Event revenue", Value: data.revenue.events }, { Metric: "Catering revenue", Value: data.revenue.catering },
      { Metric: "Bookings", Value: data.revenue.bookings }, { Metric: "Guests", Value: data.revenue.guests },
      { Metric: "New leads", Value: data.sales.leadsCount }, { Metric: "Conversion %", Value: data.sales.conversion }, { Metric: "Pipeline value", Value: data.sales.pipelineValue },
      { Metric: "Actual hours", Value: data.labour.actualHours }, { Metric: "Rostered hours", Value: data.labour.rosteredHours },
      { Metric: "Labour cost", Value: data.labour.labourCost }, { Metric: "Contractor invoices", Value: data.labour.contractorCost }, { Metric: "Labour % of revenue", Value: data.labour.labourPct },
      { Metric: "Food safety entries", Value: data.compliance.fslEntries }, { Metric: "Out-of-range readings", Value: data.compliance.fslOut },
    ]);
    add("Trend", data.trend.map(t => ({ Period: t.period, "Event revenue": t.events, "Catering revenue": t.catering, Bookings: t.bookings, Guests: t.guests, Leads: t.leads, Hours: t.hours, "Labour cost": t.labour })));
    add("Venues", data.venue.venues.map(v => ({ Space: v.name, Events: v.events, Guests: v.guests, Revenue: v.revenue, Hours: v.hours, "Days used %": v.occupancy })));
    add("Staff", data.labour.staff.map(s => ({ Name: s.name, Department: s.department, "Actual hrs": s.actual, "Rostered hrs": s.rostered, Variance: Math.round((s.actual - s.rostered) * 100) / 100, Cost: s.cost, Shifts: s.shifts, Late: s.late })));
    add("Lead sources", data.sales.leadSources.map(x => ({ Source: x.name, Leads: x.value })));
    add("Food safety", data.compliance.fslByForm.map(f => ({ Form: f.name, Entries: f.entries, "Out of range": f.outOfRange, "Days logged": f.daysLogged, "Coverage %": f.coverage })));
    add("Attention", alerts.map(a => ({ Priority: a.level === "high" ? "High" : "Medium", Item: a.text })));
    XLSX.writeFile(wb, `Operations_${business.name}_${data.range.from}_${data.range.to}.xlsx`);
  };

  const exportPdf = () => {
    if (!data || !business) return;
    const doc = new jsPDF();
    doc.setFontSize(16); doc.text(`${business.name} — Operations report`, 14, 16);
    doc.setFontSize(10); doc.text(`${fmtDate(data.range.from)} to ${fmtDate(data.range.to)}`, 14, 23);
    const sec = (title: string, head: string[], body: (string | number)[][]) => {
      autoTable(doc, { startY: ((doc as any).lastAutoTable?.finalY || 26) + 8, head: [[title, ...head.slice(1)]], body: body.length ? body : [["No data"]], styles: { fontSize: 8 }, headStyles: { fillColor: [40, 40, 40] } });
    };
    sec("Key figures", ["Metric", "Value"], [
      ["Total revenue", money(data.revenue.total)], ["Events / catering", `${money(data.revenue.events)} / ${money(data.revenue.catering)}`],
      ["Bookings / guests", `${data.revenue.bookings} / ${data.revenue.guests}`], ["Revenue per guest", money(data.revenue.perGuest)],
      ["New leads / conversion", `${data.sales.leadsCount} / ${data.sales.conversion}%`], ["Pipeline value", money(data.sales.pipelineValue)],
      ["Actual vs rostered hours", `${num(data.labour.actualHours)} / ${num(data.labour.rosteredHours)}`], ["Labour cost (incl. contractors)", money(data.labour.labourCost + data.labour.contractorCost)],
      ["Labour % of revenue", `${data.labour.labourPct}%`], ["Food safety entries / out of range", `${data.compliance.fslEntries} / ${data.compliance.fslOut}`],
    ]);
    sec("Needs attention", ["Item", "Priority"], alerts.map(a => [a.text, a.level === "high" ? "High" : "Medium"]));
    sec("Venue spaces", ["Space", "Events", "Guests", "Revenue", "Days used %"], data.venue.venues.map(v => [v.name, v.events, v.guests, money(v.revenue), `${v.occupancy}%`]));
    sec("Staff hours", ["Name", "Dept", "Actual", "Rostered", "Cost", "Late"], data.labour.staff.map(s => [s.name, s.department, num(s.actual), num(s.rostered), money(s.cost), s.late]));
    sec("Food safety", ["Form", "Entries", "Out of range", "Coverage %"], data.compliance.fslByForm.map(f => [f.name, f.entries, f.outOfRange, `${f.coverage}%`]));
    doc.save(`Operations_${business.name}_${data.range.from}_${data.range.to}.pdf`);
  };

  if (authLoading || bizLoading || urlBizLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><div className="h-10 w-10 rounded-xl skeleton-shimmer" /></div>;
  }
  if (!user) return <Navigate to="/auth?next=operations" replace />;
  if (!business) return <Navigate to={isMaster ? "/master" : "/hub"} replace />;
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

  const d = data, p = prev;

  return (
    <div className="min-h-[100dvh] bg-background standalone-top-pad safe-x">
      <div className="max-w-7xl mx-auto px-4 py-6 space-y-5">
        {/* Header */}
        <div className="flex flex-wrap items-center gap-3 justify-between">
          <div className="flex items-center gap-3">
            <Link to={isMaster ? "/master/businesses" : "/hub"}><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="h-5 w-5" /></Button></Link>
            <div className="h-10 w-10 rounded-xl bg-primary/8 flex items-center justify-center"><Gauge className="h-5 w-5 text-primary" /></div>
            <div>
              <h1 className="text-xl font-bold text-foreground tracking-tight">Operations</h1>
              <p className="text-xs text-muted-foreground">{business.name} · {fmtDate(range.from)} – {fmtDate(range.to)}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={preset} onValueChange={(v: RangePreset) => { setPreset(v); if (v !== "custom") setRange(presetRange(v)); }}>
              <SelectTrigger className="w-[150px] h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="week">This week</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="last30">Last 30 days</SelectItem>
                <SelectItem value="quarter">This quarter</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="custom">Custom dates</SelectItem>
              </SelectContent>
            </Select>
            {preset === "custom" && (
              <>
                <Input type="date" className="h-9 w-[150px]" value={range.from} onChange={e => e.target.value && setRange(r => ({ ...r, from: e.target.value }))} />
                <Input type="date" className="h-9 w-[150px]" value={range.to} onChange={e => e.target.value && setRange(r => ({ ...r, to: e.target.value }))} />
              </>
            )}
            <Button variant="outline" size="icon" className="h-9 w-9" onClick={() => setTick(t => t + 1)} aria-label="Refresh"><RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} /></Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportExcel} disabled={!d}><FileSpreadsheet className="h-4 w-4" />Excel</Button>
            <Button variant="outline" size="sm" className="h-9 gap-1.5" onClick={exportPdf} disabled={!d}><FileText className="h-4 w-4" />PDF</Button>
          </div>
        </div>

        {!d || !p ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Array.from({ length: 8 }).map((_, i) => <div key={i} className="h-24 rounded-xl skeleton-shimmer" />)}</div>
        ) : (
          <Tabs defaultValue="overview" className="space-y-4">
            <TabsList className="flex w-full overflow-x-auto justify-start h-auto flex-nowrap">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="revenue">Revenue & sales</TabsTrigger>
              <TabsTrigger value="venue">Events & venue</TabsTrigger>
              <TabsTrigger value="labour">Staff & labour</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="attention">Attention {alerts.length ? `(${alerts.length})` : ""}</TabsTrigger>
              <TabsTrigger value="reports">Reports</TabsTrigger>
            </TabsList>

            <TabsContent value="reports">
              <ReportBuilder businessId={business.id} businessName={business.name} range={range} ops={d} />
            </TabsContent>

            {/* OVERVIEW */}
            <TabsContent value="overview" className="space-y-4">
              <section aria-label="Sales and events dashboard">
                <EventsDashboard businessId={business.id} ownerView canOpenSales={canOpenSales} />
              </section>
              <section className="space-y-4 border-t border-border pt-6" aria-label="Owner operations dashboard">
              <div>
                <h2 className="font-serif text-2xl font-semibold">Owner operations</h2>
                <p className="text-sm text-muted-foreground">Financial, workforce and compliance performance for the selected period.</p>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Total revenue" value={money(d.revenue.total)} cur={d.revenue.total} prev={p.revenue.total} />
                <Kpi label="Revenue per guest" value={money(d.revenue.perGuest)} cur={d.revenue.perGuest} prev={p.revenue.perGuest} />
                <Kpi label="Labour % of revenue" value={`${d.labour.labourPct}%`} cur={d.labour.labourPct} prev={p.labour.labourPct} invert alert={d.labour.labourPct > 35} />
                <Kpi label="Food safety issues" value={num(d.compliance.fslOut)} cur={d.compliance.fslOut} prev={p.compliance.fslOut} invert alert={d.compliance.fslOut > 0} />
              </div>
              <div className="grid lg:grid-cols-3 gap-4">
                <Panel title="Revenue trend" className="lg:col-span-2">
                  <div className="h-64"><ResponsiveContainer><AreaChart data={d.trend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} /><YAxis tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} formatter={(v: number) => money(v)} /><Legend wrapperStyle={{ fontSize: 11 }} /><Area type="monotone" dataKey="events" name="Events" stackId="1" stroke={P} fill={P} fillOpacity={0.35} /><Area type="monotone" dataKey="catering" name="Catering" stackId="1" stroke="hsl(var(--success))" fill="hsl(var(--success))" fillOpacity={0.3} /></AreaChart></ResponsiveContainer></div>
                </Panel>
                <Panel title="Needs attention">
                  {alerts.length ? <ul className="space-y-2">{alerts.slice(0, 8).map((a, i) => <li key={i} className="flex gap-2 text-xs"><AlertTriangle className={`h-3.5 w-3.5 shrink-0 mt-0.5 ${a.level === "high" ? "text-destructive" : "text-warning"}`} /><span className="text-foreground">{a.text}</span></li>)}</ul> : <p className="text-xs text-muted-foreground py-6 text-center">Nothing needs attention</p>}
                </Panel>
              </div>
              <Panel title="Labour hours vs cost">
                <div className="h-56"><ResponsiveContainer><LineChart data={d.trend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} /><YAxis yAxisId="l" tick={{ fontSize: 10, fill: MUTED }} /><YAxis yAxisId="r" orientation="right" tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Line yAxisId="l" dataKey="hours" name="Hours" stroke={P} dot={false} /><Line yAxisId="r" dataKey="labour" name="Cost $" stroke="hsl(var(--warning))" dot={false} /></LineChart></ResponsiveContainer></div>
              </Panel>
              </section>
            </TabsContent>

            {/* REVENUE */}
            <TabsContent value="revenue" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Event revenue" value={money(d.revenue.events)} cur={d.revenue.events} prev={p.revenue.events} />
                <Kpi label="Catering revenue" value={money(d.revenue.catering)} cur={d.revenue.catering} prev={p.revenue.catering} />
                <Kpi label="Average event value" value={money(d.revenue.avgPerEvent)} cur={d.revenue.avgPerEvent} prev={p.revenue.avgPerEvent} />
                <Kpi label="Deposits collected" value={money(d.revenue.depositsCollected)} cur={d.revenue.depositsCollected} prev={p.revenue.depositsCollected} />
                <Kpi label="Balance still owed (upcoming)" value={money(d.revenue.outstandingBalance)} />
                <Kpi label="Overdue balances" value={num(d.revenue.overdueBalances.length)} alert={d.revenue.overdueBalances.length > 0} />
                <Kpi label="Open pipeline value" value={money(d.sales.pipelineValue)} hint={`${d.sales.activeLeads} active leads`} />
                <Kpi label="Cancelled bookings" value={num(d.revenue.cancelled)} cur={d.revenue.cancelled} prev={p.revenue.cancelled} invert />
              </div>
              <div className="grid lg:grid-cols-3 gap-4">
                <Panel title="Leads over time" className="lg:col-span-2">
                  <div className="h-56"><ResponsiveContainer><BarChart data={d.trend}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="label" tick={{ fontSize: 10, fill: MUTED }} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} /><Bar dataKey="leads" name="New leads" fill={P} radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                </Panel>
                <Panel title="Lead outcomes">
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <div><p className="text-lg font-bold text-foreground">{d.sales.leadsCount}</p><p className="text-[11px] text-muted-foreground">New</p></div>
                    <div><p className="text-lg font-bold text-success">{d.sales.won}</p><p className="text-[11px] text-muted-foreground">Won</p></div>
                    <div><p className="text-lg font-bold text-destructive">{d.sales.lost}</p><p className="text-[11px] text-muted-foreground">Lost / cold</p></div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-4 mb-1">Why leads were lost</p>
                  <DataTable cols={["Reason", "Leads"]} rows={d.sales.lostReasons.slice(0, 6).map(x => [x.name, x.value])} />
                </Panel>
              </div>
              <div className="grid lg:grid-cols-3 gap-4">
                <Panel title="Lead sources">
                  {d.sales.leadSources.length ? <div className="h-56"><ResponsiveContainer><PieChart><Pie data={d.sales.leadSources} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80}>{d.sales.leadSources.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></div> : <Empty />}
                </Panel>
                <Panel title="Pipeline by stage (all leads)">
                  <div className="h-56"><ResponsiveContainer><BarChart data={d.sales.leadStages} layout="vertical"><XAxis type="number" allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} /><YAxis type="category" dataKey="name" width={110} tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} /><Bar dataKey="value" name="Leads" fill={P} radius={[0, 4, 4, 0]} /></BarChart></ResponsiveContainer></div>
                </Panel>
                <Panel title={`Inspections (${d.sales.inspections})`}>
                  <DataTable cols={["Status", "Count"]} rows={d.sales.inspStatus.map(x => [x.name, x.value])} />
                  <p className="text-xs text-muted-foreground mt-3">{d.sales.overdueTasks.length} overdue sales tasks</p>
                </Panel>
              </div>
              {d.revenue.overdueBalances.length > 0 && (
                <Panel title="Bookings with overdue balance">
                  <DataTable cols={["Event date", "Event", "Balance due", "Total", "Deposit paid"]} rows={d.revenue.overdueBalances.map((b: any) => [fmtDate(b.event_date), b.event_name || b.event_type || "Event", fmtDate(b.balance_due_date), money(Number(b.total_amount) || 0), b.deposit_paid ? "Yes" : "No"])} />
                </Panel>
              )}
            </TabsContent>

            {/* VENUE */}
            <TabsContent value="venue" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Events held / booked" value={num(d.revenue.eventCount)} cur={d.revenue.eventCount} prev={p.revenue.eventCount} />
                <Kpi label="Catering jobs" value={num(d.revenue.cateringCount)} cur={d.revenue.cateringCount} prev={p.revenue.cateringCount} />
                <Kpi label="Avg guests per event" value={num(d.revenue.eventCount ? d.revenue.guests / d.revenue.bookings : 0)} />
                <Kpi label="Spaces in use" value={num(d.venue.venues.length)} />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <Panel title="Busiest days of the week">
                  <div className="h-56"><ResponsiveContainer><BarChart data={d.venue.byDow}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="events" name="Events" fill={P} radius={[4, 4, 0, 0]} /><Bar dataKey="guests" name="Guests" fill="hsl(var(--success))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                </Panel>
                <Panel title="Event types">
                  {d.venue.eventTypes.length ? <div className="h-56"><ResponsiveContainer><PieChart><Pie data={d.venue.eventTypes} dataKey="value" nameKey="name" outerRadius={80}>{d.venue.eventTypes.map((_, i) => <Cell key={i} fill={PIE[i % PIE.length]} />)}</Pie><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /></PieChart></ResponsiveContainer></div> : <Empty />}
                </Panel>
              </div>
              <Panel title="Venue space performance">
                <DataTable cols={["Space", "Events", "Guests", "Revenue", "Event hours", "Days used %"]} rows={d.venue.venues.map(v => [v.name, v.events, v.guests, money(v.revenue), num(v.hours), `${v.occupancy}%`])} />
              </Panel>
              <Panel title="Upcoming 30 days">
                <DataTable cols={["Date", "Time", "Event", "Type", "Space", "Guests", "Value", "Deposit"]} rows={d.venue.upcoming.map((b: any) => [fmtDate(b.event_date), b.start_time ? b.start_time.slice(0, 5) : "—", b.event_label || b.event_name || "—", b.event_type_display || b.event_type || "—", b.venue_space || (b.booking_kind === "catering" ? "Off-site catering" : "—"), b.guest_count || "—", money(Number(b.total_amount) || 0), b.deposit_paid ? "Paid" : "Not paid"])} />
              </Panel>
            </TabsContent>

            {/* LABOUR */}
            <TabsContent value="labour" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Actual hours worked" value={num(d.labour.actualHours)} cur={d.labour.actualHours} prev={p.labour.actualHours} />
                <Kpi label="Rostered hours" value={num(d.labour.rosteredHours)} cur={d.labour.rosteredHours} prev={p.labour.rosteredHours} />
                <Kpi label="Hours over / under roster" value={`${d.labour.variance > 0 ? "+" : ""}${num(d.labour.variance)}`} alert={d.labour.variance > d.labour.rosteredHours * 0.1 && d.labour.rosteredHours > 0} />
                <Kpi label="Wage cost (clocked)" value={money(d.labour.labourCost)} cur={d.labour.labourCost} prev={p.labour.labourCost} invert />
                <Kpi label="Contractor invoices" value={money(d.labour.contractorCost)} cur={d.labour.contractorCost} prev={p.labour.contractorCost} invert />
                <Kpi label="Staff who worked" value={`${d.labour.staffCount} / ${d.labour.activeEmployees}`} hint="of active staff" />
                <Kpi label="Late clock-ins" value={num(d.labour.lateArrivals)} cur={d.labour.lateArrivals} prev={p.labour.lateArrivals} invert alert={d.labour.lateArrivals > 0} />
                <Kpi label="Timesheets awaiting approval" value={num(d.labour.unapprovedDays)} alert={d.labour.unapprovedDays > 0} hint={`${d.labour.leave} approved leave requests`} />
              </div>
              <div className="grid lg:grid-cols-2 gap-4">
                <Panel title="Hours and cost by department">
                  <div className="h-56"><ResponsiveContainer><BarChart data={d.labour.departments}><CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" /><XAxis dataKey="name" tick={{ fontSize: 10, fill: MUTED }} /><YAxis tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} /><Legend wrapperStyle={{ fontSize: 11 }} /><Bar dataKey="hours" name="Hours" fill={P} radius={[4, 4, 0, 0]} /><Bar dataKey="cost" name="Cost $" fill="hsl(var(--warning))" radius={[4, 4, 0, 0]} /></BarChart></ResponsiveContainer></div>
                </Panel>
                <Panel title="Clock-in times (Sydney)">
                  <div className="h-56"><ResponsiveContainer><BarChart data={d.labour.hourHeat.map(h => ({ ...h, label: `${h.hour % 12 || 12}${h.hour < 12 ? "am" : "pm"}` }))}><XAxis dataKey="label" tick={{ fontSize: 9, fill: MUTED }} interval={1} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: MUTED }} /><Tooltip {...tip} /><Bar dataKey="clockIns" name="Clock-ins" fill={P} radius={[3, 3, 0, 0]} /></BarChart></ResponsiveContainer></div>
                </Panel>
              </div>
              <Panel title="Staff breakdown">
                <DataTable cols={["Name", "Department", "Actual hrs", "Rostered hrs", "Variance", "Shifts", "Late", "Cost"]} rows={d.labour.staff.map(s => [s.name, s.department, num(s.actual), num(s.rostered), `${s.actual - s.rostered > 0 ? "+" : ""}${num(s.actual - s.rostered)}`, s.shifts, s.late, money(s.cost)])} />
              </Panel>
            </TabsContent>

            {/* COMPLIANCE */}
            <TabsContent value="compliance" className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <Kpi label="Food safety entries" value={num(d.compliance.fslEntries)} cur={d.compliance.fslEntries} prev={p.compliance.fslEntries} hint={`${d.compliance.activeForms} active forms`} />
                <Kpi label="Out-of-range readings" value={num(d.compliance.fslOut)} cur={d.compliance.fslOut} prev={p.compliance.fslOut} invert alert={d.compliance.fslOut > 0} />
                <Kpi label="Maintenance overdue" value={num(d.compliance.maintOverdue.length)} alert={d.compliance.maintOverdue.length > 0} hint={`${d.compliance.maintTotal} items tracked`} />
                <Kpi label="Maintenance due (14 days)" value={num(d.compliance.maintDue14.length)} />
                <Kpi label="Staff documents expired" value={num(d.compliance.docsExpired.length)} alert={d.compliance.docsExpired.length > 0} />
                <Kpi label="Documents expiring (30 days)" value={num(d.compliance.docsExpiring.length)} alert={d.compliance.docsExpiring.length > 0} />
                <Kpi label="Documents awaiting check" value={num(d.compliance.docsPending.length)} />
                <Kpi label="Stock orders in progress" value={num(d.compliance.ordersPending)} />
              </div>
              <Panel title="Food safety logs by form">
                <DataTable cols={["Form", "Entries", "Out of range", "Days logged", "Daily coverage"]} rows={d.compliance.fslByForm.map(f => [f.name, f.entries, f.outOfRange, f.daysLogged, `${f.coverage}%`])} />
              </Panel>
              <div className="grid lg:grid-cols-2 gap-4">
                <Panel title="Maintenance overdue & due soon">
                  <DataTable cols={["Item", "Next service", "Status"]} rows={[...d.compliance.maintOverdue.map((m: any) => [m.name, fmtDate(m.next_service_date), "Overdue"]), ...d.compliance.maintDue14.map((m: any) => [m.name, fmtDate(m.next_service_date), "Due soon"])]} />
                </Panel>
                <Panel title="Staff documents expired & expiring">
                  <DataTable cols={["Staff", "Document", "Expiry", "Status"]} rows={[...d.compliance.docsExpired.map((x: any) => [d.compliance.empName(x.employee_id), x.custom_label || x.category, fmtDate(x.expiry_date), "Expired"]), ...d.compliance.docsExpiring.map((x: any) => [d.compliance.empName(x.employee_id), x.custom_label || x.category, fmtDate(x.expiry_date), "Expiring"])]} />
                </Panel>
              </div>
            </TabsContent>

            {/* ATTENTION */}
            <TabsContent value="attention">
              <Panel title="Everything that needs an owner's eye">
                {alerts.length ? (
                  <ul className="divide-y divide-border/50">
                    {[...alerts].sort((a, b) => (a.level === b.level ? 0 : a.level === "high" ? -1 : 1)).map((a, i) => (
                      <li key={i} className="flex items-center gap-3 py-2.5 text-sm">
                        <span className={`text-[10px] font-semibold uppercase rounded px-1.5 py-0.5 ${a.level === "high" ? "bg-destructive/10 text-destructive" : "bg-warning/10 text-warning"}`}>{a.level === "high" ? "High" : "Medium"}</span>
                        <span className="text-foreground">{a.text}</span>
                      </li>
                    ))}
                  </ul>
                ) : <p className="text-sm text-muted-foreground py-8 text-center">All clear — nothing needs attention.</p>}
              </Panel>
            </TabsContent>
          </Tabs>
        )}

        <p className="text-[11px] text-muted-foreground text-center">
          Read-only. Arrows compare with the previous period of the same length. Hours come from staff clock-ins/outs minus breaks; wage cost uses each employee's pay rate.
        </p>
      </div>
    </div>
  );
}
