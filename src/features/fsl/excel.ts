import ExcelJS from "exceljs";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";
import { supabase } from "@/integrations/supabase/client";
import { DAYS, FormConfig, formatValue } from "./engine";
import type { FslEntry, FslForm } from "./status";

export const BUCKET = "fsl-templates";

export const colLetter = (n: number) => { let s = ""; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
export const colNumber = (s: string) => s.toUpperCase().split("").reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0);
export const splitAddr = (a: string) => { const m = /^([A-Z]+)(\d+)$/i.exec(a.trim()); return m ? { col: m[1].toUpperCase(), row: Number(m[2]) } : null; };

export interface Grid { rows: string[][]; merges: { r1: number; c1: number; r2: number; c2: number }[]; nRows: number; nCols: number }

export function sheetGrid(ws: ExcelJS.Worksheet, maxRows = 80, maxCols = 30): Grid {
  const nRows = Math.min(Math.max(ws.rowCount, 1), maxRows);
  const nCols = Math.min(Math.max(ws.columnCount, 1), maxCols);
  const rows: string[][] = [];
  for (let r = 1; r <= nRows; r++) { const row: string[] = []; for (let c = 1; c <= nCols; c++) { const cell = ws.getCell(r, c); row.push(cell.isMerged && cell.master.address !== cell.address ? "" : String(cell.text ?? "")); } rows.push(row); }
  const merges = ((ws.model as any).merges || []).map((m: string) => {
    const [a, b] = m.split(":"); const A = splitAddr(a)!, B = splitAddr(b || a)!;
    return { r1: A.row, c1: colNumber(A.col), r2: B.row, c2: colNumber(B.col) };
  });
  return { rows, merges, nRows, nCols };
}

export function gridToText(g: Grid) {
  return g.rows.map((r, i) => r.map((v, j) => (v ? `${colLetter(j + 1)}${i + 1}=${v.replace(/\s+/g, " ").slice(0, 120)}` : "")).filter(Boolean).join(" | ")).filter(Boolean).join("\n")
    + (g.merges.length ? `\nMERGED: ${g.merges.map((m) => `${colLetter(m.c1)}${m.r1}:${colLetter(m.c2)}${m.r2}`).join(", ")}` : "");
}

export async function loadWorkbook(buf: ArrayBuffer) { const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buf); return wb; }

export async function downloadTemplate(path: string) {
  const { data, error } = await supabase.storage.from(BUCKET).download(path);
  if (error) throw error;
  return await data.arrayBuffer();
}

