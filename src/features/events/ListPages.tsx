import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Mail, MapPin, Phone, Building2, Plus } from "lucide-react";
import DishPhotoCell from "./DishPhotoCell";
import { signDishPhotos } from "./dishPhotos";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData, type Row } from "./useEventsData";
import SimpleList from "./SimpleList";
import { DrinksImportButton } from "./MenuImport";
import MenuShareDialog from "./MenuShareDialog";
import { supabase as sbMenu } from "@/integrations/supabase/client";
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
  const { businessCode } = useParams();
  const [menuSends, setMenuSends] = useState<Row[]>([]);
  useEffect(() => { setMenuSends([]); if (!open) return; (sbMenu.from("crm_menu_sends" as any) as any).select("*").eq("customer_id", open.id).order("sent_at", { ascending: false }).then(({ data }: any) => setMenuSends(data || [])); }, [open?.id]);
  const eventMap = useMemo(() => { const leadCust = new Map(crm.leads.map(l => [l.id, l.customer_id])); const m = new Map<string, any[]>(); crm.bookings.forEach(b => { const ids = new Set([b.customer_id, leadCust.get(b.lead_id)].filter(Boolean)); ids.forEach(id => { if (!m.has(id)) m.set(id, []); m.get(id)!.push(b); }); }); return m; }, [crm.bookings, crm.leads]);
  const eventsFor = (c: Row) => eventMap.get(c.id) || [];
  if (!d.business) return null;
  const openEvents = open ? eventsFor(open).slice().sort((a, b) => String(b.event_date).localeCompare(String(a.event_date))) : [];
  const upcoming = openEvents.filter(b => b.event_date >= new Date().toLocaleDateString("en-CA"));
  const Detail = ({ icon: Icon, label, value }: { icon: any; label: string; value?: string }) => <div className="flex items-start gap-2 text-sm"><Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><div className="min-w-0"><p className="text-xs text-muted-foreground">{label}</p><p className="break-words">{value || "—"}</p></div></div>;
  return <>
    <SimpleList title="Customers" subtitle="Everyone recorded as a customer, whether added here or through a lead or event." table="crm_customers" businessId={d.business.id} rows={d.customers} refresh={d.refresh} nameKey="full_name" onOpen={setOpen}
      fields={[{ key: "full_name", label: "Name", required: true }, { key: "phone", label: "Phone" }, { key: "email", label: "Email", type: "email" }, { key: "address", label: "Address" }, { key: "company", label: "Company" }, { key: "source", label: "Source", type: "select", options: [{ value: "direct", label: "Direct" }, { value: "lead", label: "Lead" }, { value: "event", label: "Event" }] }]}
      columns={[{ label: "Name", render: r => r.full_name }, { label: "Source", render: r => prettyCrmValue(r.source) }, { label: "Phone", render: r => r.phone || "—" }, { label: "Email", render: r => r.email || "—" }, { label: "Address", render: r => r.address || "—" }, { label: "Events", render: r => eventsFor(r).length }]} />
    <Dialog open={!!open} onOpenChange={o => !o && setOpen(null)}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{open?.full_name}</DialogTitle></DialogHeader>
      {open && <div className="space-y-5">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline" className="capitalize">{prettyCrmValue(open.source || "direct")}</Badge>
          <Badge variant="secondary">{openEvents.length} event{openEvents.length === 1 ? "" : "s"}{upcoming.length ? ` · ${upcoming.length} upcoming` : ""}</Badge>
        </div>
        <div className="grid gap-3 rounded-md border border-border p-4 sm:grid-cols-2">
          <Detail icon={Phone} label="Phone" value={open.phone} />
          <Detail icon={Mail} label="Email" value={open.email} />
          <Detail icon={MapPin} label="Address" value={open.address} />
          <Detail icon={Building2} label="Company" value={open.company} />
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" asChild><Link to={`/b/${businessCode}/events/leads/events?new=1&customer=${open.id}`}><Plus className="mr-1.5 h-4 w-4" />New event lead</Link></Button>
          <Button size="sm" variant="outline" asChild><Link to={`/b/${businessCode}/catering/bookings/new?customer=${open.id}`}><Plus className="mr-1.5 h-4 w-4" />New catering booking</Link></Button>
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Menus sent</p>
          {menuSends.length ? menuSends.map(m => <div key={m.id} className="flex justify-between gap-3 border-b border-border pb-2 text-sm"><div className="min-w-0"><p className="font-medium"><Badge variant="secondary" className="mr-2">Menu sent</Badge>{m.summary || "Menu"}</p><p className="text-xs text-muted-foreground">To {m.recipient_email}</p></div><span className="shrink-0 text-xs text-muted-foreground">{new Date(m.sent_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true })}</span></div>) : <p className="text-sm text-muted-foreground">No menus sent yet.</p>}
        </div>
        <div className="space-y-2">
          <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">Event history</p>
          {openEvents.length ? openEvents.map(b => <Link key={b.id} to={b.booking_kind === "catering" ? `/b/${businessCode}/catering/bookings/${b.id}` : `/b/${businessCode}/events/events/${b.id}`} className="flex justify-between gap-3 border-b border-border pb-2 text-sm hover:bg-muted/40"><span className="min-w-0 truncate">{b.event_name || prettyCrmValue(b.event_type || "Event")} · {b.venue_space}</span><span className="shrink-0 text-muted-foreground">{format(new Date(`${b.event_date}T00:00:00`), "dd MMM yyyy")}</span></Link>) : <p className="text-sm text-muted-foreground">No events yet.</p>}
        </div>
      </div>}
    </DialogContent></Dialog>
  </>;
}

