import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Columns3, FileSpreadsheet, FileText, Loader2, Save, Trash2 } from "lucide-react";
import type { OpsData, Range } from "@/lib/operationsData";
import { DATASETS, GROUPS, type Col, type Ctx, type Dataset, type Row } from "./reportDatasets";

const db = supabase as any;
type Selection = Record<string, string[]>; // dataset key -> chosen column keys
type Template = { id: string; name: string; config: { sections: Selection } };

const money = (v: any) => `$${(Number(v) || 0).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (s: string) => (s ? new Date(s.slice(0, 10) + "T12:00:00Z").toLocaleDateString("en-AU", { day: "2-digit", month: "short", year: "numeric" }) : "");
const show = (c: Col, v: any) => (v == null || v === "" ? "" : c.type === "money" ? money(v) : c.type === "date" ? fmtDate(String(v)) : c.type === "num" ? (Number(v) || 0).toLocaleString("en-AU", { maximumFractionDigits: 2 }) : String(v));
const showSummary = (label: string, v: string | number) =>
  typeof v === "number" && /value|revenue|cost|received|total|amount|deposit/i.test(label) && !/^(deposits paid|bookings)/i.test(label) ? money(v) : typeof v === "number" ? v.toLocaleString("en-AU", { maximumFractionDigits: 2 }) : v;

export default function ReportBuilder({ businessId, businessName, range, ops }: { businessId: string; businessName: string; range: Range; ops: OpsData | null }) {
  const { toast } = useToast();
  const [sel, setSel] = useState<Selection>({});
  const [templates, setTemplates] = useState<Template[]>([]);
  const [tplId, setTplId] = useState<string>("");
  const [tplName, setTplName] = useState("");
  const [busy, setBusy] = useState<"" | "xlsx" | "pdf">("");

  const loadTemplates = async () => {
    const { data } = await db.from("ops_report_templates").select("id,name,config").eq("business_id", businessId).order("name");
    setTemplates(data || []);
  };
  useEffect(() => { loadTemplates(); }, [businessId]);

  const chosen = useMemo(() => DATASETS.filter(d => sel[d.key]?.length), [sel]);
  const toggleSet = (d: Dataset, on: boolean) => setSel(s => { const n = { ...s }; if (on) n[d.key] = d.columns.map(c => c.key); else delete n[d.key]; return n; });
  const toggleCol = (d: Dataset, key: string, on: boolean) => setSel(s => {
    const cur = s[d.key] || [];
    const next = on ? d.columns.map(c => c.key).filter(k => k === key || cur.includes(k)) : cur.filter(k => k !== key);
    const n = { ...s }; if (next.length) n[d.key] = next; else delete n[d.key]; return n;
  });
  const toggleGroup = (g: string, on: boolean) => DATASETS.filter(d => d.group === g).forEach(d => toggleSet(d, on));

  const applyTemplate = (id: string) => {
    setTplId(id);
    const t = templates.find(x => x.id === id);
    if (t) { setSel(t.config?.sections || {}); setTplName(t.name); }
  };
  const saveTemplate = async () => {
    const name = tplName.trim();
    if (!name || !chosen.length) return toast({ title: "Name the template and pick at least one section", variant: "destructive" });
    const existing = templates.find(t => t.name.toLowerCase() === name.toLowerCase());
    const q = existing
      ? db.from("ops_report_templates").update({ name, config: { sections: sel } }).eq("id", existing.id).select().single()
      : db.from("ops_report_templates").insert({ business_id: businessId, name, config: { sections: sel } }).select().single();
    const { data, error } = await q;
    if (error) return toast({ title: "Could not save template", description: error.message, variant: "destructive" });
    await loadTemplates(); setTplId(data.id);
    toast({ title: existing ? "Template updated" : "Template saved" });
  };
  const deleteTemplate = async () => {
    if (!tplId || !confirm("Delete this template?")) return;
    await db.from("ops_report_templates").delete().eq("id", tplId);
    setTplId(""); setTplName(""); loadTemplates();
  };

  const collect = async () => {
    let empCache: Promise<Row[]> | null = null;
    const ctx: Ctx = {
      bid: businessId, range, ops,
      employees: () => (empCache ||= (async () => {
        const { data, error } = await db.from("employees").select("id,name,department,job_title,email,phone,pay_rate,admin_hourly_rate,active").eq("business_id", businessId).order("name");
        if (error) throw error; return data || [];
      })()),
    };
    return Promise.all(chosen.map(async d => {
      const rows = await d.load(ctx);
      const cols = d.columns.filter(c => sel[d.key].includes(c.key));
      return { d, cols, rows, summary: d.summary(rows) };
    }));
  };

  const fileBase = `Report_${businessName.replace(/[^\w]+/g, "_")}_${range.from}_${range.to}`;

  const exportXlsx = async () => {
    setBusy("xlsx");
    try {
      const secs = await collect();
      const wb = XLSX.utils.book_new();
      const cover: any[][] = [[`${businessName} — Operations report`], [`Period: ${fmtDate(range.from)} to ${fmtDate(range.to)}`], [`Generated: ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}`], [], ["Section", "Records"]];
      secs.forEach(s => cover.push([s.d.label, s.rows.length]));
      const cs = XLSX.utils.aoa_to_sheet(cover); cs["!cols"] = [{ wch: 36 }, { wch: 12 }];
      XLSX.utils.book_append_sheet(wb, cs, "Contents");
      const used = new Set<string>();
      secs.forEach(s => {
        const aoa: any[][] = [[s.d.label], [`${fmtDate(range.from)} to ${fmtDate(range.to)}`], [], ["Summary"], ...s.summary.map(([k, v]) => [k, v]), [], s.cols.map(c => c.label)];
        const headerRow = aoa.length; // 1-based index of header
        s.rows.forEach(r => aoa.push(s.cols.map(c => {
          const v = r[c.key];
          if (c.type === "money" || c.type === "num") return v == null || v === "" ? null : Number(v) || 0;
          return v == null ? "" : String(v);
        })));
        if (!s.rows.length) aoa.push(["No records for this period"]);
        else {
          // formula totals for money columns
          const last = aoa.length;
          aoa.push(s.cols.map((c, i) => i === 0 ? "Total" : c.type === "money" ? { f: `SUM(${XLSX.utils.encode_col(i)}${headerRow + 1}:${XLSX.utils.encode_col(i)}${last})` } : ""));
        }
        const ws = XLSX.utils.aoa_to_sheet(aoa);
        s.cols.forEach((c, i) => {
          if (c.type !== "money") return;
          for (let r = headerRow; r < aoa.length; r++) { const cell = ws[XLSX.utils.encode_cell({ r, c: i })]; if (cell) cell.z = '$#,##0.00;($#,##0.00);"-"'; }
        });
        ws["!cols"] = s.cols.map((c, i) => ({ wch: Math.min(50, Math.max(c.label.length + 2, i === 0 ? 30 : 12, ...s.rows.slice(0, 200).map(r => String(r[c.key] ?? "").length + 2))) }));
        let name = s.d.label.replace(/[\\/?*[\]:]/g, "").slice(0, 31);
        while (used.has(name)) name = name.slice(0, 29) + "_" + used.size;
        used.add(name);
        XLSX.utils.book_append_sheet(wb, ws, name);
      });
      XLSX.writeFile(wb, `${fileBase}.xlsx`);
    } catch (e: any) {
      toast({ title: "Report failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(""); }
  };

  const exportPdf = async () => {
    setBusy("pdf");
    try {
      const secs = await collect();
      const doc = new jsPDF({ orientation: "landscape" });
      const W = doc.internal.pageSize.getWidth();
      doc.setFontSize(18); doc.text(`${businessName} — Operations report`, 14, 18);
      doc.setFontSize(10); doc.setTextColor(100);
      doc.text(`Period: ${fmtDate(range.from)} to ${fmtDate(range.to)}   ·   Generated ${new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })}`, 14, 25);
      doc.setTextColor(0);
      autoTable(doc, { startY: 32, head: [["Section", "Records"]], body: secs.map(s => [s.d.label, s.rows.length]), styles: { fontSize: 9 }, headStyles: { fillColor: [40, 40, 40] }, tableWidth: 120 });
      secs.forEach(s => {
        doc.addPage();
        doc.setFontSize(14); doc.text(s.d.label, 14, 16);
        doc.setFontSize(9); doc.setTextColor(100); doc.text(`${s.d.description} · ${fmtDate(range.from)} to ${fmtDate(range.to)}`, 14, 22); doc.setTextColor(0);
        autoTable(doc, { startY: 26, head: [["Summary", ""]], body: s.summary.map(([k, v]) => [k, String(showSummary(k, v))]), styles: { fontSize: 8 }, headStyles: { fillColor: [90, 90, 90] }, tableWidth: 110 });
        const body = s.rows.map(r => s.cols.map(c => show(c, r[c.key])));
        autoTable(doc, {
          startY: ((doc as any).lastAutoTable?.finalY || 30) + 6,
          head: [s.cols.map(c => c.label)],
          body: body.length ? body : [[{ content: "No records for this period", colSpan: s.cols.length }]],
          styles: { fontSize: s.cols.length > 8 ? 6.5 : 7.5, cellPadding: 1.5, overflow: "linebreak" },
          headStyles: { fillColor: [40, 40, 40] },
          columnStyles: Object.fromEntries(s.cols.map((c, i) => [i, c.type === "money" || c.type === "num" ? { halign: "right" } : {}])),
        });
      });
      const pages = doc.getNumberOfPages();
      for (let i = 1; i <= pages; i++) { doc.setPage(i); doc.setFontSize(8); doc.setTextColor(130); doc.text(`Page ${i} of ${pages}`, W - 14, doc.internal.pageSize.getHeight() - 8, { align: "right" }); }
      doc.save(`${fileBase}.pdf`);
    } catch (e: any) {
      toast({ title: "Report failed", description: e?.message || String(e), variant: "destructive" });
    } finally { setBusy(""); }
  };

  return (
    <div className="space-y-4">
      <Card className="border-border/50">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Report builder</CardTitle>
          <p className="text-xs text-muted-foreground">Pick the sections and columns you need. Each section downloads with a summary followed by every record for {fmtDate(range.from)} – {fmtDate(range.to)} (change the dates at the top of the page).</p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Select value={tplId} onValueChange={applyTemplate}>
              <SelectTrigger className="w-[220px] h-9"><SelectValue placeholder={templates.length ? "Load a saved template" : "No saved templates yet"} /></SelectTrigger>
              <SelectContent>{templates.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input className="h-9 w-[200px]" placeholder="Template name" value={tplName} onChange={e => setTplName(e.target.value)} />
            <Button size="sm" variant="outline" className="h-9 gap-1.5" onClick={saveTemplate}><Save className="h-4 w-4" />Save template</Button>
            {tplId && <Button size="sm" variant="ghost" className="h-9 gap-1.5 text-destructive" onClick={deleteTemplate}><Trash2 className="h-4 w-4" />Delete</Button>}
            <div className="flex-1" />
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setSel(Object.fromEntries(DATASETS.map(d => [d.key, d.columns.map(c => c.key)])))}>Select everything</Button>
            <Button size="sm" variant="ghost" className="h-9" onClick={() => setSel({})}>Clear</Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid md:grid-cols-2 gap-4">
        {GROUPS.map(g => {
          const sets = DATASETS.filter(d => d.group === g);
          const allOn = sets.every(d => sel[d.key]?.length);
          return (
            <Card key={g} className="border-border/50">
              <CardHeader className="pb-2 flex-row items-center justify-between space-y-0">
                <CardTitle className="text-sm font-semibold">{g}</CardTitle>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => toggleGroup(g, !allOn)}>{allOn ? "Clear group" : "Select group"}</Button>
              </CardHeader>
              <CardContent className="space-y-1">
                {sets.map(d => {
                  const cols = sel[d.key] || [];
                  const on = cols.length > 0;
                  return (
                    <div key={d.key} className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-muted/50">
                      <Checkbox id={`ds-${d.key}`} checked={on} onCheckedChange={v => toggleSet(d, !!v)} />
                      <label htmlFor={`ds-${d.key}`} className="flex-1 min-w-0 cursor-pointer">
                        <span className="block text-sm font-medium text-foreground">{d.label}</span>
                        <span className="block text-[11px] text-muted-foreground truncate">{d.description}</span>
                      </label>
                      {on && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs"><Columns3 className="h-3.5 w-3.5" />{cols.length}/{d.columns.length}</Button>
                          </PopoverTrigger>
                          <PopoverContent align="end" className="w-60 p-2">
                            <p className="text-xs font-medium text-muted-foreground px-1 pb-1">Columns to include</p>
                            {d.columns.map(c => (
                              <label key={c.key} className="flex items-center gap-2 rounded px-1 py-1.5 text-sm hover:bg-muted cursor-pointer">
                                <Checkbox checked={cols.includes(c.key)} onCheckedChange={v => toggleCol(d, c.key, !!v)} />{c.label}
                              </label>
                            ))}
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="sticky bottom-3 z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-card/95 backdrop-blur p-3 shadow-lg">
        <p className="text-sm text-muted-foreground">{chosen.length ? `${chosen.length} section${chosen.length > 1 ? "s" : ""} selected` : "Select at least one section"}</p>
        <div className="flex gap-2">
          <Button size="sm" className="gap-1.5" disabled={!chosen.length || !!busy} onClick={exportXlsx}>{busy === "xlsx" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}Download Excel</Button>
          <Button size="sm" variant="outline" className="gap-1.5" disabled={!chosen.length || !!busy} onClick={exportPdf}>{busy === "pdf" ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileText className="h-4 w-4" />}Download PDF</Button>
        </div>
      </div>
    </div>
  );
}
