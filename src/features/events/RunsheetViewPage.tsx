import { loadBeverageDetail } from "@/lib/beverageDetail";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { downloadRunsheetPdf } from "@/lib/runsheetDownload";
import { Link, Navigate, useLocation, useParams } from "react-router-dom";
import { format } from "date-fns";
import { ChevronRight, ArrowLeft, Printer, Mail, Link as LinkIcon, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import SendRunsheetDialog, { runsheetPublicUrl } from "./SendRunsheetDialog";
import { useCrmData } from "@/features/sales/useCrmData";
import { prettyCrmValue } from "@/features/sales/types";
import { to12 } from "./useEventsData";
import { DEFAULT_RUNSHEET_TERMS } from "./defaultTerms";

export function runsheetTermsFor(settings: any, booking: any): string | null {
  if (booking?.booking_kind === "catering" || settings?.runsheet_terms_enabled === false) return null;
  return (settings?.runsheet_terms ?? "").trim() || DEFAULT_RUNSHEET_TERMS;
}

const signDateLabel = (d?: string | null) => d ? format(new Date(`${d}T00:00:00`), "dd/MM/yyyy") : "";
function SignRow({ label, name, date, signature }: { label: string; name?: string | null; date?: string | null; signature?: string | null }) {
  const blank = (w: string, v?: string) => v ? <span className="font-semibold">{v}</span> : <span className={`inline-block ${w} border-b border-border`} />;
  return <div className="mt-4 grid grid-cols-3 items-end gap-6 text-xs">
    <p>{label}: {blank("w-24", name || "")}</p>
    <p className="flex items-end gap-1">Signature: {signature ? <img src={signature} alt="Signature" className="h-10 w-32 object-contain object-left" /> : <span className="inline-block w-20 border-b border-border" />}</p>
    <p>Date: {blank("w-20", signDateLabel(date))}</p>
  </div>;
}

function TermsPage({ terms, businessName, rs }: { terms: string; businessName?: string; rs?: any }) {
  const blocks = terms.split(/\n\s*\n/).map(b => b.trim()).filter(Boolean);
  return <section data-pdf-break className="mt-10 break-before-page pt-2 text-[10.5px] leading-snug" style={{ breakBefore: "page" }}>
    <header className="flex items-start justify-between gap-6 border-b border-border pb-3">
      <h1 className="text-xl font-bold">Terms &amp; Conditions</h1>
      <img src="/regal-logo.png" alt={businessName || "Logo"} className="h-14 w-28 object-contain object-right" />
    </header>
    <div className="mt-3 space-y-2">{blocks.map((b, i) => /^\d+\.\s/.test(b) || (b.length < 90 && !/[.:]$/.test(b) && i > 0)
      ? <h2 key={i} className="pt-1 text-xs font-bold">{b}</h2>
      : <p key={i} className="whitespace-pre-line">{b.replace(/^([^:\n]{2,40}):/, "$1:")}</p>)}</div>
    <div className="mt-2"><SignRow label="Client name" name={rs?.client_sign_name} date={rs?.client_sign_date} signature={rs?.client_signature} /></div>
  </section>;
}

export function runsheetTitle(lead: any, b: any) { return `${prettyCrmValue(lead?.event_type || b?.event_type || "Event")} — ${lead?.full_name || "Client"}`; }

// Keep the document at its real A4 dimensions; only its on-screen preview is scaled.
function A4Preview({ children, documentRef }: { children: React.ReactNode; documentRef: React.RefObject<HTMLDivElement> }) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);
  const [height, setHeight] = useState(1123);
  useLayoutEffect(() => {
    const frame = frameRef.current;
    const document = documentRef.current;
    if (!frame || !document) return;
    const measure = () => {
      const nextScale = Math.min(1, frame.clientWidth / document.offsetWidth);
      setScale(nextScale);
      setHeight(document.scrollHeight * nextScale);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(frame);
    observer.observe(document);
    return () => observer.disconnect();
  }, [documentRef, children]);
  return <div ref={frameRef} className="runsheet-preview w-full overflow-hidden" style={{ height }}>
    <div ref={documentRef} className="runsheet-page" style={{ transform: `scale(${scale})` }}>{children}</div>
  </div>;
}

