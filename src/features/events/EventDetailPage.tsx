import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format, isToday } from "date-fns";
import { toast } from "sonner";
import { CalendarDays, ChevronRight, Clock, ClipboardList, FileText, ListChecks, MapPin, Pencil, User, Users, UtensilsCrossed, X, RotateCcw, History } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { useCrmData } from "@/features/sales/useCrmData";
import LeadDetailDialog from "@/features/sales/LeadDetailDialog";
import { prettyCrmValue } from "@/features/sales/types";
import { useEventsData, bookingEnd, minutesBetween, to12 } from "./useEventsData";

const Section = ({ icon: Icon, title, action, children }: any) => <Card><CardContent className="p-6">
  <div className="mb-4 flex items-center justify-between gap-2"><p className="flex items-center gap-2 text-lg font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</p>{action}</div>{children}</CardContent></Card>;
const Empty = ({ title, text }: { title: string; text: string }) => <div><p className="font-medium">{title}</p><p className="text-sm text-muted-foreground">{text}</p></div>;
const Row = ({ k, v }: { k: string; v: any }) => <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v || "—"}</span></div>;

export default function EventDetailPage({ kind }: { kind: "event" | "catering" }) {
  const { businessCode, id } = useParams(); const nav = useNavigate();
  const crm = useCrmData(); const ev = useEventsData();
  const [items, setItems] = useState<any[]>([]); const [selection, setSelection] = useState<any>(null); const [workflow, setWorkflow] = useState(false);
  const b: any = crm.bookings.find(x => x.id === id);
  useEffect(() => {
    if (!b?.menu_selection_id && !b?.lead_id) return;
    (async () => {
      const sel = b.menu_selection_id ? await supabase.from("crm_menu_selections").select("*").eq("id", b.menu_selection_id).maybeSingle()
        : await supabase.from("crm_menu_selections").select("*").eq("lead_id", b.lead_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      setSelection(sel.data);
      if (sel.data) { const r = await supabase.from("crm_menu_selection_items").select("*").eq("selection_id", sel.data.id).order("created_at"); setItems(r.data || []); }
    })();
  }, [b?.menu_selection_id, b?.lead_id]);
  if (!crm.business) return null;
  const list = `/b/${businessCode}/events/${kind === "event" ? "events" : "catering-bookings"}`;
  if (!b) return <div className="py-20 text-center text-muted-foreground">{crm.loading ? "Loading…" : <>Event not found. <Link to={list} className="text-primary">Back to list</Link></>}</div>;

  const lead: any = crm.leads.find(l => l.id === b.lead_id);
  const customer: any = ev.customers.find(c => c.id === b.customer_id) || (lead && { full_name: lead.full_name, phone: lead.phone, email: lead.email });
  const rs: any = crm.runsheets.filter((r: any) => r.booking_id === b.id || r.lead_id === b.lead_id).sort((a: any, z: any) => (z.revision || 0) - (a.revision || 0))[0];
  const venue = ev.venues.find(v => v.id === b.venue_space_id || v.name === b.venue_space);
  const start = String(b.start_time).slice(0, 5); const end = bookingEnd(b); const hrs = minutesBetween(start, end) / 60;
  const guests = (b.adults ?? b.guest_count) + (b.kids || 0);
  const date = new Date(`${b.event_date}T00:00:00`);
  const cancelled = b.status === "cancelled";
  const title = b.event_name || lead?.full_name || "Event";
  const courses = items.reduce((m: Record<string, any[]>, i) => { const c = i.course || "Other"; (m[c] ||= []).push(i); return m; }, {});
  const schedule: any[] = rs?.service_schedule || [];
  const setStatus = async (status: string) => { const { error } = await supabase.from("crm_bookings").update({ status }).eq("id", b.id); if (error) toast.error(error.message); else { toast.success(status === "cancelled" ? "Event cancelled" : "Event restored"); crm.refresh(); } };

  return <div className="space-y-6">
    <p className="flex items-center gap-1 text-sm text-muted-foreground"><Link to={list} className="hover:text-primary">{kind === "event" ? "Events" : "Catering bookings"}</Link><ChevronRight className="h-3 w-3" /><span className="text-foreground">View event</span></p>
    <div className="flex flex-col gap-4 border-b border-border pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="border-l-2 border-primary pl-4"><p className="text-xs font-medium uppercase tracking-widest text-primary">{kind === "event" ? "Events" : "Catering"}</p>
        <h1 className="flex items-center gap-3 font-serif text-3xl font-semibold">{title}<Badge variant={cancelled ? "destructive" : "secondary"}>{cancelled ? "Cancelled" : "Live"}</Badge></h1>
        <p className="text-sm text-muted-foreground">Event Order {b.event_order_number || "—"} · {prettyCrmValue(b.event_type || lead?.event_type || "event")}</p></div>
      <div className="flex flex-wrap gap-2">{lead && <><Button variant="outline" onClick={() => setWorkflow(true)}><FileText className="mr-2 h-4 w-4" />Run sheet</Button><Button onClick={() => setWorkflow(true)}><Pencil className="mr-2 h-4 w-4" />Edit</Button></>}</div>
    </div>

    <Card><CardContent className="grid divide-y divide-border p-0 sm:grid-cols-4 sm:divide-x sm:divide-y-0">
      {[[CalendarDays, "Date", format(date, "EEEE, d MMMM yyyy"), isToday(date) ? "Today" : format(date, "EEE")], [Clock, "Time", `${to12(start)} – ${to12(end)}`, `${+hrs.toFixed(2)} hours`], [MapPin, kind === "event" ? "Venue" : "Location", kind === "event" ? b.venue_space : b.service_location || "—", venue?.capacity ? `Capacity ${venue.capacity}` : ""], [Users, "Guests", guests, `${b.adults ?? b.guest_count} adults · ${b.kids || 0} kids`]].map(([I, l, v, s]: any, i) => <div key={l} className="p-5">
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground"><I className="h-3.5 w-3.5" />{l}</p><p className="mt-1 font-medium">{v}</p><p className="text-xs text-muted-foreground">{s}</p>
        {i === 3 && venue?.capacity && <div className="mt-2 h-1 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.min(100, guests / venue.capacity * 100)}%` }} /></div>}</div>)}
    </CardContent></Card>

    <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
      <div className="space-y-6">
        <Section icon={CalendarDays} title="Schedule"><p className="font-medium">{title}</p><p className="text-sm">{format(date, "EEEE, d MMMM yyyy")} · {to12(start)} – {to12(end)}</p><p className="text-xs text-muted-foreground">{b.venue_space || b.service_location} · {guests} guests</p></Section>

        <Section icon={UtensilsCrossed} title="Catering" action={<span className="text-xs text-muted-foreground">{selection?.package_name ? `${selection.package_name} · ` : ""}{items.length} items</span>}>
          {items.length ? <div className="space-y-4">{selection?.beverage_package && <div><p className="text-sm font-medium">Beverages</p><p className="text-sm text-muted-foreground">{prettyCrmValue(selection.beverage_package)}</p></div>}
            {(Object.entries(courses) as [string, any[]][]).map(([c, list]) => <div key={c}><p className="text-sm font-medium">{prettyCrmValue(c)}{list[0].service_start_time && <span className="ml-2 text-xs text-muted-foreground">{to12(String(list[0].service_start_time).slice(0, 5))}{list[0].service_end_time ? ` – ${to12(String(list[0].service_end_time).slice(0, 5))}` : ""}</span>}</p><p className="text-sm text-muted-foreground">{list.map(i => i.item_name).join(" · ")}</p></div>)}
            {(selection?.dietary_requirements || selection?.allergies) && <p className="text-xs text-muted-foreground">Dietary: {[selection.dietary_requirements, selection.allergies].filter(Boolean).join(" · ")}</p>}</div>
            : <Empty title="No menu selected yet" text="Choose the menu in the lead workflow; it prints on the run sheet." />}
        </Section>

        <Section icon={ListChecks} title="Activities">{schedule.length ? <ol className="space-y-2">{schedule.map((s, i) => <li key={i} className="flex gap-4 text-sm"><span className="w-20 shrink-0 font-medium">{to12(s.time)}</span><span>{s.label}{s.detail && <span className="text-muted-foreground"> — {s.detail}</span>}</span></li>)}</ol>
          : <Empty title="No activities yet" text="Arrivals, speeches, cake cutting — the running order prints on the run sheet. Add it in the Run sheet step." />}</Section>

        <Section icon={ClipboardList} title="Setup & additional information">{rs?.setup_items?.length || rs?.setup_notes ? <div className="space-y-2">{rs.setup_items?.length > 0 && <div className="flex flex-wrap gap-1.5">{rs.setup_items.map((s: string) => <Badge key={s} variant="outline">{s}</Badge>)}</div>}{rs.setup_notes && <p className="whitespace-pre-wrap text-sm">{rs.setup_notes}</p>}{rs.access_time && <p className="text-xs text-muted-foreground">Decor / vendor access {to12(String(rs.access_time).slice(0, 5))}</p>}</div>
          : <Empty title="No setup information recorded" text="Prints on the Event Order in the right-hand column." />}</Section>

        <Section icon={FileText} title="Notes"><div className="space-y-4">
          <div><p className="text-xs font-medium">From the client</p>{rs?.client_notes || rs?.special_requests || lead?.notes ? <p className="whitespace-pre-wrap text-sm">{rs?.client_notes || rs?.special_requests || lead?.notes}</p> : <p className="text-sm text-muted-foreground">No notes from the client</p>}</div>
          <div><p className="text-xs font-medium">Internal — never printed for the client</p>{rs?.ops_notes || b.notes ? <p className="whitespace-pre-wrap text-sm">{rs?.ops_notes || b.notes}</p> : <p className="text-sm text-muted-foreground">No internal notes</p>}</div></div></Section>
      </div>

      <div className="space-y-6">
        <Card className={cancelled ? "border-destructive/40" : "border-primary/40"}><CardContent className="space-y-3 p-6"><p className="border-l-2 border-primary pl-3 text-lg font-semibold">Status</p>
          <p className="text-sm text-muted-foreground">{cancelled ? "Cancelled. The space is free again and the event is hidden from the calendar." : "Live. Holds its space — no other event can take it — and appears on the calendar."}</p>
          {lead && <p className="text-sm">Workflow stage: <span className="font-medium text-primary">{prettyCrmValue(lead.status)}</span></p>}
          {cancelled ? <Button size="sm" variant="outline" onClick={() => setStatus("confirmed")}><RotateCcw className="mr-2 h-4 w-4" />Restore event</Button> : <Button size="sm" variant="outline" onClick={() => confirm("Cancel this event?") && setStatus("cancelled")}><X className="mr-2 h-4 w-4" />Cancel event</Button>}
        </CardContent></Card>
        <Section icon={User} title="Customer">{customer ? <><p className="mb-2 font-medium">{customer.full_name}</p><Row k="Phone" v={customer.phone} /><Row k="Email" v={customer.email} /><Row k="Address" v={customer.address} /></> : <p className="text-sm text-muted-foreground">No customer linked</p>}</Section>
        <Section icon={Users} title="Event team"><Row k="Sales person" v={rs?.sales_person && `${rs.sales_person}${rs.sales_person_phone ? ` · ${rs.sales_person_phone}` : ""}`} /><Row k="Event coordinator" v={rs?.event_coordinator && `${rs.event_coordinator}${rs.event_coordinator_phone ? ` · ${rs.event_coordinator_phone}` : ""}`} /><Row k="On-site contact" v={rs?.onsite_contact_name && `${rs.onsite_contact_name}${rs.onsite_contact_phone ? ` · ${rs.onsite_contact_phone}` : ""}`} /></Section>
        <Section icon={History} title="Record"><Row k="Event Order" v={b.event_order_number} /><Row k="Run sheet" v={rs ? `Revision ${rs.revision || 1}${rs.sent_at ? " · issued" : " · draft"}` : "Not started"} /><Row k="Created" v={format(new Date(b.created_at), "d MMM yyyy, h:mm a")} /></Section>
      </div>
    </div>
    {lead && <LeadDetailDialog lead={lead} open={workflow} onOpenChange={setWorkflow} options={crm.options} interactions={crm.interactions} inspections={crm.inspections} tasks={crm.tasks} menuItems={crm.menuItems} booking={b} businessName={crm.business.name} onSaved={crm.refresh} />}
  </div>;
}
