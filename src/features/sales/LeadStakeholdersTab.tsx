import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Phone, Mail, X, Plus } from "lucide-react";
import { toast } from "sonner";
import { prettyCrmValue } from "./types";

type Row = Record<string, any>;

export default function LeadStakeholdersTab({ leadId, businessId }: { leadId: string; businessId: string }) {
  const { businessCode } = useParams();
  const [all, setAll] = useState<Row[]>([]);
  const [links, setLinks] = useState<Row[]>([]);
  const [pick, setPick] = useState(""); const [role, setRole] = useState(""); const [time, setTime] = useState("");
  const [filter, setFilter] = useState("all");
  const t = (n: string) => supabase.from(n as any) as any;
  const load = async () => {
    const [s, l] = await Promise.all([
      t("crm_stakeholders").select("*").eq("business_id", businessId).eq("active", true).order("full_name"),
      t("crm_lead_stakeholders").select("*").eq("lead_id", leadId).order("created_at"),
    ]);
    setAll(s.data || []); setLinks(l.data || []);
  };
  useEffect(() => { load(); }, [leadId]);
  const linked = new Set(links.map(l => l.stakeholder_id));
  const types = Array.from(new Set(all.map(s => s.stakeholder_type)));
  const available = all.filter(s => !linked.has(s.id) && (filter === "all" || s.stakeholder_type === filter));
  const add = async () => {
    if (!pick) return;
    const { error } = await t("crm_lead_stakeholders").insert({ business_id: businessId, lead_id: leadId, stakeholder_id: pick, role: role || null, arrival_time: time || null });
    if (error) return toast.error(error.message);
    setPick(""); setRole(""); setTime(""); load();
  };
  const remove = async (id: string) => { const { error } = await t("crm_lead_stakeholders").delete().eq("id", id); if (error) toast.error(error.message); else load(); };

  return <div className="space-y-5">
    <div className="space-y-3 rounded-md border border-border p-4">
      <p className="text-sm font-medium">Add a stakeholder to this event</p>
      <div className="flex flex-wrap gap-1.5">{["all", ...types].map(ty => <button key={ty} type="button" onClick={() => setFilter(ty)} className={`rounded-full border px-3 py-1 text-xs ${filter === ty ? "border-primary bg-primary/10" : "border-border"}`}>{ty === "all" ? "All" : prettyCrmValue(ty)}</button>)}</div>
      <div className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_auto]">
        <select value={pick} onChange={e => setPick(e.target.value)} className="h-10 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Choose a vendor or stakeholder…</option>
          {available.map(s => <option key={s.id} value={s.id}>{s.full_name} · {prettyCrmValue(s.stakeholder_type)}{s.position ? ` (${s.position})` : ""}</option>)}
        </select>
        <Input value={role} onChange={e => setRole(e.target.value)} placeholder="Role on the day (e.g. Stage decor)" />
        <Input value={time} onChange={e => setTime(e.target.value)} placeholder="Arrival (e.g. 3:00 PM)" />
        <Button type="button" onClick={add} disabled={!pick}><Plus className="mr-1 h-4 w-4" />Add</Button>
      </div>
      {!all.length && <p className="text-sm text-muted-foreground">No stakeholders yet. Add them under People → <Link to={`/b/${businessCode}/events/stakeholders`} className="text-primary underline">Stakeholders & vendors</Link>.</p>}
    </div>
    <div className="space-y-2">
      {links.map(l => { const s = all.find(x => x.id === l.stakeholder_id); if (!s) return null; return <div key={l.id} className="flex items-start justify-between gap-3 rounded-md border border-border p-3">
        <div className="space-y-1"><div className="flex items-center gap-2"><p className="font-medium">{s.full_name}</p><Badge variant="outline">{prettyCrmValue(s.stakeholder_type)}</Badge></div>
          {(l.role || l.arrival_time) && <p className="text-sm">{[l.role, l.arrival_time && `Arrives ${l.arrival_time}`].filter(Boolean).join(" · ")}</p>}
          <p className="flex flex-wrap gap-3 text-xs text-muted-foreground">{s.phone && <span className="flex items-center gap-1"><Phone className="h-3 w-3" />{s.phone}</span>}{s.email && <span className="flex items-center gap-1"><Mail className="h-3 w-3" />{s.email}</span>}</p></div>
        <Button type="button" variant="ghost" size="icon" onClick={() => remove(l.id)} aria-label="Remove"><X className="h-4 w-4" /></Button>
      </div>; })}
      {!links.length && <p className="text-sm text-muted-foreground">No stakeholders attached to this event yet.</p>}
    </div>
  </div>;
}
