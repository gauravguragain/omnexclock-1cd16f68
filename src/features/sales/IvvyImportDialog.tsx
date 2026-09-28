import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { readClientList, type ClientRow } from "./clientListImport";


const BATCH = 25;
const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));
async function countLiveClashes(bookingIds: string[]) {
  if (!bookingIds.length) return 0;
  const clashing = new Set<string>();
  for (let i = 0; i < bookingIds.length; i += BATCH) {
    const { data, error } = await retry(() => supabase.from("crm_booking_venue_clashes").select("booking_id").in("booking_id", bookingIds.slice(i, i + BATCH)));
    if (error) throw error;
    (data || []).forEach(row => row.booking_id && clashing.add(row.booking_id));
  }
  return clashing.size;
}
// Retries a save when the connection drops ("Failed to fetch") so large imports on slow networks still finish.
async function retry<T extends { error: any }>(fn: () => PromiseLike<T>): Promise<T> {
  let last: any;
  for (let a = 0; a < 5; a++) {
    try {
      const res = await fn();
      const msg = String(res.error?.message || "");
      if (!res.error || !/fetch|network|timeout|load failed/i.test(msg)) return res;
      last = res.error;
    } catch (e) { last = e; }
    await sleep(800 * (a + 1));
  }
  throw new Error(`Connection problem while saving the import (${last?.message || "network error"}). Please check your internet and try again — already saved rows will be updated, not duplicated.`);
}

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
// Finds a phone value under any heading containing "phone" or "mobile" (iVvy renames these between export types).
const phoneOf = (r: Row) => col(r, "Phone", "Mobile", "Phone Number", "Contact Number", "Contact Phone", "Mobile Phone", "Phone (Mobile)", "Phone (Work)", "Work Phone", "Home Phone")
  || Object.entries(r).find(([k, v]) => v && /phone|mobile/.test(k))?.[1] || "";
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

