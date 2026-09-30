import { useRef, useState } from "react";
import * as XLSX from "xlsx";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Download, Loader2, Upload } from "lucide-react";
import type { Row } from "./useEventsData";

// Simple two-sheet template: "1. Packages" (one row per package) + "2. Dishes" (one row per dish/drink).
const PKG_HEADERS = ["Menu book", "Menu group", "Package", "Food or drinks", "Price per person", "Min guests", "Menu title (optional)", "Subtitle (optional)", "Description (optional)"];
const PKG_SAMPLE = [
  ["Western Menu", "Event", "Tier 1", "Food", 75, 30, "Western Menu", "Tier 1 Buffet Selection", ""],
  ["Catering Menu", "Catering", "Party Pack", "Food", 35, 20, "", "", "Drop-off catering"],
  ["Beverages", "Event", "Drinks Package", "Drinks", 35, "", "", "", "4 hour package"],
];
const DISH_HEADERS = ["Menu book", "Package", "Course", "Guests pick (how many)", "Dish or drink", "Diet / kind", "Protein choices (optional, comma separated)", "Extra $ per person (optional)"];
const DISH_SAMPLE = [
  ["Western Menu", "Tier 1", "Entrée", 2, "Mushroom arancini, truffle mayo", "Veg", "", ""],
  ["Western Menu", "Tier 1", "Entrée", "", "Chicken satay, peanut sauce", "Non-veg", "", ""],
  ["Western Menu", "Tier 1", "Mains", 2, "Curry of the day", "Non-veg", "Chicken, Lamb, Goat", ""],
  ["Western Menu", "Tier 1", "Mains", "", "Grilled barramundi, lemon butter", "Seafood", "", 5],
  ["Catering Menu", "Party Pack", "Sides", 3, "Vegetable samosa", "Veg", "", ""],
  ["Beverages", "Drinks Package", "Drinks", "", "Coke", "Soft", "", ""],
];
const MENU_NOTES = [
  "HOW TO FILL — 2 simple steps",
  "",
  "Step 1 — sheet '1. Packages': one row per package.",
  "  • Menu book: the book the package belongs to (created if new).",
  "  • Menu group: event or catering.",
  "  • Food or drinks: food or drinks.",
  "  • Price per person: a number, e.g. 75.",
  "",
  "Step 2 — sheet '2. Dishes': one row per dish or drink.",
  "  • Menu book and Package: pick from the dropdowns (they list what you typed on sheet 1).",
  "  • Course and Diet / kind: pick from the dropdowns (you can also type your own course name).",
  "  • Course: e.g. Entrée, Mains, Dessert. Same course name = same course.",
  "  • Guests pick: how many dishes guests choose in that course — fill on the first row of the course only.",
  "  • Veg / Non-veg / Seafood: veg, nonveg or seafood (soft or hard for drinks).",
  "",
  "Delete the example rows, keep the header rows, then upload.",
];
const DRINK_HEADERS = ["Drink name", "Kind", "Price"];
const DRINK_SAMPLE = [["Coke", "Soft drink", 4.5], ["House Red Wine (glass)", "Wine", 12]];

const norm = (s: unknown) => String(s ?? "").trim();
const key = (s: unknown) => norm(s).toLowerCase();
const num = (v: unknown) => { const s = norm(v).replace(/[$,]/g, ""); return s === "" || isNaN(Number(s)) ? null : Number(s); };

function downloadTemplate(name: string, headers: string[], sample: unknown[][], notes: string[]) {
  const wb = XLSX.utils.book_new();
  const ws = XLSX.utils.aoa_to_sheet([headers, ...sample]);
  ws["!cols"] = headers.map(h => ({ wch: Math.max(14, h.length + 2) }));
  XLSX.utils.book_append_sheet(wb, ws, "Template");
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet(notes.map(n => [n])), "How to fill");
  XLSX.writeFile(wb, name);
}

