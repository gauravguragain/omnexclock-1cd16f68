import CateringMenuEditor, { cateringMenuRows, cateringMenuTotal, useBookPackages, type CPkg } from "./CateringMenuEditor";
import { DeliveryFields, emptyDelivery, feeOf, type DeliveryValue } from "./DeliveryCard";
import { DEFAULT_CHAFING_PRICE } from "./ChafingCard";
import { Checkbox } from "@/components/ui/checkbox";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import OptionSelect from "@/features/sales/OptionSelect";
import DateField from "@/features/sales/DateField";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData, bookingEnd, minutesBetween, to12 } from "./useEventsData";
import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const toMin = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const range = (s: string, e: string) => { const a = toMin(s); let b = toMin(e); if (b <= a) b += 1440; return [a, b]; };

const Step = ({ n, title, sub, children }: any) => <Card><CardContent className="p-6"><div className="mb-4 flex gap-4"><span className="font-serif text-3xl text-primary">{n}</span><div><h2 className="text-lg font-semibold">{title}</h2><p className="text-sm text-muted-foreground">{sub}</p></div></div>{children}</CardContent></Card>;

export default function CreateEventWizard({ kind }: { kind: "event" | "catering" }) {
  const crm = useCrmData(); const ev = useEventsData(); const { user } = useAuth();
  const [params] = useSearchParams(); const nav = useNavigate(); const { businessCode } = useParams();
  const leadId = params.get("lead"); const presetCustomerId = params.get("customer");
  useEffect(() => { if (presetCustomerId && ev.customers.some(c => c.id === presetCustomerId)) { setMode("existing"); setCustomerId(presetCustomerId); } }, [presetCustomerId, ev.customers.length]);
  const [mode, setMode] = useState<"existing" | "new">("new"); const [customerId, setCustomerId] = useState(""); const [cSearch, setCSearch] = useState("");
  const [cust, setCust] = useState({ full_name: "", phone: "", email: "", address: "" });
  const [f, setF] = useState({ event_name: "", event_type: "", date: "", start: "18:00", end: "23:00", adults: "", kids: "", venue: "", location: "", notes: "", method: "delivery" as "delivery" | "pickup" });
  const [saving, setSaving] = useState(false);
  const [delivery, setDelivery] = useState<DeliveryValue>(emptyDelivery());
  const [coordId, setCoordId] = useState("");
  const [pkgs, setPkgs] = useState<CPkg[]>([]); const bookPackages = useBookPackages(ev);
  const [chafOn, setChafOn] = useState(false); const [chafQty, setChafQty] = useState("1"); const [chafPrice, setChafPrice] = useState(String(DEFAULT_CHAFING_PRICE));
  const itemName = (ci: any) => ci.dish_id ? ev.dishes.find(x => x.id === ci.dish_id)?.name : ev.drinks.find(x => x.id === ci.drink_id)?.name;
  const courseOpts = (courseId: string) => ev.courseItems.filter(ci => ci.course_id === courseId).map(ci => ({ id: ci.id, name: itemName(ci) as string })).filter(o => o.name);
  const activePkgs = ev.packages.filter(p => p.active);
  const updPkg = (key: string, patch: any) => setPkgs(ps => ps.map(p => p.key === key ? { ...p, ...patch } : p));
  const staff = ev.stakeholders.filter(s => s.stakeholder_type === "coordinator" && s.active !== false).map(s => ({ id: s.id, name: s.full_name, phone: s.phone, job_title: s.position }));
  const coord = staff.find(s => s.id === coordId);
  const set = (k: keyof typeof f, v: string) => setF(p => ({ ...p, [k]: v }));

  useEffect(() => {
    const l = crm.leads.find(x => x.id === leadId); if (!l) return;
    if (l.customer_id) { setMode("existing"); setCustomerId(l.customer_id); } else setCust({ full_name: l.full_name, phone: l.phone || "", email: l.email || "", address: "" });
    const venue = ev.venues.find(v => v.name === l.venue_space || v.name.toLowerCase().replace(/\s+/g, "_") === l.venue_space);
    setF(p => ({ ...p, event_name: `${l.full_name} — ${l.event_type.replace(/_/g, " ")}`, event_type: l.event_type, date: l.preferred_dates?.[0] || "", adults: l.estimated_guest_count ? String(l.estimated_guest_count) : "", venue: venue?.id || "", location: l.service_location || "" }));
  }, [leadId, crm.leads.length, ev.venues.length]);

  const total = (Number(f.adults) || 0) + (Number(f.kids) || 0);
  const chafCount = chafOn ? Math.max(0, Math.floor(Number(chafQty) || 0)) : 0;
  const chafUnit = Math.max(0, Number(chafPrice) || 0);
  const chafTotal = chafCount * chafUnit;
  const menuTotal = cateringMenuTotal(pkgs, total);
  const grandTotal = Math.round((menuTotal + (kind === "catering" && f.method === "delivery" ? (feeOf(delivery) ?? 0) : 0) + (kind === "catering" ? chafTotal : 0)) * 100) / 100;
  const venue = ev.venues.find(v => v.id === f.venue);
  const clashes = useMemo(() => {
    if (!f.date || kind === "catering") return {} as Record<string, any[]>;
    const [a, b] = range(f.start, f.end); const out: Record<string, any[]> = {};
    ev.venues.forEach(v => { out[v.id] = crm.bookings.filter(bk => bk.event_date === f.date && bk.status !== "cancelled" && (bk.venue_space_id === v.id || bk.venue_space === v.name) && (() => { const [c, d] = range(String(bk.start_time).slice(0, 5), bookingEnd(bk)); return a < d && c < b; })()); });
    return out;
  }, [f.date, f.start, f.end, crm.bookings, ev.venues, kind]);
  const customers = ev.customers.filter(c => `${c.full_name} ${c.phone || ""} ${c.email || ""}`.toLowerCase().includes(cSearch.toLowerCase())).slice(0, 8);
  const custOk = mode === "existing" ? !!customerId : !!(cust.full_name && cust.phone && cust.email);
  const cateringOk = kind === "event" || pkgs.length > 0;
  const ready = cateringOk && custOk && f.event_name && f.date && Number(f.adults) > 0 && (kind === "event" ? !!f.venue : (f.method === "pickup" || !!f.location));

  const save = async () => {
    if (!crm.business || !ready) return; setSaving(true);
    try {
      const bid = crm.business.id; let cid = customerId;
      if (mode === "new") { const { data, error } = await (supabase.from("crm_customers" as any) as any).insert({ business_id: bid, ...cust, address: cust.address || null, source: leadId ? "lead" : "event" }).select().single(); if (error) throw error; cid = data.id; }
      const c = mode === "new" ? cust : ev.customers.find(x => x.id === cid)!;
      let lid = leadId;
      if (lid) { const { error } = await supabase.from("crm_leads").update({ customer_id: cid, lead_outcome: "confirmed", lead_kind: kind, service_location: f.location || null } as any).eq("id", lid); if (error) throw error; }
      else { const { data, error } = await supabase.from("crm_leads").insert({ business_id: bid, full_name: c.full_name, phone: c.phone || null, email: c.email || null, source: "direct", event_type: kind === "catering" ? "catering" : (f.event_type || "other"), preferred_dates: [f.date], estimated_guest_count: total, venue_space: venue?.name || null, status: "menu_selected", lead_kind: kind, service_location: f.location || null, customer_id: cid, lead_outcome: "confirmed", created_by: user?.id } as any).select().single(); if (error) throw error; lid = data.id; }
      const order = null; // assigned when the run sheet is first sent
      const { data: bk, error } = await supabase.from("crm_bookings").insert({ business_id: bid, lead_id: lid, customer_id: cid, booking_kind: kind, event_name: f.event_name, event_type: kind === "catering" ? "catering" : (f.event_type || null), fulfilment_method: kind === "catering" ? f.method : "delivery", event_date: f.date, start_time: f.start, end_time: f.end, duration_minutes: minutesBetween(f.start, f.end), guest_count: total, adults: Number(f.adults) || 0, kids: Number(f.kids) || 0, venue_space: kind === "event" ? venue!.name : "Off-site catering", venue_space_id: kind === "event" ? venue!.id : null, service_location: kind === "catering" && f.method === "pickup" ? null : (f.location || null), ...(kind === "catering" ? { chafing_dishes: chafCount, chafing_dish_price: chafUnit, total_amount: grandTotal } : {}), ...(kind === "catering" && f.method === "delivery" ? { delivery_distance_km: delivery.km === "" ? null : Number(delivery.km), delivery_rate_per_km: Number(delivery.rate) || 0, delivery_fee_manual: delivery.manual, delivery_fee: feeOf(delivery) } : {}), notes: f.notes || null, status: "confirmed", event_order_number: order as any, created_by: user?.id } as any).select("id").single();
      if (error) throw error;
      const chosen = pkgs;
      if (chosen.length) {
        const { data: sel, error: se } = await supabase.from("crm_menu_selections").upsert({ business_id: bid, lead_id: lid!, guest_count: Number(f.adults) || total, package_name: chosen[0].name || null, updated_by: user?.id } as any, { onConflict: "lead_id" }).select("id").single();
        if (se) throw se;
        await supabase.from("crm_menu_selection_items").delete().eq("selection_id", sel.id);
        const rows = cateringMenuRows(chosen, bid, sel.id);
        if (rows.length) await supabase.from("crm_menu_selection_items").insert(rows);
      }
      if (kind === "catering" || coord || f.notes) await supabase.from("crm_runsheets").insert({ business_id: bid, lead_id: lid!, booking_id: bk?.id, event_order_number: order as any, booking_reference: String(lid).slice(0, 10).toUpperCase(), adult_guests: Number(f.adults) || 0, kids_guests: Number(f.kids) || 0, event_coordinator: coord?.name || null, event_coordinator_phone: coord?.phone || null, onsite_contact_name: coord?.name || null, onsite_contact_phone: coord?.phone || null, client_notes: f.notes || null, status: "draft", created_by: user?.id } as any);
      toast.success(kind === "event" ? "Event created" : "Catering booking created");
       nav(kind === "catering" ? `/b/${businessCode}/catering/bookings` : `/b/${businessCode}/events/events`);
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const checks: [string, boolean][] = [["Customer", custOk], ["Booking & schedule", !!(f.event_name && f.date && Number(f.adults) > 0)], [kind === "event" ? "Venue" : "Delivery or pickup", kind === "event" ? !!f.venue : (f.method === "pickup" || !!f.location)], ...(kind === "catering" ? [["Coordinator", true], ["Catering", cateringOk]] as [string, boolean][] : []), ["Notes", true]];
  const custName = mode === "existing" ? ev.customers.find(x => x.id === customerId)?.full_name : cust.full_name;
  const Sum = ({ l, v, empty }: { l: string; v?: any; empty: string }) => <div className="border-t pt-2"><p className="text-xs uppercase tracking-widest text-muted-foreground">{l}</p><p className={cn("text-sm", !v && "text-muted-foreground")}>{v || empty}</p></div>;
  return <div className="mx-auto grid max-w-6xl gap-6 lg:grid-cols-[1fr_300px]"><div className="space-y-5">
    <div><h1 className="font-serif text-3xl font-semibold">{kind === "event" ? "Create event" : "New catering booking"}</h1><p className="text-sm text-muted-foreground">Record a confirmed {kind === "event" ? "event" : "catering job"}. The customer, schedule and {kind === "event" ? "hall" : "service location"} are required; everything else can follow.</p></div>
    <Step n="01" title="Customer" sub="Search for an existing client, or add a new one. Name, phone and email are required.">
      <div className="mb-3 flex gap-2">{(["existing", "new"] as const).map(m => <Button key={m} size="sm" variant={mode === m ? "default" : "outline"} onClick={() => setMode(m)}>{m === "existing" ? "Existing customer" : "New customer"}</Button>)}</div>
      {mode === "existing" ? <div className="space-y-2"><Input placeholder="Find a customer" value={cSearch} onChange={e => setCSearch(e.target.value)} /><div className="grid gap-2 sm:grid-cols-2">{customers.map(c => <button key={c.id} onClick={() => setCustomerId(c.id)} className={cn("rounded-md border p-3 text-left text-sm", customerId === c.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}><p className="font-medium">{c.full_name}</p><p className="text-xs text-muted-foreground">{c.phone || c.email || "—"}</p></button>)}</div></div>
        : <div className="grid gap-3 sm:grid-cols-2">{(["full_name", "phone", "email"] as const).map(k => <div key={k} className="space-y-1.5"><Label>{k === "full_name" ? "Name *" : `${k[0].toUpperCase()}${k.slice(1)} *`}</Label><Input value={cust[k]} onChange={e => setCust(p => ({ ...p, [k]: e.target.value }))} /></div>)}</div>}
    </Step>
    <Step n="02" title={kind === "catering" ? "Order & timing" : "Event & schedule"} sub={kind === "catering" ? "The order, the delivery or pickup window, and how many it feeds." : "What is being held, when, and how many are coming."}>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5"><Label>Event name *</Label><Input value={f.event_name} onChange={e => set("event_name", e.target.value)} /></div>
        {kind === "event" && <div className="space-y-1.5"><Label>Event type</Label><OptionSelect name="event_type_pick" emptyLabel="Choose type" defaultValue={f.event_type} options={crm.options.filter(o => o.option_type === "event_type" && o.active)} onChange={v => v !== f.event_type && set("event_type", v)} /></div>}
        <div className="space-y-1.5"><Label>Date *</Label><DateField value={f.date} onChange={v => set("date", v)} /></div>
        <div className="grid grid-cols-2 gap-2"><div className="space-y-1.5"><Label>{kind === "catering" ? (f.method === "pickup" ? "Pickup from *" : "Delivery from *") : "Start *"}</Label><TimeDropdownPicker value={f.start} onChange={v => set("start", v)} /></div><div className="space-y-1.5"><Label>{kind === "catering" ? (f.method === "pickup" ? "Pickup until *" : "Delivery until *") : "End *"}</Label><TimeDropdownPicker value={f.end} onChange={v => set("end", v)} /></div></div>
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
    </Step> : <><Step n="03" title="Delivery or pickup" sub="Will we deliver the food, or will the client collect it?">
      <div className="mb-3 flex gap-2">{(["delivery", "pickup"] as const).map(m => <Button key={m} type="button" size="sm" variant={f.method === m ? "default" : "outline"} onClick={() => setF(p => ({ ...p, method: m }))}>{m === "delivery" ? "Delivery" : "Pickup"}</Button>)}</div>
      {f.method === "delivery" ? <DeliveryFields addressLabel="Delivery address *" address={f.location} onAddress={v => set("location", v)} value={delivery} onChange={setDelivery} /> : <p className="text-sm text-muted-foreground">The client collects from the venue during the pickup window.</p>}
    </Step>
    <Step n="04" title="Coordinator" sub="Optional. Printed on the event order as the event's coordinator, and their number as the onsite contact.">
       <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{staff.map(s => <button key={s.id} type="button" onClick={() => setCoordId(coordId === s.id ? "" : s.id)} className={cn("rounded-md border p-3 text-left text-sm", coordId === s.id ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40")}><p className="font-medium">{s.name}</p><p className="text-xs text-muted-foreground">{s.job_title || "Coordinator"}{s.phone ? ` · ${s.phone}` : ""}</p></button>)}{!staff.length && <p className="text-sm text-muted-foreground">No coordinators yet. Add them under People → <Link to={`/b/${businessCode}/catering/coordinators`} className="text-primary underline">Coordinators</Link>.</p>}</div>
    </Step>
    <Step n="05" title="Catering" sub="The packages the client ordered, and the dishes they chose. Prints on the run sheet.">
      <CateringMenuEditor pkgs={pkgs} setPkgs={setPkgs} bookPackages={bookPackages} />
      <div className="mt-4 space-y-3 border-t border-border pt-4">
        <label className="flex cursor-pointer items-center gap-2 text-sm"><Checkbox checked={chafOn} onCheckedChange={v => setChafOn(!!v)} />Chafing dishes required</label>
        {chafOn && <div className="grid gap-3 sm:grid-cols-3">
          <div className="space-y-1.5"><Label className="text-xs">Number of chafing dishes</Label><Input type="number" min={0} step={1} value={chafQty} onChange={e => setChafQty(e.target.value)} /></div>
          <div className="space-y-1.5"><Label className="text-xs">Price per chafing dish ($)</Label><Input type="number" min={0} step="0.01" value={chafPrice} onChange={e => setChafPrice(e.target.value)} /></div>
          <div className="flex flex-col justify-end"><p className="rounded-md bg-muted px-3 py-2 text-sm">Chafing total <strong className="float-right">${chafTotal.toFixed(2)}</strong></p></div>
        </div>}
        <dl className="space-y-1 rounded-lg bg-muted/60 p-3 text-sm">
          <div className="flex justify-between"><dt>Menu</dt><dd>${menuTotal.toFixed(2)}</dd></div>
          {f.method === "delivery" && <div className="flex justify-between"><dt>Delivery</dt><dd>${(feeOf(delivery) ?? 0).toFixed(2)}</dd></div>}
          <div className="flex justify-between"><dt>Chafing dishes{chafCount ? ` (${chafCount} × $${chafUnit.toFixed(2)})` : ""}</dt><dd>${chafTotal.toFixed(2)}</dd></div>
          <div className="flex justify-between border-t border-border pt-1 text-base font-semibold"><dt>Total</dt><dd>${grandTotal.toFixed(2)}</dd></div>
        </dl>
      </div>
    </Step></>}
    <Step n={kind === "event" ? "04" : "06"} title="Notes" sub="Notes for the client and the team — all optional."><Textarea value={f.notes} onChange={e => set("notes", e.target.value)} /></Step>
    <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => nav(-1)}>Cancel</Button><Button disabled={!ready || saving} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{kind === "event" ? "Save event" : "Create booking"}</Button></div>
  </div>
  <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start"><Card><CardContent className="space-y-3 p-5">
     <div className="flex items-center justify-between"><p className="font-serif text-xl">{kind === "catering" ? "Catering summary" : "Event summary"}</p><span className="text-xs text-primary">Live</span></div>
    <Sum l="Reference" v="" empty="Assigned on save" /><Sum l="Customer" v={custName} empty="Not chosen yet" /><Sum l="Event" v={f.event_name && `${f.event_name}${f.date ? ` · ${f.date} · ${kind === "catering" ? (f.method === "pickup" ? "pickup " : "delivery ") : ""}${to12(f.start)}–${to12(f.end)}` : ""}`} empty="Not named yet" />
    <Sum l={kind === "event" ? "Venue" : f.method === "pickup" ? "Pickup" : "Delivery to"} v={kind === "event" ? venue?.name : f.method === "pickup" ? "Client collects" : f.location} empty="Not entered yet" /><Sum l="Guests" v={total ? `${f.adults || 0} adults · ${f.kids || 0} children` : ""} empty="Not set yet" />
    {kind === "catering" && <><Sum l="Coordinator" v={coord?.name} empty="None" /><Sum l="Catering" v={pkgs.map(p => p.name).join(", ")} empty="No catering added" /></>}
    <Sum l="Notes" v={f.notes} empty="No notes added" />
  </CardContent></Card>
  <Card><CardContent className="space-y-2 p-5"><div className="flex justify-between"><p className="font-medium">Before you create</p><span className="text-xs text-muted-foreground">{checks.filter(c => c[1]).length} of {checks.length}</span></div>
    {checks.map(([l, ok]) => <p key={l} className="flex justify-between text-sm"><span>{l}</span><span className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "done" : "not yet"}</span></p>)}</CardContent></Card></aside>
  </div>;
}
