import { useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Mail, MapPin, Pencil, Phone, Tag, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { prettyCrmValue, type CrmLead } from "@/features/sales/types";
import { bookingEnd, to12 } from "./useEventsData";

type Booking = Record<string, any>;
type CalendarProps = {
  bookings: Booking[];
  leads: CrmLead[];
  customers: Booking[];
  venues: Booking[];
  onView: (booking: Booking) => void;
  onEdit: (booking: Booking) => void;
};

const TONES = [
  "bg-primary/15 text-primary",
  "bg-secondary text-secondary-foreground",
  "bg-accent text-accent-foreground",
  "bg-muted text-foreground",
  "bg-destructive/15 text-destructive",
];

export default function MonthCalendar({ bookings, leads, customers, venues, onView, onEdit }: CalendarProps) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [types, setTypes] = useState<string[] | null>(null);
  const active = bookings.filter(b => b.status !== "cancelled" && b.event_date);
  const leadOf = (b: Booking) => leads.find(l => l.id === b.lead_id);
  const customerOf = (b: Booking) => customers.find(c => c.id === b.customer_id) || leadOf(b);
  const nameOf = (b: Booking) => b.event_name || leadOf(b)?.full_name || "Event";
  const typeOf = (b: Booking) => b.event_type || leadOf(b)?.event_type || "no_type";
  const placeOf = (b: Booking) => venues.find(v => v.id === b.venue_space_id || v.name === b.venue_space)?.name || b.venue_space || b.service_location || "No venue selected";
  const allTypes = Array.from(new Set(active.map(typeOf)));
  const tone = (type: string) => TONES[Math.max(0, allTypes.indexOf(type)) % TONES.length];
  const filtered = active.filter(b => !types || types.includes(typeOf(b)));
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const eventsOn = (date: string) => filtered.filter(b => b.event_date === date).sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
  const selected = selectedDate ? eventsOn(selectedDate) : [];
  const groups = Array.from(new Set(selected.map(placeOf)));
  const guestCount = (b: Booking) => Number(b.adults ?? b.guest_count ?? 0) + Number(b.kids ?? 0);
  const dateCount = filtered.filter(b => String(b.event_date).startsWith(format(month, "yyyy-MM"))).length;

  return <>
    <div className="overflow-hidden rounded-md border border-border bg-card">
      <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <Button size="icon" variant="ghost" aria-label="Previous month" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button>
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"><CalendarDays className="h-4 w-4" /></span>
          <Popover><PopoverTrigger asChild><Button variant="ghost" className="h-9 px-1 text-base font-semibold sm:text-lg" aria-label={`${format(month, "MMMM yyyy")} — change month`}>{format(month, "MMMM yyyy")}</Button></PopoverTrigger>
            <PopoverContent className="w-auto"><label className="space-y-2 text-sm"><span className="font-medium">Go to month</span><input type="month" aria-label="Go to month" value={format(month, "yyyy-MM")} onChange={e => { if (e.target.value) setMonth(new Date(`${e.target.value}-01T00:00:00`)); }} className="block h-10 rounded-md border border-input bg-background px-3 text-foreground" /></label></PopoverContent>
          </Popover>
          <Button size="icon" variant="ghost" aria-label="Next month" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-2">
          <Popover><PopoverTrigger asChild><Button size="sm" variant="outline" className="sm:hidden">Categories</Button></PopoverTrigger><PopoverContent align="end" className="w-52 space-y-3">{allTypes.map(t => <label key={t} className="flex items-center gap-2 text-sm"><Checkbox checked={!types || types.includes(t)} onCheckedChange={checked => setTypes(current => checked ? [...(current || []), t] : (current || allTypes).filter(x => x !== t))} />{t === "no_type" ? "No type" : prettyCrmValue(t)}</label>)}</PopoverContent></Popover>
          <div className="hidden flex-wrap gap-3 sm:flex">{allTypes.map(t => <label key={t} className="flex cursor-pointer items-center gap-1.5 text-xs text-muted-foreground"><Checkbox checked={!types || types.includes(t)} onCheckedChange={checked => setTypes(current => checked ? [...(current || []), t] : (current || allTypes).filter(x => x !== t))} className="h-3.5 w-3.5" /><span className={cn("h-2 w-2 rounded-full bg-primary", tone(t))} />{t === "no_type" ? "No type" : prettyCrmValue(t)}</label>)}</div>
          <span className="whitespace-nowrap text-xs font-medium">{dateCount} {dateCount === 1 ? "event" : "events"}</span>
        </div>
      </div>
      <div className="overflow-x-auto"><div className="min-w-[700px] p-2 sm:p-3">
        <div className="mb-2 grid grid-cols-7 rounded-full bg-primary/15 py-2 text-center text-xs font-semibold text-primary">{["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-1.5">{days.map(d => {
          const key = format(d, "yyyy-MM-dd"); const list = eventsOn(key);
          return <Button key={key} variant="ghost" aria-label={`${format(d, "EEE, MMM d, yyyy")}, ${list.length} ${list.length === 1 ? "event" : "events"}`} onClick={() => list.length && setSelectedDate(key)} disabled={!list.length} className={cn("h-auto min-h-[125px] min-w-0 flex-col items-stretch justify-start gap-0 overflow-hidden rounded-md border border-border p-2 text-left hover:border-primary/60 hover:bg-primary/5 sm:min-h-[168px] xl:min-h-[205px]", !isSameMonth(d, month) && "bg-muted/25 text-muted-foreground", isToday(d) && "border-primary bg-primary/5", !list.length && "cursor-default opacity-75 disabled:opacity-75")}>
            <span className={cn("mb-2 self-start text-sm font-semibold", isToday(d) && "text-primary")}>{format(d, "d")}{isToday(d) && <span className="ml-1 text-[10px]">(today)</span>}</span>
            {list.slice(0, 3).map(b => <span key={b.id} className="mb-1 flex w-full items-center gap-1 overflow-hidden text-[11px] font-normal"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", tone(typeOf(b)))} /><span className="shrink-0 text-muted-foreground">{String(b.start_time || "").slice(0, 5)}</span><span className={cn("min-w-0 truncate rounded px-1 font-medium", tone(typeOf(b)))}>{nameOf(b)}</span></span>)}
            {list.length > 3 && <span className="text-[11px] font-semibold text-primary">+{list.length - 3} more</span>}
          </Button>;
        })}</div>
      </div></div>
    </div>

    <Dialog open={!!selectedDate} onOpenChange={open => !open && setSelectedDate(null)}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-1rem)] max-w-[480px] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border p-5 pr-12 text-left"><div className="flex items-center gap-3"><span className="rounded-md bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" /></span><div><DialogTitle className="text-base">{selectedDate ? format(new Date(`${selectedDate}T00:00:00`), "EEEE, MMMM d, yyyy") : "Events"}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{selected.length} {selected.length === 1 ? "event" : "events"}, {groups.length} {groups.length === 1 ? "venue" : "venues"}</p></div></div></DialogHeader>
        <div className="space-y-4 pb-5">{groups.map(place => <section key={place}>
          <h3 className="bg-muted/60 px-5 py-2 text-xs font-semibold uppercase text-muted-foreground">{place}</h3>
          <div className="divide-y divide-border">{selected.filter(b => placeOf(b) === place).map(b => {
            const customer = customerOf(b); const time = `${to12(String(b.start_time || "").slice(0, 5))} – ${to12(bookingEnd(b))}`;
            return <div key={b.id} className="space-y-3 px-5 py-4">
              <div className="rounded-md border border-border bg-primary/5 p-3"><p className="text-xs font-semibold">{time}</p><p className="mt-1 font-semibold">{nameOf(b)}</p><p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{guestCount(b)} guests</span></p></div>
              <dl className="divide-y divide-border text-sm">
                <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4" />Event type</dt><dd className="text-right">{prettyCrmValue(typeOf(b))}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{b.booking_kind === "catering" ? "Location" : "Venue"}</dt><dd className="text-right">{place}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Time</dt><dd className="text-right">{time}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" />Guests</dt><dd className="text-right">{guestCount(b)}{b.kids ? ` · ${b.adults ?? b.guest_count ?? 0} adults, ${b.kids} kids` : ""}</dd></div>
                <div className="flex items-center justify-between gap-3 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><UserRound className="h-4 w-4" />Organizer</dt><dd className="flex min-w-0 items-center gap-2 text-right"><span className="min-w-0 break-words">{customer?.full_name || "—"}{customer?.phone && <span className="block text-xs text-muted-foreground">{customer.phone}</span>}</span>{customer?.phone && <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0"><a href={`tel:${customer.phone}`} aria-label={`Call ${customer.full_name}`}><Phone className="h-3.5 w-3.5" /></a></Button>}{customer?.email && <Button asChild size="icon" variant="outline" className="h-8 w-8 shrink-0"><a href={`mailto:${customer.email}`} aria-label={`Email ${customer.full_name}`}><Mail className="h-3.5 w-3.5" /></a></Button>}</dd></div>
                <div className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">Notes</dt><dd className="max-w-[65%] whitespace-pre-wrap text-right">{b.notes || "No notes added"}</dd></div>
              </dl>
              <div className="flex items-center justify-between gap-2 pt-1"><Button size="sm" variant="outline" onClick={() => { setSelectedDate(null); onEdit(b); }}><Pencil className="mr-2 h-4 w-4" />Edit event</Button><Button size="sm" variant="outline" onClick={() => { setSelectedDate(null); onView(b); }}>View details <ChevronRight className="ml-2 h-4 w-4" /></Button></div>
            </div>;
          })}</div>
        </section>)}</div>
      </DialogContent>
    </Dialog>
  </>;
}