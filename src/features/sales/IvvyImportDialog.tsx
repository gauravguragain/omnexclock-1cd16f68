import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { readClientList, type ClientRow } from "./clientListImport";

type Row = Record<string, string>;
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function parseCsv(text: string): Row[] {
  text = text.replace(/^﻿/, "");
  const rows: string[][] = []; let row: string[] = []; let cell = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ",") { row.push(cell); cell = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [head, ...body] = rows; if (!head) return [];
  return body.filter(r => r.some(v => v.trim())).map(r => Object.fromEntries(head.map((h, i) => [h.trim().toLowerCase().replace(/\s+/g, " "), (r[i] ?? "").trim()])));
}
const col = (r: Row, ...names: string[]) => { for (const n of names) { const v = r[n.toLowerCase()]; if (v) return v; } return ""; };
const parseDate = (s: string) => { // "Saturday, 26 September 2026" or "26/09/2026" or "2026-09-26"
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/);
  if (m) {
    const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi < 0) return null;
    return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  }
  const d = s.match(/(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4})/); // dd/mm/yyyy (Australian)
  if (d) return `${d[3]}-${d[2].padStart(2, "0")}-${d[1].padStart(2, "0")}`;
  const iso = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  return null;
};
const num = (s: string) => { const n = parseFloat((s || "").replace(/,/g, "")); return isFinite(n) ? n : 0; };

type Prepared = { code: string; row: Row; date: string | null; catering: boolean; status: string };

