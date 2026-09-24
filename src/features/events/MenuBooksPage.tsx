import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, ArchiveRestore, Loader2, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEventsData, type Row } from "./useEventsData";

type CourseDraft = { key: string; name: string; picks: string; items: string[] };
const COURSE_PRESETS = ["Starters", "Entrées", "Mains", "Sides", "Desserts"];

export default function MenuBooksPage() {
  const d = useEventsData(); const [status, setStatus] = useState("active");
  const [bookOpen, setBookOpen] = useState<Row | null | "new">(null);
  const [pkg, setPkg] = useState<Row | null>(null); const [pkgOpen, setPkgOpen] = useState(false);
  if (!d.business) return null;
  const bid = d.business.id;
  const books = d.books.filter(b => status === "all" || (status === "active" ? b.active : !b.active));
  const coursesOf = (p: Row) => d.courses.filter(c => c.package_id === p.id);
  const dishCount = (p: Row) => d.courseItems.filter(ci => coursesOf(p).some(c => c.id === ci.course_id)).length;
  const toggle = async (table: string, r: Row) => { await (supabase.from(table as any) as any).update({ active: !r.active }).eq("id", r.id); d.refresh(); };
  const saveBook = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const v = { name: String(f.get("name")), description: String(f.get("description") || "") || null };
    const t = supabase.from("crm_menu_books" as any) as any;
    const r = bookOpen && bookOpen !== "new" ? await t.update(v).eq("id", bookOpen.id) : await t.insert({ ...v, business_id: bid, sort_order: d.books.length });
    if (r.error) toast.error(r.error.message); else { setBookOpen(null); d.refresh(); }
  };

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><p className="text-xs font-medium uppercase tracking-widest text-primary">Catering</p><h1 className="font-serif text-3xl font-semibold">Menu books</h1><p className="text-sm text-muted-foreground">{d.packages.length} packages across {d.books.length} menu books.</p></div>
      <div className="flex gap-2"><Button variant="outline" onClick={() => setBookOpen("new")}><Plus className="mr-2 h-4 w-4" />Menu book</Button><Button onClick={() => { setPkg(null); setPkgOpen(true); }} disabled={!d.books.length}><Plus className="mr-2 h-4 w-4" />Add new menu</Button></div>
    </div>
    <div className="flex gap-2">{["active", "archived", "all"].map(s => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="capitalize" onClick={() => setStatus(s)}>{s} ({d.books.filter(b => s === "all" || (s === "active" ? b.active : !b.active)).length})</Button>)}</div>
    {!d.books.length && <p className="text-sm text-muted-foreground">Create a menu book first (for example "Nepali Express" or "Indian Catering Packages").</p>}
    <div className="grid gap-5 lg:grid-cols-2">{books.map(b => { const pk = d.packages.filter(p => p.book_id === b.id); return <Card key={b.id}>
      <CardHeader className="flex-row items-start justify-between space-y-0"><div><CardTitle className="font-serif text-2xl">{b.name}</CardTitle><p className="text-sm text-muted-foreground">{pk.length} packages{b.description ? ` · ${b.description}` : ""}</p></div>
        <div className="flex">{!b.active && <Badge variant="outline">Archived</Badge>}<Button size="icon" variant="ghost" title="Edit book" onClick={() => setBookOpen(b)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title={b.active ? "Archive" : "Restore"} onClick={() => toggle("crm_menu_books", b)}>{b.active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}</Button></div></CardHeader>
      <CardContent className="space-y-2">{pk.map(p => <div key={p.id} className="flex items-center justify-between gap-2 rounded-md border p-3">
        <button className="text-left" onClick={() => { setPkg(p); setPkgOpen(true); }}><p className="font-medium">{p.name} {!p.active && <Badge variant="outline" className="ml-1 text-[10px]">Archived</Badge>}</p><p className="text-xs text-muted-foreground">{p.package_type === "beverage" ? "Beverage" : "Food"} · {coursesOf(p).length} courses · {dishCount(p)} items</p></button>
        <Button size="icon" variant="ghost" title={p.active ? "Archive" : "Restore"} onClick={() => toggle("crm_packages", p)}>{p.active ? <Archive className="h-4 w-4" /> : <ArchiveRestore className="h-4 w-4" />}</Button>
      </div>)}{!pk.length && <p className="text-sm text-muted-foreground">No packages yet.</p>}</CardContent></Card>; })}</div>

    <Dialog open={!!bookOpen} onOpenChange={o => !o && setBookOpen(null)}><DialogContent><DialogHeader><DialogTitle>{bookOpen === "new" ? "New menu book" : "Edit menu book"}</DialogTitle></DialogHeader>
      <form key={bookOpen === "new" ? "n" : (bookOpen as Row)?.id} onSubmit={saveBook} className="space-y-3"><div className="space-y-1.5"><Label>Name *</Label><Input name="name" required defaultValue={bookOpen && bookOpen !== "new" ? bookOpen.name : ""} /></div><div className="space-y-1.5"><Label>Description</Label><Input name="description" defaultValue={bookOpen && bookOpen !== "new" ? bookOpen.description || "" : ""} /></div><DialogFooter><Button>Save</Button></DialogFooter></form></DialogContent></Dialog>
    {pkgOpen && <PackageEditor open={pkgOpen} onClose={() => setPkgOpen(false)} pkg={pkg} data={d} />}
  </div>;
}

