import { useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Plus, Search, Upload } from "lucide-react";
import { useCrmData } from "@/features/sales/useCrmData";
import LeadFormDialog from "@/features/sales/LeadFormDialog";
import LeadDetailDialog from "@/features/sales/LeadDetailDialog";
import { prettyCrmValue, type CrmLead } from "@/features/sales/types";

export default function LeadsBoard({ kind }: { kind: "event" | "catering" }) {
  const crm = useCrmData(); const nav = useNavigate(); const { businessCode } = useParams();
  const [tab, setTab] = useState("new"); const [search, setSearch] = useState("");
  const [formOpen, setFormOpen] = useState(false); const [editing, setEditing] = useState<CrmLead | null>(null); const [detail, setDetail] = useState<CrmLead | null>(null);
  const [declining, setDeclining] = useState<CrmLead | null>(null); const [reason, setReason] = useState(""); const fileRef = useRef<HTMLInputElement>(null);
  const mine = useMemo(() => crm.leads.filter(l => (l.lead_kind || "event") === kind), [crm.leads, kind]);
  const outcome = (l: CrmLead) => l.lead_outcome || "new";
  const shown = mine.filter(l => (tab === "all" || outcome(l) === tab) && `${l.full_name} ${l.email || ""} ${l.phone || ""} ${l.event_type} ${l.service_location || ""}`.toLowerCase().includes(search.toLowerCase()));
  const reasons = crm.options.filter(o => o.option_type === "lost_reason" && o.active);
  if (!crm.business) return null;
  const label = kind === "event" ? "Event leads" : "Catering leads";

  const decline = async () => {
    if (!declining) return;
    const { error } = await supabase.from("crm_leads").update({ lead_outcome: "declined", decline_reason: reason || null, lost_reason: reason || null } as any).eq("id", declining.id);
    if (error) toast.error(error.message); else { toast.success("Lead declined"); setDeclining(null); setReason(""); crm.refresh(); }
  };
  const reopen = async (l: CrmLead) => { await supabase.from("crm_leads").update({ lead_outcome: "new", decline_reason: null } as any).eq("id", l.id); crm.refresh(); };
  const exportCsv = () => {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const rows = [["Name", "Phone", "Email", "Source", "Event type", "Preferred date", "Guests", "Service location", "Outcome", "Stage"], ...shown.map(l => [l.full_name, l.phone, l.email, l.source, l.event_type, l.preferred_dates?.[0], l.estimated_guest_count, l.service_location, outcome(l), l.status])];
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([rows.map(r => r.map(q).join(",")).join("\n")], { type: "text/csv" }));
    a.download = `${crm.business!.business_code}__${label.replace(" ", "-")}__${format(new Date(), "dd.MM.yyyy")}.csv`; a.click();
  };
  const importCsv = async (file: File) => {
    const text = await file.text(); const lines = text.split(/\r?\n/).filter(Boolean);
    const parse = (line: string) => (line.match(/("([^"]|"")*"|[^,]*)(,|$)/g) || []).map(c => c.replace(/,$/, "").replace(/^"|"$/g, "").replace(/""/g, '"').trim());
    const head = parse(lines[0]).map(h => h.toLowerCase());
    const idx = (n: string) => head.findIndex(h => h.includes(n));
    const rows = lines.slice(1).map(parse).filter(r => r[idx("name")]).map(r => ({
      business_id: crm.business!.id, full_name: r[idx("name")], phone: r[idx("phone")] || null, email: r[idx("email")] || null,
      source: (r[idx("source")] || "import").toLowerCase().replace(/\s+/g, "_"), event_type: (r[idx("event")] || "other").toLowerCase().replace(/\s+/g, "_"),
      preferred_dates: idx("date") >= 0 && r[idx("date")] ? [r[idx("date")]] : [], estimated_guest_count: Number(r[idx("guest")]) || null,
      service_location: idx("location") >= 0 ? r[idx("location")] || null : null, lead_kind: kind,
    }));
    if (!rows.length) return toast.error("No rows found — the file needs a Name column");
    const { error } = await supabase.from("crm_leads").insert(rows as any);
    if (error) toast.error(error.message); else { toast.success(`${rows.length} leads imported`); crm.refresh(); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-widest text-primary">Leads</p><h1 className="font-serif text-3xl font-semibold">{label}</h1><p className="text-sm text-muted-foreground">{kind === "event" ? "Enquiries about hosting an event — each lead moves step by step from enquiry through inspection, menu, invoice, deposit, runsheet and final payment." : "Enquiries for catering only — each lead moves step by step through the full workflow."}</p></div>
      <div className="flex flex-wrap gap-2"><input ref={fileRef} type="file" accept=".csv" hidden onChange={e => e.target.files?.[0] && importCsv(e.target.files[0])} /><Button variant="outline" onClick={() => fileRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Import</Button><Button variant="outline" onClick={exportCsv}><Download className="mr-2 h-4 w-4" />Export</Button><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />New lead</Button></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">{["new", "confirmed", "declined", "all"].map(t => <Button key={t} size="sm" variant={tab === t ? "default" : "outline"} onClick={() => setTab(t)} className="capitalize">{t} ({t === "all" ? mine.length : mine.filter(l => outcome(l) === t).length})</Button>)}
      <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="Search leads" value={search} onChange={e => setSearch(e.target.value)} /></div></div>
    <p className="text-xs text-muted-foreground">{shown.length} leads shown</p>
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{shown.map(l => <Card key={l.id}><CardContent className="space-y-3 p-5">
      <div className="flex items-start justify-between gap-2"><div><p className="font-serif text-xl">{l.full_name}</p><p className="text-xs text-muted-foreground">{prettyCrmValue(l.event_type)} · {prettyCrmValue(l.source)}</p></div><Badge variant={outcome(l) === "declined" ? "destructive" : "outline"} className="capitalize">{outcome(l)}</Badge></div>
      <dl className="grid grid-cols-2 gap-2 text-sm"><div><dt className="text-xs text-muted-foreground">Email</dt><dd className="truncate">{l.email || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Phone</dt><dd>{l.phone || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Guests</dt><dd>{l.estimated_guest_count || "—"}</dd></div><div><dt className="text-xs text-muted-foreground">Date</dt><dd>{l.preferred_dates?.[0] || "—"}</dd></div>{kind === "catering" && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Service location</dt><dd>{l.service_location || "—"}</dd></div>}{l.decline_reason && <div className="col-span-2"><dt className="text-xs text-muted-foreground">Declined because</dt><dd>{prettyCrmValue(l.decline_reason)}</dd></div>}</dl>
      <div className="flex flex-wrap gap-2 pt-1">
        {outcome(l) === "new" && <><Button size="sm" onClick={() => setDetail(l)}>Continue workflow · {prettyCrmValue(l.status)}</Button><Button size="sm" variant="outline" onClick={() => setDeclining(l)}>Decline</Button></>}
        {outcome(l) === "declined" && <Button size="sm" variant="outline" onClick={() => reopen(l)}>Reopen</Button>}
        <Button size="sm" variant="ghost" onClick={() => setDetail(l)}>View details</Button><Button size="sm" variant="ghost" onClick={() => { setEditing(l); setFormOpen(true); }}>Edit</Button>
      </div>
    </CardContent></Card>)}{!shown.length && <p className="text-sm text-muted-foreground">No leads here.</p>}</div>
    <Dialog open={!!declining} onOpenChange={o => !o && setDeclining(null)}><DialogContent><DialogHeader><DialogTitle>Decline {declining?.full_name}</DialogTitle></DialogHeader>
      <select value={reason} onChange={e => setReason(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Choose a reason</option>{reasons.map(r => <option key={r.id} value={r.value}>{r.label}</option>)}</select>
      <DialogFooter><Button variant="outline" onClick={() => setDeclining(null)}>Cancel</Button><Button variant="destructive" onClick={decline}>Decline lead</Button></DialogFooter></DialogContent></Dialog>
    <LeadFormDialog open={formOpen} onOpenChange={setFormOpen} businessId={crm.business.id} options={crm.options} lead={editing} leads={crm.leads} onSaved={crm.refresh} defaultKind={kind} />
    <LeadDetailDialog lead={detail} open={!!detail} onOpenChange={o => !o && setDetail(null)} options={crm.options} interactions={crm.interactions} inspections={crm.inspections} tasks={crm.tasks} menuItems={crm.menuItems} booking={crm.bookings.find(b => b.lead_id === detail?.id)} businessName={crm.business.name} onSaved={crm.refresh} />
  </div>;
}