const DEFAULT_STAKE_TYPES = [{ value: "vendor", label: "Vendor" }, { value: "decorator", label: "Decorator" }, { value: "dj", label: "DJ / Entertainment" }, { value: "photographer", label: "Photographer" }, { value: "florist", label: "Florist" }, { value: "kitchen", label: "Kitchen" }, { value: "supplier", label: "Supplier" }, { value: "sales", label: "Sales" }, { value: "other", label: "Other" }];
export function CoordinatorsPage() {
  const d = useEventsData(); if (!d.business) return null;
  return <SimpleList title="Coordinators" subtitle="The people who run events and catering jobs on the day. Pick one when booking — their name and number print on the run sheet." table="crm_stakeholders" businessId={d.business.id} rows={d.stakeholders.filter(r => r.stakeholder_type === "coordinator")} refresh={d.refresh} archivable nameKey="full_name" defaults={{ stakeholder_type: "coordinator" }}
    fields={[{ key: "full_name", label: "Name", required: true }, { key: "position", label: "Position" }, { key: "phone", label: "Phone" }, { key: "email", label: "Email", type: "email" }, { key: "notes", label: "Notes" }]}
    columns={[{ label: "Name", render: r => r.full_name }, { label: "Position", render: r => r.position || "—" }, { label: "Phone", render: r => r.phone || "—" }, { label: "Email", render: r => r.email || "—" }]} />;
}
export function StakeholdersPage() {
  const d = useEventsData(); const crm = useCrmData();
  const custom = crm.options.filter(o => o.option_type === "stakeholder_type" && o.active).map(o => ({ value: o.value, label: o.label }));
  const STAKE_TYPES = custom.length ? custom : DEFAULT_STAKE_TYPES;
  if (!d.business) return null;
  return <SimpleList title="Stakeholders" subtitle="Vendors, decorators, DJs, photographers and suppliers the venue works with. Attach them to a lead from its Stakeholders tab." table="crm_stakeholders" businessId={d.business.id} rows={d.stakeholders.filter(r => r.stakeholder_type !== "coordinator")} refresh={d.refresh} archivable nameKey="full_name" filterKey="stakeholder_type" filterOptions={STAKE_TYPES}
    fields={[{ key: "full_name", label: "Name", required: true }, { key: "position", label: "Position" }, { key: "stakeholder_type", label: "Type", type: "select", options: STAKE_TYPES }, { key: "phone", label: "Phone" }, { key: "email", label: "Email", type: "email" }, { key: "notes", label: "Notes" }]}
    columns={[{ label: "Name", render: r => r.full_name }, { label: "Position", render: r => r.position || "—" }, { label: "Type", render: r => <Badge variant="outline">{prettyCrmValue(r.stakeholder_type)}</Badge> }, { label: "Phone", render: r => r.phone || "—" }, { label: "Email", render: r => r.email || "—" }]} />;
}

