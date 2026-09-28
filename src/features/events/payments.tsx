import { useLiveSync } from "@/hooks/useLiveSync";
import { useCallback, useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Plus, Trash2, Wallet } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export type CrmPayment = { id: string; business_id: string; booking_id: string; amount: number; paid_on: string; payment_type: string; method: string; reference: string | null; notes: string | null; created_at: string };

export const PAYMENT_TYPES: Record<string, string> = { deposit: "Deposit", instalment: "Instalment", balance: "Final balance", extra: "Extras", refund: "Refund" };
export const PAYMENT_METHODS: Record<string, string> = { bank_transfer: "Bank transfer", card: "Card (EFTPOS)", cash: "Cash", cheque: "Cheque", other: "Other" };

export const money = (n: number) => new Intl.NumberFormat("en-AU", { style: "currency", currency: "AUD" }).format(Number(n) || 0);
export const sydneyToday = () => new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });

export function paymentSummary(booking: any, payments: CrmPayment[]) {
  const total = Number(booking?.total_amount) || 0;
  const deposit = Number(booking?.deposit_amount) || 0;
  const paid = Math.round(payments.reduce((s, p) => s + Number(p.amount || 0), 0) * 100) / 100;
  const balance = total > 0 ? Math.max(0, Math.round((total - paid) * 100) / 100) : 0;
  const today = sydneyToday();
  const status = total > 0 && paid >= total ? "paid" : paid <= 0 ? "unpaid" : paid >= deposit && deposit > 0 ? "deposit" : "part";
  const overdue = (balance > 0 && !!booking?.balance_due_date && booking.balance_due_date < today) || (deposit > 0 && paid < deposit && !!booking?.deposit_due_date && booking.deposit_due_date < today);
  return { total, deposit, paid, balance, status, overdue };
}

export const STATUS_LABEL: Record<string, string> = { paid: "Paid in full", deposit: "Deposit paid", part: "Part paid", unpaid: "Unpaid" };
export function PaymentBadge({ status, overdue }: { status: string; overdue?: boolean }) {
  if (overdue) return <Badge variant="destructive">Overdue</Badge>;
  return <Badge variant={status === "paid" ? "default" : "outline"} className={status === "unpaid" ? "text-muted-foreground" : ""}>{STATUS_LABEL[status]}</Badge>;
}

export function usePayments(businessId?: string, bookingId?: string) {
  const [payments, setPayments] = useState<CrmPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!businessId) return;
    let q = (supabase as any).from("crm_payments").select("*").eq("business_id", businessId).order("paid_on", { ascending: false }).order("created_at", { ascending: false });
    if (bookingId) q = q.eq("booking_id", bookingId);
    const { data, error } = await q;
    if (error) toast.error(error.message); else setPayments(data || []);
    setLoading(false);
  }, [businessId, bookingId]);
  useEffect(() => { refresh(); }, [refresh]);
  useLiveSync(["crm_payments"], businessId, () => void refresh());
  return { payments, loading, refresh };
}

