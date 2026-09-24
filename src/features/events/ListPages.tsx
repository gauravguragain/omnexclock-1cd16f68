import { useMemo, useState } from "react";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData, type Row } from "./useEventsData";
import SimpleList from "./SimpleList";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { format } from "date-fns";
import { prettyCrmValue } from "@/features/sales/types";

const usage = (courseItems: Row[], key: "dish_id" | "drink_id", id: string, courses: Row[]) => {
  const pk = new Set(courseItems.filter(ci => ci[key] === id).map(ci => courses.find(c => c.id === ci.course_id)?.package_id).filter(Boolean));
  return pk.size ? `In ${pk.size} package${pk.size > 1 ? "s" : ""}` : "Not used yet";
};

export function CustomersPage() {
  const d = useEventsData(); const crm = useCrmData(); const [open, setOpen] = useState<Row | null>(null);
  const eventsFor = (c: Row) => crm.bookings.filter(b => b.customer_id === c.id || crm.leads.find(l => l.id === b.lead_id)?.customer_id === c.id);
  if (!d.business) return null;
  return <>
    <SimpleList title="Customers" subtitle="Everyone recorded as a customer, whether added here or through a lead or event." table="crm_customers" businessId={d.business.id} rows={d.customers} refresh={d.refresh} nameKey="full_name" onOpen={setOpen}
      fields={[{ key: "full_name", label: "Name", required: true }, { key: "phone", label: "Phone" }, { key: "email", label: "Email", type: "email" }, { key: "address", label: "Address" }, { key: "company", label: "Company" }, { key: "source", label: "Source", type: "select", options: [{ value: "direct", label: "Direct" }, { value: "lead", label: "Lead" }, { value: "event", label: "Event" }] }]}
      columns={[{ label: "Name", render: r => r.full_name }, { label: "Source", render: r => prettyCrmValue(r.source) }, { label: "Phone", render: r => r.phone || "—" }, { label: "Email", render: r => r.email || "—" }, { label: "Address", render: r => r.address || "—" }, { label: "Events", render: r => eventsFor(r).length }]} />
    <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}><DialogContent><DialogHeader><DialogTitle className="font-serif text-2xl">{open?.full_name}</DialogTitle></DialogHeader>
      <p className="text-sm text-muted-foreground">{[open?.phone, open?.email, open?.address].filter(Boolean).join(" · ")}</p>
      <div className="space-y-2">{open && eventsFor(open).length ? eventsFor(open).map(b => <div key={b.id} className="flex justify-between border-b pb-2 text-sm"><span>{b.event_name || prettyCrmValue(b.event_type || "Event")} · {b.venue_space}</span><span className="text-muted-foreground">{format(new Date(`${b.event_date}T00:00:00`), "dd MMM yyyy")}</span></div>) : <p className="text-sm text-muted-foreground">No events yet.</p>}</div>
    </DialogContent></Dialog>
  </>;
}

