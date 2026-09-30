import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import MonthCalendar from "@/features/events/MonthCalendar";

const POLL_MS = 20000;

// Shareable, view-only calendar. Anyone with the link sees events and catering
// exactly as the in-app calendar shows them; data refreshes every 20s and on focus.
export default function PublicCalendarPage() {
  const { businessId, token } = useParams();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/crm-calendar-public?b=${businessId}&t=${token}`, {
        headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY }, cache: "no-store",
      });
      const body = await res.json();
      if (!res.ok) { setError(body.error || "Calendar not found"); return; }
      setError(""); setData(body);
    } catch { /* keep last data on network blips */ }
  }, [businessId, token]);

  useEffect(() => {
    load();
    const tick = () => { if (document.visibilityState === "visible" && navigator.onLine) load(); };
    const id = window.setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick); window.addEventListener("online", tick); document.addEventListener("visibilitychange", tick);
    return () => { clearInterval(id); window.removeEventListener("focus", tick); window.removeEventListener("online", tick); document.removeEventListener("visibilitychange", tick); };
  }, [load]);

  if (error && !data) return <div className="flex min-h-dvh items-center justify-center p-6 text-sm text-muted-foreground">{error}</div>;
  if (!data) return <div className="flex min-h-dvh items-center justify-center text-sm text-muted-foreground">Loading calendar…</div>;

  return (
    <div className="min-h-dvh bg-background">
      <div className="mx-auto max-w-5xl space-y-4 p-4 pb-16 sm:p-6">
        <div className="flex items-center gap-3">
          {data.business.logo_url && <img src={data.business.logo_url} alt={data.business.name} className="h-10 w-auto object-contain" />}
          <div>
            <h1 className="text-lg font-semibold leading-tight">Events & catering calendar</h1>
            <p className="text-xs text-muted-foreground">{data.business.name} · view only · updates automatically</p>
          </div>
        </div>
        <MonthCalendar
          readOnly
          bookings={data.bookings}
          leads={data.leads}
          runsheets={data.runsheets}
          customers={data.customers}
          venues={data.venues}
          paidBookingIds={data.paidIds}
          onView={() => {}}
          onEdit={() => {}}
        />
      </div>
    </div>
  );
}
