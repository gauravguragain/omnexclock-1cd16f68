import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useCrmData } from "@/features/sales/useCrmData";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { History } from "lucide-react";

type Row = { id: string; lead_id: string | null; event_type: string; title: string; details: any; actor_id: string | null; created_at: string };
const TYPES: Record<string, string> = { all: "All", lead_created: "Lead created", status_changed: "Stage changes", interaction: "Interactions" };
const PAGE = 200;

export default function AuditLogPage() {
  const crm = useCrmData(); const { businessCode } = useParams();
  const [rows, setRows] = useState<Row[]>([]); const [people, setPeople] = useState<Record<string, string>>({});
  const [type, setType] = useState("all"); const [q, setQ] = useState(""); const [limit, setLimit] = useState(PAGE); const [loading, setLoading] = useState(true);
  const bid = crm.business?.id;

  useEffect(() => {
    if (!bid) return; setLoading(true);
    let query = (supabase.from("crm_timeline_events" as any) as any).select("*").eq("business_id", bid).order("created_at", { ascending: false }).limit(limit);
    if (type !== "all") query = query.eq("event_type", type);
    query.then(async ({ data }: any) => {
      const list = (data || []) as Row[]; setRows(list);
      const ids = [...new Set(list.map(r => r.actor_id).filter(Boolean))] as string[];
      if (ids.length) { const { data: p } = await supabase.from("profiles").select("id, full_name, email").in("id", ids); setPeople(Object.fromEntries((p || []).map((x: any) => [x.id, x.full_name || x.email]))); }
      setLoading(false);
    });
  }, [bid, type, limit]);

  const leadName = useMemo(() => Object.fromEntries(crm.leads.map(l => [l.id, l.full_name])), [crm.leads]);
  const shown = rows.filter(r => `${r.title} ${leadName[r.lead_id || ""] || ""} ${people[r.actor_id || ""] || ""}`.toLowerCase().includes(q.toLowerCase()));
  const fmt = (s: string) => new Date(s).toLocaleString("en-AU", { timeZone: "Australia/Sydney", day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit", hour12: true });

  if (!crm.business) return null;
  return <div className="space-y-6">
    <div><p className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-primary"><History className="h-4 w-4" />Sales &amp; events</p><h1 className="font-serif text-3xl font-semibold">Audit log</h1><p className="text-sm text-muted-foreground">Who did what, and when — newest first.</p></div>
    <div className="flex flex-wrap items-center gap-2">
      {Object.entries(TYPES).map(([k, v]) => <Button key={k} size="sm" variant={type === k ? "default" : "outline"} onClick={() => { setType(k); setLimit(PAGE); }}>{v}</Button>)}
      <Input className="ml-auto w-full sm:w-64" placeholder="Search client, action or person" value={q} onChange={e => setQ(e.target.value)} />
    </div>
    <div className="divide-y rounded-xl border bg-card">
      {loading && !rows.length ? <p className="p-6 text-sm text-muted-foreground">Loading…</p> : !shown.length ? <p className="p-6 text-sm text-muted-foreground">No activity found.</p> :
        shown.map(r => <div key={r.id} className="flex flex-col gap-1 p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-medium">{r.title}</p>
            <p className="text-xs text-muted-foreground">
              {r.lead_id && leadName[r.lead_id] ? <Link className="text-primary hover:underline" to={`/b/${businessCode}/events/lead/${r.lead_id}`}>{leadName[r.lead_id]}</Link> : "—"}
              {" · "}{r.actor_id ? people[r.actor_id] || "Staff member" : "System"}
            </p>
          </div>
          <p className="shrink-0 text-xs text-muted-foreground">{fmt(r.created_at)}</p>
        </div>)}
    </div>
    {rows.length >= limit && <div className="text-center"><Button variant="outline" onClick={() => setLimit(l => l + PAGE)}>Load more</Button></div>}
  </div>;
}
