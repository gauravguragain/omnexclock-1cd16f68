import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, isToday } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Plus, Search } from "lucide-react";
import { useCrmData } from "@/features/sales/useCrmData";
import { prettyCrmValue } from "@/features/sales/types";
import { useEventsData, bookingEnd, to12 } from "./useEventsData";

export default function EventsList({ kind }: { kind: "event" | "catering" }) {
  const crm = useCrmData(); const ev = useEventsData(); const { businessCode } = useParams(); const nav = useNavigate();
  const listBase = kind === "catering" ? `/b/${businessCode}/catering/bookings` : `/b/${businessCode}/events/events`;
   const [tab, setTab] = useState("upcoming"); const [search, setSearch] = useState("");
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

  const rowsFor = (list: any[]) => list.map(b => <tr key={b.id} className="cursor-pointer border-t border-border hover:bg-muted/30" onClick={e => { if (!(e.target as HTMLElement).closest("button")) nav(`${listBase}/${b.id}`); }}>
    <td className="p-3"><Button variant="link" className="h-auto p-0 text-left font-medium" onClick={() => nav(`${listBase}/${b.id}`)}>{b.event_name || customer(b)}</Button><p className="text-xs text-muted-foreground">{kind === "catering" ? (b.fulfilment_method === "pickup" ? "Pickup" : "Delivery") : prettyCrmValue(b.event_type || "event")}</p></td>
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
      <div><p className="text-xs font-medium uppercase tracking-widest text-primary">{kind === "event" ? "Events" : "Catering"}</p><h1 className="font-serif text-3xl font-semibold">{kind === "event" ? "Events" : "Catering bookings"}</h1><p className="text-sm text-muted-foreground">{kind === "event" ? "Every function the venue has agreed to host, soonest first." : "Delivery and pickup orders, soonest first."}</p></div>
      {kind === "catering" ? <Button asChild><Link to={`${listBase}/new`}><Plus className="mr-2 h-4 w-4" />New catering booking</Link></Button> : <Button asChild><Link to={`/b/${businessCode}/events/leads/events`}><Plus className="mr-2 h-4 w-4" />Start with a lead</Link></Button>}
    </div>
    <div className="flex flex-wrap items-center gap-2">{["upcoming", "past", "cancelled", "all"].map(t => <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} className="capitalize" onClick={() => setTab(t)}>{t} ({t === "all" ? mine.length : mine.filter(b => bucket(b) === t).length})</Button>)}
      <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="Search name, customer, reference or hall" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
    <div className="grid gap-3 md:hidden">{shown.map(b => <section key={b.id} className="min-w-0 rounded-md border border-border p-4">
      <div className="flex items-start justify-between gap-3"><Button variant="link" className="h-auto min-w-0 justify-start whitespace-normal p-0 text-left text-base font-semibold" onClick={() => nav(`${listBase}/${b.id}`)}>{b.event_name || customer(b)}</Button><Badge variant={bucket(b) === "cancelled" ? "destructive" : "outline"} className="shrink-0">{isToday(new Date(`${b.event_date}T00:00:00`)) && bucket(b) !== "cancelled" ? "Today" : prettyCrmValue(bucket(b))}</Badge></div>
      <p className="mt-1 text-sm text-muted-foreground">{format(new Date(`${b.event_date}T00:00:00`), "EEE, dd MMM yyyy")} · {to12(String(b.start_time).slice(0, 5))} – {to12(bookingEnd(b))}</p>
      <dl className="mt-3 grid grid-cols-2 gap-2 text-sm"><div className="min-w-0"><dt className="text-xs text-muted-foreground">{kind === "event" ? "Venue" : "Location"}</dt><dd className="break-words">{kind === "event" ? b.venue_space : b.service_location || "—"}</dd></div><div className="min-w-0"><dt className="text-xs text-muted-foreground">Customer</dt><dd className="break-words">{customer(b)}</dd></div><div><dt className="text-xs text-muted-foreground">Guests</dt><dd>{b.adults ?? b.guest_count}{b.kids ? ` + ${b.kids} kids` : ""}</dd></div><div><dt className="text-xs text-muted-foreground">Event order</dt><dd>{b.event_order_number || "—"}</dd></div></dl>
      <div className="mt-3 flex justify-between border-t border-border pt-2"><Button size="sm" variant="outline" onClick={() => nav(`${listBase}/${b.id}`)}>{kind === "catering" ? "View booking" : "View event"}</Button>{b.status === "cancelled" ? <Button size="sm" variant="ghost" onClick={() => setStatus(b, "confirmed")}>Restore</Button> : <Button size="sm" variant="ghost" onClick={() => confirm("Cancel this booking?") && setStatus(b, "cancelled")}>Cancel</Button>}</div>
    </section>)}{!shown.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing here.</p>}</div>
    <div className="hidden overflow-x-auto rounded-md border md:block"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr>{["Event", "Date", "Time", kind === "event" ? "Venue" : "Location", "Customer", "Guests", "Status", "Event order", ""].map(h => <th key={h} className="p-3">{h}</th>)}</tr></thead>
      <tbody>{todays.length > 0 && <tr className="bg-primary/5"><td colSpan={9} className="px-3 py-1.5 text-xs font-semibold text-primary">Today · {todays.length}</td></tr>}{rowsFor(todays)}{rowsFor(rest)}
        {!shown.length && <tr><td colSpan={9} className="p-10 text-center text-muted-foreground">Nothing here.</td></tr>}</tbody></table></div>
  </div>;
}
