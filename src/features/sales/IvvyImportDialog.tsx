import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type Row = Record<string, string>;
const MONTHS = ["january","february","march","april","may","june","july","august","september","october","november","december"];

function parseCsv(text: string): Row[] {
  text = text.replace(/^\uFEFF/, "");
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
const parseDate = (s: string) => { // "Saturday, 26 September 2026"
  const m = s.match(/(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/); if (!m) return null;
  const mi = MONTHS.indexOf(m[2].toLowerCase()); if (mi < 0) return null;
  return `${m[3]}-${String(mi + 1).padStart(2, "0")}-${m[1].padStart(2, "0")}`;
};
const num = (s: string) => { const n = parseFloat((s || "").replace(/,/g, "")); return isFinite(n) ? n : 0; };

type Prepared = { code: string; row: Row; date: string | null; catering: boolean; status: string };

export default function IvvyImportDialog({ open, onOpenChange, businessId, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; businessId: string; onDone: () => void }) {
  const [items, setItems] = useState<Prepared[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");

  const onFile = async (f?: File) => {
    if (!f) return;
    const rows = parseCsv(await f.text());
    if (!rows.length || !("Code" in rows[0]) || !("Main Contact" in rows[0])) { toast.error("This doesn't look like an iVvy bookings export."); return; }
    const out: Prepared[] = []; let skip = 0;
    for (const r of rows) {
      if (!r.Code || !(r["Main Contact"] || r["Booking Name"])) { skip++; continue; }
      out.push({ code: r.Code, row: r, date: parseDate(r["Event Start Date"]), catering: /catering/i.test(r["Booking Name"]), status: (r.Status || "").toLowerCase() });
    }
    setItems(out); setSkipped(skip);
  };

  const run = async () => {
    setBusy(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      const leadRows = items.map(({ code, row: r, date, catering, status }) => {
        const guests = Math.round(num(r["Total Attendees Guaranteed"]));
        const lStatus = status === "confirmed" ? "deposit_received" : status === "cancelled" ? "cold" : "new";
        return {
          business_id: businessId, external_ref: code,
          full_name: r["Main Contact"] || [r["First Name"], r["Last Name"]].filter(Boolean).join(" ") || r["Booking Name"],
          email: r.Email || null, company: r.Company || null, source: "ivvy",
          event_type: catering ? "catering" : (r["Booking Name"] || "other").toLowerCase().replace(/\s+/g, "_"),
          lead_kind: catering ? "catering" : "event",
          preferred_dates: date ? [date] : [], estimated_guest_count: guests > 0 ? guests : null,
          estimated_value: num(r["Total Amount"]), status: lStatus,
          lead_outcome: lStatus === "deposit_received" ? "confirmed" : lStatus === "cold" ? "declined" : "new",
          decline_reason: status === "cancelled" ? (r["Cancel Reason"] || "Cancelled in iVvy") : null,
          tags: ["ivvy", `ivvy:${code}`, r["Sales Person"] && `sales:${r["Sales Person"]}`].filter(Boolean) as string[],
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
      const bookingRows = items.filter(p => p.status === "confirmed" && p.date).map(({ code, row: r, date, catering }) => {
        const [leadId, customerId] = (idByCode[code] || "|").split("|");
        const guests = Math.max(1, Math.round(num(r["Total Attendees Guaranteed"])));
        return {
          business_id: businessId, external_ref: code, lead_id: leadId || null, customer_id: customerId || null,
          event_date: date, start_time: "18:00", end_time: "22:00", duration_minutes: 240, guest_count: guests, adults: guests,
          venue_space: "TBC", booking_kind: catering ? "catering" : "event", event_name: r["Booking Name"],
          total_amount: num(r["Total Amount"]), deposit_amount: num(r["Total Paid"]), deposit_paid: num(r["Total Paid"]) > 0,
          status: "confirmed", confirmed_at: new Date().toISOString(),
          notes: [`Imported from iVvy (${code})`, r.Coordinator && `Coordinator: ${r.Coordinator}`, r["Sales Person"] && `Sales person: ${r["Sales Person"]}`, `Paid: $${num(r["Total Paid"])} · Outstanding: $${num(r["Total Outstanding"])}`].filter(Boolean).join("\n"),
          created_by: user?.id ?? null, updated_by: user?.id ?? null,
        };
      });
      for (let i = 0; i < bookingRows.length; i += 100) {
        setProgress(`Bookings ${Math.min(i + 100, bookingRows.length)}/${bookingRows.length}`);
        const { error } = await supabase.from("crm_bookings").upsert(bookingRows.slice(i, i + 100) as any, { onConflict: "business_id,external_ref" });
        if (error) throw error;
      }
      toast.success(`Imported ${leadRows.length} leads and ${bookingRows.length} confirmed bookings from iVvy.`);
      setItems([]); onOpenChange(false); onDone();
    } catch (e: any) { toast.error(e.message || "Import failed"); }
    finally { setBusy(false); setProgress(""); }
  };

  const c = (f: (p: Prepared) => boolean) => items.filter(f).length;
  return <Dialog open={open} onOpenChange={o => { if (!busy) onOpenChange(o); }}>
    <DialogContent className="max-w-lg">
      <DialogHeader><DialogTitle>Import from iVvy</DialogTitle><DialogDescription>In iVvy, export your Bookings list as CSV and upload it here. Running it again updates bookings already imported.</DialogDescription></DialogHeader>
      <Input type="file" accept=".csv,text/csv" disabled={busy} onChange={e => onFile(e.target.files?.[0])} />
      {items.length > 0 && <div className="grid grid-cols-2 gap-2 text-sm">
        {[["Bookings found", items.length], ["Event leads", c(p => !p.catering)], ["Catering leads", c(p => p.catering)], ["Confirmed (become events)", c(p => p.status === "confirmed")], ["Tentative (New)", c(p => p.status === "tentative")], ["Cancelled (Cold)", c(p => p.status === "cancelled")], ["Skipped rows", skipped]].map(([l, v]) =>
          <div key={l as string} className="flex justify-between border-b border-border py-1"><span className="text-muted-foreground">{l}</span><span className="font-medium">{v}</span></div>)}
      </div>}
      {progress && <p className="text-sm text-muted-foreground">{progress}</p>}
      <DialogFooter><Button variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>Cancel</Button><Button disabled={busy || !items.length} onClick={run}>{busy ? "Importing…" : `Import ${items.length || ""}`}</Button></DialogFooter>
    </DialogContent>
  </Dialog>;
}
