import { FormEvent, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { ausToday, buildAusTimestamp } from "@/lib/dateUtils";
import DateField from "./DateField";
import type { CrmLead } from "./types";

export default function TaskFormDialog({ open, onOpenChange, businessId, leads, onSaved }: {
  open: boolean; onOpenChange: (open: boolean) => void; businessId: string; leads: CrmLead[]; onSaved: () => void;
}) {
  const { user } = useAuth();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [leadId, setLeadId] = useState("none");
  const [date, setDate] = useState(ausToday());
  const [time, setTime] = useState("09:00");
  const [priority, setPriority] = useState("medium");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setTitle(""); setDescription(""); setLeadId("none"); setDate(ausToday()); setTime("09:00"); setPriority("medium");
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!title.trim()) { toast.error("Enter a task title"); return; }
    setBusy(true);
    const { error } = await supabase.from("crm_tasks").insert({
      business_id: businessId, lead_id: leadId === "none" ? null : leadId, title: title.trim(),
      description: description.trim() || null, task_type: "manual", assigned_to: user?.id,
      due_at: buildAusTimestamp(date, time), priority, status: "open", automated: false, created_by: user?.id,
    } as any);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Task added to Tasks and Calendar"); onOpenChange(false); onSaved(); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent>
      <DialogHeader><DialogTitle>Add task</DialogTitle></DialogHeader>
      <form className="space-y-4" onSubmit={submit}>
        <div className="space-y-2"><Label htmlFor="task-title">Task title</Label><Input id="task-title" value={title} onChange={(event) => setTitle(event.target.value)} required /></div>
        <div className="space-y-2"><Label>Lead (optional)</Label><Select value={leadId} onValueChange={setLeadId}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">No linked lead</SelectItem>{leads.map((lead) => <SelectItem key={lead.id} value={lead.id}>{lead.full_name}</SelectItem>)}</SelectContent></Select></div>
        <div className="space-y-2"><Label htmlFor="task-notes">Notes (optional)</Label><Textarea id="task-notes" value={description} onChange={(event) => setDescription(event.target.value)} rows={3} /></div>
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Due date</Label><DateField value={date} onChange={setDate} required /></div><div className="space-y-2"><Label>Due time</Label><TimeDropdownPicker value={time} onChange={setTime} /></div></div>
        <div className="space-y-2"><Label>Priority</Label><Select value={priority} onValueChange={setPriority}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="low">Low</SelectItem><SelectItem value="medium">Medium</SelectItem><SelectItem value="high">High</SelectItem></SelectContent></Select></div>
        <div className="flex justify-end gap-2"><Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button><Button type="submit" disabled={busy}>{busy ? "Adding…" : "Add task"}</Button></div>
      </form>
    </DialogContent>
  </Dialog>;
}