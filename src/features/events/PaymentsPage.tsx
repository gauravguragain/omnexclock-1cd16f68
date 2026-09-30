import { eventLabel } from "@/lib/eventLabel";
import { prettyCrmValue } from "@/features/sales/types";
import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { Plus, Search, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useCrmData } from "@/features/sales/useCrmData";
import { usePayments, paymentSummary, money, PaymentBadge, RecordPaymentDialog, PAYMENT_TYPES, PAYMENT_METHODS, sydneyToday } from "./payments";
import { cn } from "@/lib/utils";

type Filter = "outstanding" | "overdue" | "paid" | "all";

export default function PaymentsPage() {
  const crm = useCrmData(); const { businessCode } = useParams();
  const { payments, refresh } = usePayments(crm.business?.id);
  const [filter, setFilter] = useState<Filter>("outstanding");
  const [q, setQ] = useState(""); const [open, setOpen] = useState(false);
  const leadName = (id?: string) => crm.leads.find(l => l.id === id)?.full_name;

  const payable = useMemo(() => crm.bookings.filter(b => b.status !== "cancelled" && (b.booking_kind === "catering" || Number(b.deposit_amount) > 0 || payments.some(p => p.booking_id === b.id))), [crm.bookings, payments]);
  const rows = useMemo(() => payable.map(b => {
    const s = paymentSummary(b, payments.filter(p => p.booking_id === b.id));
    return { b, s, client: leadName(b.lead_id) || "" };
  }).sort((a, z) => {
    const today = sydneyToday();
    const dist = (d?: string) => Math.abs(new Date(String(d || today) + "T00:00:00").getTime() - new Date(today + "T00:00:00").getTime());
    return dist(a.b.event_date) - dist(z.b.event_date);
  }), [payable, crm.leads, payments]);

  const [, setTick] = useState(0);
  useEffect(() => { const t = setInterval(() => setTick(n => n + 1), 60000); return () => clearInterval(t); }, []);
  const month = sydneyToday().slice(0, 7);
  const monthLabel = format(new Date(month + "-01T00:00:00"), "MMMM yyyy");
  const paidDay = (v?: string) => !v ? "" : v.length > 10 ? new Date(v).toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }) : v;
  const totals = {
    outstanding: rows.reduce((s, r) => s + Math.max(r.s.balance, 0), 0),
    overdue: rows.filter(r => r.s.overdue).reduce((s, r) => s + r.s.balance, 0),
    thisMonth: payments.filter(p => paidDay(p.paid_on).startsWith(month)).reduce((s, p) => s + Number(p.amount), 0),
    awaitingDeposit: rows.filter(r => r.s.paid < r.s.deposit).length,
  };
  const counts: Record<Filter, number> = { outstanding: rows.filter(r => r.s.status !== "paid").length, overdue: rows.filter(r => r.s.overdue).length, paid: rows.filter(r => r.s.status === "paid").length, all: rows.length };
  const needle = q.trim().toLowerCase();
  const shown = rows.filter(r => filter === "all" ? true : filter === "paid" ? r.s.status === "paid" : filter === "overdue" ? r.s.overdue : r.s.status !== "paid")
    .filter(r => !needle || [r.b.event_name, r.b.event_type, r.client, r.b.event_order_number].some(v => String(v || "").toLowerCase().includes(needle)));
  const link = (b: any) => b.booking_kind === "catering" ? `/b/${businessCode}/catering/bookings/${b.id}` : `/b/${businessCode}/events/events/${b.id}`;
  const bookingLabel = (id: string) => { const b = crm.bookings.find(x => x.id === id); return b ? eventLabel(b, crm.leads.find(l => l.id === b.lead_id)?.full_name) : "Booking"; };

  if (!crm.business) return null;
  return <div className="space-y-6">
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary"><Wallet className="h-4 w-4" />Events &amp; catering</p><h1 className="font-serif text-3xl font-semibold">Payments</h1><p className="text-sm text-muted-foreground">Track deposits and balances received. Invoices stay in Xero — record payments here.</p></div>
      <Button onClick={() => setOpen(true)}><Plus className="mr-2 h-4 w-4" />Record payment</Button>
    </div>

    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {[["Outstanding", money(totals.outstanding)], ["Overdue", money(totals.overdue)], ["Received this month", money(totals.thisMonth)], ["Awaiting deposit", String(totals.awaitingDeposit)]].map(([k, v], i) =>
        <Card key={k}><CardContent className="p-4"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">{k}</p><p className={cn("mt-1 text-xl font-semibold", i === 1 && totals.overdue > 0 && "text-destructive")}>{v}</p></CardContent></Card>)}
    </div>

    <Card><CardContent className="space-y-4 p-4 sm:p-6">
      <div className="flex flex-wrap items-center gap-2">
        {(["outstanding", "overdue", "paid", "all"] as Filter[]).map(f => <Button key={f} size="sm" variant={filter === f ? "default" : "outline"} onClick={() => setFilter(f)} className="capitalize">{f} <span className="ml-1 opacity-70">{counts[f]}</span></Button>)}
        <div className="relative ml-auto w-full sm:w-64"><Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="pl-8" placeholder="Search client or event" value={q} onChange={e => setQ(e.target.value)} /></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-sm">
        <thead><tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground"><th className="py-2 pr-3">Date</th><th className="pr-3">Booking</th><th className="pr-3">Client</th><th className="pr-3 text-right">Total</th><th className="pr-3 text-right">Received</th><th className="pr-3 text-right">Balance</th><th>Status</th></tr></thead>
        <tbody>{shown.length ? shown.map(({ b, s, client }) => <tr key={b.id} className="border-b border-border/60 last:border-0 hover:bg-muted/40">
          <td className="py-2 pr-3 whitespace-nowrap">{b.event_date ? format(new Date(b.event_date + "T00:00"), "d MMM yyyy") : "—"}</td>
          <td className="pr-3"><Link to={link(b)} className="font-medium hover:text-primary">{eventLabel(b, client)}</Link><span className="ml-1 text-xs text-muted-foreground">{b.booking_kind === "catering" ? "Catering" : "Event"}</span></td>
          <td className="pr-3">{client || "—"}</td>
          <td className="pr-3 text-right">{money(s.total)}</td><td className="pr-3 text-right">{money(s.paid)}</td>
          <td className={cn("pr-3 text-right font-medium", s.overdue && "text-destructive")}>{money(s.balance)}</td>
          <td><PaymentBadge status={s.status} overdue={s.overdue} /></td>
        </tr>) : <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">No bookings here.</td></tr>}</tbody>
      </table></div>
    </CardContent></Card>

    <Card><CardContent className="space-y-3 p-4 sm:p-6"><p className="text-lg font-semibold">Recent payments</p>
      {payments.length ? <div className="divide-y divide-border">{[...payments].sort((a: any, b: any) => String(b.created_at || "").localeCompare(String(a.created_at || ""))).slice(0, 25).map(p => { const b = crm.bookings.find(x => x.id === p.booking_id); return <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
        <div><p className="font-medium">{money(p.amount)} · {PAYMENT_TYPES[p.payment_type] || p.payment_type}</p><p className="text-xs text-muted-foreground">{format(new Date(p.paid_on + "T00:00"), "d MMM yyyy")} · {PAYMENT_METHODS[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ""}</p></div>
        {b ? <Link to={link(b)} className="text-xs text-primary hover:underline">{bookingLabel(p.booking_id)}</Link> : <span className="text-xs text-muted-foreground">{bookingLabel(p.booking_id)}</span>}
      </div>; })}</div> : <p className="text-sm text-muted-foreground">No payments recorded yet.</p>}
    </CardContent></Card>

    <RecordPaymentDialog open={open} onOpenChange={setOpen} bookings={payable.map(b => ({ ...b, client_name: crm.leads.find(l => l.id === b.lead_id)?.full_name }))} onSaved={() => { refresh(); crm.refresh(); }} />
  </div>;
}