async function readRows(file: File): Promise<Record<string, unknown>[]> {
  const wb = XLSX.read(await file.arrayBuffer());
  const ws = wb.Sheets[wb.SheetNames.find(n => n !== "How to fill") || wb.SheetNames[0]];
  return XLSX.utils.sheet_to_json(ws, { defval: "" });
}
const col = (r: Record<string, unknown>, starts: string) => { const k = Object.keys(r).find(k => k.trim().toLowerCase().replace(/\s+/g, " ").startsWith(starts)); return k ? r[k] : ""; };
const drinkKind = (r: Record<string, unknown>) => { const k = Object.keys(r).find(k => /\b(kind|category|type)\b/i.test(k.trim())); return k ? norm(r[k]) : ""; };

async function downloadMenuTemplate() {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const head = (ws: any) => { const r = ws.getRow(1); r.font = { bold: true, color: { argb: "FFFFFFFF" } }; r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF7A1F2B" } }; r.height = 22; ws.views = [{ state: "frozen", ySplit: 1 }]; };
  const notes = wb.addWorksheet("How to fill"); notes.getColumn(1).width = 100; MENU_NOTES.forEach(n => notes.addRow([n])); notes.getRow(1).font = { bold: true, size: 14 };
  const lists = wb.addWorksheet("Lists", { state: "veryHidden" });
  const L = { groups: ["Event", "Catering"], types: ["Food", "Drinks"], courses: ["Entrée", "Mains", "Sides", "Desserts", "Canapés", "Salads", "Breads", "Drinks"], diets: ["Veg", "Non-veg", "Seafood", "Soft", "Hard"] };
  Object.values(L).forEach((arr, c) => arr.forEach((v, r) => { lists.getCell(r + 1, c + 1).value = v; }));
  const ref = (c: string, n: number) => `Lists!$${c}$1:$${c}$${n}`;
  const N = 300;
  const pk = wb.addWorksheet("1. Packages"); pk.addRow(PKG_HEADERS); PKG_SAMPLE.forEach(r => pk.addRow(r)); head(pk);
  pk.columns.forEach((c, i) => { c.width = i === 8 ? 32 : 20; });
  const ds = wb.addWorksheet("2. Dishes"); ds.addRow(DISH_HEADERS); DISH_SAMPLE.forEach(r => ds.addRow(r)); head(ds);
  ds.columns.forEach((c, i) => { c.width = i === 4 ? 40 : i === 6 ? 30 : 18; });
  const dv = (ws: any, col: string, formula: string, strict = true) => { for (let r = 2; r <= N; r++) ws.getCell(`${col}${r}`).dataValidation = { type: "list", allowBlank: true, formulae: [formula], showErrorMessage: strict, errorStyle: strict ? "stop" : "warning", error: "Pick from the list" }; };
  dv(pk, "B", ref("A", L.groups.length)); dv(pk, "D", ref("B", L.types.length));
  dv(ds, "A", `'1. Packages'!$A$2:$A$${N}`); dv(ds, "B", `'1. Packages'!$C$2:$C$${N}`);
  dv(ds, "C", ref("C", L.courses.length), false); dv(ds, "F", ref("D", L.diets.length));
  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  const a = document.createElement("a"); a.href = url; a.download = "menu-books-template.xlsx"; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
}

type MenuRow = { book: string; group: "event" | "catering"; pkg: string; type: "food" | "beverage"; desc: string; course: string; picks: number | null; veg: number | null; nonveg: number | null; seafood: number | null; cnote: string; item: string; diet: string; dietRaw: string; proteins: string; extra: number; menuTitle: string; style: string; subtitle: string; price: number | null; priceLabel: string; minGuests: number | null };
const groupOf = (v: unknown): "event" | "catering" => key(v).startsWith("cat") ? "catering" : "event";
const typeOf = (v: unknown): "food" | "beverage" => /^(bev|drink)/.test(key(v)) ? "beverage" : "food";

async function readMenuRows(file: File): Promise<MenuRow[]> {
  const wb = XLSX.read(await file.arrayBuffer());
  const find = (re: RegExp) => wb.SheetNames.find(n => re.test(n.toLowerCase()));
  const pkgName = find(/packages?$/), dishName = find(/dish/);
  if (pkgName && dishName) {
    const pkgs = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[pkgName], { defval: "" });
    const byName = new Map<string, Record<string, unknown>>();
    pkgs.forEach(p => { const n = key(col(p, "package")), b = key(col(p, "menu book")); if (!n) return; if (!byName.has(`${b}||${n}`)) byName.set(`${b}||${n}`, p); if (!byName.has(n)) byName.set(n, p); });
    const out: MenuRow[] = [];
    for (const r of XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[dishName], { defval: "" })) {
      const item = norm(col(r, "dish")), pn = norm(col(r, "package"));
      if (!item || !pn) continue;
      const bn = key(col(r, "menu book")); const p = (bn && byName.get(`${bn}||${key(pn)}`)) || byName.get(key(pn));
      if (!p) throw new Error(`Dish "${item}" uses package "${pn}", which is not on the Packages sheet.`);
      const dietRaw = norm(col(r, "diet")) || norm(col(r, "veg")); const diet = key(dietRaw).replace(/[\s-]/g, "");
      out.push({ book: norm(col(p, "menu book")) || "Menu", group: groupOf(col(p, "menu group")), pkg: norm(col(p, "package")), type: typeOf(col(p, "food or")), desc: norm(col(p, "description")), course: norm(col(r, "course")) || "Menu", picks: num(col(r, "guests pick")), veg: null, nonveg: null, seafood: null, cnote: "", item, diet, dietRaw, proteins: norm(col(r, "protein")), extra: num(col(r, "extra")) ?? 0, menuTitle: norm(col(p, "menu title")), style: "", subtitle: norm(col(p, "subtitle")), price: num(col(p, "price per")), priceLabel: "", minGuests: num(col(p, "min guest")) });
    }
    return out;
  }
  // Older single-sheet template stays supported.
  return (await readRows(file)).map(r => ({ book: norm(col(r, "menu book")), group: groupOf(col(r, "menu group")), pkg: norm(r[Object.keys(r).find(k => key(k) === "package") || "Package"]), type: typeOf(col(r, "type")), desc: norm(col(r, "package description")), course: norm(col(r, "course")) || "Menu", picks: num(col(r, "course total")) ?? num(col(r, "course picks")), veg: num(col(r, "veg picks")), nonveg: num(col(r, "non-veg picks")), item: norm(col(r, "item")), diet: key(col(r, "diet")), dietRaw: norm(col(r, "diet")), proteins: norm(col(r, "protein")), extra: num(col(r, "extra")) ?? 0, menuTitle: norm(col(r, "menu title")), style: norm(col(r, "style")), subtitle: norm(col(r, "subtitle")), price: num(col(r, "price per")), priceLabel: norm(col(r, "price shown")), minGuests: num(col(r, "min guest")), seafood: num(col(r, "seafood")), cnote: norm(col(r, "course breakdown")) })).filter(r => r.book && r.pkg && r.item);
}

