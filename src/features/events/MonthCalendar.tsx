import { useState } from "react";
import { addMonths, eachDayOfInterval, endOfMonth, endOfWeek, format, isSameMonth, isToday, startOfMonth, startOfWeek } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { prettyCrmValue } from "@/features/sales/types";

const TONES = ["bg-primary/20 text-primary", "bg-accent text-accent-foreground", "bg-secondary text-secondary-foreground", "bg-destructive/15 text-destructive", "bg-muted text-foreground"];

export default function MonthCalendar({ bookings, inspections, leads }: { bookings: any[]; inspections: any[]; leads: any[] }) {
  const [month, setMonth] = useState(startOfMonth(new Date())); const [types, setTypes] = useState<string[] | null>(null);
  const days = eachDayOfInterval({ start: startOfWeek(month, { weekStartsOn: 1 }), end: endOfWeek(endOfMonth(month), { weekStartsOn: 1 }) });
  const typeOf = (b: any) => b.event_type || leads.find(l => l.id === b.lead_id)?.event_type || "no_type";
  const allTypes = Array.from(new Set(bookings.map(typeOf)));
  const tone = (t: string) => TONES[Math.max(0, allTypes.indexOf(t)) % TONES.length];
  const items = [
    ...bookings.filter(b => b.status !== "cancelled" && (!types || types.includes(typeOf(b)))).map(b => ({ date: b.event_date, time: String(b.start_time).slice(0, 5), label: b.event_name || leads.find(l => l.id === b.lead_id)?.full_name || "Event", cls: tone(typeOf(b)) })),
    ...inspections.filter(i => i.starts_at && i.status !== "cancelled").map(i => ({ date: format(new Date(i.starts_at), "yyyy-MM-dd"), time: format(new Date(i.starts_at), "HH:mm"), label: `Inspection · ${leads.find(l => l.id === i.lead_id)?.full_name || ""}`, cls: "border border-dashed border-primary/50 text-muted-foreground" })),
  ];
  const monthCount = items.filter(i => i.date.startsWith(format(month, "yyyy-MM"))).length;
  return <Card><CardContent className="space-y-4 p-4">
    <div className="flex flex-wrap items-center gap-2"><Button size="sm" variant="outline" onClick={() => setMonth(startOfMonth(new Date()))}>Today</Button><Button size="icon" variant="ghost" onClick={() => setMonth(addMonths(month, -1))}><ChevronLeft className="h-4 w-4" /></Button><h2 className="min-w-40 text-center font-serif text-xl">{format(month, "MMMM yyyy")}</h2><Button size="icon" variant="ghost" onClick={() => setMonth(addMonths(month, 1))}><ChevronRight className="h-4 w-4" /></Button><span className="text-xs text-muted-foreground">{monthCount} entries</span>
      <div className="ml-auto flex flex-wrap gap-1">{allTypes.map(t => { const on = !types || types.includes(t); return <button key={t} onClick={() => setTypes(on ? (types || allTypes).filter(x => x !== t) : [...(types || []), t])} className={cn("rounded px-2 py-0.5 text-xs", tone(t), !on && "opacity-30")}>{t === "no_type" ? "No type" : prettyCrmValue(t)}</button>; })}</div></div>
    <div className="grid grid-cols-7 border-l border-t text-xs">{["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"].map(d => <div key={d} className="border-b border-r bg-muted/40 p-1.5 font-semibold text-muted-foreground">{d}</div>)}
      {days.map(d => { const key = format(d, "yyyy-MM-dd"); const list = items.filter(i => i.date === key).sort((a, b) => a.time.localeCompare(b.time)); return <div key={key} className={cn("min-h-24 border-b border-r p-1", !isSameMonth(d, month) && "bg-muted/20 text-muted-foreground")}>
        <p className={cn("mb-1 text-right", isToday(d) && "font-bold text-primary")}>{format(d, "d")}{isToday(d) && " (today)"}</p>
        {list.slice(0, 3).map((i, n) => <p key={n} className={cn("mb-0.5 truncate rounded px-1 py-0.5", i.cls)} title={`${i.time} ${i.label}`}>{i.time} {i.label}</p>)}{list.length > 3 && <p className="text-muted-foreground">+{list.length - 3} more</p>}
      </div>; })}</div>
  </CardContent></Card>;
}