export function DishesPage() {
  const d = useEventsData();
  const [urls, setUrls] = useState<Record<string, string>>({});
  const pathsKey = d.dishes.map(x => x.photo_path || "").join("|");
  useEffect(() => { signDishPhotos(d.dishes.map(x => x.photo_path)).then(setUrls); }, [pathsKey]);
  if (!d.business) return null;
  const bid = d.business.id;
  const opts = [{ value: "veg", label: "Vegetarian" }, { value: "nonveg", label: "Non-vegetarian" }];
  return <SimpleList title="Dishes" subtitle={`${d.dishes.length} dishes shared across every package. Add a photo so guests can see each dish.`} table="crm_dishes" businessId={bid} rows={d.dishes} refresh={d.refresh} archivable groupAZ filterKey="diet" filterOptions={opts}
    fields={[{ key: "name", label: "Dish name", required: true }, { key: "diet", label: "Diet", type: "select", options: opts }]}
    columns={[{ label: "Photo", render: r => <DishPhotoCell dish={r} businessId={bid} url={r.photo_path ? urls[r.photo_path] : undefined} onChanged={d.refresh} /> }, { label: "Dish", render: r => r.name }, { label: "Diet", render: r => <Badge variant={r.diet === "veg" ? "outline" : "secondary"}>{r.diet === "veg" ? "V · Veg" : "N · Non-veg"}</Badge> }, { label: "Used", render: r => <span className="text-muted-foreground">{usage(d.courseItems, "dish_id", r.id, d.courses)}</span> }]} />;
}

export function DrinksPage() {
  const d = useEventsData(); const [share, setShare] = useState(false); if (!d.business) return null;
  const kindLabel = (k: string) => k === "soft" ? "Soft drink" : k === "hard" ? "Hard drink" : k.replace(/\b\p{L}/gu, c => c.toUpperCase());
  const opts = [...new Set(["soft", "hard", ...d.drinks.map((x: any) => String(x.kind || "soft").trim() || "soft")])].map(k => ({ value: k, label: kindLabel(k) }));
  const KIND_ORDER = ["beer", "cocktail", "ready to serve", "wine", "whiskey", "gin", "vodka", "tequila"];
  const kindRank = (k: string) => { const l = k.toLowerCase(); const i = KIND_ORDER.findIndex(o => l.includes(o)); return i === -1 ? KIND_ORDER.length : i; };
  const kindOf = (x: any) => String(x.kind || "soft").trim() || "soft";
  const kindOrder = (a: string, b: string) => {
    const ra = kindRank(a), rb = kindRank(b);
    if (ra !== rb) return ra - rb;
    if (ra < KIND_ORDER.length) return a.localeCompare(b);
    if (a === "soft") return 1;
    if (b === "soft") return -1;
    if (a === "hard") return 1;
    if (b === "hard") return -1;
    return a.localeCompare(b);
  };
  return <SimpleList title="Drinks" subtitle={`${d.drinks.length} drinks shared across every package.`} table="crm_drinks" businessId={d.business.id} rows={d.drinks} refresh={d.refresh} archivable groupBy={kindOf} groupOrder={kindOrder} groupLabel={kindLabel} filterKey="kind" filterOptions={opts} extra={<><DrinksImportButton data={d as any} /><Button variant="outline" onClick={() => setShare(true)}>Print / email</Button>{share && <MenuShareDialog open={share} onOpenChange={setShare} data={d as any} source="drinks" defaultDrinks />}</>}
    fields={[{ key: "name", label: "Drink name", required: true }, { key: "kind", label: "Kind", type: "text", placeholder: "e.g. Soft drink, Wine, Beer" }, { key: "price", label: "Price ($)", type: "number" }]}
    columns={[{ label: "Drink", render: r => r.name }, { label: "Kind", render: r => <Badge variant="outline">{kindLabel(String(r.kind || "soft"))}</Badge> }, { label: "Price", render: r => r.price != null ? `$${Number(r.price).toFixed(2)}` : <span className="text-muted-foreground">—</span> }, { label: "Used", render: r => <span className="text-muted-foreground">{usage(d.courseItems, "drink_id", r.id, d.courses)}</span> }]} />;
}

