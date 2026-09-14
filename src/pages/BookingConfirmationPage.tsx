import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";

export default function BookingConfirmationPage() {
  const { token = "" } = useParams(); const [booking, setBooking] = useState<any>(null); const [error, setError] = useState(""); const [busy, setBusy] = useState(false);
  const call = async (action: "view"|"confirm"|"decline") => { setBusy(true); const { data, error: invokeError } = await supabase.functions.invoke("crm-confirm-booking", { body: { token, action } }); setBusy(false); if (invokeError || data?.error) setError(data?.error || "This confirmation link is unavailable."); else setBooking(data.booking); };
  useEffect(() => { void call("view"); }, [token]);
  if (!booking && !error) return <main className="min-h-dvh grid place-items-center bg-background"><Loader2 className="h-8 w-8 animate-spin text-primary"/></main>;
  return <main className="min-h-dvh grid place-items-center bg-background p-5"><Card className="w-full max-w-xl"><CardContent className="p-7">
    {error ? <div className="text-center"><XCircle className="mx-auto h-12 w-12 text-destructive"/><h1 className="mt-4 font-serif text-2xl">Confirmation unavailable</h1><p className="mt-2 text-muted-foreground">{error}</p></div> : <>
      <p className="text-sm uppercase text-primary">{booking.businesses?.name || "Booking confirmation"}</p><h1 className="mt-2 font-serif text-3xl">{booking.crm_leads?.full_name}</h1>
      <div className="my-6 grid grid-cols-2 gap-4 border-y border-border py-5 text-sm"><div><p className="text-muted-foreground">Event</p><p>{booking.crm_leads?.event_type}</p></div><div><p className="text-muted-foreground">Date</p><p>{booking.event_date}</p></div><div><p className="text-muted-foreground">Time</p><p>{booking.start_time}</p></div><div><p className="text-muted-foreground">Venue</p><p>{booking.venue_space}</p></div><div><p className="text-muted-foreground">Guests</p><p>{booking.guest_count}</p></div><div><p className="text-muted-foreground">Deposit</p><p>${Number(booking.deposit_amount).toFixed(2)}</p></div></div>
      {booking.status === "confirmed" ? <div className="text-center"><CheckCircle2 className="mx-auto h-10 w-10 text-primary"/><p className="mt-3 font-semibold">Your booking is confirmed.</p></div> : booking.status === "declined" ? <p className="text-center text-muted-foreground">This booking was declined.</p> : <div className="flex flex-col gap-3 sm:flex-row"><Button className="flex-1" disabled={busy} onClick={() => call("confirm")}>Confirm booking</Button><Button className="flex-1" variant="outline" disabled={busy} onClick={() => call("decline")}>Decline</Button></div>}
    </>}
  </CardContent></Card></main>;
}