export async function uploadTemplate(businessId: string, name: string, buf: ArrayBuffer | Blob) {
  const path = `${businessId}/${Date.now()}-${name.replace(/[^a-z0-9.]+/gi, "_")}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, buf instanceof Blob ? buf : new Blob([buf]), { contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  if (error) throw error;
  return path;
}

export function saveBlob(blob: Blob, filename: string) {
  const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = filename; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

// ---------------- Tabular view (used for CSV, PDF and templateless Excel) ----------------
export interface Table { head: string[]; body: string[][] }

const fv = (cfg: FormConfig, e: FslEntry, key: string) => { const f = cfg.fields.find((x) => x.key === key); return formatValue(f, e.field_values[key]) + (e.edited ? "*" : ""); };

export function toTable(form: FslForm, entries: FslEntry[], period: string): Table {
  const cfg = form.config;
  const mine = entries.filter((e) => e.form_id === form.id && e.period_key === period);
  if (cfg.form_type === "daily_grid") {
    const [y, m] = period.split("-").map(Number); const days = new Date(y, m, 0).getDate();
    const tf = cfg.limitField || cfg.fields[0]?.key;
    const head = ["Date", ...cfg.sections.flatMap((s) => cfg.checks.map((c) => `${s.label} ${c.label}`)), "Signature & corrective actions"];
    const body: string[][] = [];
    for (let d = 1; d <= days; d++) {
      const ds = `${period}-${String(d).padStart(2, "0")}`; const de = mine.filter((e) => e.entry_date === ds);
      const cells = cfg.sections.flatMap((s) => cfg.checks.map((c) => { const e = de.find((x) => x.section_key === s.key && x.check_key === c.key); return e ? fv(cfg, e, tf) : ""; }));
      const notes = de.map((e) => { const others = cfg.fields.filter((f) => f.key !== tf).map((f) => e.field_values[f.key]).filter(Boolean).join(" "); return `${e.staff_name}${others ? `: ${others}` : ""}`; });
      body.push([ds, ...cells, Array.from(new Set(notes)).join("; ")]);
    }
    return { head, body };
  }
  if (cfg.form_type === "weekly_checklist") {
    const head = ["Item requiring cleaning", ...(cfg.sectionAttrs || []).map((a) => a.label), ...DAYS];
    const body = cfg.sections.map((s) => [s.label, ...(cfg.sectionAttrs || []).map((a) => s.attrs?.[a.key] || ""), ...DAYS.map((d) => { const e = mine.find((x) => x.section_key === s.key && x.check_key === d); return e ? `${e.staff_name}${e.edited ? "*" : ""}` : ""; })]);
    return { head, body };
  }
  const fields = cfg.fields.filter((f) => f.type !== "photo");
  const head = [...fields.map((f) => f.label), ...(cfg.form_type === "two_step" ? ["Status"] : [])];
  const body = mine.slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map((e) => [...fields.map((f) => fv(cfg, e, f.key)), ...(cfg.form_type === "two_step" ? [e.status === "open" ? "OPEN" : "Finished"] : [])]);
  return { head, body };
}

export function exportCsv(form: FslForm, entries: FslEntry[], period: string) {
  const t = toTable(form, entries, period);
  const esc = (s: string) => `"${String(s ?? "").replace(/"/g, '""')}"`;
  const csv = [t.head, ...t.body].map((r) => r.map(esc).join(",")).join("\n");
  saveBlob(new Blob([csv], { type: "text/csv" }), `${form.config.name} ${period}.csv`);
}

export function exportPdf(form: FslForm, entries: FslEntry[], period: string, headerValues: Record<string, string>) {
  const t = toTable(form, entries, period);
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.text(form.config.title, 148.5, 12, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9);
  doc.text([form.config.code ? `Code: ${form.config.code}` : "", ...Object.entries(headerValues).map(([k, v]) => `${k}: ${v}`)].filter(Boolean).join("     "), 148.5, 18, { align: "center" });
  autoTable(doc, { head: [t.head], body: t.body, startY: 22, styles: { fontSize: t.head.length > 12 ? 6 : 8, cellPadding: 1.2, lineColor: 0, lineWidth: 0.1, textColor: 0 }, headStyles: { fillColor: [230, 230, 230], textColor: 0 }, theme: "grid" });
  const y = (doc as any).lastAutoTable.finalY + 6;
  if (form.config.instructions) { doc.setFontSize(8); doc.text(doc.splitTextToSize(form.config.instructions, 270), 14, Math.min(y, 195)); }
  doc.setFontSize(7); doc.text("* edited entry — see audit log", 14, 205);
  doc.save(`${form.config.name} ${period}.pdf`);
}

