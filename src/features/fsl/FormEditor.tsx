import { useEffect, useMemo, useState } from "react";
import ExcelJS from "exceljs";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ArrowDown, ArrowUp, Trash2, Plus, Smartphone, Download, Upload, History, Save, X, Link2, Unlink } from "lucide-react";
import { toast } from "sonner";
import { DAYS, FieldDef, FieldType, FormConfig, slug } from "./engine";
import type { FslEntry, FslForm } from "./status";
import { FormRunner } from "./FormRunner";
import { colLetter, colNumber, downloadTemplate, loadWorkbook, saveBlob, sheetGrid, splitAddr, uploadTemplate, Grid } from "./excel";

const FIELD_TYPES: FieldType[] = ["temperature", "number", "text", "date", "time", "datetime", "dropdown", "yesno", "photo", "signature"];

function move<T>(arr: T[], i: number, d: number) { const a = [...arr]; const j = i + d; if (j < 0 || j >= a.length) return a; [a[i], a[j]] = [a[j], a[i]]; return a; }
const numOrNull = (s: string) => (s.trim() === "" || Number.isNaN(Number(s)) ? null : Number(s));
const condToText = (c?: { field: string; value: string }[]) => (c || []).map((x) => `${x.field}=${x.value}`).join("\n");
const textToCond = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const [field, ...v] = l.split("="); return { field: field.trim(), value: v.join("=").trim() }; });
const limToText = (c?: any[]) => (c || []).map((x) => `${x.field}=${x.value}: ${x.min ?? ""}..${x.max ?? ""}`).join("\n");
const textToLim = (t: string) => t.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => { const m = /^(.+?)=(.+?):\s*(-?[\d.]*)\s*\.\.\s*(-?[\d.]*)$/.exec(l); return m ? { field: m[1].trim(), value: m[2].trim(), min: numOrNull(m[3]), max: numOrNull(m[4]) } : null; }).filter(Boolean) as any[];

export function mapTargets(cfg: FormConfig) {
  const t: { key: string; label: string; kind: "header" | "column" }[] = cfg.headers.map((h) => ({ key: h.key, label: `Header: ${h.label}`, kind: "header" }));
  if (cfg.form_type === "daily_grid") {
    for (const s of cfg.sections) for (const c of cfg.checks) for (const f of cfg.fields) t.push({ key: `${s.key}|${c.key}|${f.key}`, label: `${s.label} · ${c.label} · ${f.label}`, kind: "column" });
    for (const f of cfg.fields) t.push({ key: `*|*|${f.key}`, label: `Any unit · ${f.label}`, kind: "column" });
  } else if (cfg.form_type === "weekly_checklist") {
    t.push({ key: "section", label: "Item name", kind: "column" });
    (cfg.sectionAttrs || []).forEach((a) => t.push({ key: `attr:${a.key}`, label: a.label, kind: "column" }));
    DAYS.forEach((d) => t.push({ key: `day:${d}`, label: `Sign-off ${d}`, kind: "column" }));
  } else cfg.fields.forEach((f) => t.push({ key: f.key, label: f.label, kind: "column" }));
  return t;
}

