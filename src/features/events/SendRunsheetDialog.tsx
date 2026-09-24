import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Mail, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { prettyCrmValue } from "@/features/sales/types";
import { to12 } from "./useEventsData";

const PUBLIC_ORIGIN = "https://omnexclock.lovable.app";
export const runsheetPublicUrl = (rs: any) => `${PUBLIC_ORIGIN}/runsheet/${rs.id}?t=${rs.share_token}`;

type Person = { key: string; name: string; email: string };

export default function SendRunsheetDialog({ open, onOpenChange, rs, lead, booking, businessName }: {
  open: boolean; onOpenChange: (v: boolean) => void; rs: any; lead: any; booking: any; businessName: string;
}) {
  const [stakeholders, setStakeholders] = useState<any[]>([]);
  const [linked, setLinked] = useState<any[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [extra, setExtra] = useState(""); const [message, setMessage] = useState(""); const [sending, setSending] = useState(false);
  const resend = !!rs.emailed_at || !!rs.sent_at;

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [s, l] = await Promise.all([
        (supabase.from("crm_stakeholders" as any) as any).select("*").eq("business_id", lead.business_id).eq("active", true).order("full_name"),
        (supabase.from("crm_lead_stakeholders" as any) as any).select("*").eq("lead_id", lead.id),
      ]);
      setStakeholders(s.data || []); setLinked(l.data || []);
      setPicked(new Set(lead.email ? ["client"] : []));
    })();
  }, [open, lead.id]);

  const groups = useMemo(() => {
    const withEmail = stakeholders.filter(s => s.email);
    const linkedIds = new Set(linked.map(l => l.stakeholder_id));
    const map = (arr: any[]): Person[] => arr.map(s => ({ key: s.id, name: s.full_name, email: s.email }));
    return [
      { title: "Coordinators — sent the run sheet", people: map(withEmail.filter(s => s.stakeholder_type === "coordinator")) },
      { title: "Vendors on this event", people: map(withEmail.filter(s => linkedIds.has(s.id) && s.stakeholder_type !== "coordinator")) },
      { title: "Other stakeholders", people: map(withEmail.filter(s => !linkedIds.has(s.id) && s.stakeholder_type !== "coordinator")) },
    ].filter(g => g.people.length);
  }, [stakeholders, linked]);

  const all: Person[] = [...(lead.email ? [{ key: "client", name: lead.full_name, email: lead.email }] : []), ...groups.flatMap(g => g.people)];
  const extras = extra.split(/[,;\s]+/).map(e => e.trim()).filter(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e));
  const recipients = [...all.filter(p => picked.has(p.key)), ...extras.map(e => ({ key: e, name: "", email: e }))]
    .filter((p, i, a) => a.findIndex(x => x.email.toLowerCase() === p.email.toLowerCase()) === i);
  const toggle = (k: string) => setPicked(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleGroup = (ps: Person[]) => setPicked(s => { const n = new Set(s); const allOn = ps.every(p => n.has(p.key)); ps.forEach(p => allOn ? n.delete(p.key) : n.add(p.key)); return n; });

  const send = async () => {
    setSending(true);
    const start = booking?.start_time ? String(booking.start_time).slice(0, 5) : "";
    const payload = {
      type: "runsheet", businessName, resend, message: message.trim() || undefined,
      eventTitle: `${prettyCrmValue(lead.event_type || booking?.event_type || "Event")} — ${lead.full_name}`,
      dateLabel: booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "EEEE, d MMMM yyyy") : "",
      timeLabel: start ? to12(start) : "",
      venue: prettyCrmValue(booking?.venue_space || lead.venue_space || ""),
      guestsLabel: rs.adult_guests != null ? `${rs.adult_guests} adults${rs.kids_guests ? ` + ${rs.kids_guests} kids` : ""}` : "",
      eventOrder: rs.event_order_number ? `${rs.event_order_number}-${rs.revision || 1}` : "",
      viewUrl: runsheetPublicUrl(rs),
    };
    let ok = 0; const failed: string[] = [];
    for (const r of recipients) {
      const { data, error } = await supabase.functions.invoke("send-email", { body: { ...payload, to: r.email, recipientName: r.name || undefined } });
      if (error || !data?.success) failed.push(r.email); else ok++;
    }
    if (ok) {
      await supabase.from("crm_interactions").insert({ business_id: lead.business_id, lead_id: lead.id, interaction_type: "note", occurred_at: new Date().toISOString(),
        notes: `Run sheet v${rs.revision || 1} emailed to ${recipients.filter(r => !failed.includes(r.email)).map(r => r.email).join(", ")}.` } as any);
    }
    setSending(false);
    if (failed.length) toast.error(`Couldn't send to ${failed.join(", ")}`);
    if (ok) { toast.success(`Run sheet sent to ${ok}`); onOpenChange(false); }
  };

  const Item = ({ p }: { p: Person }) => <label className="flex cursor-pointer items-start gap-3 border-t border-border px-4 py-3">
    <Checkbox checked={picked.has(p.key)} onCheckedChange={() => toggle(p.key)} className="mt-0.5" />
    <span><span className="block text-sm font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.email}</span></span>
  </label>;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>{resend ? "Send this run sheet again?" : "Email the run sheet"}</DialogTitle></DialogHeader>
      <p className="flex gap-2 text-sm text-muted-foreground"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />Nothing about the event changes. Each person gets a link to the run sheet exactly as it stands — no prices shown.</p>
      <div>
        <p className="mb-2 text-sm font-medium">Who gets an email</p>
        <div className="overflow-hidden rounded-xl border border-border">
          {lead.email ? <div className="[&>label]:border-t-0"><Item p={{ key: "client", name: `The client — ${lead.full_name}`, email: lead.email }} /></div>
            : <p className="px-4 py-3 text-sm text-muted-foreground">The client has no email saved.</p>}
          {groups.map(g => <div key={g.title}>
            <div className="flex items-center justify-between border-t border-border bg-muted/40 px-4 py-2 text-xs text-muted-foreground"><span>{g.title}</span><button type="button" className="hover:text-primary" onClick={() => toggleGroup(g.people)}>Select all</button></div>
            {g.people.map(p => <Item key={p.key} p={p} />)}
          </div>)}
        </div>
      </div>
      <Input value={extra} onChange={e => setExtra(e.target.value)} placeholder="Other emails (comma separated)" />
      <Textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="Optional message" rows={2} />
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={!recipients.length || sending} onClick={send}><Mail className="mr-2 h-4 w-4" />{sending ? "Sending…" : `${resend ? "Resend" : "Send"} to ${recipients.length}`}</Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
