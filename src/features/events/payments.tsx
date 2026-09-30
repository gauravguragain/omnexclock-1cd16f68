import { eventLabel } from "@/lib/eventLabel";
import { prettyCrmValue } from "@/features/sales/types";
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { ChevronsUpDown } from "lucide-react";

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

/** bookingId: undefined = all business payments; null = no booking yet (none). */
export function usePayments(businessId?: string, bookingId?: string | null) {
  const [payments, setPayments] = useState<CrmPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!businessId) return;
    if (bookingId === null) { setPayments([]); setLoading(false); return; }
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [search, setSearch] = useState("");
  useEffect(() => {
    if (open) { setForm({ booking_id: booking?.id || "", amount: suggested && suggested.amount > 0 ? String(suggested.amount) : "", paid_on: sydneyToday(), payment_type: suggested?.type || "deposit", method: "bank_transfer", reference: "", notes: "" }); setSearch(""); }
  }, [open]);
  const sortedBookings = useMemo(() => sortUpcomingFirst(bookings || []), [bookings]);
  const filteredBookings = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return sortedBookings;
    return sortedBookings.filter(b => bookingLabel(b).toLowerCase().includes(q));
  }, [sortedBookings, search]);
  const target = booking || bookings?.find(b => b.id === form.booking_id);
  const [guest, setGuest] = useState<{ name: string; email: string }>({ name: "", email: "" });
  const [bizName, setBizName] = useState("");
  useEffect(() => {
    if (!open || !target) return;
    let off = false;
    (async () => {
      let name = target.client_name || "", email = "";
      if (target.customer_id) { const { data } = await (supabase as any).from("crm_customers").select("full_name,email").eq("id", target.customer_id).maybeSingle(); if (data) { name = name || data.full_name; email = data.email || ""; } }
      if (!email && target.lead_id) { const { data } = await (supabase as any).from("crm_leads").select("full_name,email").eq("id", target.lead_id).maybeSingle(); if (data) { name = name || data.full_name; email = data.email || ""; } }
      const { data: biz } = await (supabase as any).from("businesses").select("name").eq("id", target.business_id).maybeSingle();
      if (!off) { setGuest({ name, email }); setBizName(biz?.name || ""); }
    })();
    return () => { off = true; };
  }, [open, target?.id]);
  const save = async (sendConfirmation = false) => {
    const amt = Number(form.amount);
    if (!target) { toast.error("Choose a booking."); return; }
    if (!amt || amt <= 0) { toast.error("Enter an amount above $0."); return; }
    if (sendConfirmation && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(guest.email.trim())) { toast.error("Enter the guest's email address."); return; }
    setSaving(true);
    const { error } = await (supabase as any).from("crm_payments").insert({
      business_id: target.business_id, booking_id: target.id, amount: form.payment_type === "refund" ? -amt : amt,
      paid_on: form.paid_on, payment_type: form.payment_type, method: form.method, reference: form.reference.trim() || null, notes: form.notes.trim() || null,
    });
    if (error) { setSaving(false); toast.error(error.message); return; }
    if (sendConfirmation) {
      const fmt = (d?: string | null) => d ? format(new Date(d + "T00:00"), "d MMMM yyyy") : "";
      const total = Number(target.total_amount) || 0;
      const { data: pays } = await (supabase as any).from("crm_payments").select("amount").eq("booking_id", target.id);
      const paid = (pays || []).reduce((s: number, p: any) => s + Number(p.amount || 0), 0);
      const { error: e2 } = await supabase.functions.invoke("send-email", { body: {
        type: "deposit_confirmation", to: guest.email.trim(), recipientName: guest.name, businessName: bizName,
        eventTitle: eventLabel(target, guest.name), eventDate: fmt(target.event_date),
        depositAmount: money(amt), receivedDate: fmt(form.paid_on), method: PAYMENT_METHODS[form.method] || form.method,
        reference: form.reference.trim() || undefined,
        totalAmount: total > 0 ? money(total) : undefined, balanceRemaining: total > 0 ? money(Math.max(0, total - paid)) : undefined,
        balanceDueDate: fmt(target.balance_due_date) || undefined,
      } });
      setSaving(false);
      if (e2) toast.error("Payment saved, but the deposit confirmation email failed to send.");
      else toast.success(`Deposit recorded and confirmation sent to ${guest.email.trim()}`);
    } else {
      setSaving(false);
      toast.success(form.payment_type === "refund" ? "Refund recorded" : "Payment recorded");
    }
    onOpenChange(false); onSaved();
  };
  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
    <div className="space-y-3">
      {!booking && <div><Label>Booking</Label>
        <Popover open={pickerOpen} onOpenChange={o => { setPickerOpen(o); if (o) setSearch(""); }}>
          <PopoverTrigger asChild>
            <Button type="button" variant="outline" role="combobox" aria-expanded={pickerOpen} className="w-full justify-between font-normal">
              <span className="truncate">{target ? bookingLabel(target) : "Choose a booking"}</span>
              <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-[var(--radix-popover-trigger-width)] p-0" align="start">
            <Command shouldFilter={false}>
              <CommandInput placeholder="Search bookings by name, event or date…" value={search} onValueChange={setSearch} />
              <CommandList>
                {filteredBookings.length === 0 ? <CommandEmpty>No bookings match “{search}”.</CommandEmpty> :
                  <CommandGroup>
                    {filteredBookings.map(b => (
                      <CommandItem key={b.id} value={b.id} onSelect={() => { set("booking_id", b.id); setPickerOpen(false); setSearch(""); }}>
                        <span className="truncate">{bookingLabel(b)}</span>
                      </CommandItem>
                    ))}
                  </CommandGroup>}
              </CommandList>
            </Command>
          </PopoverContent>
        </Popover>
      </div>}
      <div className="grid grid-cols-2 gap-3">
        <div><Label>Type</Label><Select value={form.payment_type} onValueChange={v => set("payment_type", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_TYPES).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
        <div><Label>Amount (AUD)</Label><Input type="number" inputMode="decimal" min="0" step="0.01" value={form.amount} onChange={e => set("amount", e.target.value)} /></div>
        <div><Label>Date received</Label><Input type="date" value={form.paid_on} onChange={e => set("paid_on", e.target.value)} /></div>
        <div><Label>Method</Label><Select value={form.method} onValueChange={v => set("method", v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(PAYMENT_METHODS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent></Select></div>
      </div>
      <div><Label>Reference (e.g. Xero invoice no.)</Label><Input value={form.reference} onChange={e => set("reference", e.target.value)} placeholder="INV-0001" /></div>
      <div><Label>Notes</Label><Textarea rows={2} value={form.notes} onChange={e => set("notes", e.target.value)} /></div>
      {target && <p className="text-xs text-muted-foreground">Booking total {money(target.total_amount)} · deposit {money(target.deposit_amount)}</p>}
      {form.payment_type === "deposit" && target && <div><Label>Guest email (for deposit confirmation)</Label><Input type="email" value={guest.email} onChange={e => setGuest(g => ({ ...g, email: e.target.value }))} placeholder="guest@example.com" /></div>}
    </div>
    <DialogFooter className="gap-2"><Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
      <Button variant={form.payment_type === "deposit" ? "outline" : "default"} onClick={() => save(false)} disabled={saving}>{saving ? "Saving…" : "Save payment"}</Button>
      {form.payment_type === "deposit" && <Button onClick={() => save(true)} disabled={saving}>{saving ? "Sending…" : "Save & send confirmation"}</Button>}
    </DialogFooter>
  </DialogContent></Dialog>;
}

/** Payment tracking card shown on an event or catering booking page. */
export function BookingPaymentsCard({ booking, onChanged }: { booking: any; onChanged?: () => void }) {
  const { payments, refresh } = usePayments(booking?.business_id, booking?.id ?? null);
  const [open, setOpen] = useState(false);
  const s = useMemo(() => paymentSummary(booking, payments), [booking, payments]);
  if (!booking) return null;
  const suggested = s.paid < s.deposit ? { type: "deposit", amount: s.deposit - s.paid } : { type: "balance", amount: Math.max(s.balance, 0) };
  const changed = () => { refresh(); onChanged?.(); };
  const remove = async (p: CrmPayment) => {
    if (!confirm(`Delete this ${money(p.amount)} payment record?`)) return;
    const { error } = await (supabase as any).from("crm_payments").delete().eq("id", p.id);
    if (error) toast.error(error.message); else { toast.success("Payment deleted"); changed(); }
  };
  const pct = s.total > 0 ? Math.min(100, Math.max(0, (s.paid / s.total) * 100)) : 0;
  return <Card><CardContent className="space-y-4 p-6">
    <div className="flex items-center justify-between gap-2"><p className="flex items-center gap-2 border-l-2 border-primary pl-3 text-lg font-semibold"><Wallet className="h-4 w-4" />Payments</p><PaymentBadge status={s.status} overdue={s.overdue} /></div>
    {<>
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
      <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => setOpen(true)}><Plus className="mr-1 h-4 w-4" />Record payment</Button></div>
    </>}
    <div className="space-y-2">{payments.length ? payments.map(p => <div key={p.id} className="flex items-start justify-between gap-2 rounded-md border border-border p-2 text-sm">
      <div className="min-w-0"><p className="font-medium">{money(p.amount)} <span className="font-normal text-muted-foreground">· {PAYMENT_TYPES[p.payment_type] || p.payment_type}</span></p>
        <p className="text-xs text-muted-foreground">{format(new Date(p.paid_on + "T00:00"), "d MMM yyyy")} · {PAYMENT_METHODS[p.method] || p.method}{p.reference ? ` · ${p.reference}` : ""}</p>
        {p.notes && <p className="whitespace-pre-wrap text-xs">{p.notes}</p>}</div>
      <Button size="icon" variant="ghost" className="h-7 w-7 shrink-0" aria-label="Delete payment" onClick={() => remove(p)}><Trash2 className="h-3.5 w-3.5" /></Button>
    </div>}</div>
    <RecordPaymentDialog open={open} onOpenChange={setOpen} booking={booking} suggested={suggested} onSaved={changed} />
  </CardContent></Card>;
}

/** Upcoming events (soonest first), then past events (most recent first). */
/** "3 Oct 2026 · Client — Event name" label used by the booking picker. */
function bookingLabel(b: any) {
  return `${b?.event_date ? format(new Date(b.event_date + "T00:00"), "d MMM yyyy") : "No date"} · ${eventLabel(b)}`;
}
function sortUpcomingFirst(list: any[]) {
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
  const up = list.filter(b => b.event_date && b.event_date >= today).sort((a, b) => a.event_date.localeCompare(b.event_date));
  const past = list.filter(b => !b.event_date || b.event_date < today).sort((a, b) => (b.event_date || "").localeCompare(a.event_date || ""));
  return [...up, ...past];
}
