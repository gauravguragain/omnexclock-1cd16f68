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
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { Download, Plus, Save, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import type { CrmLead, CrmOption } from "./types";
import { prettyCrmValue } from "./types";
import { buildRunsheetPdf, type RunsheetScheduleLine } from "@/lib/runsheetPdf";

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
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [runsheetId, setRunsheetId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ selection: any; items: any[]; catalogue: Record<string, string> }>({ selection: null, items: [], catalogue: {} });

  const [form, setForm] = useState({
    event_order_number: "", booking_reference: "", sales_person: "", event_coordinator: "",
    onsite_contact_name: "", onsite_contact_phone: "", adult_guests: "", kids_guests: "",
    access_time: "", setup_notes: "", special_requests: "",
  });
  const [setupItems, setSetupItems] = useState<string[]>([]);
  const [extraSetupItems, setExtraSetupItems] = useState<string[]>([]);
  const [newSetupItem, setNewSetupItem] = useState("");
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);

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
    if (row) {
      setRunsheetId(row.id);
      setForm({
        event_order_number: row.event_order_number || "", booking_reference: row.booking_reference || "",
        sales_person: row.sales_person || "", event_coordinator: row.event_coordinator || "",
        onsite_contact_name: row.onsite_contact_name || "", onsite_contact_phone: row.onsite_contact_phone || "",
        adult_guests: row.adult_guests != null ? String(row.adult_guests) : "",
        kids_guests: row.kids_guests != null ? String(row.kids_guests) : "",
        access_time: row.access_time || "", setup_notes: row.setup_notes || "", special_requests: row.special_requests || "",
      });
      setSetupItems(row.setup_items || []);
      setSchedule(((row.service_schedule || []) as RunsheetScheduleLine[]).map((line, index) => ({ ...line, key: `s${index}` })));
    } else {
      setRunsheetId(null);
      setForm((prev) => ({
        ...prev,
        adult_guests: String(booking?.guest_count || lead.estimated_guest_count || ""),
        booking_reference: prev.booking_reference || lead.id.slice(0, 10).toUpperCase(),
      }));
    }
    setLoading(false);
  }, [lead.id, lead.business_id, lead.estimated_guest_count, booking?.guest_count]);

  useEffect(() => { void load(); }, [load]);

  const menuByCategory = useMemo(() => {
    const groups = new Map<string, string[]>();
    menu.items.forEach((item: any) => {
      const category = item.menu_item_id ? prettyCrmValue(menu.catalogue[item.menu_item_id] || "other") : "Custom items";
      groups.set(category, [...(groups.get(category) || []), item.item_name]);
    });
    return Array.from(groups.entries()).map(([category, items]) => ({ category, items }));
  }, [menu]);

  const startTime = String(booking?.start_time || "17:30").slice(0, 5);
  const endTime = minutesToTime(timeToMinutes(startTime) + Number(booking?.duration_minutes || 300));

  const prefillSchedule = () => {
    const start = timeToMinutes(startTime);
    const suggestions: { label: string; offset: number }[] = [
      { label: courseOptions[0] || "Live stall", offset: 30 },
      { label: courseOptions[1] || "Entrees", offset: 45 },
      { label: courseOptions[2] || "Kids menu", offset: 60 },
      { label: courseOptions[3] || "Mains", offset: 150 },
      { label: courseOptions[4] || "Dessert", offset: 240 },
    ];
    setSchedule(suggestions.map((s, index) => ({ key: `p${index}`, time: minutesToTime(start + s.offset), label: s.label, detail: "" })));
    toast.success("Timings suggested — adjust as needed");
  };

  const addSetupOption = async () => {
    const label = newSetupItem.trim();
    if (!label) return;
    setExtraSetupItems((v) => Array.from(new Set([...v, label])));
    setSetupItems((v) => Array.from(new Set([...v, label])));
    setNewSetupItem("");
    const { error } = await supabase.from("crm_options").insert({
      business_id: lead.business_id, option_type: "setup_item", label,
      value: label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, ""),
      sort_order: 900, created_by: user?.id,
    } as any);
    toast.success(error ? "Added to this runsheet" : "Added to your setup list");
  };

  const save = async () => {
    setSaving(true);
    const payload: any = {
      business_id: lead.business_id, lead_id: lead.id, booking_id: booking?.id || null,
      event_order_number: form.event_order_number || null, booking_reference: form.booking_reference || null,
      sales_person: form.sales_person || null, event_coordinator: form.event_coordinator || null,
      onsite_contact_name: form.onsite_contact_name || null, onsite_contact_phone: form.onsite_contact_phone || null,
      adult_guests: form.adult_guests ? Number(form.adult_guests) : null,
      kids_guests: form.kids_guests ? Number(form.kids_guests) : null,
      access_time: form.access_time || null, setup_items: setupItems, setup_notes: form.setup_notes || null,
      service_schedule: schedule.map(({ time, label, detail }) => ({ time, label, detail })),
      special_requests: form.special_requests || null, updated_by: user?.id,
    };
    if (!runsheetId) payload.created_by = user?.id;
    const { data, error } = await supabase.from("crm_runsheets").upsert(payload, { onConflict: "lead_id" }).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    setRunsheetId(data.id);
    toast.success("Runsheet saved");
    onSaved();
  };

  const download = () => {
    const doc = buildRunsheetPdf({
      businessName: business?.name || "",
      businessPhone: business?.phone, businessEmail: business?.email,
      eventTitle: `${prettyCrmValue(lead.event_type)} — ${lead.full_name}`,
      eventDateLabel: booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "EEEE, d MMMM yyyy") : "Date to be confirmed",
      startTime: prettyTime(startTime), endTime: prettyTime(endTime),
      venueSpace: prettyCrmValue(booking?.venue_space || lead.venue_space || "—"),
      adultGuests: Number(form.adult_guests || 0), kidsGuests: Number(form.kids_guests || 0),
      clientName: lead.full_name, clientPhone: lead.phone,
      salesPerson: form.sales_person, eventCoordinator: form.event_coordinator,
      onsiteContactName: form.onsite_contact_name, onsiteContactPhone: form.onsite_contact_phone,
      eventOrderNumber: form.event_order_number, bookingReference: form.booking_reference,
      schedule: schedule.map(({ time, label, detail }) => ({ time: prettyTime(time), label, detail })),
      menuByCategory,
      beveragePackage: menu.selection?.beverage_package ? prettyCrmValue(menu.selection.beverage_package) : null,
      dietaryRequirements: menu.selection?.dietary_requirements, allergies: menu.selection?.allergies,
      specialRequests: form.special_requests,
      setupItems, setupNotes: form.setup_notes, accessTime: form.access_time ? prettyTime(form.access_time) : null,
    });
    doc.save(`Runsheet-${lead.full_name.replace(/\s+/g, "-")}-${booking?.event_date || "draft"}.pdf`);
  };

  const markSent = async () => {
    await supabase.from("crm_runsheets").update({ status: "sent", sent_at: new Date().toISOString() } as any).eq("lead_id", lead.id);
    await supabase.from("crm_leads").update({ status: "runsheet_sent" }).eq("id", lead.id);
    toast.success("Marked as runsheet sent");
    onSaved();
  };

  if (loading) return <p className="py-8 text-sm text-muted-foreground">Loading runsheet…</p>;

  const set = (key: keyof typeof form) => (event: { target: { value: string } }) => setForm((prev) => ({ ...prev, [key]: event.target.value }));

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-serif text-lg">{prettyCrmValue(lead.event_type)} · {booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "EEE d MMM yyyy") : "No booking date yet"}</p>
            <p className="text-sm text-muted-foreground">{prettyTime(startTime)} – {prettyTime(endTime)} · {prettyCrmValue(booking?.venue_space || lead.venue_space || "Venue to confirm")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={save} disabled={saving}><Save className="mr-2 h-4 w-4" />Save runsheet</Button>
            <Button size="sm" variant="outline" onClick={download}><Download className="mr-2 h-4 w-4" />Download BEO</Button>
            <Button size="sm" variant="secondary" onClick={markSent} disabled={!runsheetId}>Mark as sent</Button>
          </div>
        </div>
        {!booking && <p className="mt-3 text-xs text-muted-foreground">Prepare the booking on the Confirmation tab so the date, time and venue flow through to the runsheet.</p>}
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1.5"><Label>Event order number</Label><Input value={form.event_order_number} onChange={set("event_order_number")} placeholder="698-1" /></div>
        <div className="space-y-1.5"><Label>Booking reference</Label><Input value={form.booking_reference} onChange={set("booking_reference")} /></div>
        <div className="space-y-1.5"><Label>Sales person</Label><Input value={form.sales_person} onChange={set("sales_person")} /></div>
        <div className="space-y-1.5"><Label>Event coordinator</Label><Input value={form.event_coordinator} onChange={set("event_coordinator")} /></div>
        <div className="space-y-1.5"><Label>Onsite contact</Label><Input value={form.onsite_contact_name} onChange={set("onsite_contact_name")} placeholder="Name on the day" /></div>
        <div className="space-y-1.5"><Label>Onsite contact number</Label><Input value={form.onsite_contact_phone} onChange={set("onsite_contact_phone")} /></div>
        <div className="space-y-1.5"><Label>Adults</Label><Input type="number" min="0" value={form.adult_guests} onChange={set("adult_guests")} /></div>
        <div className="space-y-1.5"><Label>Kids</Label><Input type="number" min="0" value={form.kids_guests} onChange={set("kids_guests")} /></div>
      </section>

      <section className="space-y-3 rounded-lg border border-border p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div><h3 className="font-serif text-lg">Service schedule</h3><p className="text-xs text-muted-foreground">What happens when, for the kitchen and floor team.</p></div>
          <Button type="button" size="sm" variant="outline" onClick={prefillSchedule}><Sparkles className="mr-2 h-4 w-4" />Suggest timings</Button>
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
                ? <Input value={row.label} placeholder="What is happening" onChange={(event) => setSchedule((v) => v.map((r, i) => (i === index ? { ...r, label: event.target.value } : r)))} />
                : <Input value={row.detail || ""} placeholder="Notes e.g. served on the table" onChange={(event) => setSchedule((v) => v.map((r, i) => (i === index ? { ...r, detail: event.target.value } : r)))} />}
              <Button type="button" variant="ghost" size="icon" title="Remove line" onClick={() => setSchedule((v) => v.filter((_, i) => i !== index))}><X className="h-4 w-4" /></Button>
            </div>
          ))}
          {!schedule.length && <p className="text-sm text-muted-foreground">No timings yet.</p>}
        </div>
        <Button type="button" size="sm" variant="secondary" onClick={() => setSchedule((v) => [...v, { key: `n${Date.now()}`, time: startTime, label: courseOptions[0] || "", detail: "" }])}><Plus className="mr-2 h-4 w-4" />Add timing</Button>
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
          <div className="space-y-1.5"><Label>Decor / vendor access time</Label><TimeDropdownPicker value={form.access_time || "10:00"} onChange={(value) => setForm((prev) => ({ ...prev, access_time: value }))} /></div>
          <div className="space-y-1.5"><Label>Setup notes</Label><Textarea rows={3} value={form.setup_notes} onChange={set("setup_notes")} placeholder="8 chairs per table, gift table on stage…" /></div>
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
          <div className="space-y-1.5"><Label>Special requests</Label><Textarea rows={3} value={form.special_requests} onChange={set("special_requests")} placeholder="Host has requested tea…" /></div>
        </div>
      </section>
    </div>
  );
}
