import { useEffect, useState } from "react";
import { CalendarClock, Check, UserX } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import DateField from "./DateField";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { buildAusTimestamp } from "@/lib/dateUtils";
import type { CrmInspection, CrmLead } from "./types";

function sydneyParts(timestamp: string | null) {
  if (!timestamp) return { date: "", time: "10:00" };
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value || "";
  return { date: `${part("year")}-${part("month")}-${part("day")}`, time: `${part("hour")}:${part("minute")}` };
}

export default function InspectionActions({ inspection, lead, onSaved }: {
  inspection: CrmInspection; lead?: CrmLead; onSaved: () => void;
}) {
  const { user } = useAuth();
  const initialStart = sydneyParts(inspection.starts_at || inspection.proposed_at);
  const initialEnd = sydneyParts(inspection.ends_at);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState(initialStart.date);
  const [startTime, setStartTime] = useState(initialStart.time);
  const [endTime, setEndTime] = useState(inspection.ends_at ? initialEnd.time : "11:00");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    const start = sydneyParts(inspection.starts_at || inspection.proposed_at);
    const end = sydneyParts(inspection.ends_at);
    setDate(start.date); setStartTime(start.time); setEndTime(inspection.ends_at ? end.time : "11:00");
  }, [open, inspection.starts_at, inspection.proposed_at, inspection.ends_at]);

  const setOutcome = async (status: "completed" | "no_show_needs_follow_up") => {
    setBusy(true);
    const { error } = await supabase.from("crm_inspections").update({ status, updated_by: user?.id } as any).eq("id", inspection.id);
    if (!error && status === "completed" && lead?.status === "inspection_booked") {
      const { error: leadError } = await supabase.from("crm_leads").update({ status: "inspected" }).eq("id", lead.id);
      if (leadError) { setBusy(false); toast.error(leadError.message); return; }
    }
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(status === "completed" ? "Inspection marked complete" : "No show recorded — follow-up needed"); onSaved(); }
  };

  const reschedule = async () => {
    if (!date) { toast.error("Choose a new inspection date"); return; }
    if (endTime <= startTime) { toast.error("End time must be after start time"); return; }
    setBusy(true);
    const { error } = await supabase.from("crm_inspections").update({
      proposed_at: buildAusTimestamp(date, startTime), starts_at: buildAusTimestamp(date, startTime),
      ends_at: buildAusTimestamp(date, endTime), status: "rescheduled", updated_by: user?.id,
    } as any).eq("id", inspection.id);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Inspection rescheduled on the calendar"); setOpen(false); onSaved(); }
  };

  return <>
    <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-4">
      <Button size="sm" variant="outline" disabled={busy || inspection.status === "completed"} onClick={() => setOutcome("completed")}><Check className="mr-2 h-4 w-4" />Complete</Button>
      <Button size="sm" variant="outline" disabled={busy} onClick={() => setOpen(true)}><CalendarClock className="mr-2 h-4 w-4" />Reschedule</Button>
      <Button size="sm" variant="outline" disabled={busy || inspection.status === "no_show_needs_follow_up"} onClick={() => setOutcome("no_show_needs_follow_up")}><UserX className="mr-2 h-4 w-4" />No show</Button>
    </div>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent>
        <DialogHeader><DialogTitle>Reschedule inspection</DialogTitle></DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2"><Label>Date</Label><DateField value={date} onChange={setDate} required /></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2"><Label>Start time</Label><TimeDropdownPicker value={startTime} onChange={setStartTime} /></div>
            <div className="space-y-2"><Label>End time</Label><TimeDropdownPicker value={endTime} onChange={setEndTime} /></div>
          </div>
          <div className="flex justify-end gap-2"><Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button disabled={busy} onClick={reschedule}>{busy ? "Saving…" : "Save new time"}</Button></div>
        </div>
      </DialogContent>
    </Dialog>
  </>;
}