import { useEffect, useMemo, useState } from "react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Mail, RotateCcw, Send, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { prettyCrmValue } from "@/features/sales/types";
import { to12 } from "./useEventsData";

const PUBLIC_ORIGIN = "https://omnexclock.lovable.app";
export const runsheetPublicUrl = (rs: any) => `${PUBLIC_ORIGIN}/runsheet/${rs.id}?t=${rs.share_token}`;

type Person = { key: string; name: string; email: string; kind: "confirmation" | "runsheet" };
type Group = { title: string; people: Person[] };

/**
 * Mirrors the draft app: one window to issue (first send) or resend (later) a booking.
 * Client + event managers get the booking confirmation; kitchen + coordinators get the run sheet.
 */
export default function SendRunsheetDialog({ open, onOpenChange, rs, lead, booking, businessName, mode = "resend", onIssue, onSent }: {
  open: boolean; onOpenChange: (v: boolean) => void; rs: any; lead: any; booking: any; businessName: string;
  mode?: "issue" | "resend"; onIssue?: () => Promise<any | null>; onSent?: () => void;
}) {
  const { user } = useAuth();
  const issuing = mode === "issue";
  const [groups, setGroups] = useState<Group[]>([]);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const already = new Set<string>((rs?.emailed_to || []).map((e: string) => e.toLowerCase()));

  useEffect(() => {
    if (!open) return;
    (async () => {
      const [mgr, st] = await Promise.all([
        (supabase.rpc as any)("crm_event_managers", { _business_id: lead.business_id }),
        (supabase.from("crm_stakeholders" as any) as any).select("id, full_name, email, stakeholder_type").eq("business_id", lead.business_id).eq("active", true).order("full_name"),
      ]);
      const staff = (st.data || []).filter((s: any) => s.email);
      const g: Group[] = [
        { title: "Event managers", people: (mgr.data || []).map((m: any) => ({ key: `m-${m.user_id}`, name: m.full_name || m.email, email: m.email, kind: "confirmation" as const })) },
        { title: "Kitchen — sent the run sheet", people: staff.filter((s: any) => s.stakeholder_type === "kitchen").map((s: any) => ({ key: s.id, name: s.full_name, email: s.email, kind: "runsheet" as const })) },
        { title: "Coordinators — sent the run sheet", people: staff.filter((s: any) => s.stakeholder_type === "coordinator").map((s: any) => ({ key: s.id, name: s.full_name, email: s.email, kind: "runsheet" as const })) },
      ];
      setGroups(g);
      // Resend: preselect whoever was emailed before. Issue: client + me + every coordinator/kitchen contact.
      const next = new Set<string>();
      const all = [...(lead.email ? [{ key: "client", email: lead.email }] : []), ...g.flatMap(x => x.people)];
      if (!issuing && already.size) all.forEach(p => already.has(p.email.toLowerCase()) && next.add(p.key));
      else {
        if (lead.email) next.add("client");
        g[0].people.forEach(p => p.key === `m-${user?.id}` && next.add(p.key));
      }
      setPicked(next);
    })();
  }, [open, lead.id]);

  const client: Person | null = lead.email ? { key: "client", name: lead.full_name, email: lead.email, kind: "confirmation" } : null;
  const everyone = useMemo(() => [...(client ? [client] : []), ...groups.flatMap(g => g.people)], [groups, lead.email]);
  const recipients = everyone.filter(p => picked.has(p.key)).filter((p, i, a) => a.findIndex(x => x.email.toLowerCase() === p.email.toLowerCase()) === i);
  const toggle = (k: string) => setPicked(s => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });
  const toggleGroup = (ps: Person[]) => setPicked(s => { const n = new Set(s); const on = ps.every(p => n.has(p.key)); ps.forEach(p => on ? n.delete(p.key) : n.add(p.key)); return n; });

  const send = async () => {
    setSending(true);
    let sheet = rs;
    if (issuing) { sheet = await onIssue?.(); if (!sheet) { setSending(false); return; } }
    const start = booking?.start_time ? String(booking.start_time).slice(0, 5) : "";
    const endMin = start && booking?.duration_minutes ? (() => { const [h, m] = start.split(":").map(Number); const t = (h * 60 + m + booking.duration_minutes) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; })() : "";
    const base = {
      type: "runsheet", businessName, resend: !issuing,
      eventTitle: `${prettyCrmValue(lead.event_type || booking?.event_type || "Event")} — ${lead.full_name}`,
      dateLabel: booking?.event_date ? format(new Date(`${booking.event_date}T00:00:00`), "EEEE, d MMMM yyyy") : "",
      timeLabel: start ? `${to12(start)}${endMin ? ` – ${to12(endMin)}` : ""}` : "",
      venue: prettyCrmValue(booking?.venue_space || lead.venue_space || ""),
      guestsLabel: sheet.adult_guests != null ? `${sheet.adult_guests} adults${sheet.kids_guests ? ` + ${sheet.kids_guests} kids` : ""}` : "",
      eventOrder: sheet.event_order_number ? `${sheet.event_order_number}-${sheet.revision || 1}` : "",
      viewUrl: runsheetPublicUrl(sheet),
    };
    const ok: string[] = []; const failed: string[] = [];
    for (const r of recipients) {
      const { data, error } = await supabase.functions.invoke("send-email", { body: { ...base, kind: r.kind, to: r.email, recipientName: r.key === "client" ? lead.full_name : r.name } });
      if (error || !data?.success) failed.push(r.email); else ok.push(r.email);
    }
    if (ok.length) {
      const emailed = Array.from(new Set([...(sheet.emailed_to || []), ...ok.map(e => e.toLowerCase())]));
      await supabase.from("crm_runsheets").update({ emailed_at: new Date().toISOString(), emailed_to: emailed } as any).eq("id", sheet.id);
      await supabase.from("crm_interactions").insert({ business_id: lead.business_id, lead_id: lead.id, interaction_type: "email", occurred_at: new Date().toISOString(), logged_by: user?.id,
        notes: `${issuing ? "Booking confirmed and run sheet" : "Booking and run sheet re-sent"} (v${sheet.revision || 1}) to ${ok.join(", ")}.` } as any);
    }
    setSending(false);
    if (failed.length) toast.error(`Couldn't send to ${failed.join(", ")}`);
    if (ok.length) toast.success(`Sent to ${ok.length}`);
    if (!failed.length) onOpenChange(false);
    onSent?.();
  };

  const Item = ({ p, first }: { p: Person; first?: boolean }) => <label className={`flex cursor-pointer items-start gap-3 px-4 py-3 ${first ? "" : "border-t border-border"}`}>
    <Checkbox checked={picked.has(p.key)} onCheckedChange={() => toggle(p.key)} className="mt-0.5" />
    <span className="flex-1"><span className="block text-sm font-medium">{p.name}</span><span className="block text-xs text-muted-foreground">{p.email}</span></span>
    {already.has(p.email.toLowerCase()) && <span className="flex items-center gap-1 text-[11px] text-muted-foreground"><Check className="h-3 w-3" />Emailed</span>}
  </label>;

  return <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
      <DialogHeader><DialogTitle>{issuing ? (rs?.sent_at ? "Re-issue this booking?" : "Confirm and send this booking") : "Send this booking again?"}</DialogTitle></DialogHeader>
      {issuing
        ? <p className="flex gap-2 text-sm text-muted-foreground"><Send className="mt-0.5 h-4 w-4 shrink-0" />Locks in run sheet v{rs?.revision || 1}, moves the lead to "Run sheet sent" and creates the follow-up tasks. The client and event managers get the booking confirmation; kitchen and coordinators get the run sheet.</p>
        : <>
          <p className="flex gap-2 text-sm text-muted-foreground"><RotateCcw className="mt-0.5 h-4 w-4 shrink-0" />Nothing about the event changes. It sends the confirmation and the run sheet exactly as they stand.</p>
          {already.size > 0 && <p className="flex gap-2 rounded-xl border border-border bg-muted/40 p-3 text-xs text-muted-foreground"><Mail className="mt-0.5 h-3.5 w-3.5 shrink-0" />Everyone marked "Emailed" has already been emailed once. Sending again puts a second, identical copy in their inbox — worth doing if the first didn't arrive, otherwise close this.</p>}
        </>}
      <div>
        <p className="mb-2 text-sm font-medium">Who gets an email</p>
        <div className="overflow-hidden rounded-xl border border-border">
          {client ? <Item p={{ ...client, name: "The client" , email: client.email }} first /> : <p className="px-4 py-3 text-sm text-muted-foreground">The client has no email saved.</p>}
          {groups.filter(g => g.people.length).map(g => <div key={g.title}>
            <div className="flex items-center justify-between border-t border-border px-4 py-2.5 text-xs text-muted-foreground"><span>{g.title}</span><button type="button" className="hover:text-primary" onClick={() => toggleGroup(g.people)}>Select all</button></div>
            {g.people.map(p => <Item key={p.key} p={p} />)}
          </div>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">Each email links to the live run sheet — no prices shown. Add kitchen contacts under Stakeholders & vendors (type "kitchen") and coordinators under People → Coordinators.</p>
      </div>
      <DialogFooter>
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button disabled={sending || (!issuing && !recipients.length)} onClick={send}>
          {sending ? "Sending…" : issuing ? (recipients.length ? `Confirm & send to ${recipients.length}` : "Confirm without emailing") : `Resend to ${recipients.length}`}
        </Button>
      </DialogFooter>
    </DialogContent>
  </Dialog>;
}