type Data = { business: { id: string } | null; books: Row[]; packages: Row[]; dishes: Row[]; drinks: Row[]; refresh: () => void };

function ImportShell({ title, desc, onTemplate, onFile, busy, result }: { title: string; desc: string; onTemplate: () => void; onFile: (f: File) => void; busy: boolean; result: string[] }) {
  const ref = useRef<HTMLInputElement>(null);
  return <DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>{title}</DialogTitle><DialogDescription>{desc}</DialogDescription></DialogHeader>
    <ol className="list-decimal space-y-1 pl-5 text-sm text-muted-foreground"><li>Download the template.</li><li>Fill one row per item (keep the header row).</li><li>Upload the filled file (Excel or CSV).</li></ol>
    <input ref={ref} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onFile(f); e.target.value = ""; }} />
    {result.length > 0 && <div className="max-h-48 overflow-y-auto rounded-md border bg-muted/40 p-3 text-xs">{result.map((l, i) => <p key={i}>{l}</p>)}</div>}
    <DialogFooter className="gap-2"><Button variant="outline" onClick={onTemplate}><Download className="mr-2 h-4 w-4" />Download template</Button><Button disabled={busy} onClick={() => ref.current?.click()}>{busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}Upload file</Button></DialogFooter>
  </DialogContent>;
}