// ---------------- Sheet grid ----------------
function SheetGrid({ grid, cfg, selected, onSelect }: { grid: Grid; cfg: FormConfig; selected: string | null; onSelect: (a: string) => void }) {
  const linked = useMemo(() => {
    const m: Record<string, string> = {};
    for (const [k, a] of Object.entries(cfg.excel?.headerCells || {})) m[a] = k;
    const sr = cfg.excel?.startRow; if (sr) for (const [k, c] of Object.entries(cfg.excel?.columns || {})) m[`${c}${sr}`] = k;
    return m;
  }, [cfg.excel]);
  const hidden = new Set<string>(); const span: Record<string, { r: number; c: number }> = {};
  for (const m of grid.merges) { span[`${m.r1}:${m.c1}`] = { r: m.r2 - m.r1 + 1, c: m.c2 - m.c1 + 1 }; for (let r = m.r1; r <= m.r2; r++) for (let c = m.c1; c <= m.c2; c++) if (r !== m.r1 || c !== m.c1) hidden.add(`${r}:${c}`); }
  return (
    <div className="overflow-auto border border-border rounded-lg max-h-[70vh] bg-card">
      <table className="text-[11px] border-collapse">
        <thead><tr><th className="sticky top-0 left-0 z-20 bg-muted w-8" />{Array.from({ length: grid.nCols }, (_, i) => <th key={i} className="sticky top-0 z-10 bg-muted px-2 py-1 font-medium border border-border min-w-16">{colLetter(i + 1)}</th>)}</tr></thead>
        <tbody>
          {grid.rows.map((row, ri) => (
            <tr key={ri}><td className="sticky left-0 bg-muted px-1.5 text-muted-foreground border border-border text-center">{ri + 1}</td>
              {row.map((v, ci) => {
                const r = ri + 1, c = ci + 1; if (hidden.has(`${r}:${c}`)) return null;
                const addr = `${colLetter(c)}${r}`; const sp = span[`${r}:${c}`]; const l = linked[addr];
                return <td key={ci} rowSpan={sp?.r} colSpan={sp?.c} onClick={() => onSelect(addr)} title={l ? `Linked: ${l}` : addr}
                  className={`border border-border px-1.5 py-1 align-top cursor-pointer max-w-48 whitespace-pre-wrap ${selected === addr ? "ring-2 ring-primary ring-inset" : ""} ${l ? "bg-primary/20" : "hover:bg-muted/60"}`}>{v}{l && <span className="block text-[9px] text-primary font-semibold">⟵ {l}</span>}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ---------------- Editor ----------------
export function FormEditor({ form, onClose, onSaved }: { form: FslForm; onClose: () => void; onSaved: () => void }) {
  const [cfg, setCfg] = useState<FormConfig>(() => JSON.parse(JSON.stringify(form.config)));
  const [active, setActive] = useState(form.active);
  const [wb, setWb] = useState<ExcelJS.Workbook | null>(null);
  const [sheetName, setSheetName] = useState<string | undefined>(form.config.excel?.sheet);
  const [grid, setGrid] = useState<Grid | null>(null);
  const [gridDirty, setGridDirty] = useState(false);
  const [sel, setSel] = useState<string | null>(null);
  const [cellText, setCellText] = useState("");
  const [linkKey, setLinkKey] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState("");
  const [preview, setPreview] = useState(false);
  const [previewEntries, setPreviewEntries] = useState<FslEntry[]>([]);
  const [versions, setVersions] = useState<any[] | null>(null);
  const [diff, setDiff] = useState<{ wb: ExcelJS.Workbook; changes: string[]; remapped: string[]; cfg: FormConfig } | null>(null);
  const [json, setJson] = useState("");

  const ws = wb ? (sheetName && wb.getWorksheet(sheetName)) || wb.worksheets[0] : null;
  const refreshGrid = () => { if (ws) setGrid(sheetGrid(ws)); };
  useEffect(() => { if (form.template_path) downloadTemplate(form.template_path).then(loadWorkbook).then(setWb).catch((e) => toast.error(`Couldn't open template: ${e.message}`)); }, [form.template_path]);
  useEffect(() => { refreshGrid(); /* eslint-disable-next-line */ }, [wb, sheetName]);
  useEffect(() => { if (ws && sel) setCellText(String(ws.getCell(sel).text ?? "")); }, [sel, ws]);

  const set = (p: Partial<FormConfig>) => setCfg((c) => ({ ...c, ...p }));
  const setField = (i: number, p: Partial<FieldDef>) => set({ fields: cfg.fields.map((f, j) => (j === i ? { ...f, ...p } : f)) });
  const excel = cfg.excel || {};
  const setExcel = (p: any) => set({ excel: { ...excel, ...p } });
  const targets = mapTargets(cfg);

  const linkCell = () => {
    if (!sel || !linkKey) return; const t = targets.find((x) => x.key === linkKey)!; const a = splitAddr(sel)!;
    if (t.kind === "header") setExcel({ headerCells: { ...(excel.headerCells || {}), [t.key]: sel } });
    else setExcel({ columns: { ...(excel.columns || {}), [t.key]: a.col }, startRow: excel.startRow || a.row });
    toast.success(`Linked ${sel} → ${t.label}`);
  };
  const unlinkCell = () => {
    if (!sel) return; const a = splitAddr(sel)!;
    const hc = Object.fromEntries(Object.entries(excel.headerCells || {}).filter(([, v]) => v !== sel));
    const cols = excel.startRow === a.row ? Object.fromEntries(Object.entries(excel.columns || {}).filter(([, v]) => v !== a.col)) : excel.columns;
    setExcel({ headerCells: hc, columns: cols });
  };
  const editCell = () => { if (!ws || !sel) return; ws.getCell(sel).value = cellText; setGridDirty(true); refreshGrid(); };
  const rowCol = (op: "ir" | "dr" | "ic" | "dc") => {
    if (!ws || !sel) return; const a = splitAddr(sel)!; const cn = colNumber(a.col);
    if (op === "ir") ws.spliceRows(a.row, 0, []); if (op === "dr") ws.spliceRows(a.row, 1);
    if (op === "ic") ws.spliceColumns(cn, 0, []); if (op === "dc") ws.spliceColumns(cn, 1);
    setGridDirty(true); refreshGrid();
  };

  const save = async (override?: { config: FormConfig; template_path: string | null; note: string }) => {
    setSaving(true);
    try {
      let config = override?.config || cfg; let template_path = override ? override.template_path : form.template_path || null;
      if (!override && wb && gridDirty) template_path = await uploadTemplate(form.business_id, `${config.name}.xlsx`, await wb.xlsx.writeBuffer() as ArrayBuffer);
      if (sheetName) config = { ...config, excel: { ...(config.excel || {}), sheet: sheetName } };
      const version = form.version + 1;
      const { data: { user } } = await supabase.auth.getUser();
      const { error: e1 } = await supabase.from("fsl_forms").update({ config: config as any, name: config.name, form_type: config.form_type, active, version, template_path, updated_at: new Date().toISOString() }).eq("id", form.id);
      if (e1) throw e1;
      await supabase.from("fsl_form_versions").insert({ form_id: form.id, business_id: form.business_id, version, config: config as any, template_path, note: override?.note || note || null, created_by: user?.id });
      toast.success(`Saved as version ${version}`); setGridDirty(false); onSaved();
    } catch (e: any) { toast.error(e.message); } finally { setSaving(false); }
  };

  const loadVersions = async () => { const { data } = await supabase.from("fsl_form_versions").select("*").eq("form_id", form.id).order("version", { ascending: false }); setVersions(data || []); };

  const reupload = async (file: File) => {
    const nwb = await loadWorkbook(await file.arrayBuffer());
    const nws = (sheetName && nwb.getWorksheet(sheetName)) || nwb.worksheets[0];
    const oldG = ws ? sheetGrid(ws, 200, 40) : null; const newG = sheetGrid(nws, 200, 40);
    const changes: string[] = [];
    const R = Math.max(oldG?.nRows || 0, newG.nRows), C = Math.max(oldG?.nCols || 0, newG.nCols);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) { const o = oldG?.rows[r]?.[c] || "", n = newG.rows[r]?.[c] || ""; if (o !== n) changes.push(`${colLetter(c + 1)}${r + 1}: "${o}" → "${n}"`); }
    // keep links where header text still matches: find the label text above each linked column in the new sheet
    const next: FormConfig = JSON.parse(JSON.stringify(cfg)); const remapped: string[] = [];
    const findText = (g: Grid, text: string) => { for (let r = 0; r < g.nRows; r++) for (let c = 0; c < g.nCols; c++) if (text && g.rows[r][c].trim() === text.trim()) return { r: r + 1, c: c + 1 }; return null; };
    if (oldG && next.excel?.startRow) {
      const sr = next.excel.startRow; let newSr = sr;
      for (const [k, col] of Object.entries(next.excel.columns || {})) {
        const cn = colNumber(col); let label = ""; let lr = sr - 1; while (lr > 0 && !label) { label = oldG.rows[lr - 1]?.[cn - 1] || ""; lr--; }
        const hit = findText(newG, label);
        if (hit && hit.c !== cn) { next.excel.columns![k] = colLetter(hit.c); remapped.push(`${k}: ${col} → ${colLetter(hit.c)} ("${label}")`); }
        if (hit) newSr = Math.max(newSr, hit.r + (sr - 1 - lr));
      }
      next.excel.startRow = newSr;
    }
    setDiff({ wb: nwb, changes, remapped, cfg: next });
  };

  const tabHeader = (
    <div className="flex flex-wrap items-center gap-2 border-b border-border pb-3 mb-3">
      <div className="mr-auto min-w-0"><p className="font-semibold truncate">{cfg.name}</p><p className="text-xs text-muted-foreground">Version {form.version}{gridDirty ? " · sheet edited" : ""}</p></div>
      <Button variant="outline" size="sm" onClick={() => { setPreviewEntries([]); setPreview(true); }}><Smartphone className="h-4 w-4 mr-1" />Preview as staff</Button>
      <Button variant="outline" size="sm" disabled={!wb} onClick={async () => saveBlob(new Blob([await wb!.xlsx.writeBuffer()]), `${cfg.name}.xlsx`)}><Download className="h-4 w-4 mr-1" />Download template</Button>
      <label className="inline-flex"><input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && reupload(e.target.files[0])} /><span className="inline-flex items-center h-9 px-3 rounded-md border border-input text-sm cursor-pointer hover:bg-accent"><Upload className="h-4 w-4 mr-1" />{wb ? "Re-upload updated Excel" : "Attach Excel template"}</span></label>
      <Button variant="outline" size="sm" onClick={loadVersions}><History className="h-4 w-4 mr-1" />Versions</Button>
      <Input className="h-9 w-40" placeholder="Change note" value={note} onChange={(e) => setNote(e.target.value)} />
      <Button size="sm" disabled={saving} onClick={() => save()}><Save className="h-4 w-4 mr-1" />{saving ? "Saving…" : "Save"}</Button>
      <Button variant="ghost" size="icon" onClick={onClose}><X className="h-4 w-4" /></Button>
    </div>
  );

  const settings = (
    <Tabs defaultValue="general">
      <TabsList className="flex flex-wrap h-auto">
        {["general", "sections", "fields", "rules", "excel", "json"].map((t) => <TabsTrigger key={t} value={t} className="capitalize" onClick={() => t === "json" && setJson(JSON.stringify(cfg, null, 2))}>{t === "json" ? "Advanced" : t}</TabsTrigger>)}
      </TabsList>

      <TabsContent value="general" className="space-y-3">
        <div className="grid sm:grid-cols-2 gap-3">
          <div><label className="text-xs">Form name</label><Input value={cfg.name} onChange={(e) => set({ name: e.target.value })} /></div>
          <div><label className="text-xs">Form code</label><Input value={cfg.code || ""} onChange={(e) => set({ code: e.target.value })} /></div>
          <div className="sm:col-span-2"><label className="text-xs">Title (as printed)</label><Input value={cfg.title} onChange={(e) => set({ title: e.target.value })} /></div>
          <div><label className="text-xs">Form type</label>
            <Select value={cfg.form_type} onValueChange={(v: any) => set({ form_type: v, period: v === "weekly_checklist" ? "weekly" : "monthly" })}><SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="daily_grid">Daily grid</SelectItem><SelectItem value="weekly_checklist">Weekly checklist</SelectItem><SelectItem value="event_log">Event log</SelectItem><SelectItem value="two_step">Two-step event log</SelectItem></SelectContent></Select></div>
          <div><label className="text-xs">Period</label>
            <Select value={cfg.period} onValueChange={(v: any) => set({ period: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="monthly">Monthly</SelectItem><SelectItem value="weekly">Weekly</SelectItem></SelectContent></Select></div>
        </div>
        <label className="flex items-center gap-2 text-sm"><Switch checked={active} onCheckedChange={setActive} />Active (shown to staff)</label>
        <div><label className="text-xs">On-screen instructions</label><Textarea rows={3} value={cfg.instructions || ""} onChange={(e) => set({ instructions: e.target.value })} /></div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <p className="text-sm font-medium">Alerts</p>
          {([["outOfRange", "Out-of-range readings"], ["overdue", "Overdue checks"], ["openTooLong", "Two-step entries open too long"]] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><Switch checked={cfg.alerts?.[k] !== false} onCheckedChange={(v) => set({ alerts: { outOfRange: true, overdue: true, openTooLong: true, ...(cfg.alerts || {}), [k]: v } })} />{l}</label>
          ))}
          {cfg.form_type === "two_step" && <div><label className="text-xs">Flag if open longer than (hours)</label><Input type="number" value={cfg.openAlertHours ?? ""} onChange={(e) => set({ openAlertHours: numOrNull(e.target.value) })} /></div>}
          <div><label className="text-xs">Extra alert emails for this form (comma separated)</label><Input value={(cfg.alertEmails || []).join(", ")} onChange={(e) => set({ alertEmails: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></div>
        </div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex justify-between items-center"><p className="text-sm font-medium">Header fields</p><Button size="sm" variant="outline" onClick={() => set({ headers: [...cfg.headers, { key: `h_${Date.now().toString(36)}`, label: "New header", type: "text" }] })}><Plus className="h-3 w-3" /></Button></div>
          {cfg.headers.map((h, i) => (
            <div key={h.key} className="grid grid-cols-[1fr_110px_1fr_auto] gap-2 items-center">
              <Input value={h.label} onChange={(e) => set({ headers: cfg.headers.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
              <Select value={h.type} onValueChange={(v: any) => set({ headers: cfg.headers.map((x, j) => (j === i ? { ...x, type: v } : x)) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["text", "dropdown", "month", "week", "date"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select>
              <Input placeholder="Options (comma)" disabled={h.type !== "dropdown"} value={(h.options || []).join(", ")} onChange={(e) => set({ headers: cfg.headers.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean), default: x.default } : x)) })} />
              <Button size="icon" variant="ghost" onClick={() => set({ headers: cfg.headers.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="sections" className="space-y-4">
        <div className="rounded-lg border border-border p-3 space-y-2">
          <div className="flex justify-between items-center"><p className="text-sm font-medium">{cfg.form_type === "weekly_checklist" ? "Items" : "Sections / units"}</p><Button size="sm" variant="outline" onClick={() => set({ sections: [...cfg.sections, { key: `s_${Date.now().toString(36)}`, label: "New item" }] })}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
          {cfg.sections.map((s, i) => (
            <div key={s.key} className="rounded-md bg-muted/40 p-2 space-y-2">
              <div className="grid grid-cols-[1fr_80px_80px_auto] gap-2 items-center">
                <Input value={s.label} onChange={(e) => set({ sections: cfg.sections.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <Input placeholder="min" value={s.min ?? ""} onChange={(e) => set({ sections: cfg.sections.map((x, j) => (j === i ? { ...x, min: numOrNull(e.target.value) } : x)) })} />
                <Input placeholder="max" value={s.max ?? ""} onChange={(e) => set({ sections: cfg.sections.map((x, j) => (j === i ? { ...x, max: numOrNull(e.target.value) } : x)) })} />
                <div className="flex"><Button size="icon" variant="ghost" onClick={() => set({ sections: move(cfg.sections, i, -1) })}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => set({ sections: move(cfg.sections, i, 1) })}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => set({ sections: cfg.sections.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
              {(cfg.sectionAttrs || []).length > 0 && <div className="grid sm:grid-cols-2 gap-2">{cfg.sectionAttrs!.map((a) => (
                a.options?.length ? <Select key={a.key} value={s.attrs?.[a.key] || ""} onValueChange={(v) => set({ sections: cfg.sections.map((x, j) => (j === i ? { ...x, attrs: { ...(x.attrs || {}), [a.key]: v } } : x)) })}><SelectTrigger><SelectValue placeholder={a.label} /></SelectTrigger><SelectContent>{a.options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent></Select>
                  : <Input key={a.key} placeholder={a.label} value={s.attrs?.[a.key] || ""} onChange={(e) => set({ sections: cfg.sections.map((x, j) => (j === i ? { ...x, attrs: { ...(x.attrs || {}), [a.key]: e.target.value } } : x)) })} />
              ))}</div>}
            </div>
          ))}
        </div>
        {cfg.form_type === "weekly_checklist" && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex justify-between items-center"><p className="text-sm font-medium">Item columns</p><Button size="sm" variant="outline" onClick={() => set({ sectionAttrs: [...(cfg.sectionAttrs || []), { key: `a_${Date.now().toString(36)}`, label: "New column" }] })}><Plus className="h-3 w-3" /></Button></div>
            {(cfg.sectionAttrs || []).map((a, i) => (
              <div key={a.key} className="grid grid-cols-[1fr_1fr_auto] gap-2">
                <Input value={a.label} onChange={(e) => set({ sectionAttrs: cfg.sectionAttrs!.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <Input placeholder="Dropdown options (comma, optional)" value={(a.options || []).join(", ")} onChange={(e) => set({ sectionAttrs: cfg.sectionAttrs!.map((x, j) => (j === i ? { ...x, options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } : x)) })} />
                <Button size="icon" variant="ghost" onClick={() => set({ sectionAttrs: cfg.sectionAttrs!.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        )}
        {cfg.form_type === "daily_grid" && (
          <div className="rounded-lg border border-border p-3 space-y-2">
            <div className="flex justify-between items-center"><p className="text-sm font-medium">Checks</p><Button size="sm" variant="outline" onClick={() => set({ checks: [...cfg.checks, { key: `c_${Date.now().toString(36)}`, label: "New check" }] })}><Plus className="h-3 w-3 mr-1" />Add</Button></div>
            {cfg.checks.map((c, i) => (
              <div key={c.key} className="grid grid-cols-[1fr_120px_auto] gap-2 items-center">
                <Input value={c.label} onChange={(e) => set({ checks: cfg.checks.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)) })} />
                <Input type="time" value={c.due || ""} onChange={(e) => set({ checks: cfg.checks.map((x, j) => (j === i ? { ...x, due: e.target.value } : x)) })} />
                <div className="flex"><Button size="icon" variant="ghost" onClick={() => set({ checks: move(cfg.checks, i, -1) })}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => set({ checks: move(cfg.checks, i, 1) })}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => set({ checks: cfg.checks.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></div>
              </div>
            ))}
          </div>
        )}
      </TabsContent>

      <TabsContent value="fields" className="space-y-2">
        <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => set({ fields: [...cfg.fields, { key: `f_${Date.now().toString(36)}`, label: "New field", type: "text" }] })}><Plus className="h-3 w-3 mr-1" />Add field</Button></div>
        {cfg.fields.map((f, i) => (
          <details key={f.key} className="rounded-lg border border-border p-2">
            <summary className="cursor-pointer text-sm flex items-center gap-2"><span className="font-medium">{f.label}</span><Badge variant="outline" className="text-[10px]">{f.type}</Badge>{f.required && <Badge className="text-[10px]">required</Badge>}<span className="text-[10px] text-muted-foreground ml-auto">{f.key}</span></summary>
            <div className="grid sm:grid-cols-2 gap-2 mt-2">
              <div><label className="text-xs">Label (as on paper)</label><Input value={f.label} onChange={(e) => setField(i, { label: e.target.value })} /></div>
              <div><label className="text-xs">Type</label><Select value={f.type} onValueChange={(v: any) => setField(i, { type: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{FIELD_TYPES.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              <div><label className="text-xs">Auto-fill</label><Select value={f.autofill || "none"} onValueChange={(v: any) => setField(i, { autofill: v === "none" ? null : v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{["none", "date", "time", "datetime", "staff"].map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent></Select></div>
              {cfg.form_type === "two_step" && <div><label className="text-xs">Step</label><Select value={f.step || "start"} onValueChange={(v: any) => setField(i, { step: v })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="start">Start</SelectItem><SelectItem value="finish">Finish</SelectItem></SelectContent></Select></div>}
              <div><label className="text-xs">Min</label><Input value={f.min ?? ""} onChange={(e) => setField(i, { min: numOrNull(e.target.value) })} /></div>
              <div><label className="text-xs">Max</label><Input value={f.max ?? ""} onChange={(e) => setField(i, { max: numOrNull(e.target.value) })} /></div>
              {f.type === "dropdown" && <div className="sm:col-span-2"><label className="text-xs">Dropdown options (comma)</label><Input value={(f.options || []).join(", ")} onChange={(e) => setField(i, { options: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /><label className="flex items-center gap-2 text-xs mt-1"><Switch checked={!!f.allowAdd} onCheckedChange={(v) => setField(i, { allowAdd: v })} />Staff can add new (saved list)</label></div>}
              <div className="sm:col-span-2"><label className="text-xs">Help text</label><Input value={f.help || ""} onChange={(e) => setField(i, { help: e.target.value })} /></div>
              <div><label className="text-xs">Conditional limits (field=value: min..max per line)</label><Textarea rows={2} defaultValue={limToText(f.conditionalLimits)} onBlur={(e) => setField(i, { conditionalLimits: textToLim(e.target.value) })} /></div>
              <div><label className="text-xs">Hide when (field=value per line)</label><Textarea rows={2} defaultValue={condToText(f.hiddenWhen)} onBlur={(e) => setField(i, { hiddenWhen: textToCond(e.target.value) })} /></div>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 text-xs"><Switch checked={!!f.required} onCheckedChange={(v) => setField(i, { required: v })} />Required</label>
              {cfg.sections.length > 0 && <label className="flex items-center gap-2 text-xs"><Switch checked={cfg.limitField === f.key} onCheckedChange={(v) => set({ limitField: v ? f.key : undefined })} />Section limits apply here</label>}
              <div className="ml-auto flex"><Button size="icon" variant="ghost" onClick={() => set({ fields: move(cfg.fields, i, -1) })}><ArrowUp className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => set({ fields: move(cfg.fields, i, 1) })}><ArrowDown className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => set({ fields: cfg.fields.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button></div>
            </div>
          </details>
        ))}
      </TabsContent>

      <TabsContent value="rules" className="space-y-4">
        <div className="rounded-lg border border-border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={!!cfg.corrective} onCheckedChange={(v) => set({ corrective: v ? { field: cfg.fields.find((f) => /correct/i.test(f.label))?.key || cfg.fields[0]?.key, triggers: [] } : null })} />Corrective action rule</label>
          {cfg.corrective && <>
            <div><label className="text-xs">Corrective action field</label><Select value={cfg.corrective.field} onValueChange={(v) => set({ corrective: { ...cfg.corrective!, field: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{cfg.fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent></Select></div>
            <p className="text-xs text-muted-foreground">Always compulsory when a reading is out of range. Also compulsory when:</p>
            <Textarea rows={2} placeholder="field=value (e.g. packaging=Poor)" defaultValue={condToText(cfg.corrective.triggers)} onBlur={(e) => set({ corrective: { ...cfg.corrective!, triggers: textToCond(e.target.value) } })} />
            <div><label className="text-xs">Default text when in range (optional)</label><Input value={cfg.corrective.defaultInRange || ""} onChange={(e) => set({ corrective: { ...cfg.corrective!, defaultInRange: e.target.value } })} /></div>
          </>}
        </div>
        <div className="rounded-lg border border-border p-3 space-y-2">
          <label className="flex items-center gap-2 text-sm font-medium"><Switch checked={!!cfg.exception} onCheckedChange={(v) => set({ exception: v ? { label: "Exception", noteLabel: "Exception note", appliesTo: cfg.fields.find((f) => f.type === "temperature")?.key || "", neverFor: [] } : null })} />Exception rule (allow below-limit with note)</label>
          {cfg.exception && <div className="grid sm:grid-cols-2 gap-2">
            <div className="sm:col-span-2"><label className="text-xs">Checkbox label</label><Input value={cfg.exception.label} onChange={(e) => set({ exception: { ...cfg.exception!, label: e.target.value } })} /></div>
            <div><label className="text-xs">Applies to field</label><Select value={cfg.exception.appliesTo} onValueChange={(v) => set({ exception: { ...cfg.exception!, appliesTo: v } })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{cfg.fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-xs">Required note label</label><Input value={cfg.exception.noteLabel} onChange={(e) => set({ exception: { ...cfg.exception!, noteLabel: e.target.value } })} /></div>
            <div><label className="text-xs">Check items in field</label><Select value={cfg.exception.neverForField || ""} onValueChange={(v) => set({ exception: { ...cfg.exception!, neverForField: v } })}><SelectTrigger><SelectValue placeholder="Field" /></SelectTrigger><SelectContent>{cfg.fields.map((f) => <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>)}</SelectContent></Select></div>
            <div><label className="text-xs">Never allowed for (comma)</label><Input value={cfg.exception.neverFor.join(", ")} onChange={(e) => set({ exception: { ...cfg.exception!, neverFor: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) } })} /></div>
          </div>}
        </div>
      </TabsContent>

      <TabsContent value="excel" className="space-y-3">
        {wb && <div><label className="text-xs">Sheet</label><Select value={ws?.name} onValueChange={(v) => setSheetName(v)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{wb.worksheets.map((w) => <SelectItem key={w.id} value={w.name}>{w.name}</SelectItem>)}</SelectContent></Select></div>}
        <div><label className="text-xs">First data row</label><Input type="number" value={excel.startRow ?? ""} onChange={(e) => setExcel({ startRow: numOrNull(e.target.value) || undefined })} /></div>
        <p className="text-xs text-muted-foreground">Click a cell in the sheet, then link it. Headers link to a single cell; columns link to the first data cell of that column.</p>
        <div className="space-y-1 max-h-72 overflow-auto">
          {targets.map((t) => { const v = t.kind === "header" ? excel.headerCells?.[t.key] : excel.columns?.[t.key]; return <div key={t.key} className="flex justify-between text-xs border-b border-border/50 py-1"><span>{t.label}</span><span className={v ? "text-primary font-semibold" : "text-muted-foreground"}>{v || "—"}</span></div>; })}
        </div>
      </TabsContent>

      <TabsContent value="json" className="space-y-2">
        <Textarea rows={22} className="font-mono text-xs" value={json} onChange={(e) => setJson(e.target.value)} />
        <Button size="sm" variant="outline" onClick={() => { try { setCfg(JSON.parse(json)); toast.success("Applied — remember to Save"); } catch (e: any) { toast.error(`Invalid JSON: ${e.message}`); } }}>Apply JSON</Button>
      </TabsContent>
    </Tabs>
  );

  const cellPanel = sel && ws && (
    <div className="rounded-lg border border-border p-3 space-y-2 mt-3">
      <p className="text-sm font-medium">Cell {sel}</p>
      <div className="flex gap-2"><Input value={cellText} onChange={(e) => setCellText(e.target.value)} /><Button size="sm" variant="outline" onClick={editCell}>Set text</Button></div>
      <div className="flex gap-2">
        <Select value={linkKey} onValueChange={setLinkKey}><SelectTrigger className="flex-1"><SelectValue placeholder="Link to field or header…" /></SelectTrigger><SelectContent>{targets.map((t) => <SelectItem key={t.key} value={t.key}>{t.label}</SelectItem>)}</SelectContent></Select>
        <Button size="sm" onClick={linkCell} disabled={!linkKey}><Link2 className="h-4 w-4" /></Button>
        <Button size="sm" variant="outline" onClick={unlinkCell}><Unlink className="h-4 w-4" /></Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" onClick={() => rowCol("ir")}>Insert row above</Button><Button size="sm" variant="outline" onClick={() => rowCol("dr")}>Delete row</Button>
        <Button size="sm" variant="outline" onClick={() => rowCol("ic")}>Insert column left</Button><Button size="sm" variant="outline" onClick={() => rowCol("dc")}>Delete column</Button>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 bg-background overflow-auto p-3 sm:p-5">
      {tabHeader}
      <div className="grid lg:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)] gap-4">
        <div>
          {grid ? <SheetGrid grid={grid} cfg={cfg} selected={sel} onSelect={setSel} /> : <div className="rounded-lg border border-dashed border-border p-10 text-center text-sm text-muted-foreground">No Excel template attached. Use “Attach Excel template” to link this form to your paper sheet. Exports will use a clean table until then.</div>}
          {cellPanel}
        </div>
        <div>{settings}</div>
      </div>

      <Dialog open={preview} onOpenChange={setPreview}>
        <DialogContent className="max-w-[420px] p-0 overflow-hidden"><div className="h-[80dvh] overflow-y-auto p-4 bg-background">
          <FormRunner form={{ ...form, config: cfg }} entries={previewEntries} staffName="Preview Staff" onBack={() => setPreview(false)}
            onSave={(p) => setPreviewEntries((x) => [...x, { ...(p as any), id: p.client_id, staff_name: "Preview Staff", created_at: new Date().toISOString(), edited: false, backfilled: false }])}
            onFinish={(e, v) => setPreviewEntries((x) => x.map((y) => (y.id === e.id ? { ...y, status: "complete", field_values: { ...y.field_values, ...v } } : y)))} />
        </div></DialogContent>
      </Dialog>

      <Dialog open={!!versions} onOpenChange={(o) => !o && setVersions(null)}>
        <DialogContent><DialogHeader><DialogTitle>Versions</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">{(versions || []).map((v) => (
            <div key={v.id} className="flex items-center justify-between rounded-md border border-border p-2 text-sm">
              <div><p className="font-medium">Version {v.version}{v.version === form.version && " (current)"}</p><p className="text-xs text-muted-foreground">{new Date(v.created_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}{v.note ? ` · ${v.note}` : ""}</p></div>
              {v.version !== form.version && <Button size="sm" variant="outline" onClick={async () => { setVersions(null); await save({ config: v.config, template_path: v.template_path, note: `Rolled back to version ${v.version}` }); }}>Roll back</Button>}
            </div>
          ))}{versions?.length === 0 && <p className="text-sm text-muted-foreground">No versions yet.</p>}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!diff} onOpenChange={(o) => !o && setDiff(null)}>
        <DialogContent className="max-w-2xl"><DialogHeader><DialogTitle>Updated Excel — what changed</DialogTitle></DialogHeader>
          <div className="max-h-[55vh] overflow-auto space-y-3 text-xs">
            <div><p className="font-semibold text-sm mb-1">{diff?.changes.length || 0} cell changes</p>{diff?.changes.slice(0, 200).map((c) => <p key={c} className="font-mono">{c}</p>)}</div>
            <div><p className="font-semibold text-sm mb-1">Field links moved ({diff?.remapped.length || 0})</p>{diff?.remapped.map((c) => <p key={c}>{c}</p>)}<p className="text-muted-foreground mt-1">All other links are kept where the headers still match.</p></div>
          </div>
          <DialogFooter><Button variant="ghost" onClick={() => setDiff(null)}>Cancel</Button>
            <Button onClick={async () => { if (!diff) return; const path = await uploadTemplate(form.business_id, `${cfg.name}.xlsx`, await diff.wb.xlsx.writeBuffer() as ArrayBuffer); setCfg(diff.cfg); setWb(diff.wb); setDiff(null); await save({ config: { ...diff.cfg, excel: { ...(diff.cfg.excel || {}), sheet: sheetName } }, template_path: path, note: "Re-uploaded Excel template" }); }}>Replace template & save</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export { slug };
