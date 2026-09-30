import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Pencil, X } from "lucide-react";
import { toast } from "sonner";
import MenuBookPicker from "@/features/sales/MenuBookPicker";

export type CDish = { courseId?: string; course: string; name: string; dishId?: string; protein?: string; notes?: string; oneOff?: boolean; diet?: string; extra: number };
export type CPkg = { key: string; pkgId: string; bookId?: string; name: string; pricePerHead: number; flatPrice?: number; dishes: CDish[] };

/** Food packages shaped for MenuBookPicker (same as the event menu selection). */
export function useBookPackages(ev: any): any[] {
  return useMemo(() => ev.packages.filter((p: any) => p.active !== false && p.package_type !== "beverage" && ev.books.find((b: any) => b.id === p.book_id)?.menu_category === "catering").map((p: any) => ({ ...p, book: ev.books.find((b: any) => b.id === p.book_id)?.name || "Menu",
    courses: ev.courses.filter((c: any) => c.package_id === p.id).map((c: any) => ({ ...c, dishes: ev.courseItems.filter((ci: any) => ci.course_id === c.id && ci.dish_id).map((ci: any) => { const d = ev.dishes.find((x: any) => x.id === ci.dish_id); return d ? { ...d, protein_options: ci.protein_options || [], extra_price_per_head: Number(ci.extra_price_per_head || 0) } : null; }).filter(Boolean) })) })), [ev.packages, ev.books, ev.courses, ev.courseItems, ev.dishes]);
}

/** Menu total: each package's per-person price (plus dish surcharges) × guests, plus any flat rate. */
export function cateringMenuTotal(pkgs: CPkg[], guests: number) {
  return pkgs.reduce((sum, p) => sum + Number(p.flatPrice || 0) + (Number(p.pricePerHead || 0) + p.dishes.reduce((a, d) => a + Number(d.extra || 0), 0)) * guests, 0);
}
/** Same total from saved crm_menu_selection_items rows. */
export function cateringItemsTotal(items: any[], guests: number) {
  return items.filter(i => !["beverage", "live_stall", "manual", "kids_package"].includes(i.course)).reduce((sum, i) => sum + Number(i.flat_price || 0) + Number(i.price_per_head || 0) * guests, 0);
}

/** crm_menu_selection_items rows for the chosen packages (same format as event menus). */
export function cateringMenuRows(pkgs: CPkg[], bid: string, selectionId: string) {
  const rows: any[] = [];
  pkgs.forEach(cp => { rows.push({ business_id: bid, selection_id: selectionId, item_name: cp.name, course: "package", price_per_head: cp.pricePerHead || null, flat_price: cp.flatPrice || null, source_package_id: cp.pkgId || null, package_group_key: cp.key });
    cp.dishes.forEach(d => rows.push({ business_id: bid, selection_id: selectionId, item_name: d.protein ? `${d.name} (${d.protein})` : d.name, course: d.course, price_per_head: d.extra || null, source_package_id: cp.pkgId || null, source_course_id: d.courseId || null, source_dish_id: d.oneOff ? null : d.dishId || null, selected_protein: d.protein || null, package_group_key: cp.key, notes: d.notes?.trim() || null, one_off_diet: d.oneOff ? d.diet || "nonveg" : null })); });
  return rows;
}

export default function CateringMenuEditor({ pkgs, setPkgs, bookPackages }: { pkgs: CPkg[]; setPkgs: (fn: (p: CPkg[]) => CPkg[]) => void; bookPackages: any[] }) {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const initial = useMemo(() => {
    const p = pkgs.find(x => x.key === editingKey); if (!p?.pkgId || !p.bookId) return undefined;
    const ds = p.dishes.map((d, i) => ({ ...d, id: d.dishId || `other:${p.key}-${i}` })).filter(d => d.courseId);
    return { bookId: p.bookId, pkgId: p.pkgId, price: String(p.pricePerHead || ""), flat: String(p.flatPrice || ""),
      picks: ds.reduce<Record<string, string[]>>((a, d) => { a[d.courseId!] = [...(a[d.courseId!] || []), d.id]; return a; }, {}),
      proteins: Object.fromEntries(ds.filter(d => d.protein).map(d => [`${d.courseId}:${d.id}`, d.protein as string])),
      notes: Object.fromEntries(ds.filter(d => d.notes).map(d => [`${d.courseId}:${d.id}`, d.notes as string])),
      oneOffs: Object.fromEntries(ds.filter(d => d.oneOff).map(d => [d.id, { name: d.name, diet: d.diet || "nonveg" }])) };
  }, [editingKey, pkgs]);
  return <div className="space-y-4">
    {pkgs.map(p => <div key={p.key} className="space-y-2 rounded-lg border border-border p-3 text-sm">
      <div className="flex items-center gap-2"><span className="flex-1 font-semibold">{p.name}{p.pricePerHead ? <span className="ml-2 text-xs font-normal text-muted-foreground">${p.pricePerHead.toFixed(2)} per guest</span> : null}{p.flatPrice ? <span className="ml-2 text-xs font-normal text-muted-foreground">${p.flatPrice.toFixed(2)} flat</span> : null}</span>
        {p.pkgId && p.bookId && p.dishes.every(d => d.courseId) && <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Edit package" onClick={() => setEditingKey(p.key)}><Pencil className="h-3.5 w-3.5" /></Button>}
        <Button type="button" size="icon" variant="ghost" className="h-7 w-7" title="Remove package" onClick={() => { setPkgs(ps => ps.filter(x => x.key !== p.key)); if (editingKey === p.key) setEditingKey(null); }}><X className="h-3.5 w-3.5" /></Button></div>
      {Object.entries(p.dishes.reduce<Record<string, CDish[]>>((m, d) => { (m[d.course] ||= []).push(d); return m; }, {})).map(([course, ds]) => <div key={course}><p className="text-xs font-medium text-muted-foreground">{course}</p><p>{ds.map(d => `${d.name}${d.protein ? ` (${d.protein})` : ""}${d.notes ? ` — ${d.notes}` : ""}${d.oneOff ? " · one-off" : ""}`).join(" · ")}</p></div>)}
    </div>)}
    {!pkgs.length && <p className="text-sm text-muted-foreground">No packages selected — choose a menu book and package below.</p>}
    {bookPackages.length > 0 ? <MenuBookPicker key={editingKey || "add"} packages={bookPackages} initial={initial} onCancel={() => setEditingKey(null)} onAdd={(p: any, picked, price, flat) => {
      const key = editingKey || crypto.randomUUID();
      const item: CPkg = { key, pkgId: p.id, bookId: p.book_id, name: p.name, pricePerHead: Number(price || 0), flatPrice: Number(flat || 0), dishes: picked.map(x => ({ courseId: x.courseId, course: x.course.trim(), name: x.dish.name, dishId: x.oneOff ? undefined : x.dish.id, protein: x.protein, notes: x.notes, oneOff: x.oneOff, diet: x.oneOff ? x.dish.diet : undefined, extra: Number(x.dish.extra_price_per_head || 0) })) };
      setPkgs(ps => editingKey ? ps.map(x => x.key === key ? item : x) : [...ps, item]);
      toast.success(editingKey ? `${p.name} updated` : `${p.name} added`); setEditingKey(null);
    }} /> : <p className="text-sm text-muted-foreground">Create packages under Menu books first.</p>}
  </div>;
}