export function MenuImportButton({ data: d }: { data: Data }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [result, setResult] = useState<string[]>([]);
  const run = async (file: File) => {
    if (!d.business) return; const bid = d.business.id; setBusy(true); const log: string[] = [];
    try {
      const rows = await readMenuRows(file);
      if (!rows.length) throw new Error("No rows found. Fill the Packages sheet and the Dishes sheet (Package, Course, Dish).");
      const books = new Map(d.books.map(b => [key(b.name), b.id as string]));
      const dishes = new Map(d.dishes.map(x => [key(x.name), x.id as string]));
      const drinks = new Map(d.drinks.map(x => [key(x.name), x.id as string]));
      const groups = new Map<string, typeof rows>();
      rows.forEach(r => { const k = `${key(r.book)}||${key(r.pkg)}`; groups.set(k, [...(groups.get(k) || []), r]); });
      let made = 0;
      for (const g of groups.values()) {
        const first = g[0];
        let bookId = books.get(key(first.book));
        if (!bookId) { const r = await (supabase.from("crm_menu_books" as any) as any).insert({ business_id: bid, name: first.book, sort_order: books.size, menu_category: first.group }).select().single(); if (r.error) throw r.error; bookId = r.data.id as string; books.set(key(first.book), bookId); log.push(`Created menu book "${first.book}"`); }
        if (d.packages.some(p => p.book_id === bookId && key(p.name) === key(first.pkg))) { log.push(`Skipped "${first.pkg}" — already exists in ${first.book}`); continue; }
        const bev = first.type === "beverage";
        const pr = await (supabase.from("crm_packages" as any) as any).insert({ business_id: bid, book_id: bookId, name: first.pkg, package_type: first.type, description: g.find(r => r.desc)?.desc || null, menu_title: g.find(r => r.menuTitle)?.menuTitle || null, style_label: g.find(r => r.style)?.style || null, subtitle: g.find(r => r.subtitle)?.subtitle || null, price_label: g.find(r => r.priceLabel)?.priceLabel || null, price_per_head: g.find(r => r.price != null)?.price ?? 0, min_guests: g.find(r => r.minGuests != null)?.minGuests ?? 1 }).select().single(); if (pr.error) throw pr.error;
        const courseOrder: string[] = []; g.forEach(r => { if (!courseOrder.includes(key(r.course))) courseOrder.push(key(r.course)); });
        for (const [i, ck] of courseOrder.entries()) {
          const items = g.filter(r => key(r.course) === ck); const c0 = items[0];
          const cr = await (supabase.from("crm_package_courses" as any) as any).insert({ business_id: bid, package_id: pr.data.id, name: c0.course, picks: items.find(r => r.picks != null)?.picks ?? null, veg_picks: bev ? null : items.find(r => r.veg != null)?.veg ?? null, non_veg_picks: bev ? null : items.find(r => r.nonveg != null)?.nonveg ?? null, seafood_picks: bev ? null : items.find(r => r.seafood != null)?.seafood ?? null, notes: items.find(r => r.cnote)?.cnote || null, sort_order: i }).select().single(); if (cr.error) throw cr.error;
          const inserts = [];
          for (const it of items) {
            const map = bev ? drinks : dishes; let id = map.get(key(it.item));
            if (!id) {
              const r = await (supabase.from((bev ? "crm_drinks" : "crm_dishes") as any) as any).insert({ business_id: bid, name: it.item, ...(bev ? { kind: it.dietRaw || "soft" } : { diet: it.diet.startsWith("sea") ? "seafood" : it.diet.startsWith("non") || it.diet === "meat" ? "nonveg" : "veg" }) }).select().single(); if (r.error) throw r.error;
              id = r.data.id as string; map.set(key(it.item), id);
            }
            inserts.push(bev ? { business_id: bid, course_id: cr.data.id, drink_id: id, extra_price_per_head: it.extra } : { business_id: bid, course_id: cr.data.id, dish_id: id, protein_options: it.proteins.split(",").map(s => s.trim()).filter(Boolean), extra_price_per_head: it.extra });
          }
          const ri = await (supabase.from("crm_package_course_items" as any) as any).insert(inserts); if (ri.error) throw ri.error;
        }
        made++; log.push(`Created package "${first.pkg}" (${courseOrder.length} courses, ${g.length} items)`);
      }
      log.unshift(`Done: ${made} package(s) created.`); toast.success(`${made} package(s) imported`); d.refresh();
    } catch (e: any) { log.push(`Error: ${e.message}`); toast.error(e.message); } finally { setResult(log); setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setResult([]); }}>
    <Button variant="outline" onClick={() => setOpen(true)}><Upload className="mr-2 h-4 w-4" />Import</Button>
    <ImportShell title="Import menu books & packages" desc="Sheet 1: one row per package. Sheet 2: one row per dish. New menu books, dishes and drinks are created automatically. Packages that already exist in the same menu book are skipped." busy={busy} result={result} onFile={run}
      onTemplate={downloadMenuTemplate} />
  </Dialog>;
}

