import { eventLabel } from "@/lib/eventLabel";
import { useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, ChevronLeft, ChevronRight, Clock3, Mail, MapPin, Pencil, Tag, UserRound, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { prettyCrmValue, type CrmLead } from "@/features/sales/types";
import { bookingEnd, to12 } from "./useEventsData";
import { usePayments } from "./payments";

type Booking = Record<string, any>;
type CalendarProps = {
  bookings: Booking[];
  leads: CrmLead[];
  runsheets: Booking[];
  customers: Booking[];
  venues: Booking[];
  onView: (booking: Booking) => void;
  onEdit: (booking: Booking) => void;
  readOnly?: boolean;
  paidBookingIds?: string[];
};


export default function MonthCalendar({ bookings, leads, runsheets, customers, venues, onView, onEdit, readOnly = false, paidBookingIds }: CalendarProps) {
  const [month, setMonth] = useState(startOfMonth(new Date()));
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  // Events only show once a payment (deposit or more) is recorded in Payments;
  // catering bookings always show.
  const { payments } = usePayments(paidBookingIds ? undefined : bookings[0]?.business_id);
  const paidIds = new Set(paidBookingIds ?? payments.filter(p => Number(p.amount) > 0).map(p => p.booking_id));
  const active = bookings.filter(b => {
    if (b.status === "cancelled" || !b.event_date) return false;
    if ((b.booking_kind || "event") === "catering") return true;
    return paidIds.has(b.id);
  });
  const leadOf = (b: Booking) => leads.find(l => l.id === b.lead_id);
  const customerOf = (b: Booking) => customers.find(c => c.id === b.customer_id) || leadOf(b);
  const nameOf = (b: Booking) => eventLabel(b, leadOf(b)?.full_name, leadOf(b)?.event_type);
  const typeOf = (b: Booking) => b.event_type || leadOf(b)?.event_type || "no_type";
  const placeOf = (b: Booking) => venues.find(v => v.id === b.venue_space_id || v.name === b.venue_space || v.name.toLowerCase().replace(/\s+/g, "_") === b.venue_space)?.name || (b.booking_kind === "catering" ? b.service_location : null) || (b.venue_space ? prettyCrmValue(b.venue_space) : null) || "No venue selected";
  const isCatering = (b: Booking) => b.booking_kind === "catering";
  const kindChip = (b: Booking) => isCatering(b) ? "bg-catering/15 text-catering" : "bg-primary/15 text-primary";
  const kindDot = (b: Booking) => isCatering(b) ? "bg-catering" : "bg-primary";
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const eventsOn = (date: string) => active.filter(b => b.event_date === date).sort((a, b) => String(a.start_time || "").localeCompare(String(b.start_time || "")));
  const selected = selectedDate ? eventsOn(selectedDate) : [];
  const groups = Array.from(new Set(selected.map(placeOf)));
  const guestSplit = (b: Booking) => {
    const sheet = runsheets.filter(r => r.booking_id === b.id || (b.lead_id && r.lead_id === b.lead_id)).sort((a, z) => Number(z.revision || 0) - Number(a.revision || 0))[0];
    return { adults: Number(sheet?.adult_guests ?? b.adults ?? b.guest_count ?? 0), kids: Number(sheet?.kids_guests ?? b.kids ?? 0) };
  };
  const guestCount = (b: Booking) => guestSplit(b).adults + guestSplit(b).kids;
  const dateCount = active.filter(b => String(b.event_date).startsWith(format(month, "yyyy-MM"))).length;

  const renderEventDetail = (b: Booking) => {
    const place = placeOf(b); const customer = customerOf(b); const time = `${to12(String(b.start_time || "").slice(0, 5))} – ${to12(bookingEnd(b))}`;
    return <div className="space-y-3 px-5 py-4">
      <div className="rounded-md border border-border bg-primary/5 p-3"><div className="flex items-start justify-between gap-3"><div className="min-w-0"><span className={cn("mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide", isCatering(b) ? "bg-catering/15 text-catering" : "bg-primary/15 text-primary")}>{isCatering(b) ? "Catering" : "Event"}</span><p className="text-xs font-semibold">{time}</p><p className="mt-1 font-semibold">{nameOf(b)}</p><p className="mt-1 flex items-center gap-1.5 text-sm font-medium"><UserRound className="h-3.5 w-3.5 shrink-0 text-muted-foreground" /><span className="min-w-0 break-words">{customer?.full_name || "—"}</span></p><p className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground"><span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{place}</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{guestCount(b)} guests</span></p></div>{customer?.email && <Button asChild size="icon" variant="outline" className="shrink-0"><a href={`mailto:${customer.email}`} aria-label={`Email ${customer.full_name}`}><Mail className="h-4 w-4" /></a></Button>}</div></div>
      <dl className="divide-y divide-border text-sm">
        <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><MapPin className="h-4 w-4" />{b.booking_kind === "catering" ? "Location" : "Venue"}</dt><dd className="text-right">{place}</dd></div>
        <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><Clock3 className="h-4 w-4" />Time</dt><dd className="text-right">{time}</dd></div>
        <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" />Guests</dt><dd className="text-right">{guestCount(b)}{guestSplit(b).kids ? ` · ${guestSplit(b).adults} adults, ${guestSplit(b).kids} kids` : ""}</dd></div>
        <div className="flex justify-between gap-4 py-2"><dt className="flex items-center gap-2 text-muted-foreground"><Tag className="h-4 w-4" />Event type</dt><dd className="text-right">{prettyCrmValue(typeOf(b))}</dd></div>
        <div className="flex justify-between gap-4 py-2"><dt className="text-muted-foreground">Notes</dt><dd className="max-w-[65%] whitespace-pre-wrap text-right">{b.notes || "No notes added"}</dd></div>

      </dl>
      {!readOnly && <div className="flex items-center justify-between gap-2 pt-1"><Button size="sm" variant="outline" onClick={() => { setSelectedDate(null); setSelectedBooking(null); onEdit(b); }}><Pencil className="mr-2 h-4 w-4" />Edit event</Button><Button size="sm" variant="outline" onClick={() => { setSelectedDate(null); setSelectedBooking(null); onView(b); }}>View details <ChevronRight className="ml-2 h-4 w-4" /></Button></div>}
    </div>;
  };

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
          <span className="whitespace-nowrap text-xs font-semibold">{dateCount}</span>
          <span className="flex items-center gap-1.5 whitespace-nowrap text-xs text-muted-foreground"><span className="h-2 w-2 rounded-full bg-primary" />Events<span className="ml-2 h-2 w-2 rounded-full bg-catering" />Catering</span>
        </div>
      </div>
      <div className="p-2 sm:p-3">
        <div className="mb-2 grid grid-cols-7 rounded-full bg-primary/15 py-2 text-center text-xs font-semibold text-primary">{["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(day => <span key={day}>{day}</span>)}</div>
        <div className="grid grid-cols-7 gap-1 sm:gap-1.5">{days.map(d => {
          const key = format(d, "yyyy-MM-dd"); const list = eventsOn(key);
          return <Button key={key} variant="ghost" aria-label={`${format(d, "EEE, MMM d, yyyy")}, ${list.length} ${list.length === 1 ? "event" : "events"}`} onClick={() => list.length && setSelectedDate(key)} disabled={!list.length} className={cn("h-auto min-h-[76px] min-w-0 flex-col items-stretch justify-start gap-0 overflow-hidden rounded-md border border-border p-1 text-left hover:border-primary/60 hover:bg-primary/5 sm:min-h-[168px] sm:p-2 xl:min-h-[205px]", !isSameMonth(d, month) && "bg-muted/25 text-muted-foreground", isToday(d) && "border-primary bg-primary/5", !list.length && "cursor-default opacity-75 disabled:opacity-75")}>
            <span className={cn("mb-1 self-start text-xs font-semibold sm:mb-2 sm:text-sm", isToday(d) && "text-primary")}>{format(d, "d")}{isToday(d) && <span className="hidden text-[10px] sm:ml-1 sm:inline">(today)</span>}</span>
            {list.slice(0, 3).map(b => <span key={b.id} role="button" tabIndex={-1} aria-label={`View ${nameOf(b)}`} onClick={e => { e.stopPropagation(); setSelectedBooking(b); }} onKeyDown={e => { if (e.key === "Enter") { e.stopPropagation(); setSelectedBooking(b); } }} className="pointer-events-none mb-1 flex w-full cursor-pointer items-center gap-1 overflow-hidden rounded text-[11px] font-normal hover:bg-primary/10 sm:pointer-events-auto"><span className={cn("h-1.5 w-1.5 shrink-0 rounded-full", kindDot(b))} /><span className="hidden shrink-0 text-muted-foreground sm:inline">{String(b.start_time || "").slice(0, 5)}</span><span className={cn("hidden min-w-0 truncate rounded px-1 font-medium sm:inline", kindChip(b))}>{nameOf(b)}</span></span>)}
            {list.length > 3 && <span className="text-[10px] font-semibold text-primary">+{list.length - 3}</span>}
          </Button>;
        })}</div>
      </div>
    </div>

    <Dialog open={!!selectedDate} onOpenChange={open => !open && setSelectedDate(null)}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-1rem)] max-w-[480px] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border p-5 pr-12 text-left"><div className="flex items-center gap-3"><span className="rounded-md bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" /></span><div><DialogTitle className="text-base">{selectedDate ? format(new Date(`${selectedDate}T00:00:00`), "EEEE, MMMM d, yyyy") : "Events"}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{selected.length} {selected.length === 1 ? "event" : "events"}, {groups.length} {groups.length === 1 ? "venue" : "venues"}</p></div></div></DialogHeader>
        {/* Mobile: swipe sideways through the day's events as cards */}
        <div className="flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-5 pt-4 sm:hidden" style={{ WebkitOverflowScrolling: "touch" }}>
          {selected.map(b => <div key={b.id} className="w-[82vw] max-w-[320px] shrink-0 snap-center overflow-hidden rounded-lg border border-border bg-card shadow-sm">{renderEventDetail(b)}</div>)}
        </div>
        {/* Desktop: grouped vertical list */}
        <div className="hidden space-y-4 pb-5 sm:block">{groups.map(place => <section key={place}>
          <h3 className="bg-muted/60 px-5 py-2 text-xs font-semibold uppercase text-muted-foreground">{place}</h3>
          <div className="divide-y divide-border">{selected.filter(b => placeOf(b) === place).map(b => <div key={b.id}>{renderEventDetail(b)}</div>)}</div>
        </section>)}</div>
      </DialogContent>
    </Dialog>

    <Dialog open={!!selectedBooking} onOpenChange={open => !open && setSelectedBooking(null)}>
      <DialogContent className="max-h-[88dvh] w-[calc(100vw-1rem)] max-w-[480px] overflow-y-auto p-0">
        <DialogHeader className="border-b border-border p-5 pr-12 text-left"><div className="flex items-center gap-3"><span className="rounded-md bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" /></span><div><DialogTitle className="text-base">{selectedBooking ? nameOf(selectedBooking) : "Event"}</DialogTitle><p className="mt-1 text-xs text-muted-foreground">{selectedBooking?.event_date ? format(new Date(`${selectedBooking.event_date}T00:00:00`), "EEEE, MMMM d, yyyy") : ""}</p></div></div></DialogHeader>
        <div className="pb-5">{selectedBooking && renderEventDetail(selectedBooking)}</div>
      </DialogContent>
    </Dialog>
  </>;
}