export function RecordPaymentDialog({ open, onOpenChange, booking, bookings, suggested, onSaved }: {
  open: boolean; onOpenChange: (o: boolean) => void; booking?: any; bookings?: any[]; suggested?: { type: string; amount: number }; onSaved: () => void;
}) {
  const [form, setForm] = useState({ booking_id: "", amount: "", paid_on: sydneyToday(), payment_type: "deposit", method: "bank_transfer", reference: "", notes: "" });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    if (open) setForm({ booking_id: booking?.id || "", amount: suggested && suggested.amount > 0 ? String(suggested.amount) : "", paid_on: sydneyToday(), payment_type: suggested?.type || "deposit", method: "bank_transfer", reference: "", notes: "" });
  }, [open]);
  const target = booking || bookings?.find(b => b.id === form.booking_id);
  const save = async () => {
    const amt = Number(form.amount);
    if (!target) { toast.error("Choose a booking."); return; }
    if (!amt || amt <= 0) { toast.error("Enter an amount above $0."); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("crm_payments").insert({
      business_id: target.business_id, booking_id: target.id, amount: form.payment_type === "refund" ? -amt : amt,
      paid_on: form.paid_on, payment_type: form.payment_type, method: form.method, reference: form.reference.trim() || null, notes: form.notes.trim() || null,
    });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success(form.payment_type === "refund" ? "Refund recorded" : "Payment recorded");
    onOpenChange(false); onSaved();
  };
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
    <div className="space-y-3">
      {!booking && <div><Label>Booking</Label><Select value={form.booking_id} onValueChange={v => set("booking_id", v)}><SelectTrigger><SelectValue placeholder="Choose a booking" /></SelectTrigger>
        <SelectContent>{(bookings || []).map(b => <SelectItem key={b.id} value={b.id}>{b.event_date ? format(new Date(b.event_date + "T00:00"), "d MMM yyyy") : ""} · {b.event_name || b.event_type || "Booking"}</SelectItem>)}</SelectContent></Select></div>}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Type</Label><Select value={form.payment_type} onValueChange={v => set("payment_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Amount (AUD)</Label><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} /></div>
        <div><Label>Date received</Label><Input type="date" value={form.paid_on} onChange={e => set("paid_on", e.target.value)} /></div>
        <div><Label>Method</Label><Select value={form.method} onValueChange={v => set("method", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div><Label>Reference (e.g. Xero invoice no.)</Label><Input value={form.reference} onChange={e => set("reference", e.target.value)} placeholder="INV-0001" /></div>
      <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
      {target && <p className="text-xs text-muted-foreground">Booking total {money(target.total_amount)} · deposit {money(target.deposit_amount)}</p>}
    </div>
    <DialogFooter><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button onClick={save} disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button></DialogFooter>
  </DialogContent></Dialog>;
}

/** Payment tracking card shown on an event or catering booking page. */
export function BookingPaymentsCard({ booking, onChanged }: { booking: any; onChanged?: () => void }) {
  const { payments, refresh } = usePayments(booking?.business_id, booking?.id);
  const [open, setOpen] = useState(false);
  const s = useMemo(() => paymentSummary(booking, payments), [booking, payments]);
  const [edit, setEdit] = useState(false);
  const [amounts, setAmounts] = useState({ total_amount: "", deposit_amount: "", deposit_due_date: "", balance_due_date: "" });
  if (!booking) return null;
  const suggested = s.paid < s.deposit ? { type: "deposit", amount: s.deposit - s.paid } : { type: "balance", amount: Math.max(s.balance, 0) };
  const changed = () => { refresh(); onChanged?.(); };
  const remove = async (p: CrmPayment) => {
    if (!confirm(`Delete this ${money(p.amount)} payment record?`)) return;
    const { error } = await (supabase as any).from("crm_payments").delete().eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("Payment deleted"); changed(); }
  };
  const startEdit = () => { setAmounts({ total_amount: String(booking.total_amount ?? ""), deposit_amount: String(booking.deposit_amount ?? ""), deposit_due_date: booking.deposit_due_date || "", balance_due_date: booking.balance_due_date || "" }); setEdit(true); };
  const saveAmounts = async () => {
    const { error } = await supabase.from("crm_bookings").update({ total_amount: Number(amounts.total_amount) || 0, deposit_amount: Number(amounts.deposit_amount) || 0, deposit_due_date: amounts.deposit_due_date || null, balance_due_date: amounts.balance_due_date || null }).eq("id", booking.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Amounts updated"); setEdit(false); onChanged?.();
  };
  const pct = s.total > 0 ? Math.min(100, Math.max(0, (s.paid / s.total) * 100)) : 0;
  return <Card><CardContent className="space-y-4 p-6">
    <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 border-l-2 border-primary pl-3 text-lg font-semibold"><Wallet className="h-4 w-4" />Payments</p><PaymentBadge status={s.status} overdue={s.overdue} /></div>
    {edit ? <div className="grid grid-cols-2 gap-3">
      <div><Label className="text-xs">Booking total</Label><Input type="number" step="0.01" value={amounts.total_amount} onChange={e => setAmounts(a => ({ ...a, total_amount: e.target.value }))} /></div>
      <div><Label className="text-xs">Deposit required</Label><Input type="number" step="0.01" value={amounts.deposit_amount} onChange={e => setAmounts(a => ({ ...a, deposit_amount: e.target.value }))} /></div>
      <div><Label className="text-xs">Deposit due</Label><Input type="date" value={amounts.deposit_due_date} onChange={e => setAmounts(a => ({ ...a, deposit_due_date: e.target.value }))} /></div>
      <div><Label className="text-xs">Balance due</Label><Input type="date" value={amounts.balance_due_date} onChange={e => setAmounts(a => ({ ...a, balance_due_date: e.target.value }))} /></div>
      <div className="col-span-2 flex justify-end gap-2"><Button size="sm" variant="outline" onClick={() => setEdit(false)}>Cancel</Button><Button size="sm" onClick={saveAmounts}>Save</Button></div>
    </div> : <>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total</p><p className="font-semibold">{money(s.total)}</p></div>
        <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Received</p><p className="font-semibold text-primary">{money(s.paid)}</p></div>
        <div className="rounded-md bg-muted/50 p-2"><p className="text-[10px] uppercase tracking-wider text-muted-foreground">Balance</p><p className={s.overdue ? "font-semibold text-destructive" : "font-semibold"}>{money(s.balance)}</p></div>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-all" style={{ width: `${pct}%` }} /></div>
      <div className="space-y-1 text-xs text-muted-foreground">
        <p>Deposit {money(s.deposit)}{booking.deposit_due_date ? ` · due ${format(new Date(booking.deposit_due_date + "T00:00"), "d MMM yyyy")}` : ""}</p>
        {booking.balance_due_date && <p>Balance due {format(new Date(booking.balance_due_date + "T00:00"), "d MMM yyyy")}</p>}
      </div>
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Record payment</Button><Button size="sm" variant="outline" onClick={startEdit}>Edit amounts</Button></div>
    </>}
    <div className="space-y-2">{payments.length ? payments.map(p => <div key={p.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
      <div className="min-w-0"><p className="font-medium">{money(p.amount)} <span className="font-normal text-muted-foreground">· {PAYMENT_TYPES[p.payment_type] || p.payment_type}</span></p>
        <p className="text-xs text-muted-foreground">{format(new Date(p.paid_on + "T00:00"), "d MMM yyyy")} · {PAYMENT_METHODS[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ""}</p>
        {p.notes && <p className="whitespace-pre-wrap text-xs">{p.notes}</p>}</div>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Delete payment" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>) : <p className="text-sm text-muted-foreground">No payments recorded yet. Recording the deposit moves the lead to Deposit received; full payment moves it to Full payment received.</p>}</div>
    <RecordPaymentDialog open={open} onOpenChange={setOpen} booking={booking} suggested={suggested} onSaved={changed} />
  </CardContent></Card>;
}
