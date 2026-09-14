import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button"; import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input"; import { Label } from "@/components/ui/label"; import { Checkbox } from "@/components/ui/checkbox";
import { AlertTriangle, Loader2 } from "lucide-react"; import { toast } from "sonner";
import type { CrmLead, CrmOption } from "./types";

export default function LeadFormDialog({ open, onOpenChange, businessId, options, lead, leads, onSaved }: { open: boolean; onOpenChange: (open:boolean)=>void; businessId:string; options:CrmOption[]; lead?:CrmLead|null; leads:CrmLead[]; onSaved:()=>void }) {
  const { user } = useAuth(); const [saving, setSaving] = useState(false); const [email, setEmail] = useState(""); const [phone, setPhone] = useState("");
  useEffect(() => { setEmail(lead?.email || ""); setPhone(lead?.phone || ""); }, [lead, open]);
  const duplicate = useMemo(() => leads.find((row) => row.id !== lead?.id && ((email && row.email?.toLowerCase() === email.toLowerCase()) || (phone && row.phone?.replace(/\D/g, "") === phone.replace(/\D/g, "")))), [email, phone, leads, lead?.id]);
  const list = (type:string) => options.filter((option) => option.option_type === type && option.active);
  const submit = async (event:FormEvent<HTMLFormElement>) => { event.preventDefault(); setSaving(true); const form = new FormData(event.currentTarget);
    const values:any = { business_id: businessId, full_name: form.get("full_name"), email: email || null, phone: phone || null, company: form.get("company") || null, source: form.get("source"), event_type: form.get("event_type"), preferred_dates: form.get("preferred_date") ? [form.get("preferred_date")] : [], flexible_date: form.get("flexible_date") === "on", estimated_guest_count: form.get("guests") ? Number(form.get("guests")) : null, budget_min: form.get("budget_min") ? Number(form.get("budget_min")) : null, budget_max: form.get("budget_max") ? Number(form.get("budget_max")) : null, estimated_value: form.get("estimated_value") ? Number(form.get("estimated_value")) : 0, venue_space: form.get("venue_space") || null, tags: String(form.get("tags") || "").split(",").map((v)=>v.trim()).filter(Boolean), updated_by:user?.id };
    const result = lead ? await supabase.from("crm_leads").update(values).eq("id", lead.id) : await supabase.from("crm_leads").insert({ ...values, created_by:user?.id });
    setSaving(false); if (result.error) toast.error(result.error.message); else { toast.success(lead ? "Lead updated" : "Lead created"); onOpenChange(false); onSaved(); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{lead ? "Edit lead" : "New lead"}</DialogTitle></DialogHeader><form onSubmit={submit} className="grid gap-4 sm:grid-cols-2">
    <div className="space-y-1.5"><Label>Full name</Label><Input name="full_name" defaultValue={lead?.full_name} required/></div><div className="space-y-1.5"><Label>Company</Label><Input name="company" defaultValue={lead?.company || ""}/></div>
    <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={(e)=>setEmail(e.target.value)}/></div><div className="space-y-1.5"><Label>Phone</Label><Input value={phone} onChange={(e)=>setPhone(e.target.value)}/></div>
    {duplicate && <div className="sm:col-span-2 flex items-center gap-2 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm"><AlertTriangle className="h-4 w-4 text-primary"/>Possible duplicate: {duplicate.full_name}</div>}
    <div className="space-y-1.5"><Label>Source</Label><OptionSelect name="source" options={list("lead_source")} defaultValue={lead?.source || "phone_call"} required/></div>
    <div className="space-y-1.5"><Label>Event type</Label><OptionSelect name="event_type" options={list("event_type")} defaultValue={lead?.event_type || "wedding"} required/></div>
    <div className="space-y-1.5"><Label>Preferred date</Label><Input name="preferred_date" type="date" defaultValue={lead?.preferred_dates?.[0] || ""}/></div><div className="space-y-1.5"><Label>Guests</Label><Input name="guests" type="number" min="1" defaultValue={lead?.estimated_guest_count || ""}/></div>
    <label className="flex items-center gap-2 text-sm sm:col-span-2"><Checkbox name="flexible_date" defaultChecked={lead?.flexible_date}/> Date is flexible</label>
    <div className="space-y-1.5"><Label>Budget from</Label><Input name="budget_min" type="number" min="0" defaultValue={lead?.budget_min || ""}/></div><div className="space-y-1.5"><Label>Budget to</Label><Input name="budget_max" type="number" min="0" defaultValue={lead?.budget_max || ""}/></div>
    <div className="space-y-1.5"><Label>Pipeline value</Label><Input name="estimated_value" type="number" min="0" defaultValue={lead?.estimated_value || ""}/></div><div className="space-y-1.5"><Label>Venue</Label><select name="venue_space" defaultValue={lead?.venue_space || ""} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Not selected</option>{list("venue_space").map(o=><option key={o.id} value={o.value}>{o.label}</option>)}</select></div>
    <div className="space-y-1.5 sm:col-span-2"><Label>Tags</Label><Input name="tags" defaultValue={lead?.tags.join(", ")} placeholder="VIP, referral, winter event"/></div>
    <DialogFooter className="sm:col-span-2"><Button type="button" variant="outline" onClick={()=>onOpenChange(false)}>Cancel</Button><Button disabled={saving || !!duplicate}>{saving&&<Loader2 className="mr-2 h-4 w-4 animate-spin"/>}Save lead</Button></DialogFooter>
  </form></DialogContent></Dialog>;
}