const STAKE_TYPES = [{ value: "vendor", label: "Vendor" }, { value: "decorator", label: "Decorator" }, { value: "dj", label: "DJ / Entertainment" }, { value: "photographer", label: "Photographer" }, { value: "florist", label: "Florist" }, { value: "kitchen", label: "Kitchen" }, { value: "supplier", label: "Supplier" }, { value: "sales", label: "Sales" }, { value: "other", label: "Other" }];
export function CoordinatorsPage() {
  const d = useEventsData(); if (!d.business) return null;
  return <SimpleList title="Coordinators" subtitle="The people who run events and catering jobs on the day. Pick one when booking — their name and number print on the run sheet." table="crm_stakeholders" businessId={d.business.id} rows={d.stakeholders.filter(r => r.stakeholder_type === "coordinator")} refresh={d.refresh} archivable nameKey="full_name" defaults={{ stakeholder_type: "coordinator" }}
    fields={[{ key: "full_name", label: "Name", required: true }, { key: "position", label: "Position" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email", type: "email" }, { key: "notes", label: "Notes" }]}
    columns={[{ label: "Name", render: r => r.full_name }, { label: "Position", render: r => r.position || "—" }, { label: "Phone", render: r => r.phone || "—" }, { label: "Email", render: r => r.email || "—" }]} />;
}
export function StakeholdersPage() {
  const d = useEventsData(); if (!d.business) return null;
  return <SimpleList title="Stakeholders" subtitle="Vendors, decorators, DJs, photographers and suppliers the venue works with. Attach them to a lead from its Stakeholders tab." table="crm_stakeholders" businessId={d.business.id} rows={d.stakeholders.filter(r => r.stakeholder_type !== "coordinator")} refresh={d.refresh} archivable nameKey="full_name" filterKey="stakeholder_type" filterOptions={STAKE_TYPES}
    fields={[{ key: "full_name", label: "Name", required: true }, { key: "position", label: "Position" }, { key: "stakeholder_type", label: "Type", type: "select", options: STAKE_TYPES }, { key: "phone", label: "Phone" }, { key: "email", label: "Email", type: "email" }, { key: "notes", label: "Notes" }]}
    columns={[{ label: "Name", render: r => r.full_name }, { label: "Position", render: r => r.position || "—" }, { label: "Type", render: r => <Badge variant="outline">{prettyCrmValue(r.stakeholder_type)}</Badge> }, { label: "Phone", render: r => r.phone || "—" }, { label: "Email", render: r => r.email || "—" }]} />;
}

export function DishesPage() {
  const d = useEventsData(); if (!d.business) return null;
  const opts = [{ value: "veg", label: "Vegetarian" }, { value: "nonveg", label: "Non-vegetarian" }];
  return <SimpleList title="Dishes" subtitle={`${d.dishes.length} dishes shared across every package.`} table="crm_dishes" businessId={d.business.id} rows={d.dishes} refresh={d.refresh} archivable groupAZ filterKey="diet" filterOptions={opts}
    fields={[{ key: "name", label: "Dish name", required: true }, { key: "diet", label: "Diet", type: "select", options: opts }]}
    columns={[{ label: "Dish", render: r => r.name }, { label: "Diet", render: r => <Badge variant={r.diet === "veg" ? "outline" : "secondary"}>{r.diet === "veg" ? "V · Veg" : "N · Non-veg"}</Badge> }, { label: "Used", render: r => <span className="text-muted-foreground">{usage(d.courseItems, "dish_id", r.id, d.courses)}</span> }]} />;
}

export function DrinksPage() {
  const d = useEventsData(); if (!d.business) return null;
  const opts = [{ value: "soft", label: "Soft drink" }, { value: "hard", label: "Hard drink" }];
  return <SimpleList title="Drinks" subtitle={`${d.drinks.length} drinks shared across every package.`} table="crm_drinks" businessId={d.business.id} rows={d.drinks} refresh={d.refresh} archivable groupAZ filterKey="kind" filterOptions={opts}
    fields={[{ key: "name", label: "Drink name", required: true }, { key: "kind", label: "Kind", type: "select", options: opts }]}
    columns={[{ label: "Drink", render: r => r.name }, { label: "Kind", render: r => <Badge variant="outline">{r.kind === "soft" ? "Soft" : "Hard"}</Badge> }, { label: "Used", render: r => <span className="text-muted-foreground">{usage(d.courseItems, "drink_id", r.id, d.courses)}</span> }]} />;
}

export function SpacesPage() {
  const d = useEventsData(); const crm = useCrmData();
  const month = format(new Date(), "yyyy-MM");
  const thisMonth = useMemo(() => (r: Row) => crm.bookings.filter(b => (b.venue_space_id === r.id || b.venue_space === r.name) && String(b.event_date).startsWith(month) && b.status !== "cancelled").length, [crm.bookings, month]);
  if (!d.business) return null;
  return <SimpleList title="Spaces" subtitle="Halls and rooms, their capacity and the layouts they suit." table="crm_venue_spaces" businessId={d.business.id} rows={d.venues} refresh={d.refresh} archivable
    fields={[{ key: "name", label: "Space name", required: true }, { key: "capacity", label: "Holds (guests)", type: "number" }, { key: "layouts", label: "Layouts", type: "tags", placeholder: "Banquet, Cocktail, Theatre" }, { key: "description", label: "Description" }]}
    columns={[{ label: "Space", render: r => r.name }, { label: "Holds", render: r => r.capacity || "—" }, { label: "Layouts", render: r => <div className="flex flex-wrap gap-1">{(r.layouts || []).map((l: string) => <Badge key={l} variant="outline">{l}</Badge>)}</div> }, { label: "Events this month", render: r => thisMonth(r) }]} />;
}
