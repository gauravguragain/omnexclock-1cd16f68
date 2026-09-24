import EventDetailPage from "@/features/events/EventDetailPage";
import CateringDetailPage from "@/features/events/CateringDetailPage";
import RunsheetViewPage from "@/features/events/RunsheetViewPage";
import EventsDashboard from "@/features/events/EventsDashboard";
import SalesMarketingPage from "@/pages/admin/SalesMarketingPage";
import LeadsBoard from "@/features/events/LeadsBoard";
import EventsList from "@/features/events/EventsList";
import CreateEventWizard from "@/features/events/CreateEventWizard";
import MenuBooksPage from "@/features/events/MenuBooksPage";
import ReportsPage from "@/features/events/ReportsPage";
import MonthCalendar from "@/features/events/MonthCalendar";
import CalendarTab from "@/features/sales/CalendarTab";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData } from "@/features/events/useEventsData";
import LeadDetailDialog from "@/features/sales/LeadDetailDialog";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { CalendarDays, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomersPage, DishesPage, DrinksPage, SpacesPage, StakeholdersPage, CoordinatorsPage } from "@/features/events/ListPages";

function CalendarPage() {
  const crm = useCrmData(); const ev = useEventsData(); const { businessCode } = useParams(); const navigate = useNavigate();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [todayKey, setTodayKey] = useState(0);
  if (!crm.business) return null;
  const editing = crm.bookings.find(b => b.id === editingId);
  const lead = crm.leads.find(l => l.id === editing?.lead_id) || null;
  return <div className="space-y-6"><div className="flex flex-wrap items-end justify-between gap-3"><div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary"><CalendarDays className="h-4 w-4" />Events</p><h1 className="font-serif text-3xl font-semibold">Calendar</h1><p className="text-sm text-muted-foreground">View and manage all your events in one place.</p></div><div className="flex gap-2"><Button variant="outline" onClick={() => setTodayKey(k => k + 1)}>Today</Button><Button asChild><Link to={`/b/${businessCode}/events/leads/events`}><Plus className="mr-2 h-4 w-4" />New lead</Link></Button></div></div>
    <MonthCalendar key={todayKey} bookings={crm.bookings.filter(b => b.booking_kind !== "catering")} leads={crm.leads.filter(l => l.lead_kind !== "catering" && l.event_type !== "catering")} runsheets={crm.runsheets} customers={ev.customers} venues={ev.venues} onView={b => navigate(`/b/${businessCode}/events/events/${b.id}`)} onEdit={b => { if (!b.lead_id) navigate(`/b/${businessCode}/events/events/${b.id}`); else setEditingId(b.id); }} />
    <CalendarTab businessId={crm.business.id} businessName={crm.business.name} leads={crm.leads.filter(l => l.lead_kind !== "catering" && l.event_type !== "catering")} inspections={crm.inspections.filter(i => crm.leads.some(l => l.id === i.lead_id && l.lead_kind !== "catering" && l.event_type !== "catering"))} bookings={crm.bookings.filter(b => b.booking_kind !== "catering")} tasks={crm.tasks.filter(t => !t.lead_id || crm.leads.some(l => l.id === t.lead_id && l.lead_kind !== "catering" && l.event_type !== "catering"))} />
    <LeadDetailDialog lead={lead?.lead_kind === "catering" ? null : lead} open={!!editingId && !!lead && lead.lead_kind !== "catering"} onOpenChange={open => { if (!open) setEditingId(null); }} initialTab="booking" options={crm.options} interactions={crm.interactions} inspections={crm.inspections} tasks={crm.tasks} menuItems={crm.menuItems} booking={editing} businessName={crm.business.name} onSaved={crm.refresh} />
  </div>;
}

export const EventsPages = {
  Dashboard: EventsDashboard,
  Pipeline: () => <SalesMarketingPage view="pipeline" />,
  Inspections: () => <SalesMarketingPage view="inspections" />,
  Tasks: () => <SalesMarketingPage view="tasks" />,
  Settings: () => <SalesMarketingPage view="settings" />,
  EventLeads: () => <LeadsBoard kind="event" />,
  CateringLeads: () => <LeadsBoard kind="catering" />,
  Events: () => <EventsList kind="event" />,
  CateringBookings: () => <EventsList kind="catering" />,
  NewEvent: () => <CreateEventWizard kind="event" />,
  NewCatering: () => <CreateEventWizard kind="catering" />,
  EventDetail: () => <EventDetailPage kind="event" />,
  CateringDetail: () => <CateringDetailPage view="booking" />,
  CateringLeadDetail: () => <CateringDetailPage view="lead" />,
  RunsheetView: () => <RunsheetViewPage />,
  Calendar: CalendarPage,
  Customers: CustomersPage, Stakeholders: StakeholdersPage, Coordinators: CoordinatorsPage, MenuBooks: MenuBooksPage, Dishes: DishesPage, Drinks: DrinksPage, Spaces: SpacesPage, Reports: ReportsPage,
};
