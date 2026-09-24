import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button"; import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input"; import { Label } from "@/components/ui/label"; import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, CalendarDays, CircleDollarSign, Loader2, UserRound } from "lucide-react"; import { toast } from "sonner";
import type { CrmLead, CrmOption } from "./types";
import OptionSelect from "./OptionSelect";
import DateField from "./DateField";

export default function LeadFormDialog({ open, onOpenChange, businessId, options, lead, leads, onSaved, defaultKind = "event" }: { open: boolean; onOpenChange: (open:boolean)=>void; businessId:string; options:CrmOption[]; lead?:CrmLead|null; leads:CrmLead[]; onSaved:()=>void; defaultKind?: string }) {
   const { user } = useAuth(); const [saving, setSaving] = useState(false); const [email, setEmail] = useState(""); const [phone, setPhone] = useState(""); const [kind, setKind] = useState(lead?.lead_kind || defaultKind);
   useEffect(() => { setEmail(lead?.email || ""); setPhone(lead?.phone || ""); setKind(lead?.lead_kind || defaultKind); }, [lead, open, defaultKind]);
  const duplicate = useMemo(() => leads.find((row) => row.id !== lead?.id && ((email && row.email?.toLowerCase() === email.toLowerCase()) || (phone && row.phone?.replace(/\D/g, "") === phone.replace(/\D/g, "")))), [email, phone, leads, lead?.id]);
  const list = (type:string) => options.filter((option) => option.option_type === type && option.active);
   const isCatering = kind === "catering";
  const submit = async (event:FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget);
    const values:any = { business_id: businessId, full_name: form.get("full_name"), email: email || null, phone: phone || null, company: form.get("company") || null, source: form.get("source"), event_type: form.get("event_type"), preferred_dates: form.get("preferred_date") ? [form.get("preferred_date")] : [], flexible_date: form.get("flexible_date") === "on", estimated_guest_count: form.get("guests") ? Number(form.get("guests")) : null, budget_min: isCatering ? null : (form.get("budget_min") ? Number(form.get("budget_min")) : null), budget_max: isCatering ? null : (form.get("budget_max") ? Number(form.get("budget_max")) : null), estimated_value: form.get("estimated_value") ? Number(form.get("estimated_value")) : 0, venue_space: isCatering ? null : (form.get("venue_space") || null), tags: String(form.get("tags") || "").split(",").map((v)=>v.trim()).filter(Boolean), lead_kind: form.get("lead_kind") || "event", service_location: isCatering ? null : (form.get("service_location") || null), updated_by:user?.id };
    const result = lead ? await supabase.from("crm_leads").update(values).eq("id", lead.id) : await supabase.from("crm_leads").insert({ ...values, created_by:user?.id });
    setSaving(false); if (result.error) toast.error(result.error.message); else { toast.success(lead ? "Lead updated" : "Lead created"); onOpenChange(false); onSaved(); }
  };
   return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="flex max-h-[calc(100dvh-1rem)] w-[calc(100vw-1rem)] max-w-[calc(100vw-1rem)] flex-col gap-0 overflow-hidden p-0 sm:max-h-[min(90dvh,900px)] sm:max-w-3xl">
     <DialogHeader className="shrink-0 border-b border-border px-5 py-5 pr-12 text-left sm:px-8 sm:py-6">
       <p className="text-xs font-semibold uppercase text-primary">{isCatering ? "Catering enquiry" : "Event enquiry"}</p>
       <DialogTitle className="font-serif text-2xl sm:text-3xl">{lead ? "Edit lead" : "New lead"}</DialogTitle>
       <p className="text-sm text-muted-foreground">{lead ? lead.full_name : "Record the enquiry details"}</p>
     </DialogHeader>
     <form onSubmit={submit} className="flex min-h-0 flex-1 flex-col">
       <div className="min-h-0 flex-1 space-y-7 overflow-y-auto px-5 py-5 sm:px-8 sm:py-6">
         <section className="space-y-4" aria-labelledby="lead-contact-heading">
           <div className="flex items-center gap-2 border-b border-border pb-2"><UserRound className="h-4 w-4 text-primary"/><h3 id="lead-contact-heading" className="text-sm font-semibold">Contact details</h3></div>
           <div className="grid gap-4 sm:grid-cols-2">
             <div className="space-y-1.5"><Label htmlFor="lead-full-name">Full name <span className="text-primary">*</span></Label><Input id="lead-full-name" name="full_name" defaultValue={lead?.full_name} required autoFocus/></div>
             <div className="space-y-1.5"><Label htmlFor="lead-company">Company</Label><Input id="lead-company" name="company" defaultValue={lead?.company || ""}/></div>
             <div className="space-y-1.5"><Label htmlFor="lead-email">Email</Label><Input id="lead-email" type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></div>
             <div className="space-y-1.5"><Label htmlFor="lead-phone">Phone</Label><Input id="lead-phone" type="tel" value={phone} onChange={(e)=>setPhone(e.target.value)}/></div>
           </div>
           {duplicate && <div role="alert" className="flex items-start gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-primary"/><span>Possible duplicate: {duplicate.full_name}. Check this contact before saving.</span></div>}
         </section>
         <section className="space-y-4" aria-labelledby="lead-event-heading">
           <div className="flex items-center gap-2 border-b border-border pb-2"><CalendarDays className="h-4 w-4 text-primary"/><h3 id="lead-event-heading" className="text-sm font-semibold">Event details</h3></div>
           <div className="grid gap-4 sm:grid-cols-2">
             <div className="space-y-1.5"><Label htmlFor="lead-kind">Enquiry type</Label><select id="lead-kind" name="lead_kind" value={kind} onChange={e => setKind(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="event">Event (hall hire)</option><option value="catering">Catering only</option></select></div>
             <div className="space-y-1.5"><Label>Event type</Label><OptionSelect name="event_type" options={list("event_type")} defaultValue={lead?.event_type || "wedding"} required/></div>
             <div className="space-y-1.5"><Label>Preferred date</Label><DateField name="preferred_date" defaultValue={lead?.preferred_dates?.[0] || ""} placeholder="Not set"/></div>
             <div className="space-y-1.5"><Label htmlFor="lead-guests">Estimated guests</Label><Input id="lead-guests" name="guests" type="number" min="1" defaultValue={lead?.estimated_guest_count || ""}/></div>
             <label className="flex min-h-10 items-center gap-2 text-sm sm:col-span-2"><Checkbox name="flexible_date" defaultChecked={lead?.flexible_date}/> Date is flexible</label>
             {!isCatering && <><div className="space-y-1.5"><Label>Venue</Label><OptionSelect name="venue_space" options={list("venue_space")} defaultValue={lead?.venue_space || ""} emptyLabel="Not selected"/></div><div className="space-y-1.5"><Label htmlFor="lead-service-location">Service location (catering)</Label><Input id="lead-service-location" name="service_location" defaultValue={lead?.service_location || ""} placeholder="Address for catering jobs"/></div></>}
           </div>
         </section>
         <section className="space-y-4" aria-labelledby="lead-tracking-heading">
           <div className="flex items-center gap-2 border-b border-border pb-2"><CircleDollarSign className="h-4 w-4 text-primary"/><h3 id="lead-tracking-heading" className="text-sm font-semibold">Value &amp; tracking</h3></div>
           <div className="grid gap-4 sm:grid-cols-2">
             {!isCatering && <><div className="space-y-1.5"><Label htmlFor="lead-budget-min">Budget from</Label><Input id="lead-budget-min" name="budget_min" type="number" min="0" defaultValue={lead?.budget_min || ""}/></div><div className="space-y-1.5"><Label htmlFor="lead-budget-max">Budget to</Label><Input id="lead-budget-max" name="budget_max" type="number" min="0" defaultValue={lead?.budget_max || ""}/></div></>}
             <div className="space-y-1.5"><Label htmlFor="lead-value">Pipeline value</Label><Input id="lead-value" name="estimated_value" type="number" min="0" defaultValue={lead?.estimated_value || ""}/></div>
             <div className="space-y-1.5"><Label>Source</Label><OptionSelect name="source" options={list("lead_source")} defaultValue={lead?.source || "phone_call"} required/></div>
             <div className="space-y-1.5 sm:col-span-2"><Label htmlFor="lead-tags">Tags</Label><Input id="lead-tags" name="tags" defaultValue={lead?.tags.join(", ")} placeholder="VIP, referral, winter event"/></div>
           </div>
         </section>
       </div>
       <DialogFooter className="shrink-0 flex-row justify-end gap-2 border-t border-border bg-background px-5 py-3 sm:px-8 sm:py-4"><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={saving || !!duplicate}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}{lead ? "Save changes" : "Create lead"}</Button></DialogFooter>
     </form>
   </DialogContent></Dialog>;
}