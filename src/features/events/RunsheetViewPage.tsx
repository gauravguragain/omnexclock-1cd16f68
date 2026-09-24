import { useEffect, useRef, useState } from "react";
import { downloadRunsheetPdf } from "@/lib/runsheetDownload";
import { Link, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight, Clock, MapPin, Users, UtensilsCrossed, Star, Settings, PenLine, CalendarDays, User, FileText, Bookmark, ArrowLeft, Printer, ClipboardList, Mic, Mail, Link as LinkIcon, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SendRunsheetDialog, { runsheetPublicUrl } from "./SendRunsheetDialog";
import { useCrmData } from "@/features/sales/useCrmData";
import { prettyCrmValue } from "@/features/sales/types";
import { to12 } from "./useEventsData";

const Box = ({ icon: Icon, title, children, className = "" }: any) => (
  <div className={`rounded-xl border border-primary/40 bg-card p-4 ${className}`}>
    <p className="mb-3 inline-flex items-center gap-2 border-b-2 border-primary pb-1.5 text-xs font-semibold uppercase tracking-widest"><Icon className="h-4 w-4 text-primary" />{title}</p>
    {children}
  </div>
);
const Info = ({ k, v }: { k: string; v: any }) => v ? <p className="flex items-center gap-2 py-0.5 text-sm"><User className="h-3.5 w-3.5 text-muted-foreground" /><span className="text-muted-foreground">{k}:</span><span className="font-medium">{v}</span></p> : null;
const Empty = ({ children }: any) => <p className="text-sm italic text-muted-foreground">{children}</p>;

export function runsheetTitle(lead: any, b: any) { return `${prettyCrmValue(lead?.event_type || b?.event_type || "Event")} — ${lead?.full_name || "Client"}`; }

export function RunsheetDocument({ rs, lead, b, items, selection, businessName }: { rs: any; lead: any; b: any; items: any[]; selection: any; businessName?: string }) {
  const PKG = ["package", "kids_package", "manual"];
  const pkgs = items.filter(i => PKG.includes(i.course) && i.course !== "manual");
  const stalls = items.filter(i => i.course === "live_stall");
  const kidsRow = items.find(i => i.course === "kids_package");
  const courses = items.filter(i => !PKG.includes(i.course) && i.course !== "live_stall" && i.course !== "beverage" && (kidsRow || i.course !== "Kids Menu"))
    .reduce((m: Record<string, any[]>, i) => { const c = i.course || "Other"; (m[c] ||= []).push(i); return m; }, {});
  const schedule: any[] = rs.service_schedule || [];
  const setup: string[] = rs.setup_items || [];
  const d = b?.event_date ? new Date(`${b.event_date}T00:00:00`) : null;
  const date = d ? format(d, "EEEE, MMMM d, yyyy") : "Date to be confirmed";
  const title = `${prettyCrmValue(lead?.event_type || b?.event_type || "Event")} — ${lead?.full_name || "Client"}`;
  const start = b?.start_time ? String(b.start_time).slice(0, 5) : "";
  const end = start && b?.duration_minutes ? (() => { const [h, m] = start.split(":").map(Number); const t = (h * 60 + m + b.duration_minutes) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })() : "";
  const venue = prettyCrmValue(b?.venue_space || lead?.venue_space || "") || "Venue to be confirmed";
  const hasSetup = rs.access_time || setup.length || rs.setup_notes || rs.special_requests;

  return <>
    <div className="space-y-4 rounded-xl border border-border bg-card p-5 text-sm shadow-sm sm:p-7 print:border-0 print:p-0 print:shadow-none">
      <div className="flex items-center gap-4 border-b border-border pb-4">
        <img src="/regal-logo.png" alt={businessName || "Logo"} className="h-14 w-14 rounded-full border border-primary/50 object-contain p-1" />
        <div>
          <h2 className="text-xl font-semibold leading-tight sm:text-2xl">{title} Event Order</h2>
          <p className="text-sm text-primary">{date}</p>
          <p className="text-xs text-muted-foreground">{businessName || "Pro Regal Pavilion"}</p>
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Info k="Event Coordinator" v={rs.event_coordinator && `${rs.event_coordinator}${rs.event_coordinator_phone ? ` (${rs.event_coordinator_phone})` : ""}`} />
          <Info k="Sales Person" v={rs.sales_person && `${rs.sales_person}${rs.sales_person_phone ? ` (${rs.sales_person_phone})` : ""}`} />
          <Info k="Client" v={lead?.full_name && `${lead.full_name}${lead.phone ? ` (${lead.phone})` : ""}`} />
          <Info k="Onsite Contact" v={[rs.onsite_contact_name, rs.onsite_contact_phone].filter(Boolean).join(" · ")} />
        </div>
        <div className="min-w-[210px] space-y-2.5 rounded-lg bg-secondary px-4 py-3 text-secondary-foreground shadow-md">
          <div className="flex gap-2"><FileText className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Event order</p><p className="font-mono font-semibold">{rs.event_order_number || "—"}</p></div></div>
          <div className="flex gap-2"><Bookmark className="mt-0.5 h-4 w-4 text-primary" /><div><p className="text-[10px] font-semibold uppercase tracking-widest text-primary">Booking reference</p><p className="font-mono font-semibold">{rs.booking_reference || "—"}</p></div></div>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-primary/40">
        <div className="flex items-center justify-between bg-primary px-4 py-2 text-xs font-semibold uppercase tracking-widest text-primary-foreground">
          <span className="flex items-center gap-2"><CalendarDays className="h-4 w-4" />Event summary – {date}</span><span>Day 1 of 1</span>
        </div>
        <div className="grid gap-3 bg-primary/5 px-4 py-3 text-sm grid-cols-2 sm:grid-cols-4">
          <p className="flex gap-2"><Clock className="mt-0.5 h-4 w-4 text-muted-foreground" />{start ? `${to12(start)}${end ? ` - ${to12(end)}` : ""}` : "Time TBC"}</p>
          <p className="flex gap-2"><Mic className="mt-0.5 h-4 w-4 text-muted-foreground" />{title}</p>
          <p className="flex gap-2"><Users className="mt-0.5 h-4 w-4 text-muted-foreground" /><span>Attendees: {rs.adult_guests ?? "—"}<br /><span className="text-muted-foreground">Kids: {rs.kids_guests ?? 0}</span></span></p>
          <p className="flex gap-2"><MapPin className="mt-0.5 h-4 w-4 text-muted-foreground" />{venue}</p>
        </div>
      </div>

      <div className="grid gap-2.5 grid-cols-1 sm:grid-cols-[1.7fr_1fr]">
        <Box icon={UtensilsCrossed} title="Menu selection">
          {stalls.length > 0 && <div className="mb-2">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Live stalls</p>
            {stalls.map(s => <p key={s.id} className="flex justify-between py-px text-xs"><span className="font-medium">{s.item_name}</span><span className="text-muted-foreground">{s.service_start_time ? to12(s.service_start_time) : ""}{s.service_end_time ? ` – ${to12(s.service_end_time)}` : ""}</span></p>)}
          </div>}
          {pkgs.length > 0 && <p className="text-xs font-semibold">{pkgs.map(p => p.item_name).join(" · ")}</p>}
          {Object.keys(courses).length > 0 && <p className="mb-1 mt-1 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Items</p>}
          <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
            {(Object.entries(courses) as [string, any[]][]).map(([c, l]) => <li key={c}>
              <p className="flex items-center gap-1.5 text-xs font-semibold"><span className="h-1.5 w-1.5 rounded-full border border-primary" />{c}</p>
              <ul className="ml-3 mt-0.5">{l.map(x => <li key={x.id} className="flex items-center gap-1.5 text-xs leading-snug"><span className="h-1 w-1 bg-muted-foreground" />{x.item_name}</li>)}</ul>
            </li>)}
          </ul>
          {selection?.beverage_package && <p className="mt-2 text-xs"><span className="text-muted-foreground">Beverages: </span>{prettyCrmValue(selection.beverage_package)}</p>}
          {selection?.corkage_enabled && <p className="mt-0.5 text-xs text-muted-foreground">Host is bringing their own drinks.</p>}
          {(selection?.dietary_requirements || selection?.allergies) && <p className="mt-1 text-xs text-muted-foreground">{[selection.dietary_requirements && `Dietary: ${selection.dietary_requirements}`, selection.allergies && `Allergies: ${selection.allergies}`].filter(Boolean).join(" · ")}</p>}
          {!items.length && <Empty>No menu saved yet.</Empty>}
        </Box>

        <div className="space-y-2.5">
          <Box icon={Star} title="Activities">
            {schedule.length ? <div className="space-y-1">{schedule.map((s, i) => <div key={i}>
              <div className="flex items-center gap-2"><span className="rounded-full bg-primary/20 px-1.5 py-px text-[10px] font-medium text-primary">{s.time ? to12(s.time) : "—"}</span><span className="h-px flex-1 bg-primary/40" /><span className="h-1.5 w-1.5 rounded-full border border-primary" /></div>
              <p className="text-xs leading-snug">{s.label}{s.detail ? <span className="text-muted-foreground"> — {s.detail}</span> : null}</p>
            </div>)}</div> : <Empty>No timings set.</Empty>}
          </Box>
          <Box icon={Settings} title="Setup & additional information">
            {hasSetup ? <div className="space-y-0.5 text-xs">
              {rs.access_time && <p><span className="text-muted-foreground">Decor / vendor access: </span>{to12(rs.access_time)}</p>}
              {setup.length > 0 && <p>{setup.join(" · ")}</p>}
              {rs.setup_notes && <p className="whitespace-pre-line text-muted-foreground">{rs.setup_notes}</p>}
              {rs.special_requests && <p><span className="text-muted-foreground">Special requests: </span>{rs.special_requests}</p>}
            </div> : <Empty>Nothing recorded.</Empty>}
          </Box>
        </div>
      </div>

      {(rs.client_notes || rs.ops_notes) && <Box icon={FileText} title="Notes">
        {rs.client_notes && <p className="text-xs"><span className="text-muted-foreground">Client notes: </span>{rs.client_notes}</p>}
        {rs.ops_notes && <p className="text-xs"><span className="text-muted-foreground">Internal notes: </span>{rs.ops_notes}</p>}
      </Box>}

      <Box icon={PenLine} title="Authorized signatures">
        <div className="mt-4 grid grid-cols-3 gap-6 text-center text-xs text-muted-foreground">
          {["Name", "Signature", "Date"].map(l => <div key={l}><div className="mb-2 border-b border-muted-foreground/60" />{l}</div>)}
        </div>
      </Box>
      <p className="flex items-center justify-end gap-1 text-xs text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />Printed Date: {format(new Date(), "dd/MM/yyyy")}</p>
    </div>
  </>;
}

export default function RunsheetViewPage() {
  const { businessCode, runsheetId } = useParams();
  const crm = useCrmData();
  const [rs, setRs] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const [selection, setSelection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [sendOpen, setSendOpen] = useState(false);
  const docRef = useRef<HTMLDivElement>(null);
  const [dl, setDl] = useState(false);

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
  const title = runsheetTitle(lead, b);
  const copyLink = async () => { await navigator.clipboard.writeText(runsheetPublicUrl(rs)); toast.success("Web link copied"); };

  return <div className="mx-auto max-w-5xl space-y-6">
    <p className="flex items-center gap-1 text-sm text-muted-foreground print:hidden"><Link to={back} className="hover:text-primary">Events</Link><ChevronRight className="h-3 w-3" /><span>Run Sheet</span><ChevronRight className="h-3 w-3" /><span className="font-medium text-foreground">Details</span></p>
    <div className="flex flex-col gap-4 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between print:hidden">
      <div className="flex items-center gap-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/15 text-primary"><ClipboardList className="h-4 w-4" /></span>
        <div className="border-l-2 border-primary pl-3">
          <p className="text-[11px] font-semibold uppercase tracking-widest text-primary">Run sheet</p>
          <h1 className="font-serif text-2xl sm:text-3xl">{title}</h1>
          <p className="text-sm text-muted-foreground">Run sheet · Event Order {rs.event_order_number || "—"}-{rs.revision || 1}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild><Link to={back}><ArrowLeft className="mr-2 h-4 w-4" />Back to event</Link></Button>
        <Button variant="outline" onClick={copyLink}><LinkIcon className="mr-2 h-4 w-4" />Copy web link</Button>
        <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
        <Button variant="outline" disabled={dl} onClick={async () => { if (!docRef.current) return; setDl(true); try { await downloadRunsheetPdf(docRef.current, `Run sheet - ${title}`); } catch { toast.error("Could not create PDF"); } setDl(false); }}><Download className="mr-2 h-4 w-4" />{dl ? "Preparing…" : "Download PDF"}</Button>
        {lead && rs.sent_at && <Button onClick={() => setSendOpen(true)}><Mail className="mr-2 h-4 w-4" />Resend Email</Button>}
      </div>
    </div>
    <div ref={docRef}><RunsheetDocument rs={rs} lead={lead} b={b} items={items} selection={selection} businessName={crm.business?.name} /></div>
    {lead && <SendRunsheetDialog open={sendOpen} onOpenChange={setSendOpen} rs={rs} lead={lead} booking={b} businessName={crm.business?.name || ""} />}
  </div>;
}

export function PublicRunsheetPage() {
  const { runsheetId } = useParams();
  const t = new URLSearchParams(window.location.search).get("t") || "";
  const [data, setData] = useState<any>(null); const [err, setErr] = useState("");
  const docRef = useRef<HTMLDivElement>(null); const [dl, setDl] = useState(false);
  useEffect(() => {
    const url = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/crm-runsheet-public?id=${encodeURIComponent(runsheetId || "")}&t=${encodeURIComponent(t)}`;
    fetch(url, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } }).then(async r => { const j = await r.json(); if (!r.ok) setErr(j.error || "Run sheet not found"); else setData(j); }).catch(() => setErr("Unable to load run sheet"));
  }, [runsheetId, t]);
  if (err) return <div className="py-20 text-center text-muted-foreground">{err}</div>;
  if (!data) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  return <div className="min-h-screen bg-background px-4 py-8">
    <div className="mx-auto max-w-5xl space-y-4">
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
        <Button disabled={dl} onClick={async () => { if (!docRef.current) return; setDl(true); try { await downloadRunsheetPdf(docRef.current, `Run sheet - ${runsheetTitle(data.lead, data.booking)}`); } catch { toast.error("Could not create PDF"); } setDl(false); }}><Download className="mr-2 h-4 w-4" />{dl ? "Preparing…" : "Download PDF"}</Button>
      </div>
      <div ref={docRef}><RunsheetDocument rs={data.rs} lead={data.lead} b={data.booking} items={data.items || []} selection={data.selection} businessName={data.businessName} /></div>
    </div>
  </div>;
}
