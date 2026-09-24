import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import QRCode from "qrcode";
import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ShieldCheck, AlertTriangle, Clock, Upload, Pencil, QrCode, Download, Plus, FileSpreadsheet, FileText, FileDown, ClipboardList, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { FormConfig, formatValue, todayStr, periodKey, mondayOf, to12, ymd, sydneyNow } from "@/features/fsl/engine";
import { formStatus, statusTone, hoursOpen, FslEntry, FslForm } from "@/features/fsl/status";
import { SEED_FORMS } from "@/features/fsl/seed";
import { FormEditor } from "@/features/fsl/FormEditor";
import { FormRunner, EditEntryForm, SavePayload } from "@/features/fsl/FormRunner";
import { exportCsv, exportPdf, exportXlsx, gridToText, loadWorkbook, sheetGrid, uploadTemplate } from "@/features/fsl/excel";

const typeLabel: Record<string, string> = { daily_grid: "Daily grid", weekly_checklist: "Weekly checklist", event_log: "Event log", two_step: "Two-step log" };

export default function FoodSafetyPage() {
  const { businessCode } = useParams();
  const { business } = useBusiness();
  const { user } = useAuth();
  const bid = business?.id as string | undefined;
  const [forms, setForms] = useState<FslForm[]>([]);
  const [entries, setEntries] = useState<FslEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [editForm, setEditForm] = useState<FslForm | null>(null);
  const [editEntry, setEditEntry] = useState<FslEntry | null>(null);
  const [backfill, setBackfill] = useState<{ form: FslForm; date: string } | null>(null);
  const [from, setFrom] = useState(() => ymd(new Date(sydneyNow().getTime() - 6 * 864e5)));
  const [to, setTo] = useState(todayStr());
  const [fForm, setFForm] = useState("all");
  const [fStaff, setFStaff] = useState("all");
  const [auditFor, setAuditFor] = useState<{ entry: FslEntry; rows: any[] } | null>(null);

  const load = useCallback(async () => {
    if (!bid) return;
    setLoading(true);
    let { data: fs } = await supabase.from("fsl_forms").select("*").eq("business_id", bid).order("sort_order");
    if (fs && fs.length === 0) {
      // First visit: load the starting configurations (fully editable afterwards)
      const rows = SEED_FORMS.map((c, i) => ({ business_id: bid, name: c.name, form_type: c.form_type, sort_order: i, config: c as any }));
      const { data: ins, error } = await supabase.from("fsl_forms").insert(rows).select("*");
      if (!error && ins) { await supabase.from("fsl_form_versions").insert(ins.map((f) => ({ form_id: f.id, business_id: bid, version: 1, config: f.config, note: "Starting configuration" }))); fs = ins; }
    }
    const since = from < ymd(new Date(sydneyNow().getTime() - 40 * 864e5)) ? from : ymd(new Date(sydneyNow().getTime() - 40 * 864e5));
    const { data: es } = await supabase.from("fsl_entries").select("*").eq("business_id", bid).or(`entry_date.gte.${since},status.eq.open`).order("created_at", { ascending: false }).limit(5000);
    setForms((fs || []) as any); setEntries((es || []) as any); setLoading(false);
  }, [bid, from]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    if (!bid) return;
    const ch = supabase.channel(`fsl-${bid}`).on("postgres_changes", { event: "*", schema: "public", table: "fsl_entries", filter: `business_id=eq.${bid}` }, () => load()).subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [bid, load]);

  const byId = useMemo(() => Object.fromEntries(forms.map((f) => [f.id, f])), [forms]);
  const active = forms.filter((f) => f.active);
  const today = todayStr();

  // ---------- admin save (backfill, flagged) ----------
  const adminSave = async (p: SavePayload) => {
    const form = byId[p.form_id];
    const { data, error } = await supabase.from("fsl_entries").insert({ ...p, business_id: bid!, form_version: form.version, backfilled: p.entry_date !== today, staff_name: (user?.email || "Admin") + " (admin)", admin_user_id: user?.id } as any).select("*").single();
    if (error) { toast.error(error.message); throw error; }
    if (data.out_of_range) supabase.functions.invoke("fsl-alerts", { body: { entry_id: data.id } });
    setEntries((x) => [data as any, ...x]);
  };
  const adminFinish = async (e: FslEntry, v: any, oor: boolean) => {
    const { data, error } = await supabase.from("fsl_entries").update({ field_values: { ...e.field_values, ...v }, status: "complete", out_of_range: e.out_of_range || oor, finished_by_name: (user?.email || "Admin") + " (admin)", finished_at: new Date().toISOString() }).eq("id", e.id).select("*").single();
    if (error) { toast.error(error.message); return; }
    setEntries((x) => x.map((y) => (y.id === e.id ? (data as any) : y)));
  };
  const saveEdit = async (entry: FslEntry, changed: any, oor: boolean, reason: string) => {
    const who = user?.email || "Admin";
    const audits = Object.keys(changed).map((k) => ({ business_id: bid!, entry_id: entry.id, field_key: k, old_value: entry.field_values[k] == null ? null : String(entry.field_values[k]), new_value: changed[k] == null ? null : String(changed[k]), changed_by: who, reason }));
    if (!audits.length) { toast.message("Nothing changed"); return; }
    const { error } = await supabase.from("fsl_entries").update({ field_values: { ...entry.field_values, ...changed }, out_of_range: oor, edited: true, updated_at: new Date().toISOString() }).eq("id", entry.id);
    if (error) { toast.error(error.message); return; }
    await supabase.from("fsl_entry_audit").insert(audits);
    toast.success("Entry updated — change recorded in the audit log"); setEditEntry(null); load();
  };

  // ---------- today ----------
  const statuses = active.map((f) => ({ f, s: formStatus(f, entries, today) }));
  const oorToday = entries.filter((e) => e.out_of_range && e.entry_date === today);
  const overdue = statuses.flatMap(({ f, s }) => s.overdue.map((o) => ({ form: f.config.name, ...o })));
  const openSteps = statuses.flatMap(({ f, s }) => s.open.map((e) => ({ f, e })));
  const unsigned = statuses.filter(({ f }) => f.config.form_type === "weekly_checklist").flatMap(({ f, s }) => s.unsigned.map((u) => ({ form: f.config.name, item: u })));

  const entrySummary = (e: FslEntry) => { const f = byId[e.form_id]; if (!f) return ""; const cfg = f.config; const sec = cfg.sections.find((s) => s.key === e.section_key)?.label; const chk = cfg.checks.find((c) => c.key === e.check_key)?.label || (cfg.form_type === "weekly_checklist" ? e.check_key : ""); const vals = cfg.fields.filter((x) => x.type !== "photo" && x.type !== "signature").map((x) => formatValue(x, e.field_values[x.key])).filter(Boolean).join(" · "); return [sec, chk, vals].filter(Boolean).join(" — "); };
  const caOf = (e: FslEntry) => { const f = byId[e.form_id]; const k = f?.config.corrective?.field; return k ? e.field_values[k] : ""; };

  const todayTab = (
    <div className="space-y-4">
      <div className="grid sm:grid-cols-2 xl:grid-cols-3 gap-3">
        {statuses.map(({ f, s }) => (
          <Card key={f.id} className="border-border/60"><CardContent className="p-4">
            <div className="flex items-start justify-between gap-2"><div><p className="font-semibold">{f.config.name}</p><p className="text-xs text-muted-foreground">{typeLabel[f.form_type]}{f.config.code ? ` · ${f.config.code}` : ""}</p></div><span className={`text-[11px] px-2 py-0.5 rounded-full ${statusTone[s.status]}`}>{s.status}</span></div>
            <p className="text-sm mt-2">{s.summary}</p>
            {s.total > 0 && <div className="h-1.5 rounded-full bg-muted mt-2 overflow-hidden"><div className="h-full bg-primary" style={{ width: `${Math.round((s.done / s.total) * 100)}%` }} /></div>}
            <Button size="sm" variant="ghost" className="mt-2 -ml-2" onClick={() => setBackfill({ form: f, date: today })}><Plus className="h-3.5 w-3.5 mr-1" />Record / backfill</Button>
          </CardContent></Card>
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" />Out of range today ({oorToday.length})</CardTitle></CardHeader><CardContent className="space-y-2">
          {oorToday.map((e) => <div key={e.id} className="rounded-md border border-destructive/40 p-2 text-sm"><p className="font-medium">{byId[e.form_id]?.config.name}: {entrySummary(e)}</p><p className="text-xs text-muted-foreground">Corrective action: {caOf(e) || "—"} · {e.staff_name}</p></div>)}
          {!oorToday.length && <p className="text-sm text-muted-foreground">None.</p>}
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><Clock className="h-4 w-4 text-primary" />Overdue checks ({overdue.length})</CardTitle></CardHeader><CardContent className="space-y-1">
          {overdue.map((o, i) => <p key={i} className="text-sm">{o.form}: <span className="font-medium">{o.section}</span> — {o.check} (due {to12(o.due)})</p>)}
          {!overdue.length && <p className="text-sm text-muted-foreground">None.</p>}
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Open two-step entries ({openSteps.length})</CardTitle></CardHeader><CardContent className="space-y-1">
          {openSteps.map(({ f, e }) => { const h = hoursOpen(e); const lim = f.config.openAlertHours || 0; return <p key={e.id} className={`text-sm ${lim && h > lim ? "text-destructive font-medium" : ""}`}>{f.config.name}: {entrySummary(e)} · open {Math.floor(h)}h · {e.staff_name}</p>; })}
          {!openSteps.length && <p className="text-sm text-muted-foreground">None.</p>}
        </CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-base">Unsigned checklist items today ({unsigned.length})</CardTitle></CardHeader><CardContent className="space-y-1">
          {unsigned.map((u, i) => <p key={i} className="text-sm">{u.form}: {u.item}</p>)}
          {!unsigned.length && <p className="text-sm text-muted-foreground">None.</p>}
        </CardContent></Card>
      </div>
    </div>
  );

  // ---------- history ----------
  const staffNames = Array.from(new Set(entries.map((e) => e.staff_name).filter(Boolean))) as string[];
  const hist = entries.filter((e) => e.entry_date >= from && e.entry_date <= to && (fForm === "all" || e.form_id === fForm) && (fStaff === "all" || e.staff_name === fStaff));
  const historyTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2 items-end">
        <div><label className="text-xs">From</label><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="text-xs">To</label><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <Select value={fForm} onValueChange={setFForm}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All forms</SelectItem>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.config.name}</SelectItem>)}</SelectContent></Select>
        <Select value={fStaff} onValueChange={setFStaff}><SelectTrigger className="w-48"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">All staff</SelectItem>{staffNames.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent></Select>
      </div>
      <div className="rounded-lg border border-border overflow-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs"><tr>{["Date", "Form", "Entry", "Corrective action", "Staff", ""].map((h) => <th key={h} className="text-left p-2 font-medium">{h}</th>)}</tr></thead>
          <tbody>{hist.map((e) => (
            <tr key={e.id} className={`border-t border-border ${e.out_of_range ? "bg-destructive/5" : ""}`}>
              <td className="p-2 whitespace-nowrap">{e.entry_date}{e.backfilled && <Badge variant="outline" className="ml-1 text-[10px]">backfilled</Badge>}</td>
              <td className="p-2">{byId[e.form_id]?.config.name}</td>
              <td className="p-2">{entrySummary(e)}{e.edited && " *"}{e.status === "open" && <Badge className="ml-1 text-[10px]">open</Badge>}{e.out_of_range && <Badge variant="destructive" className="ml-1 text-[10px]">out of range</Badge>}</td>
              <td className="p-2 text-xs">{caOf(e)}</td>
              <td className="p-2 text-xs">{e.staff_name}{e.finished_by_name ? ` → ${e.finished_by_name}` : ""}</td>
              <td className="p-2 whitespace-nowrap"><Button size="icon" variant="ghost" onClick={() => setEditEntry(e)}><Pencil className="h-4 w-4" /></Button>
                {e.edited && <Button size="icon" variant="ghost" onClick={async () => { const { data } = await supabase.from("fsl_entry_audit").select("*").eq("entry_id", e.id).order("changed_at"); setAuditFor({ entry: e, rows: data || [] }); }}><ClipboardList className="h-4 w-4" /></Button>}</td>
            </tr>
          ))}</tbody>
        </table>
        {!hist.length && <p className="text-sm text-muted-foreground p-4">No entries in this range.</p>}
      </div>
    </div>
  );

  // ---------- forms & upload ----------
  const [upload, setUpload] = useState<{ file: File; sheets: { name: string; cfg: FormConfig | null; include: boolean; status: string }[]; path?: string } | null>(null);
  const startUpload = async (file: File) => {
    const wb = await loadWorkbook(await file.arrayBuffer());
    const sheets = wb.worksheets.map((w) => ({ name: w.name, cfg: null as FormConfig | null, include: true, status: "Reading with AI…" }));
    setUpload({ file, sheets });
    const path = await uploadTemplate(bid!, file.name, await file.arrayBuffer());
    setUpload((u) => u && { ...u, path });
    await Promise.all(wb.worksheets.map(async (w, i) => {
      const { data, error } = await supabase.functions.invoke("fsl-ai-parse", { body: { businessId: bid, sheetName: w.name, gridText: gridToText(sheetGrid(w, 120, 30)) } });
      setUpload((u) => { if (!u) return u; const s = [...u.sheets]; s[i] = error || (data as any)?.error ? { ...s[i], status: `Couldn't read: ${(data as any)?.error || error?.message}`, include: false } : { ...s[i], cfg: normalize(data as any, w.name), status: "Ready" }; return { ...u, sheets: s }; });
    }));
  };
  const normalize = (c: any, sheet: string): FormConfig => ({
    name: c.name || sheet, title: c.title || sheet, code: c.code || "", form_type: c.form_type || "event_log", period: c.period || (c.form_type === "weekly_checklist" ? "weekly" : "monthly"),
    headers: c.headers || [], sections: c.sections || [], sectionAttrs: c.sectionAttrs || [], checks: c.checks || [], fields: c.fields || [], limitField: c.limitField,
    corrective: c.corrective || null, exception: c.exception || null, instructions: c.instructions || "", openAlertHours: c.openAlertHours ?? null,
    alerts: { outOfRange: true, overdue: true, openTooLong: true }, excel: { ...(c.excel || {}), sheet },
  });
  const saveUpload = async () => {
    if (!upload?.path) return;
    const pick = upload.sheets.filter((s) => s.include && s.cfg);
    const rows = pick.map((s, i) => ({ business_id: bid!, name: s.cfg!.name, form_type: s.cfg!.form_type, sort_order: forms.length + i, config: s.cfg as any, template_path: upload.path }));
    const { data, error } = await supabase.from("fsl_forms").insert(rows).select("*");
    if (error) { toast.error(error.message); return; }
    await supabase.from("fsl_form_versions").insert((data || []).map((f) => ({ form_id: f.id, business_id: bid!, version: 1, config: f.config, template_path: f.template_path, note: `Uploaded from ${upload.file.name}` })));
    toast.success(`${rows.length} form${rows.length === 1 ? "" : "s"} added`); setUpload(null); load();
  };
  const [attach, setAttach] = useState<File | null>(null);
  const attachToExisting = async (file: File) => {
    // Link an uploaded workbook's sheets to existing forms with the same name (e.g. HACCP_Forms.xlsx for the starting forms)
    const wb = await loadWorkbook(await file.arrayBuffer());
    const path = await uploadTemplate(bid!, file.name, await file.arrayBuffer());
    let n = 0;
    for (const f of forms) {
      const ws = wb.worksheets.find((w) => w.name.trim().toLowerCase() === f.config.name.trim().toLowerCase() || w.name.trim().toLowerCase() === (f.config.excel?.sheet || "").toLowerCase());
      if (!ws) continue;
      const config = { ...f.config, excel: { ...(f.config.excel || {}), sheet: ws.name } };
      await supabase.from("fsl_forms").update({ template_path: path, config: config as any, version: f.version + 1 }).eq("id", f.id);
      await supabase.from("fsl_form_versions").insert({ form_id: f.id, business_id: bid!, version: f.version + 1, config: config as any, template_path: path, note: `Attached ${file.name}` });
      n++;
    }
    toast.success(n ? `Attached the template to ${n} form${n > 1 ? "s" : ""}. Open each form to link cells.` : "No sheet names matched your forms."); setAttach(null); load();
  };

  const formsTab = (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <label><input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && startUpload(e.target.files[0])} /><span className="inline-flex items-center h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm cursor-pointer"><Upload className="h-4 w-4 mr-2" />Upload Excel workbook (new forms)</span></label>
        <label><input type="file" accept=".xlsx" className="hidden" onChange={(e) => e.target.files?.[0] && attachToExisting(e.target.files[0])} /><span className="inline-flex items-center h-10 px-4 rounded-md border border-input text-sm cursor-pointer"><FileSpreadsheet className="h-4 w-4 mr-2" />Attach workbook to existing forms</span></label>
        <Button variant="outline" onClick={async () => { const c: FormConfig = { name: "New form", title: "NEW FORM", form_type: "event_log", period: "monthly", headers: [{ key: "month", label: "Month", type: "month" }], sections: [], checks: [], fields: [{ key: "date", label: "Date", type: "date", autofill: "date" }], corrective: null, alerts: { outOfRange: true, overdue: true, openTooLong: true } }; const { data } = await supabase.from("fsl_forms").insert({ business_id: bid!, name: c.name, form_type: c.form_type, sort_order: forms.length, config: c as any }).select("*").single(); if (data) { await load(); setEditForm(data as any); } }}><Plus className="h-4 w-4 mr-2" />Blank form</Button>
      </div>
      <div className="grid gap-2">
        {forms.map((f, i) => (
          <div key={f.id} className="flex items-center gap-3 rounded-lg border border-border p-3">
            <div className="flex-1 min-w-0"><p className="font-medium">{f.config.name} {f.config.code && <span className="text-xs text-muted-foreground">{f.config.code}</span>}</p><p className="text-xs text-muted-foreground truncate">{typeLabel[f.form_type]} · {f.config.title} · v{f.version}{f.template_path ? " · Excel linked" : ""}</p></div>
            <Switch checked={f.active} onCheckedChange={async (v) => { await supabase.from("fsl_forms").update({ active: v }).eq("id", f.id); load(); }} />
            <Button size="sm" variant="outline" onClick={() => setEditForm(f)}><Pencil className="h-4 w-4 mr-1" />Edit</Button>
            <Button size="sm" variant="destructive" onClick={async () => {
              if (!window.confirm(`Delete "${f.config.name}"? All its saved entries and history will be permanently deleted. This cannot be undone.`)) return;
              const { error } = await supabase.from("fsl_forms").delete().eq("id", f.id);
              if (error) { toast.error(error.message); return; }
              toast.success("Form deleted");
              load();
            }}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
      </div>
    </div>
  );

  // ---------- export ----------
  const [exp, setExp] = useState({ form: "", period: today.slice(0, 7), week: mondayOf(today) });
  const doExport = async (kind: "xlsx" | "pdf" | "csv") => {
    const f = byId[exp.form]; if (!f) return toast.error("Pick a form");
    const period = f.config.period === "weekly" ? exp.week : exp.period;
    const startDate = f.config.period === "weekly" ? period : `${period}-01`;
    const endDate = f.config.period === "weekly" ? ymd(new Date(new Date(period + "T00:00:00").getTime() + 6 * 864e5)) : `${period}-31`;
    const { data: es } = await supabase.from("fsl_entries").select("*").eq("form_id", f.id).eq("period_key", period).order("created_at");
    const list = (es || []) as any as FslEntry[];
    const hv: Record<string, string> = {};
    for (const h of f.config.headers) hv[h.label] = h.type === "month" ? new Date(`${period}-01T00:00:00`).toLocaleDateString("en-AU", { month: "long", year: "numeric" }) : h.type === "week" ? period : String(list.find((e) => e.header_values?.[h.key])?.header_values?.[h.key] ?? h.default ?? "");
    if (kind === "csv") return exportCsv(f, list, period);
    if (kind === "pdf") return exportPdf(f, list, period, hv);
    const ids = list.filter((e) => e.edited).map((e) => e.id);
    const { data: au } = ids.length ? await supabase.from("fsl_entry_audit").select("*").in("entry_id", ids).order("changed_at") : { data: [] as any[] };
    try { await exportXlsx(f, list, period, hv, (au || []).map((a: any) => { const e = list.find((x) => x.id === a.entry_id)!; return { entry: `${e?.entry_date} ${entrySummary(e).slice(0, 60)}`, field: f.config.fields.find((x) => x.key === a.field_key)?.label || a.field_key, old: a.old_value || "", new: a.new_value || "", by: a.changed_by, at: new Date(a.changed_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" }), reason: a.reason }; })); }
    catch (e: any) { toast.error(e.message); }
    void startDate; void endDate;
  };
  const expForm = byId[exp.form];
  const exportTab = (
    <Card className="max-w-xl"><CardContent className="p-4 space-y-3">
      <Select value={exp.form} onValueChange={(v) => setExp((p) => ({ ...p, form: v }))}><SelectTrigger><SelectValue placeholder="Choose a form" /></SelectTrigger><SelectContent>{forms.map((f) => <SelectItem key={f.id} value={f.id}>{f.config.name}</SelectItem>)}</SelectContent></Select>
      {expForm?.config.period === "weekly" ? <div><label className="text-xs">Week commencing</label><Input type="date" value={exp.week} onChange={(e) => setExp((p) => ({ ...p, week: mondayOf(e.target.value) }))} /></div>
        : <div><label className="text-xs">Month</label><Input type="month" value={exp.period} onChange={(e) => setExp((p) => ({ ...p, period: e.target.value }))} /></div>}
      <div className="flex flex-wrap gap-2">
        <Button onClick={() => doExport("xlsx")}><FileSpreadsheet className="h-4 w-4 mr-2" />Excel</Button>
        <Button variant="outline" onClick={() => doExport("pdf")}><FileText className="h-4 w-4 mr-2" />PDF</Button>
        <Button variant="outline" onClick={() => doExport("csv")}><FileDown className="h-4 w-4 mr-2" />CSV</Button>
      </div>
      <p className="text-xs text-muted-foreground">Excel fills your uploaded paper template when its cells are linked; otherwise a clean table is produced. Edited entries are marked * and an Audit sheet lists every change.</p>
    </CardContent></Card>
  );

  // ---------- settings ----------
  const [settings, setSettings] = useState<{ supervisor_employee_ids: string[]; alert_emails: string[] }>({ supervisor_employee_ids: [], alert_emails: [] });
  const [employees, setEmployees] = useState<{ id: string; name: string; department: string | null }[]>([]);
  useEffect(() => {
    if (!bid) return;
    supabase.from("fsl_settings").select("*").eq("business_id", bid).maybeSingle().then(({ data }) => data && setSettings({ supervisor_employee_ids: data.supervisor_employee_ids || [], alert_emails: data.alert_emails || [] }));
    supabase.from("employees").select("id, name, department").eq("business_id", bid).eq("active", true).order("name").then(({ data }) => setEmployees((data || []) as any));
  }, [bid]);
  const logsUrl = `${window.location.origin.includes("localhost") || window.location.origin.includes("preview") ? window.location.origin : "https://omnexclock.lovable.app"}/logs?b=${businessCode}`;
  const poster = async () => {
    const qr = await QRCode.toDataURL(logsUrl, { width: 900, margin: 1 });
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    doc.setFont("helvetica", "bold"); doc.setFontSize(30); doc.text("Scan to complete", 105, 40, { align: "center" }); doc.text("food safety logs", 105, 54, { align: "center" });
    doc.addImage(qr, "PNG", 35, 70, 140, 140);
    doc.setFont("helvetica", "normal"); doc.setFontSize(14); doc.text("Sign in with your staff PIN", 105, 225, { align: "center" });
    doc.setFontSize(11); doc.text(business?.name || "", 105, 240, { align: "center" }); doc.setFontSize(9); doc.text(logsUrl, 105, 250, { align: "center" });
    doc.save("Food safety logs QR poster.pdf");
  };
  const settingsTab = (
    <div className="grid lg:grid-cols-2 gap-4">
      <Card><CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><QrCode className="h-4 w-4" />Staff QR code</CardTitle></CardHeader><CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">One QR code for all forms. Staff scan it and sign in with their staff PIN.</p>
        <p className="text-xs font-mono break-all">{logsUrl}</p>
        <div className="flex gap-2"><Button onClick={poster}><Download className="h-4 w-4 mr-2" />Download A4 poster</Button><Button variant="outline" onClick={() => window.open(logsUrl, "_blank")}>Open staff page</Button></div>
      </CardContent></Card>
      <Card><CardHeader className="pb-2"><CardTitle className="text-base">Alert emails (all forms)</CardTitle></CardHeader><CardContent className="space-y-3">
        <Input placeholder="manager@example.com, chef@example.com" value={settings.alert_emails.join(", ")} onChange={(e) => setSettings((s) => ({ ...s, alert_emails: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) }))} />
        <p className="text-xs text-muted-foreground">Admins also get in-app notifications. Each form can add its own emails and switch alert types in the Form Editor.</p>
      </CardContent></Card>
      <Card className="lg:col-span-2"><CardHeader className="pb-2"><CardTitle className="text-base">Supervisors</CardTitle></CardHeader><CardContent>
        <p className="text-sm text-muted-foreground mb-3">Supervisors can fill in forms and edit saved entries (with a reason).</p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-72 overflow-auto">{employees.map((e) => (
          <label key={e.id} className="flex items-center gap-2 text-sm"><Checkbox checked={settings.supervisor_employee_ids.includes(e.id)} onCheckedChange={(v) => setSettings((s) => ({ ...s, supervisor_employee_ids: v ? [...s.supervisor_employee_ids, e.id] : s.supervisor_employee_ids.filter((x) => x !== e.id) }))} />{e.name}<span className="text-xs text-muted-foreground">{e.department}</span></label>
        ))}</div>
      </CardContent></Card>
      <div className="lg:col-span-2"><Button onClick={async () => { const { error } = await supabase.from("fsl_settings").upsert({ business_id: bid!, ...settings, updated_at: new Date().toISOString() }); error ? toast.error(error.message) : toast.success("Settings saved"); }}>Save settings</Button></div>
    </div>
  );

  if (editForm) return <FormEditor form={editForm} onClose={() => setEditForm(null)} onSaved={async () => { await load(); const { data } = await supabase.from("fsl_forms").select("*").eq("id", editForm.id).single(); if (data) setEditForm(data as any); }} />;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3"><ShieldCheck className="h-6 w-6 text-primary" /><div><h1 className="text-xl font-semibold">Food Safety Logs</h1><p className="text-xs text-muted-foreground">HACCP records · {new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" })}</p></div></div>
      {loading && !forms.length ? <p className="text-sm text-muted-foreground">Loading…</p> : (
        <Tabs defaultValue="today">
          <TabsList className="flex flex-wrap h-auto"><TabsTrigger value="today">Today</TabsTrigger><TabsTrigger value="history">History</TabsTrigger><TabsTrigger value="forms">Forms</TabsTrigger><TabsTrigger value="export">Export</TabsTrigger><TabsTrigger value="settings">Settings</TabsTrigger></TabsList>
          <TabsContent value="today">{todayTab}</TabsContent>
          <TabsContent value="history">{historyTab}</TabsContent>
          <TabsContent value="forms">{formsTab}</TabsContent>
          <TabsContent value="export">{exportTab}</TabsContent>
          <TabsContent value="settings">{settingsTab}</TabsContent>
        </Tabs>
      )}

      <Dialog open={!!backfill} onOpenChange={(o) => !o && setBackfill(null)}>
        <DialogContent className="max-w-md max-h-[90dvh] overflow-y-auto">
          {backfill && <>
            <div className="flex items-center gap-2 mb-2"><label className="text-xs">Date</label><Input type="date" max={today} value={backfill.date} onChange={(e) => setBackfill({ ...backfill, date: e.target.value })} />{backfill.date !== today && <Badge variant="outline">Backfill — flagged</Badge>}</div>
            <FormRunner key={backfill.date} form={backfill.form} entries={entries} date={backfill.date} staffName={`${user?.email || "Admin"} (admin)`} onSave={adminSave} onFinish={adminFinish} onEdit={setEditEntry} onBack={() => setBackfill(null)} />
          </>}
        </DialogContent>
      </Dialog>

      <Dialog open={!!editEntry} onOpenChange={(o) => !o && setEditEntry(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit entry</DialogTitle></DialogHeader>
          {editEntry && byId[editEntry.form_id] && <EditEntryForm form={byId[editEntry.form_id]} entry={editEntry} onCancel={() => setEditEntry(null)} onSubmit={(v, oor, r) => saveEdit(editEntry, v, oor, r)} />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!auditFor} onOpenChange={(o) => !o && setAuditFor(null)}>
        <DialogContent><DialogHeader><DialogTitle>Change history</DialogTitle></DialogHeader>
          <div className="space-y-2 max-h-[60vh] overflow-auto">{auditFor?.rows.map((a) => <div key={a.id} className="text-sm border-b border-border pb-2"><p><span className="font-medium">{byId[auditFor.entry.form_id]?.config.fields.find((f) => f.key === a.field_key)?.label || a.field_key}</span>: “{a.old_value}” → “{a.new_value}”</p><p className="text-xs text-muted-foreground">{a.changed_by} · {new Date(a.changed_at).toLocaleString("en-AU", { timeZone: "Australia/Sydney" })} · {a.reason}</p></div>)}</div>
        </DialogContent>
      </Dialog>

      <Dialog open={!!upload} onOpenChange={(o) => !o && setUpload(null)}>
        <DialogContent className="max-w-2xl max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>New forms from {upload?.file.name}</DialogTitle></DialogHeader>
          <p className="text-sm text-muted-foreground">Each sheet becomes one form. Check the suggestions — you can fine-tune everything in the Form Editor after saving.</p>
          <div className="space-y-3">{upload?.sheets.map((s, i) => (
            <div key={s.name} className="rounded-lg border border-border p-3 space-y-2">
              <div className="flex items-center gap-2"><Checkbox checked={s.include} disabled={!s.cfg} onCheckedChange={(v) => setUpload((u) => u && { ...u, sheets: u.sheets.map((x, j) => (j === i ? { ...x, include: !!v } : x)) })} /><p className="font-medium">{s.name}</p><span className="text-xs text-muted-foreground ml-auto">{s.status}</span></div>
              {s.cfg && <div className="grid sm:grid-cols-2 gap-2">
                <Input value={s.cfg.name} onChange={(e) => setUpload((u) => u && { ...u, sheets: u.sheets.map((x, j) => (j === i ? { ...x, cfg: { ...x.cfg!, name: e.target.value } } : x)) })} />
                <Select value={s.cfg.form_type} onValueChange={(v: any) => setUpload((u) => u && { ...u, sheets: u.sheets.map((x, j) => (j === i ? { ...x, cfg: { ...x.cfg!, form_type: v, period: v === "weekly_checklist" ? "weekly" : "monthly" } } : x)) })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{Object.entries(typeLabel).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent></Select>
                <p className="text-xs text-muted-foreground sm:col-span-2">{s.cfg.sections.length} sections · {s.cfg.checks.length} checks · {s.cfg.fields.length} fields: {s.cfg.fields.map((f) => f.label).join(", ")}</p>
              </div>}
            </div>
          ))}</div>
          <DialogFooter><Button variant="ghost" onClick={() => setUpload(null)}>Cancel</Button><Button disabled={!upload?.path || !upload.sheets.some((s) => s.include && s.cfg)} onClick={saveUpload}>Save forms</Button></DialogFooter>
        </DialogContent>
      </Dialog>
      {attach && null}
    </div>
  );
}
