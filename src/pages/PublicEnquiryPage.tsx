import { FormEvent, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import DateField from "@/features/sales/DateField";
import { Checkbox } from "@/components/ui/checkbox";
import { CalendarDays, CheckCircle2, Loader2 } from "lucide-react";
import venueBanner from "@/assets/regal-venue-banner.jpg";

const eventTypes = ["Wedding", "Corporate Event", "Parties & Celebrations", "School Formal / University Event", "Birthday", "Engagement", "Christening/Naming Ceremony", "Other"];

export default function PublicEnquiryPage() {
  const { businessCode = "" } = useParams();
  const [sending, setSending] = useState(false); const [sent, setSent] = useState(false); const [error, setError] = useState("");
  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setSending(true); setError(""); const form = new FormData(event.currentTarget);
    const { error: invokeError } = await supabase.functions.invoke("crm-public-enquiry", { body: {
      businessCode, fullName: form.get("fullName"), email: form.get("email"), phone: form.get("phone"), eventType: form.get("eventType"),
      preferredDate: form.get("preferredDate"), flexibleDate: form.get("flexibleDate") === "on", guestCount: form.get("guestCount") ? Number(form.get("guestCount")) : undefined,
      message: form.get("message"), website: form.get("website"),
    }});
    setSending(false); if (invokeError) setError("We couldn't send your enquiry. Please try again."); else setSent(true);
  };
  return <main className="min-h-dvh bg-background text-foreground">
    <section className="relative h-64 overflow-hidden"><img src={venueBanner} alt="Elegant venue prepared for an event" className="h-full w-full object-cover" /><div className="absolute inset-0 bg-background/65" /><div className="absolute inset-0 flex items-end"><div className="mx-auto w-full max-w-3xl px-5 pb-8"><p className="text-sm uppercase text-primary">Regal Clock</p><h1 className="font-serif text-4xl font-semibold">Plan your event</h1><p className="mt-2 max-w-xl text-foreground/80">Tell our events team what you have in mind. We’ll be in touch to discuss the details.</p></div></div></section>
    <div className="mx-auto max-w-3xl px-5 py-8">
      {sent ? <Card><CardContent className="flex flex-col items-center py-14 text-center"><CheckCircle2 className="h-12 w-12 text-primary"/><h2 className="mt-4 font-serif text-2xl">Enquiry received</h2><p className="mt-2 text-muted-foreground">Our team will contact you soon.</p></CardContent></Card> :
      <form onSubmit={submit} className="grid gap-5 sm:grid-cols-2">
        <div className="space-y-2"><Label htmlFor="fullName">Full name</Label><Input id="fullName" name="fullName" required maxLength={150}/></div>
        <div className="space-y-2"><Label htmlFor="phone">Phone</Label><Input id="phone" name="phone" type="tel" maxLength={40}/></div>
        <div className="space-y-2"><Label htmlFor="email">Email</Label><Input id="email" name="email" type="email" required maxLength={255}/></div>
        <div className="space-y-2"><Label htmlFor="eventType">Event type</Label><select id="eventType" name="eventType" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" required>{eventTypes.map((type) => <option key={type}>{type}</option>)}</select></div>
        <div className="space-y-2"><Label htmlFor="preferredDate">Preferred date</Label><DateField name="preferredDate" placeholder="Choose a date"/></div>
        <div className="space-y-2"><Label htmlFor="guestCount">Estimated guests</Label><Input id="guestCount" name="guestCount" type="number" min="1" max="10000"/></div>
        <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox name="flexibleDate"/> My date is flexible</label>
        <div className="hidden"><Input name="website" tabIndex={-1} autoComplete="off"/></div>
        <div className="space-y-2 sm:col-span-2"><Label htmlFor="message">Tell us about your event</Label><Textarea id="message" name="message" rows={5} maxLength={3000}/></div>
        {error && <p className="text-sm text-destructive sm:col-span-2">{error}</p>}
        <Button className="sm:col-span-2" disabled={sending}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : <CalendarDays className="mr-2 h-4 w-4"/>}Send enquiry</Button>
      </form>}
    </div>
  </main>;
}