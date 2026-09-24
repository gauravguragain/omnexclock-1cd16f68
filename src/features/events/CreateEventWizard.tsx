import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import DateField from "@/features/sales/DateField";
import TimeDropdownPicker from "@/components/TimeDropdownPicker";
import OptionSelect from "@/features/sales/OptionSelect";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData, bookingEnd, minutesBetween, to12 } from "./useEventsData";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const range = (s: string, e: string) => { const a = toMin(s); let b = toMin(e); if (b <= a) b += 1440; return [a, b]; };

export default function CreateEventWizard({ kind }: { kind: "event" | "catering" }) {
  const crm = useCrmData(); const ev = useEventsData(); const { user } = useAuth();
  const [params] = useSearchParams(); const nav = useNavigate(); const { businessCode } = useParams();
  const leadId = params.get("lead");
  const [mode, setMode] = useState<"existing" | "new">("new"); const [customerId, setCustomerId] = useState(""); const [cSearch, setCSearch] = useState("");
  const [cust, setCust] = useState({ full_name: "", phone: "", email: "", address: "" });
  const [f, setF] = useState({ event_name: "", event_type: "", date: "", start: "18:00", end: "23:00", adults: "", kids: "", venue: "", location: "", notes: "" });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const l = crm.leads.find(x => x.id === leadId); if (!l) return;
    if (l.customer_id) { setMode("existing"); setCustomerId(l.customer_id); } else setCust({ full_name: l.full_name, phone: l.phone || "", email: l.email || "", address: "" });
    const venue = ev.venues.find(v => v.name === l.venue_space || v.name.toLowerCase().replace(/\s+/g, "_") === l.venue_space);
    setF(p => ({ ...p, event_name: `${l.full_name} — ${l.event_type.replace(/_/g, " ")}`, event_type: l.event_type, date: l.preferred_dates?.[0] || "", adults: l.estimated_guest_count ? String(l.estimated_guest_count) : "", venue: venue?.id || "", location: l.service_location || "" }));
  }, [leadId, crm.leads.length, ev.venues.length]);

  const total = (Number(f.adults) || 0) + (Number(f.kids) || 0);
  const venue = ev.venues.find(v => v.id === f.venue);
  const clashes = useMemo(() => {
    if (!f.date || kind === "catering") return {} as Record<string, any[]>;
    const [a, b] = range(f.start, f.end); const out: Record<string, any[]> = {};
    ev.venues.forEach(v => { out[v.id] = crm.bookings.filter(bk => bk.event_date === f.date && bk.status !== "cancelled" && (bk.venue_space_id === v.id || bk.venue_space === v.name) && (() => { const [c, d] = range(String(bk.start_time).slice(0, 5), bookingEnd(bk)); return a < d && c < b; })()); });
    return out;
  }, [f.date, f.start, f.end, crm.bookings, ev.venues, kind]);
  const customers = ev.customers.filter(c => `${c.full_name} ${c.phone || ""} ${c.email || ""}`.toLowerCase().includes(cSearch.toLowerCase())).slice(0, 8);
  const custOk = mode === "existing" ? !!customerId : !!(cust.full_name && cust.phone && cust.email);
  const ready = custOk && f.event_name && f.date && Number(f.adults) > 0 && (kind === "event" ? !!f.venue : !!f.location);

  const save = async () => {
    if (!crm.business || !ready) return; setSaving(true);
    try {
      const bid = crm.business.id; let cid = customerId;
      if (mode === "new") { const { data, error } = await (supabase.from("crm_customers" as any) as any).insert({ business_id: bid, ...cust, address: cust.address || null, source: leadId ? "lead" : "event" }).select().single(); if (error) throw error; cid = data.id; }
      const c = mode === "new" ? cust : ev.customers.find(x => x.id === cid)!;
      let lid = leadId;
      if (lid) { const { error } = await supabase.from("crm_leads").update({ customer_id: cid, lead_outcome: "confirmed", lead_kind: kind, service_location: f.location || null } as any).eq("id", lid); if (error) throw error; }
      else { const { data, error } = await supabase.from("crm_leads").insert({ business_id: bid, full_name: c.full_name, phone: c.phone || null, email: c.email || null, source: "direct", event_type: f.event_type || "other", preferred_dates: [f.date], estimated_guest_count: total, venue_space: venue?.name || null, status: "menu_selected", lead_kind: kind, service_location: f.location || null, customer_id: cid, lead_outcome: "confirmed", created_by: user?.id } as any).select().single(); if (error) throw error; lid = data.id; }
      const { data: order } = await supabase.rpc("crm_next_event_order" as any, { _business_id: bid });
      const { error } = await supabase.from("crm_bookings").insert({ business_id: bid, lead_id: lid, customer_id: cid, booking_kind: kind, event_name: f.event_name, event_type: f.event_type || null, event_date: f.date, start_time: f.start, end_time: f.end, duration_minutes: minutesBetween(f.start, f.end), guest_count: total, adults: Number(f.adults) || 0, kids: Number(f.kids) || 0, venue_space: kind === "event" ? venue!.name : "Off-site catering", venue_space_id: kind === "event" ? venue!.id : null, service_location: f.location || null, notes: f.notes || null, status: "confirmed", event_order_number: order as any, created_by: user?.id } as any);
      if (error) throw error;
      toast.success(kind === "event" ? "Event created" : "Catering booking created");
      nav(`/b/${businessCode}/events/${kind === "event" ? "events" : "catering-bookings"}`);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const Step = ({ n, title, sub, children }: any) => <Card><CardContent className="p-6"><div className="mb-4 flex gap-4"><span className="font-serif text-3xl text-primary">{n}</span><div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{sub}</p></div></div>{children}</CardContent></Card>;

  return <div className="mx-auto max-w-4xl space-y-5">
    <div><h1 className="font-serif text-3xl font-semibold">{kind === "event" ? "Create event" : "New catering booking"}</h1><p className="text-sm text-muted-foreground">Record a confirmed {kind === "event" ? "event" : "catering job"}. The customer, schedule and {kind === "event" ? "hall" : "service location"} are required; everything else can follow.</p></div>
    <Step n="01" title="Customer" sub="Search for an existing client, or add a new one. Name, phone and email are required.">
      <div className="mb-3 flex gap-2">{(["existing", "new"] as const).map(m => <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{m === "existing" ? "Existing customer" : "New customer"}</Button>)}</div>
      {mode === "existing" ? <div className="space-y-2"><Input placeholder="Find a customer" value={cSearch} onChange={e => setCSearch(e.target.value)} /><div className="grid gap-2 sm:grid-cols-2">{customers.map(c => <button key={c.id} onClick={() => setCustomerId(c.id)} className={cn("rounded-md border p-3 text-left text-sm", customerId === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}><p className="font-medium">{c.full_name}</p><p className="text-xs text-muted-foreground">{c.phone || c.email || "—"}</p></button>)}</div></div>
        : <div className="grid gap-3 sm:grid-cols-2">{(["full_name", "phone", "email", "address"] as const).map(k => <div key={k} className="space-y-1.5"><Label>{k === "full_name" ? "Name *" : k === "address" ? "Address" : `${k[0].toUpperCase()}${k.slice(1)} *`}</Label><Input value={cust[k]} onChange={e => setCust(p => ({ ...p, [k]: e.target.value }))} /></div>)}</div>}
    </Step>
    <Step n="02" title="Event & schedule" sub="What is being held, when, and how many are coming.">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Event name *</Label><Input value={f.event_name} onChange={e => set("event_name", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Event type</Label><OptionSelect options={crm.options.filter(o => o.option_type === "event_type" && o.active)} value={f.event_type} onChange={(v: string) => set("event_type", v)} emptyLabel="Choose type" /></div>
        <div className="space-y-1.5"><Label>Date *</Label><DateField value={f.date} onChange={v => set("date", v)} /></div>
        <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label>Start *</Label><TimeDropdownPicker value={f.start} onChange={v => set("start", v)} /></div><div className="space-y-1.5"><Label>End *</Label><TimeDropdownPicker value={f.end} onChange={v => set("end", v)} /></div></div>
        <div className="space-y-1.5"><Label>Adults *</Label><Input type="number" min="0" value={f.adults} onChange={e => set("adults", e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Children</Label><Input type="number" min="0" value={f.kids} onChange={e => set("kids", e.target.value)} /></div>
      </div>
      <p className="mt-3 text-sm text-muted-foreground">{total ? <>Total <span className="font-semibold text-foreground">{total}</span> guests{venue?.capacity ? ` · ${venue.name} holds ${venue.capacity}` : ""}</> : "Enter the number of adults to see the total."}</p>
    </Step>
    {kind === "event" ? <Step n="03" title="Venue" sub={f.date ? `Availability on ${f.date} from ${to12(f.start)} to ${to12(f.end)}.` : "Choose a date and time above to see which halls are free."}>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{ev.venues.filter(v => v.active).map(v => { const c = clashes[v.id] || []; const over = v.capacity && total > v.capacity; return <button key={v.id} onClick={() => set("venue", v.id)} className={cn("rounded-md border p-4 text-left", f.venue === v.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}>
        <p className="font-medium">{v.name}</p><p className="text-xs text-muted-foreground">{v.capacity ? `Holds ${v.capacity}` : "Capacity not set"}</p>
        {c.length ? <p className="mt-2 flex items-center gap-1 text-xs text-destructive"><AlertTriangle className="h-3 w-3" />Booked: {c.map(b => b.event_name || "event").join(", ")}</p> : f.date ? <p className="mt-2 flex items-center gap-1 text-xs text-primary"><CheckCircle2 className="h-3 w-3" />Free</p> : null}
        {over && <p className="mt-1 text-xs text-destructive">Over capacity by {total - v.capacity}</p>}
      </button>; })}{!ev.venues.length && <p className="text-sm text-muted-foreground">Add halls under Venue → Spaces first.</p>}</div>
    </Step> : <Step n="03" title="Service location" sub="Where the food is going."><Input value={f.location} onChange={e => set("location", e.target.value)} placeholder="Full address" /></Step>}
    <Step n="04" title="Notes" sub="Anything the team should know."><Textarea value={f.notes} onChange={e => set("notes", e.target.value)} /></Step>
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => nav(-1)}>Cancel</Button><Button disabled={!ready || saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save {kind === "event" ? "event" : "booking"}</Button></div>
  </div>;
}
