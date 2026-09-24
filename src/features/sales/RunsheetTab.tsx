import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { CheckCircle2, Circle, Eye, Mail, Plus, Save, Send, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { format, subDays } from "date-fns";
import type { CrmLead, CrmOption } from "./types";
import { prettyCrmValue } from "./types";
import SendRunsheetDialog from "@/features/events/SendRunsheetDialog";
type RunsheetScheduleLine = { time: string; label: string; detail?: string };

const FALLBACK_SETUP_ITEMS = [
  "Black tablecloths", "White tablecloths", "Red carpet", "Smoke machine", "Cold sparkles", "Dry ice",
  "LED screen", "Digital welcome signage", "Cake stand", "Gift table on stage", "Stage setup",
  "Dance floor", "Microphone and PA", "High chairs",
];
const FALLBACK_COURSES = ["Live stall", "Entrees", "Kids menu", "Mains", "Dessert", "Tea and coffee", "Cake cutting", "Speeches"];

type ScheduleRow = RunsheetScheduleLine & { key: string };

const timeToMinutes = (value: string) => { const [h, m] = value.split(":").map(Number); return h * 60 + (m || 0); };
const minutesToTime = (value: number) => `${String(Math.floor(value / 60) % 24).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
const prettyTime = (value: string) => {
  if (!value) return "";
  const [h, m] = value.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m || 0).padStart(2, "0")} ${suffix}`;
};

