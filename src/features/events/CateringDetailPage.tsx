import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, FileText, Mail, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import DateField from "@/features/sales/DateField";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { useCrmData } from "@/features/sales/useCrmData";
import LeadFormDialog from "@/features/sales/LeadFormDialog";
import { prettyCrmValue } from "@/features/sales/types";
import SendRunsheetDialog from "./SendRunsheetDialog";
import { bookingEnd, minutesBetween, to12 } from "./useEventsData";

const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="space-y-3 border-t border-border py-5"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
const Field = ({ label, value }: { label: string; value: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm font-medium">{value || "—"}</dd></div>;

export default function CateringDetailPage({ view }: { view: "lead" | "booking" }) {
  const { id, businessCode } = useParams();
  const nav = useNavigate();
  const crm = useCrmData();
  const [editOpen, setEditOpen] = useState(false);
  const [editBkOpen, setEditBkOpen] = useState(false);
  const [bk, setBk] = useState({ event_name: "", event_date: "", start_time: "18:00", end_time: "23:00", fulfilment_method: "delivery", service_location: "", adults: "", kids: "", notes: "" });
  const [bkSaving, setBkSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selection, setSelection] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const booking: any = view === "booking" ? crm.bookings.find(b => b.id === id && b.booking_kind === "catering") : null;
  const lead = crm.leads.find(l => l.id === (view === "lead" ? id : booking?.lead_id) && (l.lead_kind === "catering" || booking?.booking_kind === "catering" || l.event_type === "catering"));
  const rs: any = crm.runsheets.filter((r: any) => booking && (r.booking_id === booking.id || r.lead_id === booking.lead_id)).sort((a: any, b: any) => (b.revision || 0) - (a.revision || 0))[0];
  const base = `/b/${businessCode}/catering`;

  useEffect(() => {
    if (!lead?.id) return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase.from("crm_menu_selections").select("*").eq("lead_id", lead.id).order("updated_at", { ascending: false }).limit(1).maybeSingle();
      if (cancelled) return;
      setSelection(data);
      if (data) {
        const result = await supabase.from("crm_menu_selection_items").select("*").eq("selection_id", data.id).order("created_at");
        if (!cancelled) setItems(result.data || []);
      } else setItems([]);
    })();
    return () => { cancelled = true; };
  }, [lead?.id]);

  if (!crm.business || crm.loading) return <div className="py-16 text-center text-muted-foreground">Loading…</div>;
  if ((view === "booking" && !booking) || !lead) return <div className="space-y-3 py-16 text-center"><p>Catering {view === "lead" ? "lead" : "booking"} not found.</p><Button variant="outline" asChild><Link to={`${base}/leads`}>Back to catering leads</Link></Button></div>;

  const pickup = booking?.fulfilment_method === "pickup";
  const method = pickup ? "Pickup" : "Delivery";
  const packages = items.filter(i => i.course === "package" || i.course === "kids_package");
  const courses: Record<string, any[]> = items.filter(i => !["package", "kids_package", "manual", "beverage", "live_stall"].includes(i.course)).reduce((map: Record<string, any[]>, i) => { (map[i.course || "Other"] ||= []).push(i); return map; }, {});

  const preview = async () => {
    if (!booking) return;
    if (rs) { nav(`${base}/bookings/${booking.id}/runsheet/${rs.id}`); return; }
    const { data, error } = await supabase.from("crm_runsheets").insert({ business_id: booking.business_id, lead_id: lead.id, booking_id: booking.id, event_order_number: booking.event_order_number, adult_guests: booking.adults || 0, kids_guests: booking.kids || 0, status: "draft" } as any).select("id").single();
    if (error) { toast.error(error.message); return; }
    await crm.refresh();
    nav(`${base}/bookings/${booking.id}/runsheet/${data.id}`);
  };
  const issue = async () => {
    if (!rs) return null;
    const { data, error } = await supabase.from("crm_runsheets").update({ status: "sent", sent_at: new Date().toISOString(), generated_at: new Date().toISOString() } as any).eq("id", rs.id).select().single();
    if (error) { toast.error(error.message); return null; }
    await crm.refresh();
    return data;
  };
  const openBkEdit = () => {
    if (!booking) return;
    setBk({ event_name: booking.event_name || "", event_date: booking.event_date || "", start_time: String(booking.start_time || "18:00").slice(0, 5), end_time: String(booking.end_time || bookingEnd(booking) || "23:00").slice(0, 5), fulfilment_method: booking.fulfilment_method || "delivery", service_location: booking.service_location || "", adults: String(booking.adults ?? booking.guest_count ?? ""), kids: String(booking.kids ?? 0), notes: booking.notes || "" });
    setEditBkOpen(true);
  };
  const saveBk = async () => {
    if (!booking) return;
    if (!bk.event_name || !bk.event_date || !(Number(bk.adults) > 0) || (bk.fulfilment_method === "delivery" && !bk.service_location)) { toast.error("Name, date, adults and delivery address are required."); return; }
    setBkSaving(true);
    const total = (Number(bk.adults) || 0) + (Number(bk.kids) || 0);
    const { error } = await supabase.from("crm_bookings").update({ event_name: bk.event_name, event_date: bk.event_date, start_time: bk.start_time, end_time: bk.end_time, duration_minutes: minutesBetween(bk.start_time, bk.end_time), fulfilment_method: bk.fulfilment_method, service_location: bk.fulfilment_method === "pickup" ? null : bk.service_location || null, adults: Number(bk.adults) || 0, kids: Number(bk.kids) || 0, guest_count: total, notes: bk.notes || null } as any).eq("id", booking.id);
    setBkSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Catering booking updated.");
    setEditBkOpen(false);
    await crm.refresh();
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <Button variant="ghost" asChild className="px-0"><Link to={view === "lead" ? `${base}/leads` : `${base}/bookings`}><ArrowLeft className="mr-2 h-4 w-4" />{view === "lead" ? "Catering leads" : "Catering bookings"}</Link></Button>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs font-semibold uppercase text-primary">{view === "lead" ? "Catering enquiry" : "Catering booking"}</p><h1 className="font-serif text-3xl font-semibold">{booking?.event_name || lead.full_name}</h1><p className="mt-1 text-sm text-muted-foreground">{lead.full_name}{booking?.event_order_number ? ` · Order ${booking.event_order_number}` : ""}</p></div>
      <div className="flex flex-wrap gap-2"><Badge variant={view === "lead" ? "outline" : "default"}>{view === "lead" ? prettyCrmValue(lead.lead_outcome === "declined" ? "declined" : "lead") : prettyCrmValue(booking.status)}</Badge>
        {view === "lead" ? <><Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Edit lead</Button>{lead.lead_outcome !== "declined" && <Button asChild><Link to={`${base}/bookings/new?lead=${lead.id}`}>Confirm as catering job</Link></Button>}</> : <><Button variant="outline" onClick={openBkEdit}><Pencil className="mr-2 h-4 w-4" />Edit booking</Button><Button variant="outline" onClick={preview}><FileText className="mr-2 h-4 w-4" />Preview run sheet</Button>{rs && <Button onClick={() => setSendOpen(true)}><Mail className="mr-2 h-4 w-4" />{rs.sent_at ? "Resend run sheet" : "Send run sheet"}</Button>}</>}
      </div>
    </header>
    <div className="grid gap-x-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Section title={booking ? "Catering order" : "Enquiry details"}><dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" value={booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "dd/MM/yyyy") : lead.preferred_dates?.[0] ? format(new Date(`${lead.preferred_dates[0]}T00:00:00`), "dd/MM/yyyy") : "—"} />
          {booking && <><Field label={`${method} window`} value={`${to12(String(booking.start_time).slice(0, 5))} – ${to12(bookingEnd(booking))}`} /><Field label="Service" value={method} /><Field label={pickup ? "Pickup" : "Delivery address"} value={pickup ? crm.business.name : booking.service_location || lead.service_location} /><Field label="Guests" value={`${booking.adults ?? booking.guest_count ?? 0} adults · ${booking.kids ?? 0} kids`} /></>}
          {!booking && <><Field label="Estimated guests" value={lead.estimated_guest_count} /><Field label="Source" value={prettyCrmValue(lead.source)} /></>}
        </dl></Section>
        {booking && <><Section title="Menu selection"><div className="space-y-3 text-sm">{packages.length ? <p><strong>Packages:</strong> {packages.map(i => i.course === "kids_package" ? `Kids menu (${i.quantity || booking.kids || 0})` : i.item_name).join(" · ")}</p> : <p className="text-muted-foreground">No packages selected.</p>}{Object.entries(courses).map(([course, dishes]) => <div key={course}><p className="font-semibold">{course}</p><p>{dishes.map(i => i.item_name).join(" · ")}</p></div>)}{items.filter(i => i.course === "live_stall").map(i => <p key={i.id}>Live stall: {i.item_name}</p>)}{selection?.dietary_requirements && <p>Dietary: {selection.dietary_requirements}</p>}{selection?.allergies && <p>Allergies: {selection.allergies}</p>}</div></Section>
          <Section title="Service schedules"><div className="grid gap-5 sm:grid-cols-2">{[["Food serving", rs?.service_schedule || []], ["FOH service", rs?.service_schedule_foh || []]].map(([title, entries]: any) => <div key={title}><p className="text-sm font-semibold">{title}</p>{entries.length ? entries.map((s: any, i: number) => <p key={i} className="text-sm">{s.time ? to12(s.time) : "—"} · {s.label}</p>) : <p className="text-sm text-muted-foreground">No timings set.</p>}</div>)}</div></Section>
          <Section title="Notes"><p className="whitespace-pre-wrap text-sm">{rs?.client_notes || booking.notes || "No notes recorded."}</p></Section></>}
      </div>
      <div>
        <Section title="Customer"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><Field label="Name" value={lead.full_name} /><Field label="Phone" value={lead.phone} /><Field label="Email" value={lead.email} /><Field label="Company" value={lead.company} /></dl></Section>
        {booking && <Section title="Catering team"><dl className="grid gap-4"><Field label="Coordinator" value={rs?.event_coordinator && `${rs.event_coordinator}${rs.event_coordinator_phone ? ` · ${rs.event_coordinator_phone}` : ""}`} /><Field label="Delivery / pickup contact" value={rs?.onsite_contact_name && `${rs.onsite_contact_name}${rs.onsite_contact_phone ? ` · ${rs.onsite_contact_phone}` : ""}`} /><Field label="Run sheet" value={rs ? `Revision ${rs.revision || 1} · ${rs.sent_at ? "sent" : "draft"}` : "Not yet created"} /></dl></Section>}
      </div>
    </div>
    <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} businessId={crm.business.id} options={crm.options} lead={lead} leads={crm.leads} onSaved={crm.refresh} defaultKind="catering" lockedKind="catering" />
    {booking && rs && <SendRunsheetDialog mode={rs.sent_at ? "resend" : "issue"} onIssue={issue} open={sendOpen} onOpenChange={setSendOpen} rs={rs} lead={lead} booking={booking} businessName={crm.business.name} />}
  </div>;
}