function PackageEditor({ open, onClose, pkg, data: d }: { open: boolean; onClose: () => void; pkg: Row | null; data: ReturnType<typeof useEventsData> }) {
  const initialCourses: CourseDraft[] = pkg ? d.courses.filter(c => c.package_id === pkg.id).map(c => ({ key: c.id, name: c.name, picks: c.picks ? String(c.picks) : "", items: d.courseItems.filter(ci => ci.course_id === c.id).map(ci => ci.dish_id || `drink:${ci.drink_id}`) })) : [{ key: crypto.randomUUID(), name: "Starters", picks: "", items: [] }];
  const [f, setF] = useState({ book_id: pkg?.book_id || d.books.find(b => b.active)?.id || "", name: pkg?.name || "", package_type: pkg?.package_type || "food", description: pkg?.description || "" });
  const [courses, setCourses] = useState<CourseDraft[]>(initialCourses); const [saving, setSaving] = useState(false); const [newDish, setNewDish] = useState<Record<string, { name: string; diet: string }>>({});
  const bev = f.package_type === "beverage";
  const pool = bev ? d.drinks.filter(x => x.active).map(x => ({ id: `drink:${x.id}`, name: x.name, tag: x.kind === "soft" ? "Soft" : "Hard" })) : d.dishes.filter(x => x.active).map(x => ({ id: x.id, name: x.name, tag: x.diet === "veg" ? "V" : "N" }));
  const upd = (key: string, patch: Partial<CourseDraft>) => setCourses(cs => cs.map(c => c.key === key ? { ...c, ...patch } : c));
  const checks = [["Menu book selected", !!f.book_id], ["Package named", !!f.name], ["At least one item", courses.some(c => c.items.length)]] as const;

  const addDish = async (course: CourseDraft) => {
    const nd = newDish[course.key]; if (!nd?.name) return;
    const table = bev ? "crm_drinks" : "crm_dishes";
    const { data, error } = await (supabase.from(table as any) as any).insert({ business_id: d.business!.id, name: nd.name, ...(bev ? { kind: nd.diet === "nonveg" ? "hard" : "soft" } : { diet: nd.diet || "veg" }) }).select().single();
    if (error) return toast.error(error.message);
    upd(course.key, { items: [...course.items, bev ? `drink:${data.id}` : data.id] }); setNewDish(p => ({ ...p, [course.key]: { name: "", diet: nd.diet } })); d.refresh();
  };
  const save = async () => {
    setSaving(true);
    try {
      const bid = d.business!.id; const values = { book_id: f.book_id, name: f.name, package_type: f.package_type, description: f.description || null, price_per_head: 0, min_guests: 1 };
      const t = supabase.from("crm_packages" as any) as any;
      let pid = pkg?.id;
      if (pid) { const r = await t.update(values).eq("id", pid); if (r.error) throw r.error; await (supabase.from("crm_package_courses" as any) as any).delete().eq("package_id", pid); }
      else { const r = await t.insert({ ...values, business_id: bid }).select().single(); if (r.error) throw r.error; pid = r.data.id; }
      for (const [i, c] of courses.entries()) {
        if (!c.name) continue;
        const r = await (supabase.from("crm_package_courses" as any) as any).insert({ business_id: bid, package_id: pid, name: c.name, picks: c.picks ? Number(c.picks) : null, sort_order: i }).select().single(); if (r.error) throw r.error;
        if (c.items.length) { const ri = await (supabase.from("crm_package_course_items" as any) as any).insert(c.items.map(it => it.startsWith("drink:") ? { business_id: bid, course_id: r.data.id, drink_id: it.slice(6) } : { business_id: bid, course_id: r.data.id, dish_id: it })); if (ri.error) throw ri.error; }
      }
      toast.success("Package saved"); d.refresh(); onClose();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };
  const remove = async () => { if (!pkg || !confirm("Delete this package?")) return; await (supabase.from("crm_packages" as any) as any).delete().eq("id", pkg.id); d.refresh(); onClose(); };

  return <Dialog open={open} onOpenChange={o => !o && onClose()}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-5xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{pkg ? "Edit package" : "Add new menu"}</DialogTitle></DialogHeader>
    <div className="grid gap-6 lg:grid-cols-[1fr_260px]">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>Menu book *</Label><select value={f.book_id} onChange={e => setF({ ...f, book_id: e.target.value })} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{d.books.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="space-y-1.5"><Label>Package name *</Label><Input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} /></div>
          <div className="space-y-1.5"><Label>Type</Label><div className="flex gap-2">{["food", "beverage"].map(t => <Button key={t} type="button" size="sm" variant={f.package_type === t ? "default" : "outline"} className="capitalize" onClick={() => setF({ ...f, package_type: t })}>{t}</Button>)}</div></div>
          <div className="space-y-1.5 sm:col-span-2"><Label>Description</Label><Textarea maxLength={600} value={f.description} onChange={e => setF({ ...f, description: e.target.value })} /></div>
        </div>
        {courses.map((c, i) => <div key={c.key} className="space-y-3 rounded-md border p-4">
          <div className="flex items-end gap-2"><div className="flex-1 space-y-1.5"><Label>Course {i + 1} name *</Label><Input value={c.name} onChange={e => upd(c.key, { name: e.target.value })} /></div><div className="w-28 space-y-1.5"><Label>Guest picks</Label><Input type="number" min="1" placeholder="All" value={c.picks} onChange={e => upd(c.key, { picks: e.target.value })} /></div><Button size="icon" variant="ghost" onClick={() => setCourses(cs => cs.filter(x => x.key !== c.key))}><Trash2 className="h-4 w-4" /></Button></div>
          <div className="flex flex-wrap gap-1.5">{c.items.map(it => { const p = pool.find(x => x.id === it); return <Badge key={it} variant="outline" className="gap-1">{p?.tag && <span className="text-primary">{p.tag}</span>}{p?.name || "Archived item"}<button onClick={() => upd(c.key, { items: c.items.filter(x => x !== it) })}><X className="h-3 w-3" /></button></Badge>; })}</div>
          <select value="" onChange={e => e.target.value && upd(c.key, { items: [...c.items, e.target.value] })} className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Add from the shared {bev ? "drinks" : "dish"} list…</option>{pool.filter(p => !c.items.includes(p.id)).map(p => <option key={p.id} value={p.id}>{p.name} ({p.tag})</option>)}</select>
          <div className="flex gap-2"><Input className="h-9" placeholder={`New ${bev ? "drink" : "dish"} name`} value={newDish[c.key]?.name || ""} onChange={e => setNewDish(p => ({ ...p, [c.key]: { diet: p[c.key]?.diet || "veg", name: e.target.value } }))} /><select className="h-9 rounded-md border border-input bg-background px-2 text-sm" value={newDish[c.key]?.diet || "veg"} onChange={e => setNewDish(p => ({ ...p, [c.key]: { name: p[c.key]?.name || "", diet: e.target.value } }))}><option value="veg">{bev ? "Soft" : "Veg"}</option><option value="nonveg">{bev ? "Hard" : "Non-veg"}</option></select><Button type="button" size="sm" variant="outline" onClick={() => addDish(c)}>Add</Button></div>
        </div>)}
        <div className="flex flex-wrap items-center gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setCourses(cs => [...cs, { key: crypto.randomUUID(), name: "", picks: "", items: [] }])}><Plus className="mr-1 h-4 w-4" />Add course</Button><span className="text-xs text-muted-foreground">or start from</span>{COURSE_PRESETS.map(p => <Button key={p} type="button" size="sm" variant="ghost" onClick={() => setCourses(cs => [...cs, { key: crypto.randomUUID(), name: p, picks: "", items: [] }])}>{p}</Button>)}</div>
      </div>
      <aside className="space-y-4 lg:sticky lg:top-0 lg:self-start"><Card><CardContent className="space-y-3 p-4"><p className="text-xs uppercase tracking-widest text-muted-foreground">Package preview</p><p className="font-serif text-xl">{f.name || "Untitled package"}</p><p className="text-xs text-muted-foreground">{d.books.find(b => b.id === f.book_id)?.name || "No menu book"} · {bev ? "Beverage" : "Food"}</p>
        <div className="grid grid-cols-2 gap-2 text-sm"><div><p className="text-xs text-muted-foreground">Courses</p>{courses.length}</div><div><p className="text-xs text-muted-foreground">Items</p>{courses.reduce((s, c) => s + c.items.length, 0)}</div></div>
        <p className="text-xs text-muted-foreground">Price per guest is set per event on the lead's menu page.</p>
        <div className="space-y-1 border-t pt-3">{checks.map(([l, ok]) => <p key={l} className="flex justify-between text-xs"><span>{l}</span><span className={ok ? "text-primary" : "text-muted-foreground"}>{ok ? "done" : "not yet"}</span></p>)}</div></CardContent></Card></aside>
    </div>
    <DialogFooter className="gap-2">{pkg && <Button variant="ghost" className="mr-auto text-destructive" onClick={remove}>Delete</Button>}<Button variant="outline" onClick={onClose}>Cancel</Button><Button disabled={saving || !checks.every(c => c[1])} onClick={save}>{saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save package</Button></DialogFooter>
  </DialogContent></Dialog>;
}