export function RunsheetDocument({ rs, lead, b, items, selection, businessName, businessPhone, businessEmail, terms, internal = false }: { rs: any; lead: any; b: any; items: any[]; selection: any; businessName?: string; businessPhone?: string; businessEmail?: string; terms?: string | null; internal?: boolean }) {
  const PKG = ["package", "kids_package", "manual"];
  const pkgs = items.filter(i => i.course === "package");
  const stalls = items.filter(i => i.course === "live_stall");
  const kidsRows = items.filter(i => i.course === "kids_package"); const kidsRow = kidsRows[0];
  const courses = items.filter(i => !PKG.includes(i.course) && i.course !== "live_stall" && i.course !== "beverage" && (kidsRow || i.course !== "Kids Menu"))
    .reduce((m: Record<string, any[]>, i) => { const c = i.course || "Other"; (m[c] ||= []).push(i); return m; }, {});
  const schedule: any[] = rs.service_schedule || [];
  const fohSchedule: any[] = rs.service_schedule_foh || [];
  const slot = (s: any) => s?.time ? `${to12(s.time)}${s.end && s.end !== s.time ? ` – ${to12(s.end)}` : ""}` : "";
  const setup: string[] = rs.setup_items || [];
  const date = b?.event_date ? format(new Date(`${b.event_date}T00:00:00`), "EEEE, d MMMM yyyy") : "Date to be confirmed";
  const start = b?.start_time ? String(b.start_time).slice(0, 5) : "";
  const end = start && b?.duration_minutes ? (() => { const [h, m] = start.split(":").map(Number); const total = (h * 60 + m + b.duration_minutes) % 1440; return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`; })() : "";
  const time = start ? `${to12(start)}${end ? ` – ${to12(end)}` : ""}` : "—";
  const catering = b?.booking_kind === "catering";
  const pickup = catering && b?.fulfilment_method === "pickup";
  const eventType = catering ? "Catering" : prettyCrmValue(lead?.event_type || b?.event_type || "Event");
  const eventTitle = catering ? `${b?.event_name || lead?.full_name || "Catering"}` : runsheetTitle(lead, b);
  const contacts = [
    ["Sales Person:", rs.sales_person, rs.sales_person_phone],
    [catering ? "Coordinator:" : "Event Coordinator:", rs.event_coordinator, rs.event_coordinator_phone],
    ["Client:", lead?.full_name, lead?.phone],
    [catering ? (pickup ? "Pickup Contact:" : "Delivery Contact:") : "Onsite Contact:", rs.onsite_contact_name, rs.onsite_contact_phone],
  ];
  const Summary = ({ bold = false }: { bold?: boolean }) => {
    const heavy = bold ? "font-bold" : "font-medium";
    return <div className={`grid grid-cols-[20%_30%_20%_30%] divide-x divide-border border border-border text-xs${bold ? " font-bold" : ""}`}>
      <div className={`p-2 ${heavy}`}>{catering && <span className="block text-[10px]">{pickup ? "Pickup window" : "Delivery window"}</span>}{time}</div>
      <div className={`p-2 ${heavy}`}>{catering ? eventTitle : eventType}</div>
      <div className="p-2">Adults: {rs.adult_guests ?? b?.adults ?? "—"}<br />{b?.kids_5_to_10 != null || b?.kids_under_5 != null ? <>Kids (5–10): {b?.kids_5_to_10 ?? 0}<br />Kids (under 5): {b?.kids_under_5 ?? 0}</> : <>Kids: {rs.kids_guests ?? b?.kids ?? 0}</>}</div>
      {catering
        ? <div className="p-2"><span className="block text-[10px]">{pickup ? "Pickup" : "Delivery to"}</span><span className={heavy}>{pickup ? (businessName || "At venue") : (b?.service_location || lead?.service_location || "—")}</span></div>
        : <div className="p-2"><span className="block text-[10px]">Venue</span><span className={heavy}>{prettyCrmValue(b?.venue_space || lead?.venue_space || "—")}</span></div>}
    </div>;
  };

  return <article className="runsheet-monochrome bg-background font-sans text-foreground">
    <header className="flex items-start justify-between gap-6">
      <div>
        <h1 className="text-2xl font-bold">{catering ? `Catering ${pickup ? "Pickup" : "Delivery"} Order` : `${eventType} Event Order`}</h1>
        <p className="mt-1 text-base font-bold">{date}</p>
        <p className="mt-1 text-xs font-bold text-foreground">{[businessName || "Pro Regal Pavilion", businessPhone, businessEmail].filter(Boolean).join("  ·  ")}</p>
      </div>
      <img src="/regal-logo.png" alt={businessName || "Logo"} className="h-20 w-36 object-contain object-right" />
    </header>

    <div className="mt-5 grid grid-cols-[1.1fr_1fr] gap-5 text-xs">
      <div className="space-y-1">
        {contacts.map(([label, name, phone]) => <div key={label} className="grid grid-cols-[110px_1fr] gap-2"><span>{label}</span><span>{name || "—"}{phone ? ` (${phone})` : ""}</span></div>)}
      </div>
      <div className="flex flex-col justify-center gap-2 border-l border-border pl-5 text-right">
        <p>Event Order: <strong>{rs.event_order_number || "—"}</strong></p>
        <p>Booking Reference: <strong>{rs.booking_reference || "—"}</strong></p>
        <p>Revision: {rs.revision || 1}</p>
      </div>
    </div>

    <section className="mt-5">
      <div className="flex justify-between bg-primary px-3 py-2 text-sm font-semibold text-primary-foreground"><span>Event Summary – {date}</span><span>Day 1 of 1</span></div>
      <Summary />
    </section>

    <section className="mt-4">
      <div className="flex justify-between bg-primary px-3 py-2 text-sm font-bold text-primary-foreground"><span>Agenda – {date}</span><span>Day 1 of 1</span></div>
      <div className="bg-muted"><Summary bold /></div>
      {/* Newspaper-style flow: content fills the left column, then the right, before a new page. */}
      <div data-runsheet-flow className="runsheet-flow columns-2 gap-8 border-x border-b border-border p-4 text-xs leading-relaxed [column-rule:1px_solid_hsl(var(--border))] [&>*]:break-inside-avoid">
          {stalls.length > 0 && <div className="pb-3"><h2 className="font-bold">Live Stalls{stalls[0].service_start_time ? ` — ${to12(stalls[0].service_start_time)}${stalls[0].service_end_time ? ` to ${to12(stalls[0].service_end_time)}` : ""}` : ""}</h2>{stalls.map(s => <p key={s.id} className="pl-3">• {String(s.item_name || "").replace(/_/g, " ").replace(/\b\p{L}/gu, letter => letter.toLocaleUpperCase())}</p>)}</div>}
          <div><h2 className="font-bold">Menu selection{pkgs.length ? ` – ${pkgs.map(p => p.item_name).join(" · ")}` : ""}</h2></div>
          {Object.entries(courses as Record<string, any[]>).map(([course, dishes]) => <div key={course} className="pt-2"><h3 className="pl-3 font-semibold">{course}</h3>{dishes.map(d => <p key={d.id} className="pl-6">- {d.item_name}{d.notes && !String(d.notes).startsWith("pkg:") ? <span className="font-semibold"> — {d.notes}</span> : null}</p>)}</div>)}
          {kidsRows.length > 0 && <div className="pt-2"><p>Kids menu: {kidsRows.reduce((s, k) => s + (Number(k.quantity) || 0), 0)} kids</p></div>}
          {selection?.beverage_package && <div className="pt-3"><h2 className="font-bold">Beverages – {selection.beverage_detail?.name || prettyCrmValue(selection.beverage_package)}</h2>{selection.beverage_detail?.description && <p className="pl-3 italic">{selection.beverage_detail.description}</p>}</div>}
          {(selection?.beverage_detail?.sections || []).filter((sec: any) => sec.name || sec.items.length || sec.notes).map((sec: any, i: number) => <div key={i} className="pt-1"><h3 className="pl-3 font-semibold">{sec.name}{sec.picks ? ` (choose ${sec.picks})` : ""}</h3>{sec.notes && <p className="whitespace-pre-line pl-6">{sec.notes}</p>}{sec.items.map((n: string) => <p key={n} className="pl-6">- {n}</p>)}</div>)}
          {selection?.corkage_enabled && <div className="pt-1 font-bold"><p>Corkage: Host is bringing their own alcohol.</p>{selection?.corkage_note && <p className="whitespace-pre-wrap">{selection.corkage_note}</p>}</div>}
          {!items.length && <div className="pt-2"><p className="text-muted-foreground">No menu saved yet.</p></div>}
          <div className="pt-4"><h2 className="font-bold">Setup & Additional Information</h2>{setup.map(s => <p key={s} className="pl-3">• {s}</p>)}</div>
          {rs.setup_notes && <div className="pt-2"><p className="whitespace-pre-line pl-3">{rs.setup_notes}</p></div>}
          {rs.access_time && <div className="pt-2"><p>Decor / vendor access: {to12(rs.access_time)}</p></div>}
          {rs.special_requests && <div className="pt-2"><p>Special requests: {rs.special_requests}</p></div>}
          {fohSchedule.some((s: any) => s?.label) && <div className="pt-4"><h2 className="font-bold">FOH service schedule</h2>{fohSchedule.filter((s: any) => s?.label).map((s, i) => <p key={i} className="pl-3">• {slot(s) || "—"} – {s.label}{s.detail ? ` (${s.detail})` : ""}</p>)}</div>}
          {schedule.some((s: any) => s?.label) && <div className="pt-4"><h2 className="font-bold">Food serving schedule</h2>{schedule.filter((s: any) => s?.label).map((s, i) => <p key={i} className="pl-3">• {slot(s) || "—"} – {s.label}{s.detail ? ` (${s.detail})` : ""}</p>)}</div>}
          {selection?.dietary_requirements && <div className="pt-3 font-bold text-red-600 print:text-red-600"><p>Dietary requirements:</p><p className="whitespace-pre-wrap">{selection.dietary_requirements}</p></div>}
          {selection?.allergies && <div className="pt-3 font-bold text-red-600 print:text-red-600"><p>Allergies:</p><p className="whitespace-pre-wrap">{selection.allergies}</p></div>}
          {rs.client_notes && <div className="pt-4"><h2 className="font-bold">Client notes</h2><p className="whitespace-pre-line pl-3">{rs.client_notes}</p></div>}
          {internal && rs.ops_notes && <div className="pt-4 text-kitchen-note"><h2 className="font-bold">Kitchen team notes</h2><p className="whitespace-pre-line pl-3">{rs.ops_notes}</p></div>}
          {internal && rs.foh_notes && <div className="pt-4 text-foh-note"><h2 className="font-bold">Front of house notes</h2><p className="whitespace-pre-line pl-3">{rs.foh_notes}</p></div>}
      </div>
    </section>

    <footer className="mt-6 text-xs">
      <div className="mt-3 border-t border-dashed border-border pt-6">
        <p className="text-right text-[10px] text-muted-foreground">Printed Date: {format(new Date(), "dd/MM/yyyy")}</p>
        <SignRow label="Name" name={rs.staff_sign_name} date={rs.staff_sign_date} signature={rs.staff_signature} />
        {!terms && <SignRow label="Client name" name={rs.client_sign_name} date={rs.client_sign_date} signature={rs.client_signature} />}
      </div>
    </footer>
    {terms && <TermsPage terms={terms} businessName={businessName} rs={rs} />}
  </article>;
}

export default function RunsheetViewPage() {
  const { businessCode, runsheetId } = useParams();
  const location = useLocation();
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
        if (sel.data) (sel.data as any).beverage_detail = await loadBeverageDetail(supabase, data.business_id, sel.data.beverage_package);
        setSelection(sel.data);
        if (sel.data) { const r = await supabase.from("crm_menu_selection_items").select("*").eq("selection_id", sel.data.id).order("created_at"); setItems(r.data || []); }
      }
      setLoading(false);
    })();
  }, [runsheetId]);

  if (loading || crm.loading) return <div className="py-20 text-center text-muted-foreground">Loading…</div>;
  const back = `/b/${businessCode}/events/events`;
  const cateringRoute = location.pathname.includes("/catering/bookings/") || location.pathname.includes("/catering-bookings/");
  if (!rs) return <div className="py-20 text-center text-muted-foreground">Run sheet not found. <Link to={cateringRoute ? `/b/${businessCode}/catering/bookings` : back} className="text-primary">Back to {cateringRoute ? "catering bookings" : "events"}</Link></div>;
  const lead: any = crm.leads.find(l => l.id === rs.lead_id);
  const b: any = crm.bookings.find(x => x.id === rs.booking_id) || crm.bookings.find(x => x.lead_id === rs.lead_id);
  const title = runsheetTitle(lead, b);
  const isCatering = b?.booking_kind === "catering" || lead?.lead_kind === "catering" || cateringRoute;
  if (isCatering && !cateringRoute) return <Navigate to={b ? `/b/${businessCode}/catering/bookings/${b.id}/runsheet/${rs.id}` : `/b/${businessCode}/catering/leads/${rs.lead_id}`} replace />;
  const backTo = isCatering
    ? b ? `/b/${businessCode}/catering/bookings/${b.id}` : `/b/${businessCode}/catering/leads`
    : b ? `/b/${businessCode}/events/events/${b.id}` : back;
  const issueCatering = async () => { const { data, error } = await supabase.from("crm_runsheets").update({ status: "sent", sent_at: new Date().toISOString(), generated_at: new Date().toISOString() } as any).eq("id", rs.id).select().single(); if (error) { toast.error(error.message); return null; } setRs(data); crm.refresh(); return data; };
   const copyLink = async (internal: boolean) => { await navigator.clipboard.writeText(runsheetPublicUrl(rs, internal)); toast.success(internal ? "Internal link copied" : "Client link copied"); };

  return <div className="mx-auto w-full max-w-[210mm] space-y-6">
    <p className="flex items-center gap-1 text-sm text-muted-foreground print:hidden"><Link to={backTo} className="hover:text-primary">{isCatering ? "Catering" : "Events"}</Link><ChevronRight className="h-3 w-3" /><span>Run Sheet</span><ChevronRight className="h-3 w-3" /><span className="font-medium text-foreground">Details</span></p>
    <div className="flex flex-wrap gap-2 print:hidden">
      <Button variant="outline" asChild><Link to={backTo}><ArrowLeft className="mr-2 h-4 w-4" />{isCatering ? "Back to booking" : "Back to event"}</Link></Button>
       <Button variant="outline" onClick={() => copyLink(false)}><LinkIcon className="mr-2 h-4 w-4" />Copy client link</Button>
       <Button variant="outline" onClick={() => copyLink(true)}><LinkIcon className="mr-2 h-4 w-4" />Copy internal link</Button>
      <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
      <Button variant="outline" disabled={dl} onClick={async () => { if (!docRef.current) return; setDl(true); try { await downloadRunsheetPdf(docRef.current, `Run sheet - ${title}`); } catch { toast.error("Could not create PDF"); } setDl(false); }}><Download className="mr-2 h-4 w-4" />{dl ? "Preparing…" : "Download PDF"}</Button>
      {lead && (rs.sent_at || isCatering) && <Button onClick={() => setSendOpen(true)}><Mail className="mr-2 h-4 w-4" />{rs.sent_at ? "Resend Email" : "Send run sheet"}</Button>}
    </div>
     <A4Preview documentRef={docRef}><RunsheetDocument internal rs={rs} lead={lead} b={b} items={items} selection={selection} businessName={crm.business?.name} businessPhone={crm.business?.phone || ""} businessEmail={crm.business?.email || ""} terms={runsheetTermsFor(crm.settings, b)} /></A4Preview>
    {lead && <SendRunsheetDialog mode={isCatering && !rs.sent_at ? "issue" : "resend"} onIssue={issueCatering} open={sendOpen} onOpenChange={setSendOpen} rs={rs} lead={lead} booking={b} businessName={crm.business?.name || ""} />}
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
   return <div className="min-h-screen bg-background px-4 py-8 print:!min-h-0 print:!p-0">
    <div className="mx-auto w-full max-w-[210mm] space-y-4">
      <div className="flex justify-end gap-2 print:hidden">
        <Button variant="outline" onClick={() => window.print()}><Printer className="mr-2 h-4 w-4" />Print</Button>
        <Button disabled={dl} onClick={async () => { if (!docRef.current) return; setDl(true); try { await downloadRunsheetPdf(docRef.current, `Run sheet - ${runsheetTitle(data.lead, data.booking)}`); } catch { toast.error("Could not create PDF"); } setDl(false); }}><Download className="mr-2 h-4 w-4" />{dl ? "Preparing…" : "Download PDF"}</Button>
      </div>
         <A4Preview documentRef={docRef}><RunsheetDocument internal={data.internal === true} rs={data.rs} lead={data.lead} b={data.booking} items={data.items || []} selection={data.selection} businessName={data.businessName} businessPhone={data.businessPhone || ""} businessEmail={data.businessEmail || ""} terms={data.terms} /></A4Preview>
    </div>
  </div>;
}
