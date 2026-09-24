import EventDetailPage from "@/features/events/EventDetailPage";
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
import { CustomersPage, DishesPage, DrinksPage, SpacesPage, StakeholdersPage } from "@/features/events/ListPages";

function CalendarPage() {
  const crm = useCrmData(); if (!crm.business) return null;
  return <div className="space-y-6"><div><p className="text-xs font-medium uppercase tracking-widest text-primary">Events</p><h1 className="font-serif text-3xl font-semibold">Calendar</h1><p className="text-sm text-muted-foreground">View all your events in one place, and subscribe from Google Calendar.</p></div>
    <MonthCalendar bookings={crm.bookings} inspections={crm.inspections} leads={crm.leads} />
    <CalendarTab businessId={crm.business.id} businessName={crm.business.name} leads={crm.leads} inspections={crm.inspections} bookings={crm.bookings} tasks={crm.tasks} /></div>;
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
  CateringDetail: () => <EventDetailPage kind="catering" />,
  Calendar: CalendarPage,
  Customers: CustomersPage, Stakeholders: StakeholdersPage, MenuBooks: MenuBooksPage, Dishes: DishesPage, Drinks: DrinksPage, Spaces: SpacesPage, Reports: ReportsPage,
};
