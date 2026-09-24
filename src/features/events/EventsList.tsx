import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useCrmData } from "@/features/sales/useCrmData";
import LeadDetailDialog from "@/features/sales/LeadDetailDialog";
import { prettyCrmValue, type CrmLead } from "@/features/sales/types";
import { useEventsData, bookingEnd, to12 } from "./useEventsData";

export default function EventsList({ kind }: { kind: "event" | "catering" }) {
  const crm = useCrmData(); const ev = useEventsData(); const { businessCode } = useParams();
  const [tab, setTab] = useState("upcoming"); const [search, setSearch] = useState(""); const [detail, setDetail] = useState<CrmLead | null>(null);
  if (!crm.business) return null;
  const today = format(new Date(), "yyyy-MM-dd");
  const mine = crm.bookings.filter(b => (b.booking_kind || "event") === kind);
  const bucket = (b: any) => b.status === "cancelled" ? "cancelled" : b.event_date < today ? "past" : "upcoming";
  const customer = (b: any) => ev.customers.find(c => c.id === b.customer_id)?.full_name || crm.leads.find(l => l.id === b.lead_id)?.full_name || "—";
  const shown = mine.filter(b => (tab === "all" || bucket(b) === tab) && `${b.event_name || ""} ${customer(b)} ${b.event_order_number || ""} ${b.venue_space} ${b.service_location || ""}`.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => tab === "past" ? b.event_date.localeCompare(a.event_date) : a.event_date.localeCompare(b.event_date));
  const todays = shown.filter(b => isToday(new Date(`${b.event_date}T00:00:00`)));
  const rest = shown.filter(b => !todays.includes(b));
  const setStatus = async (b: any, status: string) => { const { error } = await supabase.from("crm_bookings").update({ status }).eq("id", b.id); if (error) toast.error(error.message); else crm.refresh(); };

  const rowsFor = (list: any[]) => list.map(b => <tr key={b.id} className="border-t border-border hover:bg-muted/30">
    <td className="p-3"><button className="text-left font-medium hover:text-primary" onClick={() => setDetail(crm.leads.find(l => l.id === b.lead_id) || null)}>{b.event_name || customer(b)}</button><p className="text-xs text-muted-foreground">{prettyCrmValue(b.event_type || "event")}</p></td>
    <td className="p-3">{format(new Date(`${b.event_date}T00:00:00`), "dd MMM")}<p className="text-xs text-muted-foreground">{format(new Date(`${b.event_date}T00:00:00`), "EEE")}</p></td>
    <td className="p-3 whitespace-nowrap">{to12(String(b.start_time).slice(0, 5))} – {to12(bookingEnd(b))}</td>
    <td className="p-3">{kind === "event" ? b.venue_space : b.service_location || "—"}</td>
    <td className="p-3">{customer(b)}</td>
    <td className="p-3">{b.adults ?? b.guest_count}<p className="text-xs text-muted-foreground">{b.kids ? `${b.kids} kids` : "No kids"}</p></td>
    <td className="p-3"><Badge variant={bucket(b) === "cancelled" ? "destructive" : "outline"}>{isToday(new Date(`${b.event_date}T00:00:00`)) && bucket(b) !== "cancelled" ? "Today" : prettyCrmValue(bucket(b))}</Badge></td>
    <td className="p-3 font-mono text-xs">{b.event_order_number || "—"}</td>
    <td className="p-3 text-right">{b.status === "cancelled" ? <Button size="sm" variant="ghost" onClick={() => setStatus(b, "confirmed")}>Restore</Button> : <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this booking?") && setStatus(b, "cancelled")}>Cancel</Button>}</td>
  </tr>);

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-widest text-primary">Events</p><h1 className="font-serif text-3xl font-semibold">{kind === "event" ? "Events" : "Catering bookings"}</h1><p className="text-sm text-muted-foreground">{kind === "event" ? "Every function the venue has agreed to host, soonest first." : "Catering jobs with no hall hire, soonest first."}</p></div>
      <Button asChild><Link to={`/b/${businessCode}/events/${kind === "event" ? "events" : "catering-bookings"}/new`}><Plus className="mr-2 h-4 w-4" />{kind === "event" ? "Create event" : "New catering booking"}</Link></Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">{["upcoming", "past", "cancelled", "all"].map(t => <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} className="capitalize" onClick={() => setTab(t)}>{t} ({t === "all" ? mine.length : mine.filter(b => bucket(b) === t).length})</Button>)}
      <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="Search name, customer, reference or hall" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
    <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{["Event", "Date", "Time", kind === "event" ? "Venue" : "Location", "Customer", "Guests", "Status", "Event order", ""].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
      <tbody>{todays.length > 0 && <tr className="bg-primary/5"><td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-primary">Today · {todays.length}</td></tr>}{rowsFor(todays)}{rowsFor(rest)}
        {!shown.length && <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">Nothing here.</td></tr>}</tbody></table></div>
    <LeadDetailDialog lead={detail} open={!!detail} onOpenChange={o => !o && setDetail(null)} options={crm.options} interactions={crm.interactions} inspections={crm.inspections} tasks={crm.tasks} menuItems={crm.menuItems} booking={crm.bookings.find(b => b.lead_id === detail?.id)} businessName={crm.business.name} onSaved={crm.refresh} />
  </div>;
}
