import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight, Clock, MapPin, Phone, Users, UtensilsCrossed, ListChecks, FileText } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useCrmData } from "@/features/sales/useCrmData";
import { prettyCrmValue } from "@/features/sales/types";
import { to12 } from "./useEventsData";

const Section = ({ icon: Icon, title, children }: any) => (
  <Card><CardContent className="p-6">
    <p className="mb-3 flex items-center gap-2 text-lg font-semibold"><Icon className="h-4 w-4 text-primary" />{title}</p>
    {children}
  </CardContent></Card>
);
const Row = ({ k, v }: { k: string; v: any }) => v ? <div className="flex justify-between gap-4 py-1 text-sm"><span className="text-muted-foreground">{k}</span><span className="text-right">{v}</span></div> : null;

export default function RunsheetViewPage() {
  const { businessCode, runsheetId } = useParams();
  const crm = useCrmData();
  const [rs, setRs] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [selection, setSelection] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!runsheetId) return;
    (async () => {
      const { data } = await supabase.from("crm_runsheets").select("*").eq("id", runsheetId).maybeSingle();
      setRs(data);
      if (data?.lead_id) {
        const sel = await supabase.from("crm_menu_selections").select("*").eq("lead_id", data.lead_id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
        setSelection(sel.data);
        if (sel.data) { const r = await supabase.from("crm_menu_selection_items").select("*").eq("selection_id", sel.data.id).order("created_at"); setItems(r.data || []); }
      }
      setLoading(false);
    })();
  }, [runsheetId]);

  if (loading || crm.loading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  const back = `/b/${businessCode}/events/events`;
  if (!rs) return <div className="py-20 text-center text-muted-foreground">Run sheet not found. <Link to={back} className="text-primary">Back to events</Link></div>;

  const lead: any = crm.leads.find(l => l.id === rs.lead_id);
  const b: any = crm.bookings.find(x => x.id === rs.booking_id) || crm.bookings.find(x => x.lead_id === rs.lead_id);
  const PKG = ["package", "kids_package", "manual"];
  const pkgs = items.filter(i => PKG.includes(i.course));
  const stalls = items.filter(i => i.course === "live_stall");
  const kidsRow = items.find(i => i.course === "kids_package");
  const courses = items.filter(i => !PKG.includes(i.course) && i.course !== "live_stall" && (kidsRow || i.course !== "Kids Menu"))
    .reduce((m: Record<string, any[]>, i) => { const c = i.course || "Other"; (m[c] ||= []).push(i); return m; }, {});
  const schedule: any[] = rs.service_schedule || [];
  const setup: string[] = rs.setup_items || [];
  const date = b?.event_date ? format(new Date(`${b.event_date}T00:00:00`), "EEEE, d MMMM yyyy") : "Date to be confirmed";

  return <div className="mx-auto max-w-4xl space-y-6">
    <p className="flex items-center gap-1 text-sm text-muted-foreground"><Link to={back} className="hover:text-primary">Events</Link><ChevronRight className="h-3 w-3" /><span className="text-foreground">Run sheet</span></p>

    <div className="flex flex-col gap-4 border-b-2 border-primary pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-xs font-medium uppercase tracking-widest text-primary">Event run sheet</p>
        <h1 className="font-serif text-3xl font-semibold">{prettyCrmValue(lead?.event_type || b?.event_type || "Event")} — {lead?.full_name || "Client"}</h1>
        <p className="text-sm text-muted-foreground">{date}{b?.start_time ? ` · ${to12(String(b.start_time).slice(0, 5))}` : ""}</p>
      </div>
      <div className="text-right text-sm">
        <img src="/regal-logo.png" alt={crm.business?.name || "Logo"} className="ml-auto mb-2 h-12 object-contain" />
        <p className="text-muted-foreground">Event Order {rs.event_order_number || "—"} · Revision {rs.revision || 1}</p>
        <Badge variant="secondary">{rs.status === "sent" ? "Issued" : prettyCrmValue(rs.status || "draft")}</Badge>
      </div>
    </div>

    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" />Venue</p><p className="font-medium">{prettyCrmValue(b?.venue_space || lead?.venue_space || "—")}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Users className="h-3 w-3" />Guests</p><p className="font-medium">{rs.adult_guests ?? "—"} adults · {rs.kids_guests ?? 0} kids</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" />Time</p><p className="font-medium">{b?.start_time ? to12(String(b.start_time).slice(0, 5)) : "—"}{b?.duration_minutes ? ` · ${(b.duration_minutes / 60).toFixed(1)} hrs` : ""}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="flex items-center gap-1 text-xs text-muted-foreground"><FileText className="h-3 w-3" />Booking ref</p><p className="font-medium">{rs.booking_reference || "—"}</p></CardContent></Card>
    </div>

    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      <div className="space-y-6">
        {stalls.length > 0 && <Section icon={UtensilsCrossed} title="Live stalls">
          {stalls.map(s => <div key={s.id} className="flex justify-between border-b border-border py-1.5 text-sm last:border-0"><span>{s.item_name}</span><span className="text-muted-foreground">{s.service_start_time ? to12(s.service_start_time) : ""}{s.service_end_time ? ` – ${to12(s.service_end_time)}` : ""}</span></div>)}
        </Section>}

        <Section icon={UtensilsCrossed} title="Menu selection">
          {pkgs.length > 0 && <p className="mb-2 text-sm font-medium">{pkgs.map(p => p.item_name).join(" · ")}</p>}
          {selection?.corkage_enabled && <p className="mb-2 text-sm text-muted-foreground">Host is bringing their own drinks.</p>}
          {Object.entries(courses).map(([c, l]) => <p key={c} className="py-0.5 text-sm"><span className="text-muted-foreground">{c}: </span>{l.map(d => d.item_name).join(" · ")}</p>)}
          {kidsRow && <p className="py-0.5 text-sm"><span className="text-muted-foreground">Kids menu: </span>{items.filter(i => i.course === "Kids Menu").map(d => d.item_name).join(" · ") || `${kidsRow.quantity || ""} kids`}</p>}
          {selection?.beverage_package && <p className="py-0.5 text-sm"><span className="text-muted-foreground">Beverages: </span>{prettyCrmValue(selection.beverage_package)}</p>}
          {(selection?.dietary_requirements || selection?.allergies) && <p className="mt-2 text-sm text-muted-foreground">{[selection.dietary_requirements && `Dietary: ${selection.dietary_requirements}`, selection.allergies && `Allergies: ${selection.allergies}`].filter(Boolean).join(" · ")}</p>}
          {!items.length && <p className="text-sm text-muted-foreground">No menu saved yet.</p>}
        </Section>

        <Section icon={Clock} title="Service timings">
          {schedule.length ? schedule.map((s, i) => <div key={i} className="flex gap-4 border-b border-border py-1.5 text-sm last:border-0"><span className="w-20 shrink-0 font-medium">{s.time ? to12(s.time) : "—"}</span><span>{s.label}{s.detail ? <span className="text-muted-foreground"> — {s.detail}</span> : null}</span></div>) : <p className="text-sm text-muted-foreground">No timings set.</p>}
        </Section>
      </div>

      <div className="space-y-6">
        <Section icon={ListChecks} title="Setup & additional information">
          {rs.access_time && <Row k="Decor / vendor access" v={to12(rs.access_time)} />}
          {setup.length > 0 && <div className="py-1">{setup.map(s => <p key={s} className="py-0.5 text-sm">• {s}</p>)}</div>}
          {rs.setup_notes && <p className="whitespace-pre-line py-1 text-sm text-muted-foreground">{rs.setup_notes}</p>}
          {rs.special_requests && <Row k="Special requests" v={rs.special_requests} />}
        </Section>

        <Section icon={Phone} title="Contacts">
          <Row k="Client" v={lead?.full_name} />
          <Row k="Client phone" v={lead?.phone} />
          <Row k="Sales person" v={rs.sales_person} />
          <Row k="Sales phone" v={rs.sales_person_phone} />
          <Row k="Event coordinator" v={rs.event_coordinator} />
          <Row k="Coordinator phone" v={rs.event_coordinator_phone} />
          <Row k="On-site contact" v={rs.onsite_contact_name} />
          <Row k="On-site phone" v={rs.onsite_contact_phone} />
        </Section>

        {(rs.client_notes || rs.ops_notes || rs.distributed_to) && <Section icon={FileText} title="Notes">
          {rs.client_notes && <Row k="Client notes" v={rs.client_notes} />}
          {rs.ops_notes && <Row k="Internal notes" v={rs.ops_notes} />}
          {rs.distributed_to && <Row k="Distributed to" v={rs.distributed_to} />}
        </Section>}
      </div>
    </div>
  </div>;
}
