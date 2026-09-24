import { FormEvent, ReactNode, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, ArchiveRestore, Pencil, Plus, Search, Trash2 } from "lucide-react";
import type { Row } from "./useEventsData";

export type Field = { key: string; label: string; type?: "text" | "number" | "select" | "email" | "tags"; options?: { value: string; label: string }[]; required?: boolean; placeholder?: string };

export default function SimpleList({ title, subtitle, table, businessId, rows, fields, columns, refresh, archivable, filterKey, filterOptions, groupAZ, extra, nameKey = "name", onOpen, defaults }: {
  title: string; subtitle: string; table: string; businessId: string; rows: Row[]; fields: Field[];
  columns: { label: string; render: (r: Row) => ReactNode }[]; refresh: () => void; archivable?: boolean;
  filterKey?: string; filterOptions?: { value: string; label: string }[]; groupAZ?: boolean; extra?: ReactNode; nameKey?: string; onOpen?: (r: Row) => void; defaults?: Row;
}) {
  const [search, setSearch] = useState(""); const [status, setStatus] = useState("active"); const [filter, setFilter] = useState("all");
  const [editing, setEditing] = useState<Row | null>(null); const [open, setOpen] = useState(false);
  const shown = useMemo(() => rows.filter(r => (!archivable || status === "all" || (status === "active" ? r.active !== false : r.active === false))
    && (!filterKey || filter === "all" || r[filterKey] === filter)
    && JSON.stringify(r).toLowerCase().includes(search.toLowerCase())), [rows, search, status, filter, archivable, filterKey]);
  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget); const values: Row = {};
    fields.forEach(fd => { const v = f.get(fd.key); values[fd.key] = fd.type === "number" ? (v ? Number(v) : null) : fd.type === "tags" ? String(v || "").split(",").map(s => s.trim()).filter(Boolean) : (v ? String(v) : null); });
    const t = supabase.from(table as any) as any;
    const res = editing ? await t.update({ ...values, updated_at: new Date().toISOString() }).eq("id", editing.id) : await t.insert({ ...(defaults || {}), ...values, business_id: businessId });
    if (res.error) toast.error(res.error.message); else { toast.success("Saved"); setOpen(false); refresh(); }
  };
  const setActive = async (r: Row, active: boolean) => { const { error } = await (supabase.from(table as any) as any).update({ active }).eq("id", r.id); if (error) toast.error(error.message); else refresh(); };
  const remove = async (r: Row) => { if (!confirm(`Delete ${r[nameKey]}?`)) return; const { error } = await (supabase.from(table as any) as any).delete().eq("id", r.id); if (error) toast.error(error.message); else refresh(); };
  const count = (s: string) => rows.filter(r => s === "all" || (s === "active" ? r.active !== false : r.active === false)).length;
  const groups = groupAZ ? Object.entries(shown.reduce<Record<string, Row[]>>((a, r) => { const k = String(r[nameKey] || "#")[0].toUpperCase(); (a[k] ||= []).push(r); return a; }, {})).sort() : [["", shown] as [string, Row[]]];

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-serif text-3xl font-semibold">{title}</h1><p className="text-sm text-muted-foreground">{subtitle}</p></div>
      <div className="flex gap-2">{extra}<Button onClick={() => { setEditing(null); setOpen(true); }}><Plus className="mr-2 h-4 w-4" />New</Button></div>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {archivable && ["active", "archived", "all"].map(s => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} onClick={() => setStatus(s)} className="capitalize">{s} ({count(s)})</Button>)}
      {filterOptions && <select value={filter} onChange={e => setFilter(e.target.value)} className="h-9 rounded-md border border-input bg-background px-3 text-sm"><option value="all">All types</option>{filterOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>}
      <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="Search" value={search} onChange={e => setSearch(e.target.value)} /></div>
    </div>
    <p className="text-xs text-muted-foreground">{shown.length} shown</p>
    <div className="overflow-x-auto rounded-md border"><table className="w-full text-left text-sm"><thead className="bg-muted/60"><tr><th className="p-3 w-12">#</th>{columns.map(c => <th key={c.label} className="p-3">{c.label}</th>)}<th className="p-3 text-right">Actions</th></tr></thead>
      <tbody>{groups.map(([letter, list]) => <>{letter && <tr key={`g-${letter}`} className="bg-muted/30"><td colSpan={columns.length + 2} className="px-3 py-1 text-xs font-semibold text-primary">{letter} · {list.length}</td></tr>}
        {list.map((r, i) => <tr key={r.id} className="border-t border-border hover:bg-muted/30">
          <td className="p-3 text-muted-foreground">{i + 1}</td>
          {columns.map((c, ci) => <td key={c.label} className="p-3">{ci === 0 && onOpen ? <button className="font-medium hover:text-primary text-left" onClick={() => onOpen(r)}>{c.render(r)}</button> : c.render(r)}</td>)}
          <td className="p-3"><div className="flex justify-end gap-1">
            {archivable && r.active === false && <Badge variant="outline" className="mr-1">Archived</Badge>}
            <Button size="icon" variant="ghost" title="Edit" onClick={() => { setEditing(r); setOpen(true); }}><Pencil className="h-4 w-4" /></Button>
            {archivable ? <Button size="icon" variant="ghost" title={r.active === false ? "Restore" : "Archive"} onClick={() => setActive(r, r.active === false)}>{r.active === false ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>
              : <Button size="icon" variant="ghost" title="Delete" onClick={() => remove(r)}><Trash2 className="h-4 w-4" /></Button>}
          </div></td></tr>)}</>)}
        {!shown.length && <tr><td colSpan={columns.length + 2} className="p-8 text-center text-muted-foreground">Nothing here yet.</td></tr>}
      </tbody></table></div>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle className="font-serif text-2xl">{editing ? "Edit" : "New"} {title.replace(/s$/, "").toLowerCase()}</DialogTitle></DialogHeader>
      <form key={editing?.id || "new"} onSubmit={save} className="grid gap-3">
        {fields.map(fd => <div key={fd.key} className="space-y-1.5"><Label>{fd.label}{fd.required && " *"}</Label>
          {fd.type === "select" ? <select name={fd.key} defaultValue={editing?.[fd.key] ?? fd.options?.[0]?.value} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm">{fd.options?.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
            : <Input name={fd.key} type={fd.type === "number" ? "number" : fd.type === "email" ? "email" : "text"} required={fd.required} placeholder={fd.placeholder} defaultValue={fd.type === "tags" ? (editing?.[fd.key] || []).join(", ") : editing?.[fd.key] ?? ""} />}</div>)}
        <DialogFooter><Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button><Button>Save</Button></DialogFooter>
      </form></DialogContent></Dialog>
  </div>;
}
