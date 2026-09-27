import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, CalendarDays } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useCrmData } from "@/features/sales/useCrmData";
import { useEventsData } from "@/features/events/useEventsData";
import MonthCalendar from "@/features/events/MonthCalendar";
import { Button } from "@/components/ui/button";

// Full-page, view-only calendar for the Operations dashboard. Events are
// clickable and open a read-only details popup — nothing links to or edits
// any other part of the app.
export default function OperationsCalendarPage() {
  const { businessCode } = useParams();
  const { business: ctxBusiness } = useBusiness();
  const [urlBusiness, setUrlBusiness] = useState<any>(null);

  useEffect(() => {
    if (ctxBusiness || !businessCode) return;
    supabase.from("businesses").select("id, name, business_code").eq("business_code", businessCode).maybeSingle()
      .then(({ data }) => setUrlBusiness(data));
  }, [ctxBusiness, businessCode]);

  const business = ctxBusiness || urlBusiness;
  const crm = useCrmData(business?.id);
  const ev = useEventsData(business?.id);

  if (!business) return <div className="flex min-h-[60dvh] items-center justify-center text-sm text-muted-foreground">Loading calendar…</div>;

  return (
    <div className="mx-auto max-w-5xl space-y-4 p-4 pb-24 sm:p-6">
      <div className="flex items-center gap-3">
        <Button asChild variant="outline" size="sm">
          <Link to={`/b/${businessCode}/operations`}><ArrowLeft className="mr-2 h-4 w-4" />Back to Operations</Link>
        </Button>
        <div className="flex items-center gap-2">
          <span className="rounded-md bg-primary/10 p-2 text-primary"><CalendarDays className="h-5 w-5" /></span>
          <div>
            <h1 className="text-lg font-semibold leading-tight">Events calendar</h1>
            <p className="text-xs text-muted-foreground">{business.name} · view only</p>
          </div>
        </div>
      </div>
      <MonthCalendar
        readOnly
        bookings={crm.bookings.filter(b => b.booking_kind !== "catering")}
        leads={crm.leads.filter((l: any) => l.lead_kind !== "catering" && l.event_type !== "catering")}
        runsheets={crm.runsheets}
        customers={ev.customers}
        venues={ev.venues}
        onView={() => {}}
        onEdit={() => {}}
      />
    </div>
  );
}