// ---------------- Filled Excel export ----------------
export async function exportXlsx(form: FslForm, entries: FslEntry[], period: string, headerValues: Record<string, string>, audit: { entry: string; field: string; old: string; new: string; by: string; at: string; reason: string }[]) {
  const cfg = form.config;
  const map = cfg.excel || {};
  const mine = entries.filter((e) => e.form_id === form.id && e.period_key === period);
  let wb: ExcelJS.Workbook; let ws: ExcelJS.Worksheet;
  const mapped = !!(form.template_path && map.startRow && map.columns && Object.keys(map.columns).length);
  if (form.template_path) {
    wb = await loadWorkbook(await downloadTemplate(form.template_path));
    const keep = (map.sheet && wb.getWorksheet(map.sheet)) || wb.worksheets[0];
    wb.worksheets.filter((w) => w.id !== keep.id).forEach((w) => wb.removeWorksheet(w.id));
    ws = keep;
  } else { wb = new ExcelJS.Workbook(); ws = wb.addWorksheet(cfg.name.slice(0, 31)); }

  if (!mapped) {
    // Templateless or unmapped: write a clean table below the template content
    const t = toTable(form, entries, period);
    const start = form.template_path ? ws.rowCount + 2 : 1;
    if (!form.template_path) { ws.getCell(start, 1).value = cfg.title; ws.getCell(start, 1).font = { bold: true, size: 14 }; }
    const hr = start + (form.template_path ? 0 : 1);
    ws.getCell(hr, 1).value = Object.entries(headerValues).map(([k, v]) => `${k}: ${v}`).join("    ");
    const headRow = ws.getRow(hr + 2); t.head.forEach((h, i) => { const c = headRow.getCell(i + 1); c.value = h; c.font = { bold: true }; c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; });
    t.body.forEach((r, ri) => { const row = ws.getRow(hr + 3 + ri); r.forEach((v, i) => { const c = row.getCell(i + 1); c.value = v; c.border = { top: { style: "thin" }, bottom: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" } }; }); });
    t.head.forEach((_, i) => (ws.getColumn(i + 1).width = i === 0 ? 22 : 14));
  } else {
    for (const [k, addr] of Object.entries(map.headerCells || {})) { const v = headerValues[cfg.headers.find((h) => h.key === k)?.label || k] ?? headerValues[k]; if (v !== undefined && addr) ws.getCell(addr).value = v; }
    const cols = map.columns!; const start = map.startRow!;
    const put = (row: number, key: string, v: string) => { const col = cols[key]; if (col && v !== "") ws.getCell(`${col}${row}`).value = v; };
    if (cfg.form_type === "daily_grid") {
      for (const e of mine) {
        const day = Number(e.entry_date.slice(8, 10)); const row = start + day - 1;
        for (const f of cfg.fields) put(row, `${e.section_key}|${e.check_key}|${f.key}`, fv(cfg, e, f.key));
        for (const f of cfg.fields) put(row, `*|*|${f.key}`, fv(cfg, e, f.key));
      }
    } else if (cfg.form_type === "weekly_checklist") {
      cfg.sections.forEach((s, i) => {
        const row = start + i; put(row, "section", s.label);
        (cfg.sectionAttrs || []).forEach((a) => put(row, `attr:${a.key}`, s.attrs?.[a.key] || ""));
        DAYS.forEach((d) => { const e = mine.find((x) => x.section_key === s.key && x.check_key === d); if (e) put(row, `day:${d}`, `${e.staff_name}${e.edited ? "*" : ""}`); });
      });
    } else {
      const list = mine.slice().sort((a, b) => a.created_at.localeCompare(b.created_at));
      const capacity = Math.max(1, ws.rowCount - start + 1);
      if (list.length > capacity) ws.duplicateRow(start + capacity - 1, list.length - capacity, true);
      list.forEach((e, i) => cfg.fields.forEach((f) => { if (f.type !== "photo") put(start + i, f.key, fv(cfg, e, f.key)); }));
    }
  }

  if (audit.length) {
    const a = wb.addWorksheet("Audit");
    a.addRow(["Entry", "Field", "Old value", "New value", "Changed by", "When", "Reason"]).font = { bold: true };
    audit.forEach((x) => a.addRow([x.entry, x.field, x.old, x.new, x.by, x.at, x.reason]));
    a.columns.forEach((c) => (c.width = 20));
  }
  const buf = await wb.xlsx.writeBuffer();
  saveBlob(new Blob([buf]), `${cfg.name} ${period}.xlsx`);
}