export default function RunsheetTab({ lead, booking, options, onSaved }: {
  lead: CrmLead; booking: any; options: CrmOption[]; onSaved: () => void;
}) {
  const { user } = useAuth();
  const { business } = useBusiness();
  const [stakeholders, setStakeholders] = useState<any[]>([]);
  useEffect(() => { if (!business?.id) return; (supabase.from("crm_stakeholders" as any) as any).select("*").eq("business_id", business.id).eq("active", true).order("full_name").then(({ data }: any) => setStakeholders(data || [])); }, [business?.id]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [sendOpen, setSendOpen] = useState(false);
  const [runsheet, setRunsheet] = useState<any>(null);
  const [menu, setMenu] = useState<{ selection: any; items: any[]; catalogue: Record<string, string> }>({ selection: null, items: [], catalogue: {} });

  const [form, setForm] = useState({
    event_order_number: "", booking_reference: "", sales_person: "", sales_person_phone: "", event_coordinator: "", event_coordinator_phone: "",
    onsite_contact_name: "", onsite_contact_phone: "", adult_guests: "", kids_guests: "",
    access_time: "", setup_notes: "", special_requests: "", distributed_to: "", ops_notes: "", client_notes: "",
  });
  const [accessEnabled, setAccessEnabled] = useState(false);
  const [setupItems, setSetupItems] = useState<string[]>([]);
  const [extraSetupItems, setExtraSetupItems] = useState<string[]>([]);
  const [newSetupItem, setNewSetupItem] = useState("");
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [fohSchedule, setFohSchedule] = useState<ScheduleRow[]>([]);

  const setupOptions = useMemo(() => {
    const configured = options.filter((o) => o.option_type === "setup_item" && o.active).map((o) => o.label);
    const base = configured.length ? configured : FALLBACK_SETUP_ITEMS;
    return Array.from(new Set([...base, ...extraSetupItems, ...setupItems]));
  }, [options, extraSetupItems, setupItems]);

  const courseOptions = useMemo(() => {
    const configured = options.filter((o) => o.option_type === "service_course" && o.active).map((o) => o.label);
    return configured.length ? configured : FALLBACK_COURSES;
  }, [options]);

  const load = useCallback(async () => {
    setLoading(true);
    const [runsheetRes, selectionRes, catalogueRes] = await Promise.all([
      supabase.from("crm_runsheets").select("*").eq("lead_id", lead.id).maybeSingle(),
      supabase.from("crm_menu_selections").select("*").eq("lead_id", lead.id).maybeSingle(),
      supabase.from("crm_menu_items").select("id,category").eq("business_id", lead.business_id),
    ]);
    const catalogue: Record<string, string> = {};
    (catalogueRes.data || []).forEach((item: any) => { catalogue[item.id] = item.category; });
    let items: any[] = [];
    if (selectionRes.data?.id) {
      const { data } = await supabase.from("crm_menu_selection_items").select("*").eq("selection_id", selectionRes.data.id);
      items = data || [];
    }
    setMenu({ selection: selectionRes.data, items, catalogue });

    const row: any = runsheetRes.data;
    setRunsheet(row || null);
    if (row) {
      setForm({
        event_order_number: row.event_order_number || "", booking_reference: row.booking_reference || "",
        sales_person: row.sales_person || "", sales_person_phone: row.sales_person_phone || "", event_coordinator: row.event_coordinator || "", event_coordinator_phone: row.event_coordinator_phone || "",
        onsite_contact_name: row.onsite_contact_name || "", onsite_contact_phone: row.onsite_contact_phone || "",
        adult_guests: row.adult_guests != null ? String(row.adult_guests) : "",
        kids_guests: row.kids_guests != null ? String(row.kids_guests) : "",
        access_time: row.access_time || "", setup_notes: row.setup_notes || "", special_requests: row.special_requests || "",
        distributed_to: row.distributed_to || "", ops_notes: row.ops_notes || "", client_notes: row.client_notes || "",
      });
      setAccessEnabled(Boolean(row.access_time));
      setSetupItems(row.setup_items || []);
      setSchedule(((row.service_schedule || []) as RunsheetScheduleLine[]).map((line, index) => ({ ...line, key: `s${index}` })));
      setFohSchedule(((row.service_schedule_foh || []) as RunsheetScheduleLine[]).map((line, index) => ({ ...line, key: `f${index}` })));
    } else {
      setAccessEnabled(false);
      setForm((prev) => ({
        ...prev,
        adult_guests: String(booking?.guest_count || lead.estimated_guest_count || ""),
        booking_reference: lead.id.slice(0, 10).toUpperCase(),
        onsite_contact_name: lead.full_name, onsite_contact_phone: lead.phone || "",
        client_notes: menu.selection?.dietary_requirements || "",
      }));
    }
    setLoading(false);
  }, [lead.id, lead.business_id, lead.full_name, lead.phone, lead.estimated_guest_count, booking?.guest_count]);

  useEffect(() => { void load(); }, [load]);

  const menuByCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    menu.items.filter((item: any) => !["package", "live_stall", "kids_package", "manual", "beverage"].includes(item.course)).forEach((item: any) => {
      const category = item.course || (item.menu_item_id ? prettyCrmValue(menu.catalogue[item.menu_item_id] || "other") : "Menu items");
      groups.set(category, [...(groups.get(category) || []), item.item_name]);
    });
    return Array.from(groups.entries())
      .map(([category, items]) => ({ category, items }));
  }, [menu]);
  const packageName = useMemo(() => {
    const packages = menu.items.filter((item: any) => item.course === "package").map((item: any) => item.item_name);
    return menu.selection?.package_name || packages.join(", ") || null;
  }, [menu]);
  const liveStalls = useMemo(() => {
    const stalls = menu.items.filter((item: any) => item.course === "live_stall");
    return stalls.map((stall: any) => ({
      name: stall.item_name,
      startTime: stall.service_start_time ? prettyTime(String(stall.service_start_time).slice(0, 5)) : "",
      endTime: stall.service_end_time ? prettyTime(String(stall.service_end_time).slice(0, 5)) : "",
    }));
  }, [menu]);
  const corkageNote = useMemo(() => {
    const selection: any = menu.selection;
    if (!selection?.corkage_enabled) return null;
    return "Host bringing own drinks";
  }, [menu.selection]);

  const startTime = String(booking?.start_time || "17:30").slice(0, 5);
  const endTime = minutesToTime(timeToMinutes(startTime) + Number(booking?.duration_minutes || 300));

  const suggestSchedule = useCallback(() => {
    const start = timeToMinutes(startTime);
    const hasStall = menu.items.some((i: any) => (menu.catalogue[i.menu_item_id] || "").includes("stall"));
    const hasKids = Number(form.kids_guests || 0) > 0;
    const foodPlan: { label: string; offset: number; detail?: string }[] = [
      ...(hasStall ? [{ label: courseOptions.find((c) => c.toLowerCase().includes("stall")) || "Live stall", offset: 30 }] : []),
      { label: courseOptions.find((c) => c.toLowerCase().includes("entree")) || "Entrees", offset: 45 },
      ...(hasKids ? [{ label: courseOptions.find((c) => c.toLowerCase().includes("kids")) || "Kids menu", offset: 60, detail: `${form.kids_guests} kids` }] : []),
      { label: courseOptions.find((c) => c.toLowerCase().includes("main")) || "Mains", offset: 150 },
      { label: courseOptions.find((c) => c.toLowerCase().includes("dessert")) || "Dessert", offset: 225 },
    ];
    const fohPlan: { label: string; offset: number; detail?: string }[] = [
      { label: "Guest arrival and beverages", offset: 0, detail: menu.selection?.beverage_package ? prettyCrmValue(menu.selection.beverage_package) : "" },
      { label: "Speeches", offset: 105 },
      { label: "Cake cutting", offset: 210 },
      { label: "Carriages / pack down", offset: timeToMinutes(endTime) - start },
    ];
    setSchedule(foodPlan.map((line, index) => ({ key: `p${index}`, time: minutesToTime(start + line.offset), label: line.label, detail: line.detail || "" })));
    setFohSchedule(fohPlan.map((line, index) => ({ key: `q${index}`, time: minutesToTime(start + line.offset), label: line.label, detail: line.detail || "" })));
  }, [startTime, endTime, courseOptions, menu, form.kids_guests]);

  const buildFromBooking = () => {
    if (!booking) { toast.error("Prepare the booking on the Confirmation tab first"); return; }
    setForm((prev) => ({
      ...prev,
      adult_guests: prev.adult_guests || String(Math.max(0, Number(booking.guest_count || 0) - Number(prev.kids_guests || 0))),
      booking_reference: prev.booking_reference || lead.id.slice(0, 10).toUpperCase(),
      onsite_contact_name: prev.onsite_contact_name || lead.full_name,
      onsite_contact_phone: prev.onsite_contact_phone || lead.phone || "",
      client_notes: prev.client_notes || [menu.selection?.dietary_requirements, menu.selection?.allergies ? `Allergies: ${menu.selection.allergies}` : ""].filter(Boolean).join(" · "),
    }));
    if (!schedule.length && !fohSchedule.length) suggestSchedule();
    toast.success("Runsheet built from the booking and menu");
  };

  const checklist = useMemo(() => ([
    { label: "Booking date, time and venue set", done: Boolean(booking?.event_date), hint: "Confirmation tab" },
    { label: "Guest numbers split into adults and kids", done: Number(form.adult_guests || 0) > 0 },
    { label: "Menu selection saved", done: menu.items.length > 0, hint: "Menu tab" },
    { label: "Beverage package chosen", done: Boolean(menu.selection?.beverage_package), hint: "Menu tab" },
    { label: "Event coordinator assigned", done: Boolean(form.event_coordinator.trim()) },
    { label: "Onsite contact on the day", done: Boolean(form.onsite_contact_name.trim() && form.onsite_contact_phone.trim()) },
    { label: "Service schedule built", done: schedule.length > 0 || fohSchedule.length > 0 },
    { label: "Setup and styling ticked off", done: setupItems.length > 0 },
    ...(accessEnabled ? [{ label: "Vendor access time agreed", done: Boolean(form.access_time) }] : []),
    { label: "Deposit received", done: ["deposit_received", "menu_selected", "invoice_sent", "runsheet_sent", "full_payment_received"].includes(lead.status) },
  ]), [booking, form, menu, schedule, fohSchedule, setupItems, lead.status, accessEnabled]);

  const completed = checklist.filter((c) => c.done).length;
  const readyToSend = completed === checklist.length;

  const addSetupOption = async () => {
    const label = newSetupItem.trim();
    if (!label) return;
    setExtraSetupItems((v) => Array.from(new Set([...v, label])));
    setSetupItems((v) => Array.from(new Set([...v, label])));
    setNewSetupItem("");
    const { error } = await supabase.from("crm_options").upsert({
      business_id: lead.business_id, option_type: "setup_item", label,
      value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      sort_order: 900, created_by: user?.id, active: true,
    } as any, { onConflict: "business_id,option_type,value" });
    toast.success(error ? "Added to this runsheet" : "Added to your setup list");
  };

  const persist = async (extra: Record<string, any> = {}) => {
    const payload: any = {
      business_id: lead.business_id, lead_id: lead.id, booking_id: booking?.id || null,
      event_order_number: form.event_order_number || null, booking_reference: form.booking_reference || null,
       sales_person: form.sales_person || null, sales_person_phone: form.sales_person_phone || null,
       event_coordinator: form.event_coordinator || null, event_coordinator_phone: form.event_coordinator_phone || null,
      onsite_contact_name: form.onsite_contact_name || null, onsite_contact_phone: form.onsite_contact_phone || null,
      adult_guests: form.adult_guests ? Number(form.adult_guests) : null,
      kids_guests: form.kids_guests ? Number(form.kids_guests) : null,
      access_time: accessEnabled ? (form.access_time || null) : null, setup_items: setupItems, setup_notes: form.setup_notes || null,
      service_schedule: schedule.map(({ time, label, detail }) => ({ time, label, detail })),
      service_schedule_foh: fohSchedule.map(({ time, label, detail }) => ({ time, label, detail })),
      special_requests: form.special_requests || null, distributed_to: form.distributed_to || null,
      ops_notes: form.ops_notes || null, client_notes: form.client_notes || null,
      updated_by: user?.id, ...extra,
    };
    if (!runsheet) payload.created_by = user?.id;
    const { data, error } = await supabase.from("crm_runsheets").upsert(payload, { onConflict: "lead_id" }).select("*").single();
    if (error) { toast.error(error.message); return null; }
    setRunsheet(data);
    return data;
  };

  const save = async () => {
    setSaving(true);
    const bumped = runsheet?.status === "sent" ? { revision: Number(runsheet.revision || 1) + 1, status: "revised" } : {};
    const saved = await persist(bumped);
    setSaving(false);
    if (!saved) return;
    toast.success(bumped.revision ? `Saved as revision ${bumped.revision}` : "Runsheet saved");
    onSaved();
  };

  const issueRunsheet = async (): Promise<any | null> => {
    setSaving(true);
    const revision = Number(runsheet?.revision || 1);
    const saved = await persist({ status: "sent", sent_at: new Date().toISOString(), generated_at: new Date().toISOString(), revision });
    if (!saved) { setSaving(false); return null; }

    const audience = form.distributed_to || "the operations team";
    await supabase.from("crm_interactions").insert({
      business_id: lead.business_id, lead_id: lead.id, interaction_type: "note",
      occurred_at: new Date().toISOString(),
      notes: `Runsheet v${revision} issued to ${audience}.`,
      logged_by: user?.id,
    } as any);

    if (booking?.event_date) {
      await supabase.from("crm_tasks").insert({
        business_id: lead.business_id, lead_id: lead.id, booking_id: booking.id,
        title: `Operations brief — ${lead.full_name} (${prettyCrmValue(lead.event_type)})`,
        description: `Walk the floor and kitchen through runsheet v${revision}.`,
        task_type: "follow_up", priority: "high",
        due_at: subDays(new Date(`${booking.event_date}T09:00:00`), 1).toISOString(),
        created_by: user?.id,
      } as any);
      await supabase.from("crm_tasks").insert({
        business_id: lead.business_id, lead_id: lead.id,
        title: `Final numbers and payment check — ${lead.full_name}`,
        description: "Confirm final guest numbers and collect the outstanding balance.",
        task_type: "follow_up", priority: "high",
        due_at: subDays(new Date(`${booking.event_date}T09:00:00`), 7).toISOString(),
        created_by: user?.id,
      } as any);
    }

    if (["deposit_received", "menu_selected", "invoice_sent", "inspected", "contacted", "new", "inspection_booked"].includes(lead.status)) {
      await supabase.from("crm_leads").update({ status: "runsheet_sent", last_contact_at: new Date().toISOString() }).eq("id", lead.id);
    }

    setSaving(false);
    toast.success(`Run sheet v${revision} issued — follow-up tasks created`);
    onSaved();
    return saved;
  };
  const [issueOpen, setIssueOpen] = useState(false);
  const coordinators = useMemo(() => stakeholders.filter((p) => p.stakeholder_type === "coordinator"), [stakeholders]);

  if (loading) return <p className="py-8 text-sm text-muted-foreground">Loading runsheet…</p>;

  const pickPerson = (key: keyof typeof form, phoneKey: keyof typeof form) => (event: { target: { value: string } }) => { const v = event.target.value; const match = stakeholders.find((p) => p.full_name === v); setForm((prev) => ({ ...prev, [key]: v, ...(match?.phone ? { [phoneKey]: match.phone } : {}) })); };
  const PersonSelect = ({ value, personKey, phoneKey, placeholder }: { value: string; personKey: keyof typeof form; phoneKey: keyof typeof form; placeholder: string }) => (
    <select
      value={value}
      onChange={pickPerson(personKey, phoneKey)}
      className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
    >
      <option value="">{placeholder}</option>
      {value && !coordinators.some((p) => p.full_name === value) ? <option value={value}>{value}</option> : null}
      {coordinators.map((p) => <option key={p.id} value={p.full_name}>{p.full_name}{p.phone ? ` — ${p.phone}` : ""}</option>)}
    </select>
  );
  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: event.target.value }));
  const revision = Number(runsheet?.revision || 1);

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-serif text-lg">{prettyCrmValue(lead.event_type)} · {booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "EEE d MMM yyyy") : "No booking date yet"}</p>
              <Badge variant={runsheet?.status === "sent" ? "default" : "outline"}>{runsheet ? `${prettyCrmValue(runsheet.status)} · v${revision}` : "Not started"}</Badge>
            </div>
            <p className="text-sm text-muted-foreground">{prettyTime(startTime)} – {prettyTime(endTime)} · {prettyCrmValue(booking?.venue_space || lead.venue_space || "Venue to confirm")}</p>
            {runsheet?.sent_at && <p className="text-xs text-muted-foreground">Last issued {format(new Date(runsheet.sent_at), "d MMM yyyy h:mm a")}{runsheet.distributed_to ? ` to ${runsheet.distributed_to}` : ""}</p>}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={buildFromBooking}><Sparkles className="mr-2 h-4 w-4" />Build from booking</Button>
            <Button size="sm" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />Save</Button>
            {runsheet?.id && <Button size="sm" variant="outline" onClick={() => window.open(`${window.location.origin}/runsheet/${runsheet.id}?t=${runsheet.share_token}`, "_blank", "noopener")}><Eye className="mr-2 h-4 w-4" />View run sheet</Button>}
            {runsheet?.sent_at && <Button size="sm" variant="outline" onClick={() => setSendOpen(true)}><Mail className="mr-2 h-4 w-4" />Resend Email</Button>}
            <Button size="sm" variant="secondary" onClick={() => setIssueOpen(true)} disabled={saving || !readyToSend} title={readyToSend ? "" : "Complete the checklist first"}>
              <Send className="mr-2 h-4 w-4" />{runsheet?.sent_at ? "Re-issue & send" : "Confirm & send"}
            </Button>
          </div>
        </div>
        <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1.2fr]">
          <div>
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Event pack readiness</span><span>{completed}/{checklist.length}</span></div>
            <Progress value={(completed / checklist.length) * 100} className="mt-1.5 h-2" />
            <div className="mt-2 space-y-1">
              {checklist.map((item) => (
                <p key={item.label} className={`flex items-center gap-2 text-xs ${item.done ? "text-muted-foreground" : "text-foreground"}`}>
                  {item.done ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Circle className="h-3.5 w-3.5" />}
                  {item.label}{!item.done && item.hint ? <span className="text-muted-foreground">— {item.hint}</span> : null}
                </p>
              ))}
            </div>
          </div>
          <div className="space-y-2 rounded-md border border-dashed border-border p-3 text-sm">
            <p className="font-medium">How this runs</p>
            <p className="text-muted-foreground text-xs">Enquiry → inspection → menu → invoice → deposit → <strong>runsheet issued</strong> → final numbers → event day. Issuing the runsheet files a copy against the client, moves them to Runsheet Sent, and creates two reminders: final numbers a week out, and an operations brief the day before.</p>
            <div className="space-y-1.5"><Label>Issue to</Label><Input value={form.distributed_to} onChange={set("distributed_to")} placeholder="Kitchen, floor team, AV" /></div>
          </div>
        </div>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label>Event order number</Label><Input value={form.event_order_number} onChange={set("event_order_number")} placeholder="698-1" /></div>
        <div className="space-y-1.5"><Label>Booking reference</Label><Input value={form.booking_reference} onChange={set("booking_reference")} /></div>
        <div className="space-y-1.5"><Label>Sales person</Label><PersonSelect value={form.sales_person} personKey="sales_person" phoneKey="sales_person_phone" placeholder="Select from coordinators" /></div>
        <div className="space-y-1.5"><Label>Sales person contact number</Label><Input type="tel" value={form.sales_person_phone} onChange={set("sales_person_phone")} /></div>
        <div className="space-y-1.5"><Label>Event coordinator</Label><PersonSelect value={form.event_coordinator} personKey="event_coordinator" phoneKey="event_coordinator_phone" placeholder="Select from coordinators" /></div>
        <div className="space-y-1.5"><Label>Event coordinator contact number</Label><Input type="tel" value={form.event_coordinator_phone} onChange={set("event_coordinator_phone")} /></div>
        <div className="space-y-1.5"><Label>Onsite contact</Label><PersonSelect value={form.onsite_contact_name} personKey="onsite_contact_name" phoneKey="onsite_contact_phone" placeholder="Select from coordinators" /></div>
        <div className="space-y-1.5"><Label>Onsite contact number</Label><Input value={form.onsite_contact_phone} onChange={set("onsite_contact_phone")} /></div>
        <div className="space-y-1.5"><Label>Adults</Label><Input type="number" min="0" value={form.adult_guests} onChange={set("adult_guests")} /></div>
        <div className="space-y-1.5"><Label>Kids</Label><Input type="number" min="0" value={form.kids_guests} onChange={set("kids_guests")} /></div>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-serif text-lg">Food serving schedule</h3><p className="text-xs text-muted-foreground">When each course goes out, for the kitchen.</p></div>
          <Button type="button" size="sm" variant="outline" onClick={() => { suggestSchedule(); toast.success("Timings suggested — adjust as needed"); }}><Sparkles className="mr-2 h-4 w-4" />Suggest timings</Button>
        </div>
        <div className="space-y-2">
          {schedule.map((row, index) => (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[9rem_1fr_1.4fr_auto]">
              <TimeDropdownPicker value={row.time || startTime} onChange={(value) => setSchedule((v) => v.map((r, i) => (i === index ? { ...r, time: value } : r)))} />
              <select
                value={courseOptions.includes(row.label) ? row.label : "__custom__"}
                onChange={(event) => { const value = event.target.value; setSchedule((v) => v.map((r, i) => (i === index ? { ...r, label: value === "__custom__" ? "" : value } : r))); }}
                className="h-10 rounded-md border border-input bg-background px-3 text-sm"
              >
                {courseOptions.map((course) => <option key={course} value={course}>{course}</option>)}
                <option value="__custom__">Other (type your own)</option>
              </select>
              {!courseOptions.includes(row.label)
                ? <Input value={row.label} placeholder="What is being served" onChange={(event) => setSchedule((v) => v.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)))} />
                : <Input value={row.detail || ""} placeholder="Notes e.g. served on the table" onChange={(event) => setSchedule((v) => v.map((r, i) => (i === index ? { ...r, detail: event.target.value } : r)))} />}
              <Button type="button" variant="ghost" size="icon" title="Remove line" onClick={() => setSchedule((v) => v.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {!schedule.length && <p className="text-sm text-muted-foreground">No food timings yet.</p>}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setSchedule((v) => [...v, { key: `n${Date.now()}`, time: startTime, label: courseOptions[0] || "", detail: "" }])}><Plus className="mr-2 h-4 w-4" />Add food timing</Button>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div><h3 className="font-serif text-lg">FOH service schedule</h3><p className="text-xs text-muted-foreground">What happens when on the floor — arrivals, speeches, cake, pack down.</p></div>
        <div className="space-y-2">
          {fohSchedule.map((row, index) => (
            <div key={row.key} className="grid gap-2 sm:grid-cols-[9rem_1fr_1.4fr_auto]">
              <TimeDropdownPicker value={row.time || startTime} onChange={(value) => setFohSchedule((v) => v.map((r, i) => (i === index ? { ...r, time: value } : r)))} />
              <Input value={row.label} placeholder="What is happening" onChange={(event) => setFohSchedule((v) => v.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)))} />
              <Input value={row.detail || ""} placeholder="Notes e.g. at the entrance" onChange={(event) => setFohSchedule((v) => v.map((r, i) => (i === index ? { ...r, detail: event.target.value } : r)))} />
              <Button type="button" variant="ghost" size="icon" title="Remove line" onClick={() => setFohSchedule((v) => v.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {!fohSchedule.length && <p className="text-sm text-muted-foreground">No floor timings yet.</p>}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setFohSchedule((v) => [...v, { key: `m${Date.now()}`, time: startTime, label: "", detail: "" }])}><Plus className="mr-2 h-4 w-4" />Add FOH timing</Button>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="font-serif text-lg">Setup & styling</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {setupOptions.map((item) => (
              <label key={item} className="flex items-center gap-2 text-sm">
                <Checkbox checked={setupItems.includes(item)} onCheckedChange={(checked) => setSetupItems((v) => (checked ? Array.from(new Set([...v, item])) : v.filter((i) => i !== item)))} />
                {item}
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <Input value={newSetupItem} onChange={(event) => setNewSetupItem(event.target.value)} placeholder="Add another setup item" />
            <Button type="button" variant="secondary" onClick={addSetupOption}><Plus className="h-4 w-4" /></Button>
          </div>
          <div className="space-y-1.5">
            <label className="flex items-center gap-2 text-sm">
              <Checkbox checked={accessEnabled} onCheckedChange={(checked) => {
                const on = Boolean(checked);
                setAccessEnabled(on);
                if (on && !form.access_time) setForm((prev) => ({ ...prev, access_time: minutesToTime(Math.max(0, timeToMinutes(startTime) - 180)) }));
              }} />
              Decor / vendor access required
            </label>
            {accessEnabled && <TimeDropdownPicker value={form.access_time || "10:00"} onChange={(value) => setForm((prev) => ({ ...prev, access_time: value }))} />}
          </div>
          <div className="space-y-1.5"><Label>Setup notes</Label><Textarea rows={3} value={form.setup_notes} onChange={set("setup_notes")} placeholder="8 chairs per table, gift table on stage…" /></div>
          <div className="space-y-1.5"><Label>Notes for the team only</Label><Textarea rows={2} value={form.ops_notes} onChange={set("ops_notes")} placeholder="Kitchen and floor reminders" /></div>
        </div>

        <div className="space-y-3 rounded-lg border border-border p-4">
          <h3 className="font-serif text-lg">Menu on this runsheet</h3>
          {menuByCategory.length ? menuByCategory.map((group) => (
            <div key={group.category}>
              <p className="text-sm font-semibold">{group.category}</p>
              <p className="text-sm text-muted-foreground">{group.items.join(", ")}</p>
            </div>
          )) : <p className="text-sm text-muted-foreground">Save a menu selection on the Menu tab and it will appear here.</p>}
          {menu.selection?.beverage_package && <p className="text-sm"><Badge variant="outline">Beverages</Badge> {prettyCrmValue(menu.selection.beverage_package)}</p>}
          {menu.selection?.allergies && <p className="text-sm text-destructive">Allergies: {menu.selection.allergies}</p>}
          <div className="space-y-1.5"><Label>Agreed with the client</Label><Textarea rows={2} value={form.client_notes} onChange={set("client_notes")} placeholder="What you promised during calls and the inspection" /></div>
          <div className="space-y-1.5"><Label>Special requests</Label><Textarea rows={3} value={form.special_requests} onChange={set("special_requests")} placeholder="Host has requested tea…" /></div>
        </div>
      </section>
      <SendRunsheetDialog mode="issue" open={issueOpen} onOpenChange={setIssueOpen} rs={runsheet || {}} lead={lead} booking={booking} businessName={business?.name || ""} onIssue={issueRunsheet} />
      {runsheet?.id && <SendRunsheetDialog open={sendOpen} onOpenChange={setSendOpen} rs={runsheet} lead={lead} booking={booking} businessName={business?.name || ""} />}
    </div>
  );
}
