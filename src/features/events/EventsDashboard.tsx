import { useState } from "react";
import { Link, useParams } from "react-router-dom";
import { addDays, addMonths, endOfMonth, endOfWeek, format, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { CalendarDays, CalendarPlus, ChevronLeft, ChevronRight, MapPin, Plus, UserPlus, Users, UtensilsCrossed, Building2, CalendarClock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData, bookingEnd, to12 } from "./useEventsData";

const d = (s: string) => new Date(`${s}T00:00:00`);

export default function EventsDashboard() {
  const crm = useCrmData(); const ev = useEventsData(); const { businessCode } = useParams();
  const [month, setMonth] = useState(startOfMonth(new Date()));
  if (!crm.business) return null;
  const base = `/b/${businessCode}/events`;
  const today = format(new Date(), "yyyy-MM-dd"); const in7 = format(addDays(new Date(), 7), "yyyy-MM-dd");
   const active = crm.bookings.filter(b => b.status !== "cancelled" && b.booking_kind !== "catering");
  const upcoming = active.filter(b => b.event_date >= today).sort((a, b) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time));
  const todays = upcoming.filter(b => b.event_date === today);
  const week = upcoming.filter(b => b.event_date > today && b.event_date <= in7);
  const later = upcoming.filter(b => b.event_date > in7);
  const total = upcoming.length || 1;
  const guests = (b: any) => (b.adults ?? b.guest_count ?? 0) + (b.kids || 0);
  const todayGuests = todays.reduce((s, b) => s + guests(b), 0);
  const venues = ev.venues.filter(v => v.is_active !== false);
  const usedSpaces = new Set(todays.filter(b => b.venue_space).map(b => b.venue_space));
  const capacity = venues.filter(v => usedSpaces.has(v.name)).reduce((s, v) => s + (v.capacity || 0), 0);
  const thisMonth = active.filter(b => isSameMonth(d(b.event_date), new Date())).length;
  const eventDays = new Set(active.map(b => b.event_date));
  const monthCount = active.filter(b => isSameMonth(d(b.event_date), month)).length;
  const days: Date[] = []; for (let x = startOfWeek(month, { weekStartsOn: 1 }); x <= endOfWeek(endOfMonth(month), { weekStartsOn: 1 }); x = addDays(x, 1)) days.push(x);
  const util = venues.length ? Math.round((usedSpaces.size / venues.length) * 100) : 0;
  const ring = [{ n: todays.length, c: "hsl(var(--foreground))" }, { n: week.length, c: "hsl(var(--primary))" }, { n: later.length, c: "hsl(var(--destructive))" }];
  let off = 0; const C = 2 * Math.PI * 40;
  const first = todays[0];
  const cBase = `/b/${businessCode}/catering`;
  const cat = crm.bookings.filter(b => b.status !== "cancelled" && b.booking_kind === "catering");
  const cUp = cat.filter(b => b.event_date >= today).sort((a, b) => (a.event_date + a.start_time).localeCompare(b.event_date + b.start_time));
  const cToday = cUp.filter(b => b.event_date === today);
  const cWeek = cUp.filter(b => b.event_date > today && b.event_date <= in7);
  const cLeads = crm.leads.filter((l: any) => (l.lead_kind === "catering" || l.event_type === "catering") && !["cold", "lost", "declined", "full_payment_received"].includes(l.status));

  const Stat = ({ title, sub, value, unit, icon: Icon, children, link, to }: any) => <Card><CardContent className="flex h-full flex-col p-5">
    <div className="flex items-start justify-between"><div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{sub}</p></div><span className="rounded-full bg-primary/15 p-2 text-primary"><Icon className="h-4 w-4" /></span></div>
    <p className="mt-4 text-3xl font-semibold">{value}</p><p className="text-xs text-muted-foreground">{unit}</p>
    <div className="mt-3 flex-1 text-xs text-muted-foreground">{children}</div>
    <Link to={to} className="mt-3 flex items-center justify-between border-t border-border pt-3 text-sm hover:text-primary">{link}<ChevronRight className="h-4 w-4" /></Link>
  </CardContent></Card>;

  return <div className="space-y-6">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-serif text-3xl font-semibold">Welcome back</h1><p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{format(new Date(), "EEEE, d MMMM yyyy")}</span> · Venue events below, catering further down.</p></div>
      <Button asChild><Link to={`${base}/leads/events`}><UserPlus className="mr-2 h-4 w-4" />New lead</Link></Button>
    </div>

     <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <Card><CardContent className="p-6">
        <div className="flex items-start justify-between"><div><p className="text-lg font-semibold">Event load</p><p className="text-xs text-muted-foreground">How the work is spread</p></div><span className="rounded-full border border-border px-3 py-1 text-xs">{upcoming.length} upcoming events</span></div>
        <div className="mt-6 flex flex-col items-center gap-8 sm:flex-row">
          <div className="relative h-40 w-40 shrink-0"><svg viewBox="0 0 100 100" className="-rotate-90"><circle cx="50" cy="50" r="40" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            {ring.map((r, i) => { const len = (r.n / total) * C; const el = <circle key={i} cx="50" cy="50" r="40" fill="none" stroke={r.c} strokeWidth="8" strokeDasharray={`${len} ${C - len}`} strokeDashoffset={-off} />; off += len; return el; })}</svg>
            <div className="absolute inset-0 flex flex-col items-center justify-center"><span className="text-3xl font-semibold">{upcoming.length}</span><span className="text-xs text-muted-foreground">Upcoming events</span></div></div>
          <div className="w-full space-y-4">{[["Today", todays.length, ring[0].c], ["Next 7 days", week.length, ring[1].c], ["Further out", later.length, ring[2].c]].map(([l, n, c]: any) => <div key={l}>
            <div className="flex items-baseline justify-between text-sm"><span><span className="mr-2 text-2xl font-semibold">{n}</span><span className="text-muted-foreground">{l}</span></span><span className="text-xs">{Math.round((n / total) * 100)}%</span></div>
            <div className="mt-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${(n / total) * 100}%`, background: c }} /></div></div>)}</div>
        </div>
      </CardContent></Card>

      <Card className="border-primary/40 bg-card"><CardContent className="p-6">
        <p className="text-xl font-semibold">{format(month, "MMMM yyyy")}</p><p className="text-xs text-muted-foreground">{monthCount} events this month</p>
        <div className="mt-3 flex gap-2"><Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button><Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button><Button size="sm" variant="secondary" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button></div>
        <div className="mt-4 grid grid-cols-7 gap-y-1 text-center text-sm">{["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(x => <span key={x} className="text-[10px] uppercase tracking-wider text-muted-foreground">{x}</span>)}
          {days.map(x => { const k = format(x, "yyyy-MM-dd"); return <span key={k} className={`relative mx-auto flex h-8 w-8 items-center justify-center rounded-full ${k === today ? "bg-primary text-primary-foreground font-semibold" : isSameMonth(x, month) ? "" : "text-muted-foreground/50"}`}>{format(x, "d")}{eventDays.has(k) && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-primary ring-1 ring-card" />}</span>; })}</div>
        <div className="mt-3 flex justify-between text-xs"><span className="text-muted-foreground">• Event day</span><Link to={`${base}/calendar`} className="text-primary">View full calendar ›</Link></div>
      </CardContent></Card>
    </div>

     <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat title="Events today" sub={format(new Date(), "EEE d MMM")} value={todays.length} unit="events scheduled" icon={CalendarDays} link="View today's events" to={`${base}/events`}>{first ? `${to12(String(first.start_time).slice(0, 5))} – ${to12(bookingEnd(first))} · ${first.event_name || first.venue_space}` : "Nothing on today"}</Stat>
        <Stat title="Guests expected" sub="Across today's events" value={todayGuests} unit="guests expected" icon={Users} link="View events" to={`${base}/events`}>{todays.slice(0, 2).map(b => <p key={b.id} className="truncate">{b.event_name || b.venue_space} · {guests(b)}</p>)}</Stat>
        <Stat title="Spaces in use" sub="Today" value={usedSpaces.size} unit="venues / spaces" icon={MapPin} link="View spaces" to={`${base}/spaces`}>
          <div className="mb-1 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${capacity ? Math.min(100, (todayGuests / capacity) * 100) : 0}%` }} /></div>{capacity ? `${todayGuests} of ${capacity} seats · ${Math.round((todayGuests / capacity) * 100)}% capacity used` : "Add hall capacities to see usage"}</Stat>
        <Stat title="Events next 7 days" sub={`${later.length} further out`} value={week.length} unit="upcoming events" icon={CalendarClock} link="Open calendar" to={`${base}/calendar`}>{week.length ? `Next: ${week[0].event_name || week[0].venue_space} on ${format(d(week[0].event_date), "d MMM")}` : "Nothing booked in the next seven days"}</Stat>
      </div>
      <Card><CardContent className="p-6">
        <div className="flex items-start justify-between"><div className="border-l-2 border-primary pl-3"><p className="font-semibold">Upcoming events</p><p className="text-xs text-muted-foreground">The next seven days</p></div><Link to={`${base}/events`} className="text-xs text-muted-foreground hover:text-primary">View all ›</Link></div>
         <div className="mt-4 space-y-2">{[...todays, ...week].slice(0, 6).map(b => <div key={b.id} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 sm:gap-4">
          <div className="text-center"><p className="text-lg font-semibold leading-none">{format(d(b.event_date), "dd")}</p><p className="text-[10px] uppercase text-muted-foreground">{format(d(b.event_date), "MMM")}</p></div>
           <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.event_name || crm.leads.find(l => l.id === b.lead_id)?.full_name || "Event"}</p><p className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground"><span className="flex min-w-0 items-center gap-1"><MapPin className="h-3 w-3 shrink-0" /><span className="truncate">{b.venue_space || b.service_location || "—"}</span></span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{guests(b)} guests</span></p></div>
          {b.event_date === today && <span className="rounded bg-primary/15 px-2 py-0.5 text-xs text-primary">Today</span>}
        </div>)}{!todays.length && !week.length && <p className="py-8 text-center text-sm text-muted-foreground">Nothing booked in the next seven days</p>}</div>
      </CardContent></Card>
    </div>

     <div className="grid gap-4 lg:grid-cols-2">
      <Card><CardContent className="p-6">
        <p className="font-semibold">Venue at a glance</p><p className="text-xs text-muted-foreground">Standing figures</p>
        <p className="mt-4 text-sm">Utilisation rate</p><p className="text-4xl font-semibold">{util}%</p>
        <div className="mt-2 h-2 rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${util}%` }} /></div>
        <div className="mt-2 flex justify-between text-sm text-muted-foreground"><span>In use <b className="text-foreground">{usedSpaces.size}</b></span><span>Active spaces <b className="text-foreground">{venues.length}</b></span></div>
         <div className="mt-5 grid grid-cols-3 divide-x divide-border">{[[active.length, "Total events", "All time"], [thisMonth, "This month", format(new Date(), "MMMM yyyy")], [ev.venues.length, "Total spaces", `${venues.length} active`]].map(([n, l, s]: any) => <div key={l} className="min-w-0 px-2 first:pl-0 sm:px-3"><p className="text-2xl font-semibold sm:text-3xl">{n}</p><p className="text-xs sm:text-sm">{l}</p><p className="break-words text-xs text-muted-foreground">{s}</p></div>)}</div>
      </CardContent></Card>
      <Card><CardContent className="p-6">
        <p className="font-semibold">Quick actions</p><p className="text-xs text-muted-foreground">Where a shift usually starts</p>
         <div className="mt-4 grid gap-3 sm:grid-cols-2">{[[UserPlus, "New lead", "Start the event workflow", `${base}/leads/events`], [Plus, "Add space", "Create or manage venue spaces", `${base}/spaces`], [CalendarPlus, "View calendar", "All events in calendar view", `${base}/calendar`], [UtensilsCrossed, "Menu books", "Menus and packages", `${base}/menu-books`]].map(([I, t, s, to]: any) => <Link key={t} to={to} className="flex items-center gap-3 rounded-lg border border-border p-3 hover:border-primary">
          <span className="rounded-full bg-primary/15 p-2 text-primary"><I className="h-4 w-4" /></span><div className="flex-1"><p className="text-sm font-medium">{t}</p><p className="text-xs text-muted-foreground">{s}</p></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div>
      </CardContent></Card>
    </div>
    <div className="space-y-4 border-t border-border pt-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between"><div><h2 className="font-serif text-2xl font-semibold">Catering</h2><p className="text-sm text-muted-foreground">Deliveries and pickups, kept separate from venue events.</p></div>
        <Button asChild variant="outline"><Link to={`${cBase}/leads`}><UserPlus className="mr-2 h-4 w-4" />New catering lead</Link></Button></div>
      <div className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <div className="grid gap-4 sm:grid-cols-2">
          <Stat title="Catering today" sub={format(new Date(), "EEE d MMM")} value={cToday.length} unit="jobs scheduled" icon={UtensilsCrossed} link="View catering bookings" to={`${cBase}/bookings`}>{cToday[0] ? `${to12(String(cToday[0].start_time).slice(0, 5))} · ${cToday[0].event_name || "Catering"}` : "Nothing on today"}</Stat>
          <Stat title="Catering next 7 days" sub={`${cUp.length} upcoming in total`} value={cWeek.length} unit="upcoming jobs" icon={CalendarClock} link="View catering bookings" to={`${cBase}/bookings`}>{cWeek[0] ? `Next: ${cWeek[0].event_name || "Catering"} on ${format(d(cWeek[0].event_date), "d MMM")}` : "Nothing booked in the next seven days"}</Stat>
          <Stat title="Open catering leads" sub="Not yet confirmed" value={cLeads.length} unit="leads" icon={UserPlus} link="View catering leads" to={`${cBase}/leads`}>{cLeads.slice(0, 2).map((l: any) => <p key={l.id} className="truncate">{l.full_name}</p>)}</Stat>
          <Stat title="Catering this month" sub={format(new Date(), "MMMM yyyy")} value={cat.filter(b => isSameMonth(d(b.event_date), new Date())).length} unit="jobs" icon={CalendarDays} link="View catering bookings" to={`${cBase}/bookings`}>{cat.length} catering jobs all time</Stat>
        </div>
        <Card><CardContent className="p-6">
          <div className="flex items-start justify-between"><div className="border-l-2 border-primary pl-3"><p className="font-semibold">Upcoming catering</p><p className="text-xs text-muted-foreground">The next seven days</p></div><Link to={`${cBase}/bookings`} className="text-xs text-muted-foreground hover:text-primary">View all ›</Link></div>
          <div className="mt-4 space-y-2">{[...cToday, ...cWeek].slice(0, 6).map(b => <Link key={b.id} to={`${cBase}/bookings/${b.id}`} className="flex min-w-0 items-center gap-3 rounded-lg border border-border p-3 hover:border-primary sm:gap-4">
            <div className="text-center"><p className="text-lg font-semibold leading-none">{format(d(b.event_date), "dd")}</p><p className="text-[10px] uppercase text-muted-foreground">{format(d(b.event_date), "MMM")}</p></div>
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{b.event_name || crm.leads.find(l => l.id === b.lead_id)?.full_name || "Catering"}</p><p className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{to12(String(b.start_time).slice(0, 5))}</span><span className="flex items-center gap-1"><Users className="h-3 w-3" />{guests(b)} guests</span></p></div>
          </Link>)}{!cToday.length && !cWeek.length && <p className="py-8 text-center text-sm text-muted-foreground">No catering in the next seven days</p>}</div>
        </CardContent></Card>
      </div>
    </div>
  </div>;
}
