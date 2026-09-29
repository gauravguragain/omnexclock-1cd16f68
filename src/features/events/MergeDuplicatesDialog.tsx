import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { prettyCrmValue } from "@/features/sales/types";

type Row = Record<string, any>;
const firstName = (n?: string) => String(n || "").trim().split(/\s+/)[0]?.toLowerCase() || "";

function groupByFirstName(rows: Row[]) {
  const m = new Map<string, Row[]>();
  rows.forEach(r => { const k = firstName(r.full_name); if (!k) return; if (!m.has(k)) m.set(k, []); m.get(k)!.push(r); });
  return [...m.entries()].filter(([, g]) => g.length > 1).sort(([a], [b]) => a.localeCompare(b));
}

function MergeGroup({ name, rows, kind, describe, onDone }: { name: string; rows: Row[]; kind: "customer" | "lead"; describe: (r: Row) => string; onDone: () => void }) {
  const [keep, setKeep] = useState<string>(rows[0].id);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) => setPicked(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const merge = async () => {
    const ids = [...picked].filter(i => i !== keep);
    if (!ids.length) return toast.error("Tick at least one record to merge into the one you keep");
    const keepName = rows.find(r => r.id === keep)?.full_name;
    if (!confirm(`Merge ${ids.length} record${ids.length > 1 ? "s" : ""} into "${keepName}"? Their details, events and history move across and the duplicates are removed.`)) return;
    setBusy(true);
    const { error } = await (supabase.rpc as any)(kind === "customer" ? "crm_merge_customers" : "crm_merge_leads", { _keep_id: keep, _merge_ids: ids });
    setBusy(false);
    if (error) return toast.error(error.message);
    toast.success(`Merged into ${keepName}`); setPicked(new Set()); onDone();
  };
  return <div className="space-y-2 rounded-md border border-border p-3">
    <div className="flex items-center justify-between gap-2"><p className="font-medium capitalize">{name} <span className="text-xs text-muted-foreground">({rows.length})</span></p>
      <Button size="sm" disabled={busy || ![...picked].some(i => i !== keep)} onClick={merge}>{busy ? "Merging…" : "Merge selected"}</Button></div>
    {rows.map(r => <div key={r.id} className={`flex items-start gap-3 rounded p-2 text-sm ${keep === r.id ? "bg-primary/10" : ""}`}>
      <Checkbox className="mt-0.5" checked={picked.has(r.id) && keep !== r.id} disabled={keep === r.id} onCheckedChange={() => toggle(r.id)} aria-label={`Merge ${r.full_name}`} />
      <div className="min-w-0 flex-1"><p className="font-medium">{r.full_name}</p><p className="break-words text-xs text-muted-foreground">{describe(r)}</p></div>
      {keep === r.id ? <Badge>Keep</Badge> : <Button size="sm" variant="ghost" onClick={() => { setKeep(r.id); setPicked(p => { const n = new Set(p); n.delete(r.id); return n; }); }}>Keep this</Button>}
    </div>)}
  </div>;
}

export default function MergeDuplicatesDialog({ open, onOpenChange, customers, leads, bookings, onDone }: { open: boolean; onOpenChange: (o: boolean) => void; customers: Row[]; leads: Row[]; bookings: Row[]; onDone: () => void }) {
  const [tab, setTab] = useState<"customer" | "lead">("customer");
  const custGroups = useMemo(() => groupByFirstName(customers), [customers]);
  const leadGroups = useMemo(() => groupByFirstName(leads), [leads]);
  const evCount = (cid: string) => { const lids = new Set(leads.filter(l => l.customer_id === cid).map(l => l.id)); return bookings.filter(b => b.customer_id === cid || lids.has(b.lead_id)).length; };
  const leadCount = (cid: string) => leads.filter(l => l.customer_id === cid).length;
  const custDesc = (c: Row) => [c.phone, c.email, c.company, `${leadCount(c.id)} lead(s)`, `${evCount(c.id)} event(s)`, prettyCrmValue(c.source || "direct")].filter(Boolean).join(" · ");
  const leadDesc = (l: Row) => { const b = bookings.find(x => x.lead_id === l.id); return [l.phone, l.email, prettyCrmValue(l.event_type || ""), l.preferred_dates?.[0], b ? `Event ${b.event_date}` : "No event yet", prettyCrmValue(l.status || "")].filter(Boolean).join(" · "); };
  const groups = tab === "customer" ? custGroups : leadGroups;
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle className="font-serif text-2xl">Merge duplicates</DialogTitle>
      <DialogDescription>Records sharing the same first name. Choose the one to keep, tick the duplicates, then merge — missing phone, email and other details are filled in, and all leads, events, menus and history move to the one you keep.</DialogDescription></DialogHeader>
    <div className="flex gap-2">
      <Button size="sm" variant={tab === "customer" ? "default" : "outline"} onClick={() => setTab("customer")}>Customers ({custGroups.length})</Button>
      <Button size="sm" variant={tab === "lead" ? "default" : "outline"} onClick={() => setTab("lead")}>Leads ({leadGroups.length})</Button>
    </div>
    {tab === "lead" && <p className="text-xs text-muted-foreground">Two leads that each already have their own event are separate events and can't be merged — merge their customers instead.</p>}
    <div className="space-y-3">{groups.length ? groups.map(([k, g]) => <MergeGroup key={`${tab}-${k}-${g.map(r => r.id).join()}`} name={k} rows={g} kind={tab} describe={tab === "customer" ? custDesc : leadDesc} onDone={onDone} />) : <p className="text-sm text-muted-foreground">No possible duplicates found.</p>}</div>
  </DialogContent></Dialog>;
}