export function DrinksImportButton({ data: d }: { data: Data }) {
  const [open, setOpen] = useState(false); const [busy, setBusy] = useState(false); const [result, setResult] = useState<string[]>([]);
  const run = async (file: File) => {
    if (!d.business) return; setBusy(true); const log: string[] = [];
    try {
      const rows = (await readRows(file)).map(r => ({ name: norm(col(r, "drink")) || norm(col(r, "name")), kind: drinkKind(r) || "soft", price: num(col(r, "price")) })).filter(r => r.name);
      if (!rows.length) throw new Error("No drinks found. Fill the Drink name column.");
      const existing = new Map(d.drinks.map(x => [key(x.name), x.id as string]));
      let added = 0, updated = 0;
      const fresh = rows.filter(r => !existing.has(key(r.name)));
      if (fresh.length) { const r = await (supabase.from("crm_drinks" as any) as any).insert(fresh.map(x => ({ business_id: d.business!.id, name: x.name, kind: x.kind, price: x.price }))); if (r.error) throw r.error; added = fresh.length; }
      for (const x of rows.filter(r => existing.has(key(r.name)))) { const r = await (supabase.from("crm_drinks" as any) as any).update({ kind: x.kind, price: x.price, updated_at: new Date().toISOString() }).eq("id", existing.get(key(x.name))); if (r.error) throw r.error; updated++; }
      log.push(`Done: ${added} drink(s) added, ${updated} updated.`); toast.success(`${added} added, ${updated} updated`); d.refresh();
    } catch (e: any) { log.push(`Error: ${e.message}`); toast.error(e.message); } finally { setResult(log); setBusy(false); }
  };
  return <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) setResult([]); }}>
    <Button variant="outline" onClick={() => setOpen(true)}><Upload className="mr-2 h-4 w-4" />Import</Button>
    <ImportShell title="Import drinks list" desc="Drinks with a name that already exists get their kind and price updated; new names are added." busy={busy} result={result} onFile={run}
      onTemplate={() => downloadTemplate("drinks-template.xlsx", DRINK_HEADERS, DRINK_SAMPLE, ["One row per drink.", "Kind: whatever category you want (e.g. Soft drink, Wine, Beer, Spirits) — it is saved exactly as typed.", "Price in dollars, e.g. 4.50 (optional).", "Delete the example rows before uploading."])} />
  </Dialog>;
}
