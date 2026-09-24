import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CalendarDays, ClipboardList, Copy, Download, MapPin, PartyPopper } from "lucide-react";
import { format, isSameDay, startOfDay } from "date-fns";
import { toast } from "sonner";
import { prettyCrmValue } from "./types";
import type { CrmInspection, CrmLead, CrmTask } from "./types";

type AgendaEntry = { id: string; kind: "inspection" | "event" | "task"; start: Date; end: Date; title: string; detail: string; place: string };

const KIND_LABEL = { inspection: "Inspection", event: "Event", task: "Task" } as const;

// CRM task timestamps are stored in UTC; display their Sydney wall time in the venue calendar.
function sydneyWallDate(timestamp: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "00";
  return new Date(Number(part("year")), Number(part("month")) - 1, Number(part("day")), Number(part("hour")), Number(part("minute")), Number(part("second")));
}

export default function CalendarTab({ businessId, businessName, leads, inspections, bookings, tasks }: {
  businessId: string; businessName: string; leads: CrmLead[]; inspections: CrmInspection[]; bookings: any[]; tasks: CrmTask[];
}) {
  const [filter, setFilter] = useState<"all" | AgendaEntry["kind"]>("all");
  const [token, setToken] = useState("");

  // The private calendar key is only readable by staff with sales access.
  useEffect(() => {
    let active = true;
    (async () => {
      const { data, error } = await (supabase.rpc as any)("get_crm_calendar_token", { _business_id: businessId });
      if (error) console.error("Calendar link lookup failed", error);
      if (active) setToken((data as string) || "");
    })();
    return () => { active = false; };
  }, [businessId]);

  const feedUrl = token
    ? `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-calendar-feed?b=${businessId}&t=${token}`
    : "";
  const googleUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(feedUrl)}`;
  const nameOf = (id: string | null) => leads.find((lead) => lead.id === id)?.full_name || "Client";

  const entries = useMemo<AgendaEntry[]>(() => {
    const list: AgendaEntry[] = [];
    inspections.filter((i) => i.status !== "cancelled" && (i.starts_at || i.proposed_at)).forEach((i) => {
      const start = new Date((i.starts_at || i.proposed_at) as string);
      list.push({ id: `i-${i.id}`, kind: "inspection", start, end: i.ends_at ? new Date(i.ends_at) : new Date(start.getTime() + 3600000), title: `Site inspection — ${nameOf(i.lead_id)}`, detail: i.pre_notes || "Venue walkthrough", place: i.venue_space?prettyCrmValue(i.venue_space):businessName });
    });
    bookings.forEach((b: any) => {
      const start = new Date(`${b.event_date}T${String(b.start_time || "17:30").slice(0, 5)}`);
      list.push({ id: `b-${b.id}`, kind: "event", start, end: new Date(start.getTime() + Number(b.duration_minutes || 300) * 60000), title: `Event — ${nameOf(b.lead_id)}`, detail: `${b.guest_count || 0} guests`, place: b.venue_space?prettyCrmValue(b.venue_space):businessName });
    });
    tasks.filter((t) => t.status === "open").forEach((t) => {
      const start = sydneyWallDate(t.due_at);
      list.push({ id: `t-${t.id}`, kind: "task", start, end: new Date(start.getTime() + 1800000), title: `Task — ${t.title}`, detail: t.description || (t.lead_id ? nameOf(t.lead_id) : "Follow-up"), place: businessName });
    });
    return list.filter((e) => !Number.isNaN(e.start.getTime())).sort((a, b) => a.start.getTime() - b.start.getTime());
  }, [inspections, bookings, tasks, leads, businessName]);

  const visible = entries.filter((e) => filter === "all" || e.kind === filter);
  const upcoming = visible.filter((e) => e.start >= startOfDay(new Date()));
  const days = useMemo(() => {
    const grouped: { day: Date; items: AgendaEntry[] }[] = [];
    upcoming.forEach((entry) => {
      const bucket = grouped.find((g) => isSameDay(g.day, entry.start));
      if (bucket) bucket.items.push(entry); else grouped.push({ day: entry.start, items: [entry] });
    });
    return grouped;
  }, [upcoming]);

  const copyLink = async () => {
    try { await navigator.clipboard.writeText(feedUrl); toast.success("Calendar link copied"); }
    catch { toast.error("Copy failed — select the link and copy it manually"); }
  };

  const downloadIcs = () => {
    const a = document.createElement("a");
    a.href = feedUrl; a.download = `${businessName}-sales-calendar.ics`; a.target = "_blank"; a.click();
  };

  return <div className="space-y-6">
    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="h-5 w-5" />Universal calendar link</CardTitle></CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">One link covering every inspection, confirmed event and task. Copy it, then in Google Calendar choose Other calendars, From URL, and paste it. It keeps updating on its own.</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input readOnly value={feedUrl} onFocus={(e) => e.currentTarget.select()} className="font-mono text-xs" />
          <div className="flex gap-2">
            <Button variant="outline" onClick={copyLink}><Copy className="mr-2 h-4 w-4" />Copy</Button>
            <Button variant="outline" onClick={downloadIcs}><Download className="mr-2 h-4 w-4" />.ics file</Button>
            <Button asChild><a href={googleUrl} target="_blank" rel="noreferrer">Add to Google</a></Button>
          </div>
        </div>
      </CardContent>
    </Card>

    <div className="flex flex-wrap gap-2">
      {(["all", "inspection", "event", "task"] as const).map((kind) => (
        <Button key={kind} size="sm" variant={filter === kind ? "default" : "outline"} onClick={() => setFilter(kind)}>
          {kind === "all" ? `Everything (${entries.length})` : `${KIND_LABEL[kind]}s (${entries.filter((e) => e.kind === kind).length})`}
        </Button>
      ))}
    </div>

    {days.length === 0 && <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Nothing scheduled yet.</CardContent></Card>}

    <div className="space-y-4">
      {days.map((group) => (
        <Card key={group.day.toISOString()}>
          <CardHeader className="pb-3"><CardTitle className="font-serif text-lg">{format(group.day, "EEEE, dd MMMM yyyy")}</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {group.items.map((entry) => (
              <div key={entry.id} className="flex flex-col gap-1 border-b border-border pb-3 last:border-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 text-primary">{entry.kind === "event" ? <PartyPopper className="h-4 w-4" /> : entry.kind === "task" ? <ClipboardList className="h-4 w-4" /> : <CalendarDays className="h-4 w-4" />}</span>
                  <div>
                    <p className="text-sm font-medium">{entry.title}</p>
                    <p className="text-xs text-muted-foreground">{entry.detail}</p>
                  </div>
                </div>
                <div className="flex items-center gap-3 pl-7 text-xs text-muted-foreground sm:pl-0">
                  <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{entry.place}</span>
                  <Badge variant="outline">{format(entry.start, "h:mm a")} – {format(entry.end, "h:mm a")}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      ))}
    </div>
  </div>;
}
