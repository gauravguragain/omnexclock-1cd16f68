import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { ClipboardList, ChevronRight } from "lucide-react";

type Entry = { id: string; t: string; ok: boolean; label: string; date: string; kind: string; order: string };

/** Opened from a run sheet QR: lists the chosen internal run sheets, each opening its live copy. */
export default function RunsheetCollectionPage() {
  const [items, setItems] = useState<Entry[] | null>(null);
  useEffect(() => {
    const pairs = (new URLSearchParams(window.location.search).get("r") || "").split(",").map(s => s.split(".")).filter(p => p.length === 2 && p[0] && p[1]).slice(0, 100);
    const base = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID}.supabase.co/functions/v1/crm-runsheet-public`;
    Promise.all(pairs.map(async ([id, t]) => {
      try {
        const r = await fetch(`${base}?id=${encodeURIComponent(id)}&t=${encodeURIComponent(t)}`, { headers: { apikey: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY } });
        const d = await r.json();
        if (!r.ok || !d.internal) return { id, t, ok: false, label: "Unavailable run sheet", date: "", kind: "", order: "" };
        const b = d.booking || {};
        const type = b.event_type || d.lead?.event_type || "";
        const name = d.lead?.full_name || b.event_name || "Run sheet";
        return { id, t, ok: true, label: type ? `${type.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase())} – ${name}` : name, date: b.event_date || "", kind: b.booking_kind === "catering" ? "Catering" : "Event", order: d.rs?.event_order_number || "" };
      } catch { return { id, t, ok: false, label: "Unavailable run sheet", date: "", kind: "", order: "" }; }
    })).then(list => setItems(list.sort((a, b) => (a.date || "9999").localeCompare(b.date || "9999"))));
  }, []);

  return <div className="mx-auto min-h-[100dvh] max-w-xl space-y-4 bg-background p-4 pb-16">
    <div className="flex items-center gap-3 pt-4"><span className="rounded-md bg-primary/10 p-2 text-primary"><ClipboardList className="h-5 w-5" /></span><div><h1 className="text-lg font-semibold">Run sheets</h1><p className="text-xs text-muted-foreground">Internal · always the latest version</p></div></div>
    {!items ? <p className="py-10 text-center text-sm text-muted-foreground">Loading run sheets…</p>
      : !items.length ? <p className="py-10 text-center text-sm text-muted-foreground">No run sheets in this link.</p>
      : <div className="space-y-2">{items.map(i => i.ok
        ? <Link key={i.id} to={`/runsheet/${i.id}?t=${i.t}`} className="flex items-center gap-3 rounded-lg border border-border bg-card p-3 hover:border-primary">
            <div className="w-12 text-center">{i.date ? <><p className="text-lg font-semibold leading-none">{format(parseISO(i.date), "dd")}</p><p className="text-[10px] uppercase text-muted-foreground">{format(parseISO(i.date), "MMM yy")}</p></> : <p className="text-xs text-muted-foreground">—</p>}</div>
            <div className="min-w-0 flex-1"><p className="truncate font-medium">{i.label}</p><p className="text-xs text-muted-foreground">{i.kind}{i.order ? ` · ${i.order}` : ""}</p></div>
            <ChevronRight className="h-4 w-4 text-muted-foreground" />
          </Link>
        : <div key={i.id} className="rounded-lg border border-dashed border-border p-3 text-sm text-muted-foreground">{i.label}</div>)}</div>}
  </div>;
}
