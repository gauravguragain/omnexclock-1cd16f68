import { eventLabel } from "@/lib/eventLabel";
import { useEffect, useMemo, useState } from "react";
import CateringMenuEditor, { cateringItemsTotal, cateringMenuRows, cateringMenuTotal, useBookPackages, type CPkg, type CDish } from "./CateringMenuEditor";
import ChafingCard from "./ChafingCard";
import { Link, useNavigate, useParams } from "react-router-dom";
import { format } from "date-fns";
import { toast } from "sonner";
import { ArrowLeft, FileText, Mail, Pencil, X } from "lucide-react";
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
import DeliveryCard from "./DeliveryCard";
import { BookingPaymentsCard } from "./payments";
import { bookingEnd, minutesBetween, to12, useEventsData } from "./useEventsData";


const Section = ({ title, children }: { title: string; children: React.ReactNode }) => <section className="space-y-3 border-t border-border py-5"><h2 className="text-lg font-semibold">{title}</h2>{children}</section>;
const Field = ({ label, value }: { label: string; value: React.ReactNode }) => <div className="min-w-0"><dt className="text-xs text-muted-foreground">{label}</dt><dd className="break-words text-sm font-medium">{value || "—"}</dd></div>;

export default function CateringDetailPage({ view }: { view: "lead" | "booking" }) {
  const { id, businessCode } = useParams();
  const nav = useNavigate();
  const crm = useCrmData();
  const ev = useEventsData();
  const [editOpen, setEditOpen] = useState(false);
  const [editBkOpen, setEditBkOpen] = useState(false);
  const [bkTab, setBkTab] = useState<"details" | "delivery" | "menu" | "team" | "customer">("details");
  const [bk, setBk] = useState({ event_name: "", event_date: "", start_time: "18:00", end_time: "23:00", fulfilment_method: "delivery", service_location: "", adults: "", kids: "", notes: "" });
  const [pkgs, setPkgs] = useState<CPkg[]>([]);
  const [team, setTeam] = useState({ coordinator: "", coordinator_phone: "", onsite_name: "", onsite_phone: "", client_notes: "" });
  const [bkSaving, setBkSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [selection, setSelection] = useState<any>(null);
  const [items, setItems] = useState<any[]>([]);
  const booking: any = view === "booking" ? crm.bookings.find(b => b.id === id && b.booking_kind === "catering") : null;
  const lead = crm.leads.find(l => l.id === (view === "lead" ? id : booking?.lead_id) && (l.lead_kind === "catering" || booking?.booking_kind === "catering" || l.event_type === "catering"));
  const rs: any = crm.runsheets.filter((r: any) => booking && (r.booking_id === booking.id || r.lead_id === booking.lead_id)).sort((a: any, b: any) => (b.revision || 0) - (a.revision || 0))[0];
  const base = `/b/${businessCode}/catering`;
  const bookPackages = useBookPackages(ev);

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
    setBkTab("customer");
    setBk({ event_name: booking.event_name || "", event_date: booking.event_date || "", start_time: String(booking.start_time || "18:00").slice(0, 5), end_time: String(booking.end_time || bookingEnd(booking) || "23:00").slice(0, 5), fulfilment_method: booking.fulfilment_method || "delivery", service_location: booking.service_location || "", adults: String(booking.adults ?? booking.guest_count ?? ""), kids: String(booking.kids ?? 0), notes: booking.notes || "" });
    const pkgRows = items.filter(i => i.course === "package");
    setPkgs(pkgRows.map((row, idx) => {
      const pk = ev.packages.find(p => p.id === row.source_package_id) || ev.packages.find(p => p.name === row.item_name);
      const legacy = row.notes?.startsWith("pkg:") ? row.notes.slice(4) : null;
      const key = row.package_group_key || legacy || `p${idx + 1}`;
      const bp: any = bookPackages.find(p => p.id === pk?.id);
      const dRows = items.filter(i => i.course !== "package" && i.course !== "kids_package" && (i.package_group_key ? i.package_group_key === key : legacy && i.notes === `pkg:${legacy}`));
      const dishes: CDish[] = dRows.map(i => {
        const course: any = bp?.courses.find((c: any) => c.id === i.source_course_id) || bp?.courses.find((c: any) => c.name === i.course);
        const name = i.selected_protein && String(i.item_name).endsWith(` (${i.selected_protein})`) ? String(i.item_name).slice(0, -(` (${i.selected_protein})`.length)) : String(i.item_name);
        const dish = course?.dishes.find((d: any) => d.id === i.source_dish_id) || (!i.source_course_id ? course?.dishes.find((d: any) => d.name === name) : null);
        return { courseId: course?.id, course: String(i.course), name, dishId: dish?.id, protein: i.selected_protein || undefined, notes: i.package_group_key ? i.notes || undefined : undefined, oneOff: !dish, diet: i.one_off_diet || undefined, extra: Number(i.price_per_head || 0) };
      });
      return { key, pkgId: pk?.id || "", bookId: pk?.book_id, name: row.item_name, pricePerHead: Number(row.price_per_head || 0), flatPrice: Number(row.flat_price || 0), dishes };
    }));
    setTeam({ coordinator: rs?.event_coordinator || "", coordinator_phone: rs?.event_coordinator_phone || "", onsite_name: rs?.onsite_contact_name || "", onsite_phone: rs?.onsite_contact_phone || "", client_notes: rs?.client_notes || booking.notes || "" });
    setEditBkOpen(true);
  };
  const saveBk = async () => {
    if (!booking || !crm.business) return;
    if (!bk.event_name || !bk.event_date || !(Number(bk.adults) > 0)) { toast.error("Name, date and adults are required."); return; }
    setBkSaving(true);
    const bid = crm.business.id;
    const total = (Number(bk.adults) || 0) + (Number(bk.kids) || 0);
    const { error } = await supabase.from("crm_bookings").update({ event_name: bk.event_name, event_date: bk.event_date, start_time: bk.start_time, end_time: bk.end_time, duration_minutes: minutesBetween(bk.start_time, bk.end_time), fulfilment_method: bk.fulfilment_method, service_location: bk.fulfilment_method === "pickup" ? null : booking.service_location || bk.service_location || null, adults: Number(bk.adults) || 0, kids: Number(bk.kids) || 0, guest_count: total, notes: bk.notes || null } as any).eq("id", booking.id);
    if (error) { setBkSaving(false); toast.error(error.message); return; }
    const chosen = pkgs;
    const { data: sel, error: se } = await supabase.from("crm_menu_selections").upsert({ business_id: bid, lead_id: lead.id, guest_count: Number(bk.adults) || total, package_name: chosen[0]?.name || null, updated_by: null } as any, { onConflict: "lead_id" }).select("id").single();
    if (se) { setBkSaving(false); toast.error(se.message); return; }
    await supabase.from("crm_menu_selection_items").delete().eq("selection_id", sel.id);
    const rows = cateringMenuRows(chosen, bid, sel.id);
    if (rows.length) { const { error: ie } = await supabase.from("crm_menu_selection_items").insert(rows as any); if (ie) { setBkSaving(false); toast.error(ie.message); return; } }
    if (rs) {
      const { error: re } = await supabase.from("crm_runsheets").update({ event_coordinator: team.coordinator || null, event_coordinator_phone: team.coordinator_phone || null, onsite_contact_name: team.onsite_name || null, onsite_contact_phone: team.onsite_phone || null, client_notes: team.client_notes || null } as any).eq("id", rs.id);
      if (re) { setBkSaving(false); toast.error(re.message); return; }
    }
    const newTotal = cateringMenuTotal(chosen, total) + (bk.fulfilment_method === "pickup" ? 0 : Number(booking.delivery_fee || 0)) + Number(booking.chafing_dishes || 0) * Number(booking.chafing_dish_price ?? 15);
    await supabase.from("crm_bookings").update({ total_amount: Math.round(newTotal * 100) / 100 } as any).eq("id", booking.id);
    setBkSaving(false);
    toast.success("Catering booking updated.");
    setEditBkOpen(false);
    await crm.refresh();
  };

  return <div className="mx-auto max-w-5xl space-y-5">
    <Button variant="ghost" asChild className="px-0"><Link to={view === "lead" ? `${base}/leads` : `${base}/bookings`}><ArrowLeft className="mr-2 h-4 w-4" />{view === "lead" ? "Catering leads" : "Catering bookings"}</Link></Button>
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
      <div><p className="text-xs font-semibold uppercase text-primary">{view === "lead" ? "Catering enquiry" : "Catering booking"}</p><h1 className="font-serif text-3xl font-semibold">{booking ? eventLabel(booking, lead.full_name) : lead.full_name}</h1><p className="mt-1 text-sm text-muted-foreground">{lead.full_name}{booking?.event_order_number ? ` · Order ${booking.event_order_number}` : ""}</p></div>
      <div className="flex flex-wrap gap-2"><Badge variant={view === "lead" ? "outline" : "default"}>{view === "lead" ? prettyCrmValue(lead.lead_outcome === "declined" ? "declined" : "lead") : prettyCrmValue(booking.status)}</Badge>
        {view === "lead" ? <><Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Edit lead</Button>{lead.lead_outcome !== "declined" && <Button asChild><Link to={`${base}/bookings/new?lead=${lead.id}`}>Confirm as catering job</Link></Button>}</> : <><Button variant="outline" onClick={openBkEdit}><Pencil className="mr-2 h-4 w-4" />Edit booking</Button><Button variant="outline" onClick={preview}><FileText className="mr-2 h-4 w-4" />Preview run sheet</Button>{rs && <Button onClick={() => setSendOpen(true)}><Mail className="mr-2 h-4 w-4" />{rs.sent_at ? "Resend run sheet" : "Send run sheet"}</Button>}</>}
      </div>
    </header>
    <div className="grid gap-x-10 lg:grid-cols-[1.4fr_1fr]">
      <div>
        <Section title="Customer"><dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1"><Field label="Name" value={lead.full_name} /><Field label="Phone" value={lead.phone} /><Field label="Email" value={lead.email} /><Field label="Company" value={lead.company} /></dl></Section>
        <Section title={booking ? "Catering order" : "Enquiry details"}><dl className="grid gap-4 sm:grid-cols-2">
          <Field label="Date" value={booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "dd/MM/yyyy") : lead.preferred_dates?.[0] ? format(new Date(`${lead.preferred_dates[0]}T00:00:00`), "dd/MM/yyyy") : "—"} />
          {booking && <><Field label={`${method} window`} value={`${to12(String(booking.start_time).slice(0, 5))} – ${to12(bookingEnd(booking))}`} /><Field label="Service" value={method} /><Field label={pickup ? "Pickup" : "Delivery address"} value={pickup ? crm.business.name : booking.service_location || lead.service_location} /><Field label="Guests" value={`${booking.adults ?? booking.guest_count ?? 0} adults · ${booking.kids ?? 0} kids`} /></>}
          {!booking && <><Field label="Estimated guests" value={lead.estimated_guest_count} /><Field label="Source" value={prettyCrmValue(lead.source)} /></>}
        </dl></Section>
        {booking && !pickup && <Section title="Delivery"><dl className="grid gap-4 sm:grid-cols-2"><Field label="Address" value={booking.service_location ? <a className="text-primary underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(booking.service_location)}`}>{booking.service_location}</a> : null} /><Field label="Distance from Wentworthville" value={booking.delivery_distance_km != null ? `${Number(booking.delivery_distance_km).toFixed(2)} km` : null} /><Field label="Delivery fee" value={booking.delivery_fee != null ? `$${Number(booking.delivery_fee).toFixed(2)}${booking.delivery_fee_manual ? " (manual)" : ""}` : null} /></dl></Section>}
        {booking && <><Section title="Menu selection"><div className="space-y-3 text-sm">{packages.length ? <p><strong>Packages:</strong> {packages.map(i => i.course === "kids_package" ? `Kids menu (${i.quantity || booking.kids || 0})` : i.item_name).join(" · ")}</p> : <p className="text-muted-foreground">No packages selected.</p>}{Object.entries(courses).map(([course, dishes]) => <div key={course}><p className="font-semibold">{course}</p><p>{dishes.map(i => `${i.item_name}${i.package_group_key && i.notes ? ` — ${i.notes}` : ""}`).join(" · ")}</p></div>)}{items.filter(i => i.course === "live_stall").map(i => <p key={i.id}>Live stall: {String(i.item_name || "").replace(/_/g, " ")}</p>)}{selection?.dietary_requirements && <p>Dietary: {selection.dietary_requirements}</p>}{selection?.allergies && <p>Allergies: {selection.allergies}</p>}</div></Section>
          {(() => { const menuT = cateringItemsTotal(items, (booking.adults ?? 0) + (booking.kids ?? 0)); const del = pickup ? 0 : Number(booking.delivery_fee || 0); const cq = Number(booking.chafing_dishes || 0); const cp = Number(booking.chafing_dish_price ?? 15); return <><Section title="Chafing dishes"><Field label="Chafing dishes required" value={cq > 0 ? `${cq} × $${cp.toFixed(2)} = $${(cq * cp).toFixed(2)}` : "No"} /></Section><Section title="Total"><dl className="grid gap-4 sm:grid-cols-2"><Field label="Menu" value={`$${menuT.toFixed(2)}`} />{!pickup && <Field label="Delivery" value={`$${del.toFixed(2)}`} />}<Field label={`Chafing dishes${cq ? ` (${cq} × $${cp.toFixed(2)})` : ""}`} value={`$${(cq * cp).toFixed(2)}`} /><Field label="Booking total" value={<strong>${Number(booking.total_amount || 0).toFixed(2)}</strong>} /></dl></Section></>; })()}
          <Section title="Notes"><p className="whitespace-pre-wrap text-sm">{rs?.client_notes || booking.notes || "No notes recorded."}</p></Section></>}
      </div>
      <div>
        {booking && <div className="mb-6"><BookingPaymentsCard booking={booking} onChanged={crm.refresh} /></div>}
        {booking && <Section title="Catering team"><dl className="grid gap-4"><Field label="Coordinator" value={rs?.event_coordinator && `${rs.event_coordinator}${rs.event_coordinator_phone ? ` · ${rs.event_coordinator_phone}` : ""}`} /><Field label="Delivery / pickup contact" value={rs?.onsite_contact_name && `${rs.onsite_contact_name}${rs.onsite_contact_phone ? ` · ${rs.onsite_contact_phone}` : ""}`} /><Field label="Run sheet" value={rs ? `Revision ${rs.revision || 1} · ${rs.sent_at ? "sent" : "draft"}` : "Not yet created"} /></dl></Section>}
      </div>
    </div>
    <LeadFormDialog open={editOpen} onOpenChange={setEditOpen} businessId={crm.business.id} options={crm.options} lead={lead} leads={crm.leads} onSaved={crm.refresh} defaultKind="catering" lockedKind="catering" />
    {booking && rs && <SendRunsheetDialog mode={rs.sent_at ? "resend" : "issue"} onIssue={issue} open={sendOpen} onOpenChange={setSendOpen} rs={rs} lead={lead} booking={booking} businessName={crm.business.name} />}
    <Dialog open={editBkOpen} onOpenChange={setEditBkOpen}><DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto"><DialogHeader><DialogTitle>Edit catering booking</DialogTitle></DialogHeader>
      <div className="flex flex-wrap gap-2 border-b border-border pb-3">{([["customer", "Customer"], ["details", "Details"], ...(bk.fulfilment_method !== "pickup" ? [["delivery", "Delivery"]] : []), ["menu", "Menu selection & chafing"], ["team", "Team"]] as [typeof bkTab, string][]).map(([k, l]) => <Button key={k} size="sm" variant={bkTab === k ? "default" : "outline"} onClick={() => setBkTab(k)}>{l}</Button>)}</div>
      {bkTab === "delivery" && booking && <div><DeliveryCard key={booking.id} booking={booking} onChanged={crm.refresh} /><p className="text-xs text-muted-foreground">Press Save delivery above to keep delivery changes.</p></div>}
      {bkTab === "menu" && booking && <div><CateringMenuEditor pkgs={pkgs} setPkgs={setPkgs} bookPackages={bookPackages} /><p className="text-right text-sm">Menu total: <strong>${cateringMenuTotal(pkgs, (Number(bk.adults) || 0) + (Number(bk.kids) || 0)).toFixed(2)}</strong> <span className="text-muted-foreground">for {(Number(bk.adults) || 0) + (Number(bk.kids) || 0)} guests</span></p><ChafingCard key={`chafe-${booking.id}`} booking={booking} menuTotal={cateringItemsTotal(items, (booking.adults ?? 0) + (booking.kids ?? 0))} onChanged={crm.refresh} /><p className="text-xs text-muted-foreground">Press Save &amp; update total to keep chafing and total changes.</p></div>}
      {bkTab === "customer" && <div className="space-y-3 text-sm"><p>{lead.full_name} · {lead.phone || "no phone"} · {lead.email || "no email"}{lead.company ? ` · ${lead.company}` : ""}</p><Button variant="outline" onClick={() => setEditOpen(true)}><Pencil className="mr-2 h-4 w-4" />Edit customer details</Button></div>}
      {bkTab === "details" && <div className="space-y-4">
        <div><Label>Booking name</Label><Input value={bk.event_name} onChange={e => setBk(p => ({ ...p, event_name: e.target.value }))} /></div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Date</Label><DateField value={bk.event_date} onChange={v => setBk(p => ({ ...p, event_date: v }))} /></div>
          <div><Label>Service</Label><Select value={bk.fulfilment_method} onValueChange={v => setBk(p => ({ ...p, fulfilment_method: v }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="delivery">Delivery</SelectItem><SelectItem value="pickup">Pickup</SelectItem></SelectContent></Select></div>
          <div><Label>{bk.fulfilment_method === "pickup" ? "Pickup from" : "Delivery from"}</Label><TimeDropdownPicker value={bk.start_time} onChange={v => setBk(p => ({ ...p, start_time: v }))} /></div>
          <div><Label>{bk.fulfilment_method === "pickup" ? "Pickup by" : "Delivery by"}</Label><TimeDropdownPicker value={bk.end_time} onChange={v => setBk(p => ({ ...p, end_time: v }))} /></div>
          <div><Label>Adults</Label><Input type="number" min={1} value={bk.adults} onChange={e => setBk(p => ({ ...p, adults: e.target.value }))} /></div>
          <div><Label>Kids</Label><Input type="number" min={0} value={bk.kids} onChange={e => setBk(p => ({ ...p, kids: e.target.value }))} /></div>
        </div>
        <div><Label>Notes</Label><Textarea rows={3} value={bk.notes} onChange={e => setBk(p => ({ ...p, notes: e.target.value }))} /></div>
      </div>}
      {bkTab === "team" && <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <div><Label>Coordinator</Label><Select value={team.coordinator || "none"} onValueChange={v => { const s = ev.stakeholders.find(x => x.full_name === v); setTeam(p => ({ ...p, coordinator: v === "none" ? "" : v, coordinator_phone: v === "none" ? "" : (s?.phone || p.coordinator_phone) })); }}><SelectTrigger><SelectValue placeholder="Choose coordinator" /></SelectTrigger><SelectContent><SelectItem value="none">None</SelectItem>{ev.stakeholders.filter(s => s.stakeholder_type === "coordinator" && s.active !== false).map(s => <SelectItem key={s.id} value={s.full_name}>{s.full_name}</SelectItem>)}</SelectContent></Select></div>
          <div><Label>Coordinator phone</Label><Input value={team.coordinator_phone} onChange={e => setTeam(p => ({ ...p, coordinator_phone: e.target.value }))} /></div>
          <div><Label>Delivery / pickup contact</Label><Input value={team.onsite_name} onChange={e => setTeam(p => ({ ...p, onsite_name: e.target.value }))} /></div>
          <div><Label>Contact phone</Label><Input value={team.onsite_phone} onChange={e => setTeam(p => ({ ...p, onsite_phone: e.target.value }))} /></div>
        </div>
        <div><Label>Client notes (shown on run sheet)</Label><Textarea rows={3} value={team.client_notes} onChange={e => setTeam(p => ({ ...p, client_notes: e.target.value }))} /></div>
        {!rs && <p className="text-xs text-muted-foreground">Team details save once a run sheet exists — preview the run sheet first.</p>}
      </div>}
      <div className="flex justify-end gap-2 border-t border-border pt-4"><Button variant="outline" onClick={() => setEditBkOpen(false)}>Cancel</Button><Button onClick={saveBk} disabled={bkSaving}>{bkSaving ? "Saving…" : "Save changes"}</Button></div>
    </DialogContent></Dialog>
  </div>;
}