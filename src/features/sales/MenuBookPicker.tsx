import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ChevronDown, Pencil, Plus, X } from "lucide-react";
import { toast } from "sonner";

type Pkg = any;
const sel = "h-9 w-full rounded-md border border-input bg-background px-3 text-sm";
type Pick = { course: string; courseId: string; dish: any; protein?: string; notes?: string; oneOff?: boolean };

/** Searchable dish picker: type to filter the course's dish list, then choose one. */
function DishSearchSelect({ course, chosen, vegCount, nonVegCount, onPick }: { course: any; chosen: string[]; vegCount: number; nonVegCount: number; onPick: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const separate = course.veg_picks != null || course.non_veg_picks != null;
  const eligible = course.dishes.filter((d: any) => !chosen.includes(d.id) && (!separate || (d.diet === "veg" ? vegCount < (course.veg_picks ?? 0) : nonVegCount < (course.non_veg_picks ?? 0))));
  const term = q.trim().toLowerCase();
  const filtered = term ? eligible.filter((d: any) => d.name.toLowerCase().includes(term)) : eligible;
  const pick = (id: string) => { onPick(id); setOpen(false); setQ(""); };
  return (
    <Popover open={open} onOpenChange={o => { setOpen(o); if (o) setQ(""); }}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`Add a ${course.name.toLowerCase()} dish`} className="flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-sm text-muted-foreground hover:border-primary">
          <span>{`Add a ${course.name.toLowerCase()} dish…`}</span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-2rem),420px)] space-y-2 p-2">
        <Input autoFocus placeholder={`Search ${course.name.toLowerCase()} dishes…`} value={q} onChange={e => setQ(e.target.value)} />
        <ul className="max-h-60 overflow-y-auto rounded-md border border-border">
          {filtered.map((d: any) => (
            <li key={d.id}>
              <button type="button" onClick={() => pick(d.id)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted">
                <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border ${d.diet === "veg" ? "border-success bg-success/30" : "border-destructive bg-destructive/30"}`} />
                <span className="flex-1 truncate">{d.name}{Number(d.extra_price_per_head) > 0 ? ` · +$${Number(d.extra_price_per_head).toFixed(2)}/person` : ""}{d.protein_options?.length ? " · choose protein" : ""}</span>
                <span className="shrink-0 text-xs text-muted-foreground">{d.diet === "veg" ? "Veg" : d.diet === "seafood" ? "Seafood" : "Non-veg"}</span>
              </button>
            </li>
          ))}
          {!filtered.length && <li className="px-3 py-3 text-sm text-muted-foreground">No dishes match “{q}”.</li>}
          <li className="border-t border-border">
            <button type="button" onClick={() => pick("__other__")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-primary hover:bg-muted"><Plus className="h-3.5 w-3.5" />Other (type your own)…</button>
          </li>
        </ul>
      </PopoverContent>
    </Popover>
  );
}
type InitialSelection = { bookId: string; pkgId: string; picks: Record<string, string[]>; proteins: Record<string, string>; price: string; flat?: string; notes?: Record<string, string>; oneOffs?: Record<string, { name: string; diet: string }> };

/** Pick a menu book, then a package, then choose dishes per course from that package's setup. */
export default function MenuBookPicker({ packages, onAdd, initial, onCancel }: { packages: Pkg[]; onAdd: (pkg: Pkg, picks: Pick[], pricePerHead: number, flatPrice: number) => void; initial?: InitialSelection; onCancel?: () => void }) {
  const books = useMemo(() => { const m = new Map<string, string>(); packages.forEach(p => m.set(p.book_id, p.book)); return [...m].map(([id, name]) => ({ id, name })); }, [packages]);
  const [bookId, setBookId] = useState(initial?.bookId || ""); const [pkgId, setPkgId] = useState(initial?.pkgId || "");
  const [picks, setPicks] = useState<Record<string, string[]>>(initial?.picks || {});
  const [price, setPrice] = useState(initial?.price || ""); const [flat, setFlat] = useState(initial?.flat || ""); const [proteins, setProteins] = useState<Record<string, string>>(initial?.proteins || {});
  const [notes, setNotes] = useState<Record<string, string>>(initial?.notes || {});
  const [oneOffs, setOneOffs] = useState<Record<string, { name: string; diet: string }>>(initial?.oneOffs || {});
  const [otherCourse, setOtherCourse] = useState<string | null>(null);
  const [otherName, setOtherName] = useState(""); const [otherDiet, setOtherDiet] = useState("veg");
  const pkg = packages.find(p => p.id === pkgId);
  const editing = Boolean(initial);
  const reset = () => { setPkgId(""); setPicks({}); setPrice(""); setFlat(""); setProteins({}); setNotes({}); setOneOffs({}); setOtherCourse(null); setOtherName(""); };
  const dishFor = (course: any, id: string) => id.startsWith("other:") ? { id, ...oneOffs[id] } : course.dishes.find((d: any) => d.id === id);
  const addOther = (course: any) => {
    const name = otherName.trim(); if (!name) { toast.error("Enter a menu item name"); return; }
    if (name.length > 120) { toast.error("Menu item name must be 120 characters or less"); return; }
    const id = `other:${crypto.randomUUID()}`;
    setOneOffs(v => ({ ...v, [id]: { name, diet: otherDiet } }));
    setPicks(v => ({ ...v, [course.id]: [...(v[course.id] || []), id] }));
    setOtherCourse(null); setOtherName(""); setOtherDiet("veg");
  };

  const add = () => {
    if (!pkg) return;
    const over = pkg.courses.find((c: any) => c.picks && (picks[c.id]?.length || 0) > c.picks);
    if (over) return;
    const dietOver = pkg.courses.find((c: any) => {
       const chosen = (picks[c.id] || []).map(id => dishFor(c, id)).filter(Boolean);
      const separate = c.veg_picks != null || c.non_veg_picks != null;
      return separate && (chosen.filter((d: any) => d.diet === "veg").length > (c.veg_picks ?? 0)
        || chosen.filter((d: any) => d.diet !== "veg").length > (c.non_veg_picks ?? 0));
    });
    if (dietOver) { toast.error(`Too many vegetarian or non-vegetarian choices for ${dietOver.name}`); return; }
     const missing = pkg.courses.some((c: any) => (picks[c.id] || []).some(id => { const d = dishFor(c, id); return d?.protein_options?.length && !proteins[`${c.id}:${id}`]; }));
    if (missing) { toast.error("Choose a protein for each dish that needs one"); return; }
     const chosen = pkg.courses.flatMap((c: any) => (picks[c.id] || []).map(id => { const d = dishFor(c, id); return { course: c.name, courseId: c.id, dish: d, protein: proteins[`${c.id}:${id}`], notes: notes[`${c.id}:${id}`]?.trim(), oneOff: id.startsWith("other:") }; }).filter((x: Pick) => x.dish));
    onAdd(pkg, chosen, Number(price) || 0, Number(flat) || 0); if (!editing) reset();
  };

  return <div className="mt-2 space-y-3 rounded-md border border-border bg-muted/30 p-3">
    <div className="flex items-center justify-between gap-2"><p className="text-xs font-medium uppercase tracking-widest text-primary">{editing ? "Edit added package" : "From a menu book"}</p>{editing && <Button type="button" size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>}</div>
    <div className="grid gap-2 sm:grid-cols-2">
      <select className={sel} value={bookId} onChange={e => { setBookId(e.target.value); reset(); }}><option value="">Choose a menu book…</option>{books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select>
       <select className={sel} value={pkgId} disabled={!bookId} onChange={e => { setPkgId(e.target.value); setPicks({}); setOneOffs({}); setNotes({}); }}><option value="">Choose a package…</option>{packages.filter(p => p.book_id === bookId).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
    </div>
    {pkg && <div className="space-y-3">
      {pkg.description && <p className="text-xs text-muted-foreground">{pkg.description}</p>}
       {pkg.courses.map((c: any) => { const chosen = picks[c.id] || []; const chosenDishes = chosen.map(id => dishFor(c, id)).filter(Boolean); const vegCount = chosenDishes.filter((d: any) => d.diet === "veg").length; const nonVegCount = chosenDishes.length - vegCount; const full = Boolean(c.picks && chosen.length >= c.picks) || (c.veg_picks != null && c.non_veg_picks != null && vegCount >= c.veg_picks && nonVegCount >= c.non_veg_picks); return <div key={c.id} className="space-y-1.5">
        <div className="flex flex-wrap items-center justify-between gap-1 text-sm"><span className="font-medium">{c.name}</span><span className="text-xs text-muted-foreground">{c.veg_picks != null || c.non_veg_picks != null ? `Veg ${vegCount}/${c.veg_picks ?? "∞"} · Non-veg ${nonVegCount}/${c.non_veg_picks ?? "∞"}${c.picks ? ` · Total ${chosen.length}/${c.picks}` : ""}` : c.picks ? `Choose ${c.picks} · ${chosen.length} chosen` : `${chosen.length} chosen`}</span></div>
         <div className="flex flex-wrap gap-1.5">{chosen.map(id => { const d = dishFor(c, id); const noteKey = `${c.id}:${id}`; return <Badge key={id} variant="outline" className="group/dish max-w-full gap-1 py-1"><span className="text-primary">{d?.diet === "veg" ? "V" : d?.diet === "seafood" ? "SF" : "N"}</span><span className="max-w-[12rem] truncate" title={d?.name}>{d?.name}</span>{notes[noteKey]?.trim() && <span className="max-w-[12rem] truncate text-muted-foreground" title={notes[noteKey]}>— {notes[noteKey]}</span>}{Number(d?.extra_price_per_head) > 0 && <span className="text-primary">+${Number(d.extra_price_per_head).toFixed(2)}/person</span>}{d?.protein_options?.length > 0 && <select aria-label="Protein" className={`ml-1 h-6 rounded border bg-background px-1 text-xs ${proteins[noteKey] ? "border-input" : "border-destructive"}`} value={proteins[noteKey] || ""} onChange={e => setProteins(p => ({ ...p, [noteKey]: e.target.value }))}><option value="">Protein…</option>{d.protein_options.map((o: string) => <option key={o} value={o}>{o}</option>)}</select>}<Popover><PopoverTrigger asChild><Button type="button" size="icon" variant="ghost" title={`Customise ${d?.name}`} aria-label={`Customise ${d?.name}`} className={`h-6 w-6 ${notes[noteKey] ? "text-primary" : "opacity-60 sm:opacity-0 sm:group-hover/dish:opacity-100 sm:group-focus-within/dish:opacity-100"}`}><Pencil className="h-3 w-3" /></Button></PopoverTrigger><PopoverContent className="w-72 space-y-2"><label className="text-sm font-medium" htmlFor={`note-${id}`}>Customisations for {d?.name}</label><Input id={`note-${id}`} maxLength={500} placeholder="e.g. no onion, mild spice" value={notes[noteKey] || ""} onChange={e => setNotes(p => ({ ...p, [noteKey]: e.target.value }))} /></PopoverContent></Popover><Button type="button" size="icon" variant="ghost" title={`Remove ${d?.name}`} aria-label={`Remove ${d?.name}`} className="h-6 w-6" onClick={() => setPicks(p => ({ ...p, [c.id]: chosen.filter(x => x !== id) }))}><X className="h-3 w-3" /></Button></Badge>; })}</div>
         {!full && <DishSearchSelect course={c} chosen={chosen} vegCount={vegCount} nonVegCount={nonVegCount} onPick={id => { if (id === "__other__") { setOtherCourse(c.id); setOtherName(""); } else setPicks(p => ({ ...p, [c.id]: [...chosen, id] })); }} />}
         {otherCourse === c.id && <div className="flex flex-wrap items-center gap-2"><Input className="min-w-40 flex-1" autoFocus maxLength={120} aria-label={`Other ${c.name} item`} placeholder="One-off menu item" value={otherName} onChange={e => setOtherName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addOther(c); } }} /><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" aria-label="Diet" value={otherDiet} onChange={e => setOtherDiet(e.target.value)}><option value="veg">Vegetarian</option><option value="nonveg">Non-vegetarian</option><option value="seafood">Seafood</option></select><Button type="button" size="sm" onClick={() => addOther(c)}>Add</Button><Button type="button" size="icon" variant="ghost" aria-label="Cancel other item" onClick={() => setOtherCourse(null)}><X className="h-4 w-4" /></Button></div>}
      </div>; })}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">$</span><input type="number" min="0" step="0.01" value={price} onChange={e => setPrice(e.target.value)} placeholder="Price per guest" aria-label="Price per guest" className="h-9 w-32 rounded-md border border-input bg-background px-3 text-sm" /></div>
        <div className="flex items-center gap-1.5"><span className="text-xs text-muted-foreground">or flat $</span><input type="number" min="0" step="0.01" value={flat} onChange={e => setFlat(e.target.value)} placeholder="Flat rate" aria-label="Flat rate" className="h-9 w-28 rounded-md border border-input bg-background px-3 text-sm" /></div>
        <Button type="button" size="sm" onClick={add}><Plus className="mr-1 h-4 w-4" />{editing ? "Update package" : "Add package to menu"}</Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setPicks(Object.fromEntries(pkg.courses.map((c: any) => { const veg = c.dishes.filter((d: any) => d.diet === "veg").slice(0, c.veg_picks ?? c.dishes.length); const nonVeg = c.dishes.filter((d: any) => d.diet !== "veg").slice(0, c.non_veg_picks ?? c.dishes.length); return [c.id, [...veg, ...nonVeg].slice(0, c.picks || undefined).map((d: any) => d.id)]; })))}>Fill with defaults</Button>
      </div>
    </div>}
  </div>;
}