export default function IvvyImportDialog({ open, onOpenChange, businessId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; businessId: string; onDone: () => void }) {
  const [items, setItems] = useState<Prepared[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const [clients, setClients] = useState<ClientRow[]>([]);
  const onFile = async (f?: File) => {
    if (!f) return;
    setItems([]); setClients([]);
    if (/\.xlsx?$/i.test(f.name)) {
      const { data: sp } = await (supabase.from("crm_venue_spaces" as any) as any).select("name").eq("business_id", businessId).eq("active", true);
      const rows = await readClientList(f, (sp || []).map((x: any) => x.name));
      if (!rows) { toast.error("Couldn't find a 'Client Name' column in this spreadsheet."); return; }
      setClients(rows); return;
    }
    const rows = parseCsv(await f.text());
    if (!rows.length || !("code" in rows[0]) || !("main contact" in rows[0])) { toast.error("This doesn't look like an iVvy bookings export."); return; }
    const out: Prepared[] = []; let skip = 0;
    for (const r of rows) {
      if (!col(r, "Code") || !(col(r, "Main Contact") || col(r, "Booking Name"))) { skip++; continue; }
      out.push({ code: col(r, "Code"), row: r, date: parseDate(col(r, "Event Start Date")), catering: /catering/i.test(col(r, "Booking Name")), status: col(r, "Status").toLowerCase() });
    }
    setItems(out); setSkipped(skip);
  };

  const runClients = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      const leadRows = clients.map(c => ({
        business_id: businessId, external_ref: c.ref, full_name: c.name, source: "excel_import",
        event_type: c.eventType.toLowerCase().replace(/\s+/g, "_"), lead_kind: "event",
        preferred_dates: c.date ? [c.date] : [], venue_space: c.venue,
        status: c.deposit > 0 ? "deposit_received" : "new", lead_outcome: c.deposit > 0 ? "confirmed" : "new",
        tags: ["excel import"], created_by: user?.id ?? null, updated_by: user?.id ?? null,
      }));
      const leadId: Record<string, { id: string; customer_id: string | null }> = {};
      for (let i = 0; i < leadRows.length; i += 100) {
        setProgress(`Leads ${Math.min(i + 100, leadRows.length)}/${leadRows.length}`);
        const { data, error } = await supabase.from("crm_leads").upsert(leadRows.slice(i, i + 100) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref, customer_id");
        if (error) throw error;
        (data || []).forEach((d: any) => { leadId[d.external_ref] = d; });
      }
      // Start/end times and deposits live on the booking, so every dated client gets one; unpaid ones stay pending.
      const bookingRows = clients.filter(c => c.date).map(c => {
        const [sh, sm] = c.start.split(":").map(Number); const [eh, em] = c.end.split(":").map(Number);
        const dur = ((eh * 60 + em) - (sh * 60 + sm) + 1440) % 1440 || 300;
        return {
          business_id: businessId, external_ref: c.ref, lead_id: leadId[c.ref]?.id ?? null, customer_id: leadId[c.ref]?.customer_id ?? null,
          event_date: c.date, start_time: c.start, end_time: c.end, duration_minutes: dur, guest_count: 1,
          venue_space: c.venue, booking_kind: "event", event_name: `${c.eventType} – ${c.name}`,
          deposit_amount: c.deposit, deposit_paid: c.deposit > 0,
          status: c.deposit > 0 ? (c.date! < today ? "completed" : "confirmed") : "pending_confirmation",
          notes: ["Imported from spreadsheet", c.roomRaw && `Room given: ${c.roomRaw}`, c.timeRaw && `Time given: ${c.timeRaw}`, c.depositRaw && `Deposit given: ${c.depositRaw}`].filter(Boolean).join("\n"),
          created_by: user?.id ?? null, updated_by: user?.id ?? null,
        };
      });
      const bookingId: Record<string, string> = {};
      for (let i = 0; i < bookingRows.length; i += 100) {
        setProgress(`Bookings ${Math.min(i + 100, bookingRows.length)}/${bookingRows.length}`);
        const { data, error } = await supabase.from("crm_bookings").upsert(bookingRows.slice(i, i + 100) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref");
        if (error) throw error;
        (data || []).forEach((d: any) => { bookingId[d.external_ref] = d.id; });
      }
      const paid = clients.filter(c => c.deposit > 0 && bookingId[c.ref]);
      const ids = paid.map(c => bookingId[c.ref]);
      if (ids.length) { const { error } = await supabase.from("crm_payments").delete().in("booking_id", ids).eq("reference", "Spreadsheet import"); if (error) throw error; }
      const payRows = paid.map(c => ({ business_id: businessId, booking_id: bookingId[c.ref], amount: c.deposit, paid_on: today, payment_type: "deposit", method: "other", reference: "Spreadsheet import", notes: `Deposit: ${c.depositRaw}` }));
      if (payRows.length) { const { error } = await supabase.from("crm_payments").insert(payRows as any); if (error) throw error; }
      toast.success(`Imported ${leadRows.length} clients, ${bookingRows.length} bookings and ${payRows.length} deposits.`);
      setClients([]); onOpenChange(false); onDone();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  };

  const run = async () => {
    if (clients.length) return runClients();
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      const leadRows = items.map(({ code, row: r, date, catering, status }) => {
        const guests = Math.round(num(col(r, "Total Attendees Guaranteed")));
        const outstanding = num(col(r, "Total Outstanding"));
        // Historical migration: confirmed bookings are events that already happened, so fully paid ones land at the final stage.
        const lStatus = status !== "cancelled" ? (outstanding <= 0 ? "full_payment_received" : "deposit_received") : status === "cancelled" ? "cold" : "new";
        return {
          business_id: businessId, external_ref: code,
          full_name: col(r, "Main Contact") || [col(r, "First Name"), col(r, "Last Name")].filter(Boolean).join(" ") || col(r, "Booking Name"),
          email: col(r, "Email") || null, company: col(r, "Company") || null, source: "ivvy",
          event_type: catering ? "catering" : (col(r, "Booking Name") || "other").toLowerCase().replace(/\s+/g, "_"),
          lead_kind: catering ? "catering" : "event",
          preferred_dates: date ? [date] : [], estimated_guest_count: guests > 0 ? guests : null,
          estimated_value: num(col(r, "Total Amount")), status: lStatus,
          lead_outcome: lStatus === "deposit_received" || lStatus === "full_payment_received" ? "confirmed" : lStatus === "cold" ? "declined" : "new",
          decline_reason: status === "cancelled" ? (col(r, "Cancel Reason") || "Cancelled in iVvy") : null,
          tags: ["ivvy", `ivvy:${code}`, col(r, "Sales Person") && `sales:${col(r, "Sales Person")}`].filter(Boolean) as string[],
          created_by: user?.id ?? null, updated_by: user?.id ?? null,
        };
      });
      const idByCode: Record<string, string> = {};
      for (let i = 0; i < leadRows.length; i += 100) {
        setProgress(`Leads ${Math.min(i + 100, leadRows.length)}/${leadRows.length}`);
        const { data, error } = await supabase.from("crm_leads").upsert(leadRows.slice(i, i + 100) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref, customer_id");
        if (error) throw error;
        (data || []).forEach((d: any) => { idByCode[d.external_ref] = d.id + "|" + (d.customer_id ?? ""); });
      }
      const bookingRows = items.filter(p => p.status !== "cancelled" && p.date).map(({ code, row: r, date, catering }) => {
        const [leadId, customerId] = (idByCode[code] || "|").split("|");
        const guests = Math.max(1, Math.round(num(col(r, "Total Attendees Guaranteed"))));
        return {
          business_id: businessId, external_ref: code, lead_id: leadId || null, customer_id: customerId || null,
          event_date: date, start_time: "18:00", end_time: "22:00", duration_minutes: 240, guest_count: guests, adults: guests,
          venue_space: "TBC", booking_kind: catering ? "catering" : "event", event_name: col(r, "Booking Name"),
          total_amount: num(col(r, "Total Amount")), deposit_amount: num(col(r, "Total Paid")), deposit_paid: num(col(r, "Total Paid")) > 0,
          // Past events are already done — mark them completed so they don't show as upcoming or overdue.
          status: date! < today ? "completed" : "confirmed", confirmed_at: new Date().toISOString(),
          notes: [`Imported from iVvy (${code})`, col(r, "Coordinator") && `Coordinator: ${col(r, "Coordinator")}`, col(r, "Sales Person") && `Sales person: ${col(r, "Sales Person")}`, `Paid: $${num(col(r, "Total Paid"))} · Outstanding: $${num(col(r, "Total Outstanding"))}`].filter(Boolean).join("\n"),
          created_by: user?.id ?? null, updated_by: user?.id ?? null,
        };
      });
      const bookingIdByCode: Record<string, string> = {};
      for (let i = 0; i < bookingRows.length; i += 100) {
        setProgress(`Bookings ${Math.min(i + 100, bookingRows.length)}/${bookingRows.length}`);
        const { data, error } = await supabase.from("crm_bookings").upsert(bookingRows.slice(i, i + 100) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref");
        if (error) throw error;
        (data || []).forEach((d: any) => { bookingIdByCode[d.external_ref] = d.id; });
      }
      // Record what was actually paid in iVvy as payment history, so the Payments page reflects reality.
      const paidItems = items.filter(p => p.status !== "cancelled" && num(col(p.row, "Total Paid")) > 0 && bookingIdByCode[p.code]);
      const bookingIds = paidItems.map(p => bookingIdByCode[p.code]);
      for (let i = 0; i < bookingIds.length; i += 200) {
        const { error } = await supabase.from("crm_payments").delete().in("booking_id", bookingIds.slice(i, i + 200)).like("reference", "iVvy %");
        if (error) throw error;
      }
      const paymentRows = paidItems.map(p => ({
        business_id: businessId, booking_id: bookingIdByCode[p.code],
        amount: num(col(p.row, "Total Paid")), paid_on: p.date || today,
        payment_type: num(col(p.row, "Total Outstanding")) > 0 ? "deposit" : "balance",
        method: "other", reference: `iVvy ${p.code}`, notes: "Migrated from iVvy",
      }));
      for (let i = 0; i < paymentRows.length; i += 100) {
        setProgress(`Payments ${Math.min(i + 100, paymentRows.length)}/${paymentRows.length}`);
        const { error } = await supabase.from("crm_payments").insert(paymentRows.slice(i, i + 100) as any);
        if (error) throw error;
      }
      toast.success(`Imported ${leadRows.length} leads, ${bookingRows.length} bookings and ${paymentRows.length} payments from iVvy.`);
      setItems([]); onOpenChange(false); onDone();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  };

  const c = (f: (p: Prepared) => boolean) => items.filter(f).length;
  return <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>Import bookings</DialogTitle><DialogDescription>Upload an iVvy Bookings CSV, or an Excel client list (Client Name, Event Date, Event Type, Event Room, Event Start Time, Deposit). Past confirmed bookings are imported as completed history with their payments. Running it again updates bookings already imported.</DialogDescription></DialogHeader>
      <Input type="file" accept=".csv,text/csv,.xlsx,.xls" disabled={busy} onChange={e => onFile(e.target.files?.[0])} />
      {items.length > 0 && <div className="grid grid-cols-2 gap-2 text-sm">
        {[["Bookings found", items.length], ["Event leads", c(p => !p.catering)], ["Catering leads", c(p => p.catering)], ["Hosted (become bookings)", c(p => p.status !== "cancelled")], ["Past (marked completed)", c(p => p.status !== "cancelled" && p.date && p.date < new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }))], ["Cancelled (Cold)", c(p => p.status === "cancelled")], ["Skipped rows", skipped]].map(([l, v]) =>
          <div key={l as string} className="flex justify-between border-b border-border py-1"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>)}
      </div>}
      {clients.length > 0 && <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">{[["Clients found", clients.length], ["With deposit (confirmed)", clients.filter(c => c.deposit > 0).length], ["No deposit (new leads)", clients.filter(c => !c.deposit).length], ["Missing date", clients.filter(c => !c.date).length]].map(([l, v]) => <div key={l as string} className="flex justify-between border-b border-border py-1"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>)}</div>
        <div className="max-h-56 overflow-auto rounded border border-border text-xs"><table className="w-full"><tbody>{clients.map(c => <tr key={c.ref} className="border-b border-border"><td className="p-1.5 font-medium">{c.name}</td><td className="p-1.5">{c.date}</td><td className="p-1.5">{c.eventType}</td><td className="p-1.5">{c.venue}</td><td className="p-1.5 whitespace-nowrap">{c.start}–{c.end}</td><td className="p-1.5">{c.deposit ? `$${c.deposit}` : "—"}</td></tr>)}</tbody></table></div>
      </div>}
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !(items.length || clients.length)} onClick={run}>{busy ? "Importing…" : `Import ${items.length || clients.length || ""}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
