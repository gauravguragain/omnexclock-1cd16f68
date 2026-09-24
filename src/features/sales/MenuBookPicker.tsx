import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, X } from "lucide-react";
import { toast } from "sonner";

type Pkg = any;
const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";

/** Pick a menu book, then a package, then choose dishes per course from that package's setup. */
export default function MenuBookPicker({ packages, onAdd }: { packages: Pkg[]; onAdd: (pkg: Pkg, picks: { course: string; dish: any }[], pricePerHead: number) => void }) {
  const books = useMemo(() => { const m = new Map<string, string>(); packages.forEach(p => m.set(p.book_id, p.book)); return [...m].map(([id, name]) => ({ id, name })); }, [packages]);
  const [bookId, setBookId] = useState(""); const [pkgId, setPkgId] = useState("");
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [price, setPrice] = useState(""); const [proteins, setProteins] = useState<Record<string, string>>({});
  const pkg = packages.find(p => p.id === pkgId);
  const reset = () => { setPkgId(""); setPicks({}); setPrice(""); setProteins({}); };

  const add = () => {
    if (!pkg) return;
    const over = pkg.courses.find((c: any) => c.picks && (picks[c.id]?.length || 0) > c.picks);
    if (over) return;
    const missing = pkg.courses.some((c: any) => (picks[c.id] || []).some(id => { const d = c.dishes.find((x: any) => x.id === id); return d?.protein_options?.length && !proteins[`${c.id}:${id}`]; }));
    if (missing) { toast.error("Choose a protein for each dish that needs one"); return; }
    const chosen = pkg.courses.flatMap((c: any) => (picks[c.id] || []).map(id => { const d = c.dishes.find((x: any) => x.id === id); const pr = proteins[`${c.id}:${id}`]; return { course: c.name, dish: d && pr ? { ...d, name: `${d.name} (${pr})` } : d }; }).filter((x: any) => x.dish));
    onAdd(pkg, chosen, Number(price) || 0); reset();
  };

  return <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/30 p-3">
    <p className="text-xs font-medium uppercase tracking-widest text-primary">From a menu book</p>
    <div className="grid gap-2 sm:grid-cols-2">
      <select className={sel} value={bookId} onChange={e => { setBookId(e.target.value); reset(); }}><option value="">Choose a menu book…</option>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
      <select className={sel} value={pkgId} disabled={!bookId} onChange={e => { setPkgId(e.target.value); setPicks({}); }}><option value="">Choose a package…</option>{packages.filter(p => p.book_id === bookId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    {pkg && <div className="space-y-3">
      {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
      {pkg.courses.map((c: any) => { const chosen = picks[c.id] || []; const full = c.picks && chosen.length >= c.picks; return <div key={c.id} className="space-y-1.5">
        <div className="flex items-center justify-between text-sm"><span className="font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.picks ? `Choose ${c.picks} · ${chosen.length} chosen` : `${chosen.length} chosen`}</span></div>
        <div className="flex flex-wrap gap-1.5">{chosen.map(id => { const d = c.dishes.find((x: any) => x.id === id); return <Badge key={id} variant="outline" className="gap-1">{d?.diet && <span className="text-primary">{d.diet === "veg" ? "V" : "N"}</span>}{d?.name}{d?.protein_options?.length > 0 && <select aria-label="Protein" className={`ml-1 h-6 rounded border bg-background px-1 text-xs ${proteins[`${c.id}:${id}`] ? "border-input" : "border-destructive"}`} value={proteins[`${c.id}:${id}`] || ""} onChange={e => setProteins(p => ({ ...p, [`${c.id}:${id}`]: e.target.value }))}><option value="">Protein…</option>{d.protein_options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>}<button type="button" onClick={() => setPicks(p => ({ ...p, [c.id]: chosen.filter(x => x !== id) }))}><X className="h-3 w-3" /></button></Badge>; })}</div>
        {!full && <select className={sel} value="" onChange={e => e.target.value && setPicks(p => ({ ...p, [c.id]: [...chosen, e.target.value] }))}><option value="">{c.dishes.length ? `Add a ${c.name.toLowerCase()} dish…` : "No dishes in this course"}</option>{c.dishes.filter((d: any) => !chosen.includes(d.id)).map((d: any) => <option key={d.id} value={d.id}>{d.name} ({d.diet === "veg" ? "Veg" : "Non-veg"}){d.protein_options?.length ? " · choose protein" : ""}</option>)}</select>}
      </div>; })}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">$</span><input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Price per guest" className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm" /></div>
        <Button type="button" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />Add package to menu</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPicks(Object.fromEntries(pkg.courses.map((c: any) => [c.id, c.dishes.slice(0, c.picks || c.dishes.length).map((d: any) => d.id)])))}>Fill with defaults</Button>
      </div>
    </div>}
  </div>;
}