export default function IvvyImportDialog({ open, onOpenChange, businessId, onDone, mode = "ivvy" }: { mode?: "ivvy" | "excel"; open: boolean; onOpenChange: (o: boolean) => void; businessId: string; onDone: () => void }) {
  const [items, setItems] = useState<Prepared[]>([]);
  const [contacts, setContacts] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const [clients, setClients] = useState<ClientRow[]>([]);
  const [dupes, setDupes] = useState<{ name: string; date: string; existing: string }[]>([]);
  // Rows whose client name already has an event on the same date in the system (from a different record) are left out.
  const findDupes = async (rows: { ref: string; name: string; date: string | null }[]) => {
    const n = (s: string) => (s || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const dates = [...new Set(rows.map(r => r.date).filter(Boolean))] as string[];
    const found = new Map<string, string>();
    if (!dates.length) return found;
    const bookings: any[] = [];
    for (let i = 0; i < dates.length; i += 100) {
      const { data } = await supabase.from("crm_bookings").select("external_ref, event_date, event_name, lead_id, customer_id, status").eq("business_id", businessId).in("event_date", dates.slice(i, i + 100));
      bookings.push(...(data || []).filter((b: any) => b.status !== "cancelled"));
    }
    if (!bookings.length) return found;
    const [{ data: leads }, { data: custs }] = await Promise.all([
      supabase.from("crm_leads").select("id, full_name").in("id", [...new Set(bookings.map(b => b.lead_id).filter(Boolean))]),
      supabase.from("crm_customers").select("id, full_name").in("id", [...new Set(bookings.map(b => b.customer_id).filter(Boolean))]),
    ]);
    const ln = new Map((leads || []).map((l: any) => [l.id, l.full_name])); const cn = new Map((custs || []).map((c: any) => [c.id, c.full_name]));
    for (const r of rows) {
      if (!r.date || !n(r.name)) continue;
      const hit = bookings.find(b => b.event_date === r.date && b.external_ref !== r.ref && [ln.get(b.lead_id), cn.get(b.customer_id)].some(x => x && n(x) === n(r.name)));
      if (hit) found.set(r.ref, hit.event_name || ln.get(hit.lead_id) || "Existing event");
    }
    return found;
  };
  const onFile = async (f?: File) => {
    if (!f) return;
    setItems([]); setClients([]); setDupes([]);
    if (mode === "excel") {
      const { data: sp } = await (supabase.from("crm_venue_spaces" as any) as any).select("name").eq("business_id", businessId).eq("active", true);
      const rows = await readClientList(f, (sp || []).map((x: any) => x.name));
      if (!rows) { toast.error("Couldn't find a 'Client Name' column in this spreadsheet."); return; }
      const d = await findDupes(rows);
      setDupes(rows.filter(r => d.has(r.ref)).map(r => ({ name: r.name, date: r.date!, existing: d.get(r.ref)! })));
      setClients(rows.filter(r => !d.has(r.ref))); return;
    }
    const rows = parseCsv(await f.text());
    // iVvy's Bookings export has no phone column — phone numbers come from a Contacts export (Email + a phone column, no booking Code).
    if (rows.length && !("code" in rows[0]) && "email" in rows[0] && Object.keys(rows[0]).some(k => /phone|mobile/.test(k))) {
      setContacts(rows.filter(r => phoneOf(r) && (col(r, "Email") || col(r, "Main Contact") || col(r, "First Name") || col(r, "Last Name") || col(r, "Name"))));
      return;
    }
    if (!rows.length || !("code" in rows[0]) || !("main contact" in rows[0])) { toast.error("This doesn't look like an iVvy bookings or contacts export."); return; }
    const out: Prepared[] = []; let skip = 0;
    for (const r of rows) {
      if (!col(r, "Code") || !(col(r, "Main Contact") || col(r, "Booking Name"))) { skip++; continue; }
      out.push({ code: col(r, "Code"), row: r, date: parseDate(col(r, "Event Start Date")), catering: /catering/i.test(col(r, "Booking Name")), status: col(r, "Status").toLowerCase() });
    }
    const nameOf = (r: Row) => col(r, "Main Contact") || [col(r, "First Name"), col(r, "Last Name")].filter(Boolean).join(" ") || col(r, "Booking Name");
    const d = await findDupes(out.map(p => ({ ref: p.code, name: nameOf(p.row), date: p.date })));
    setDupes(out.filter(p => d.has(p.code)).map(p => ({ name: nameOf(p.row), date: p.date!, existing: d.get(p.code)! })));
    setItems(out.filter(p => !d.has(p.code))); setSkipped(skip);
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
      for (let i = 0; i < leadRows.length; i += BATCH) {
        setProgress(`Leads ${Math.min(i + BATCH, leadRows.length)}/${leadRows.length}`);
        const { data, error } = await retry(() => supabase.from("crm_leads").upsert(leadRows.slice(i, i + BATCH) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref, customer_id"));
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
      for (let i = 0; i < bookingRows.length; i += BATCH) {
        setProgress(`Bookings ${Math.min(i + BATCH, bookingRows.length)}/${bookingRows.length}`);
         const { data, error } = await retry(() => supabase.from("crm_bookings").upsert(bookingRows.slice(i, i + BATCH) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref"));
        if (error) throw error;
         (data || []).forEach((d: any) => { bookingId[d.external_ref] = d.id; });
      }
       const clashes = await countLiveClashes(Object.values(bookingId));
      const paid = clients.filter(c => c.deposit > 0 && bookingId[c.ref]);
      const ids = paid.map(c => bookingId[c.ref]);
      if (ids.length) { for (let i = 0; i < ids.length; i += BATCH) { const { error } = await retry(() => supabase.from("crm_payments").delete().in("booking_id", ids.slice(i, i + BATCH)).eq("reference", "Spreadsheet import")); if (error) throw error; } }
      const payRows = paid.map(c => ({ business_id: businessId, booking_id: bookingId[c.ref], amount: c.deposit, paid_on: c.date || today, payment_type: "deposit", method: "other", reference: "Spreadsheet import", notes: `Deposit: ${c.depositRaw}` }));
      for (let i = 0; i < payRows.length; i += BATCH) { const { error } = await retry(() => supabase.from("crm_payments").insert(payRows.slice(i, i + BATCH) as any)); if (error) throw error; }
      await supabase.rpc("crm_merge_first_name_contacts" as any, { _business_id: businessId });
       toast.success(`Imported ${leadRows.length} clients, ${bookingRows.length} bookings and ${payRows.length} deposits.`); if (clashes) toast.warning(`${clashes} imported booking(s) currently overlap another booking in the same hall.`, { duration: 12000 });
      setClients([]); onOpenChange(false); onDone();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  };

  // Applies phone numbers from an iVvy Contacts export onto existing customers/leads, matched by email then name.
  const runContacts = async () => {
    setBusy(true);
    try {
      let updated = 0;
      for (let i = 0; i < contacts.length; i++) {
        const r = contacts[i];
        const phone = phoneOf(r); const email = col(r, "Email").toLowerCase();
        const name = col(r, "Main Contact", "Name") || [col(r, "First Name"), col(r, "Last Name")].filter(Boolean).join(" ");
        if (!phone) continue;
        setProgress(`Contacts ${i + 1}/${contacts.length}`);
        let q = supabase.from("crm_customers").update({ phone } as any).eq("business_id", businessId);
        q = email ? q.ilike("email", email) : q.ilike("full_name", name);
        const { data, error } = await retry(() => q.select("id"));
        if (error) throw error;
        if (data?.length) { updated += data.length; continue; }
        let lq = supabase.from("crm_leads").update({ phone } as any).eq("business_id", businessId);
        lq = email ? lq.ilike("email", email) : lq.ilike("full_name", name);
        const { data: ld, error: le } = await retry(() => lq.select("id"));
        if (le) throw le;
        updated += ld?.length || 0;
      }
      toast.success(`Phone numbers updated on ${updated} record(s).`);
      setContacts([]); onOpenChange(false); onDone();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  };

  const run = async () => {
    if (clients.length) return runClients();
    if (contacts.length) return runContacts();
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" });
      const leadRows = items.map(({ code, row: r, date, catering, status }) => {
        const guests = Math.round(num(col(r, "Total Attendees Guaranteed")));
        const outstanding = num(col(r, "Total Outstanding"));
        // Historical migration: past events are treated as fully settled regardless of iVvy's outstanding amount.
        const lStatus = status !== "cancelled" ? "full_payment_received" : status === "cancelled" ? "cold" : "new";
        return {
          business_id: businessId, external_ref: code,
          full_name: col(r, "Main Contact") || [col(r, "First Name"), col(r, "Last Name")].filter(Boolean).join(" ") || col(r, "Booking Name"),
          email: col(r, "Email") || null, company: col(r, "Company") || null, source: "ivvy",
          phone: phoneOf(r) || null,
          event_type: catering ? "catering" : (col(r, "Booking Name") || "other").toLowerCase().replace(/\s+/g, "_"),
          lead_kind: catering ? "catering" : "event",
          preferred_dates: date ? [date] : [], estimated_guest_count: guests > 0 ? guests : null,
          estimated_value: num(col(r, "Total Amount")), status: lStatus,
          lead_outcome: lStatus === "full_payment_received" ? "confirmed" : lStatus === "cold" ? "declined" : "new",
          decline_reason: status === "cancelled" ? (col(r, "Cancel Reason") || "Cancelled in iVvy") : null,
          tags: ["ivvy", `ivvy:${code}`, col(r, "Sales Person") && `sales:${col(r, "Sales Person")}`].filter(Boolean) as string[],
          created_by: user?.id ?? null, updated_by: user?.id ?? null,
        };
      });
      const idByCode: Record<string, string> = {};
      for (let i = 0; i < leadRows.length; i += BATCH) {
        setProgress(`Leads ${Math.min(i + BATCH, leadRows.length)}/${leadRows.length}`);
        const { data, error } = await retry(() => supabase.from("crm_leads").upsert(leadRows.slice(i, i + BATCH) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref, customer_id"));
        if (error) throw error;
        (data || []).forEach((d: any) => { idByCode[d.external_ref] = d.id + "|" + (d.customer_id ?? ""); });
      }
      // Fill in phone numbers on the linked customer records too (iVvy exports gained phone later).
      const custPhone: Record<string, string> = {};
      for (const { code, row: r } of items) {
        const ph = phoneOf(r);
        const cid = (idByCode[code] || "|").split("|")[1];
        if (ph && cid) custPhone[cid] = ph;
      }
      for (const [cid, ph] of Object.entries(custPhone)) {
        await retry(() => supabase.from("crm_customers").update({ phone: ph } as any).eq("id", cid));
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
      for (let i = 0; i < bookingRows.length; i += BATCH) {
        setProgress(`Bookings ${Math.min(i + BATCH, bookingRows.length)}/${bookingRows.length}`);
         const { data, error } = await retry(() => supabase.from("crm_bookings").upsert(bookingRows.slice(i, i + BATCH) as any, { onConflict: "business_id,external_ref" }).select("id, external_ref"));
        if (error) throw error;
         (data || []).forEach((d: any) => { bookingIdByCode[d.external_ref] = d.id; });
      }
       const clashes = await countLiveClashes(Object.values(bookingIdByCode));
      // Past events are fully settled (migration) — record the full total as paid so no balance shows due.
      // Future events keep only what iVvy shows as actually paid.
      const paidItems = items.filter(p => p.status !== "cancelled" && bookingIdByCode[p.code]
        && (p.date && p.date <= today ? num(col(p.row, "Total Amount")) > 0 : num(col(p.row, "Total Paid")) > 0));
      const bookingIds = paidItems.map(p => bookingIdByCode[p.code]);
      for (let i = 0; i < bookingIds.length; i += BATCH) {
        const { error } = await retry(() => supabase.from("crm_payments").delete().in("booking_id", bookingIds.slice(i, i + BATCH)).like("reference", "iVvy %"));
        if (error) throw error;
      }
      const paymentRows = paidItems.map(p => ({
        business_id: businessId, booking_id: bookingIdByCode[p.code],
        amount: p.date && p.date <= today ? num(col(p.row, "Total Amount")) : num(col(p.row, "Total Paid")),
        paid_on: p.date || today,
        payment_type: "balance",
        method: "other", reference: `iVvy ${p.code}`, notes: "Migrated from iVvy",
      }));
      for (let i = 0; i < paymentRows.length; i += BATCH) {
        setProgress(`Payments ${Math.min(i + BATCH, paymentRows.length)}/${paymentRows.length}`);
        const { error } = await retry(() => supabase.from("crm_payments").insert(paymentRows.slice(i, i + BATCH) as any));
        if (error) throw error;
      }
      const { data: mergedCount } = await supabase.rpc("crm_merge_first_name_contacts" as any, { _business_id: businessId });
       toast.success(`Imported ${leadRows.length} leads, ${bookingRows.length} bookings and ${paymentRows.length} payments from iVvy.${Number(mergedCount) > 0 ? ` Merged ${mergedCount} duplicate contact(s).` : ""}`); if (clashes) toast.warning(`${clashes} imported booking(s) currently overlap another booking in the same hall.`, { duration: 12000 });
      setItems([]); onOpenChange(false); onDone();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  };

  const c = (f: (p: Prepared) => boolean) => items.filter(f).length;
  return <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
    <DialogContent className="max-w-2xl">
      <DialogHeader><DialogTitle>{mode === "excel" ? "Import clients from Excel" : "Import past events from iVvy"}</DialogTitle><DialogDescription>{mode === "excel" ? "Upload your client spreadsheet with columns Client Name, Event Date, Event Type, Event Room, Event Start Time and Deposit. Running it again updates clients already imported." : "Upload an iVvy Bookings CSV export. Past bookings are imported as completed history with their payments. Running it again updates bookings already imported. The Bookings export has no phone column — to add phone numbers, upload an iVvy Contacts CSV here too and they'll be matched to your customers by email."}</DialogDescription></DialogHeader>
      <Input type="file" accept={mode === "excel" ? ".xlsx,.xls,.csv" : ".csv,text/csv"} disabled={busy} onChange={e => onFile(e.target.files?.[0])} />
      {items.length > 0 && <div className="grid grid-cols-2 gap-2 text-sm">
        {[["Bookings found", items.length], ["Event leads", c(p => !p.catering)], ["Catering leads", c(p => p.catering)], ["Hosted (become bookings)", c(p => p.status !== "cancelled")], ["Past (marked completed)", c(p => p.status !== "cancelled" && p.date && p.date < new Date().toLocaleDateString("en-CA", { timeZone: "Australia/Sydney" }))], ["Cancelled (Cold)", c(p => p.status === "cancelled")], ["Skipped rows", skipped]].map(([l, v]) =>
          <div key={l as string} className="flex justify-between border-b border-border py-1"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>)}
      </div>}
      {clients.length > 0 && <div className="space-y-2 text-sm">
        <div className="grid grid-cols-2 gap-2">{[["Clients found", clients.length], ["With deposit (confirmed)", clients.filter(c => c.deposit > 0).length], ["No deposit (new leads)", clients.filter(c => !c.deposit).length], ["Missing date", clients.filter(c => !c.date).length]].map(([l, v]) => <div key={l as string} className="flex justify-between border-b border-border py-1"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>)}</div>
        <div className="max-h-56 overflow-auto rounded border border-border text-xs"><table className="w-full"><tbody>{clients.map(c => <tr key={c.ref} className="border-b border-border"><td className="p-1.5 font-medium">{c.name}</td><td className="p-1.5">{c.date}</td><td className="p-1.5">{c.eventType}</td><td className="p-1.5">{c.venue}</td><td className="p-1.5 whitespace-nowrap">{c.start}–{c.end}</td><td className="p-1.5">{c.deposit ? `$${c.deposit}` : "—"}</td></tr>)}</tbody></table></div>
      </div>}
      {contacts.length > 0 && <div className="space-y-2 text-sm">
        <p className="text-muted-foreground">Contacts export detected — phone numbers will be added to matching customers and leads (matched by email, then name).</p>
        <div className="max-h-56 overflow-auto rounded border border-border text-xs"><table className="w-full"><tbody>{contacts.map((r, i) => <tr key={i} className="border-b border-border"><td className="p-1.5 font-medium">{col(r, "Main Contact", "Name") || [col(r, "First Name"), col(r, "Last Name")].filter(Boolean).join(" ")}</td><td className="p-1.5">{col(r, "Email")}</td><td className="p-1.5">{phoneOf(r)}</td></tr>)}</tbody></table></div>
      </div>}
      {dupes.length > 0 && <div className="space-y-2 text-sm">
        <p className="font-medium text-destructive">{dupes.length} row(s) won't be imported — this client already has an event on the same date:</p>
        <div className="max-h-48 overflow-auto rounded border border-destructive/40 text-xs"><table className="w-full"><tbody>{dupes.map((x, i) => <tr key={i} className="border-b border-border"><td className="p-1.5 font-medium">{x.name}</td><td className="p-1.5 whitespace-nowrap">{x.date}</td><td className="p-1.5 text-muted-foreground">Already in system: {x.existing}</td></tr>)}</tbody></table></div>
      </div>}
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !(items.length || clients.length || contacts.length)} onClick={run}>{busy ? "Importing…" : `Import ${items.length || clients.length || contacts.length || ""}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
