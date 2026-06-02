import { format } from "date-fns";

/**
 * Centralised export-filename builder used by all admin exports
 * (Timesheets, Rosters, Payroll, Monthly/Weekly Business Reports).
 *
 * Output format:
 *   {BIZ}__{ReportType}[__{Scope}]__{DateRange}.{ext}
 *
 * Sections are separated by double underscores; words inside a section use
 * single hyphens. The result is filesystem-safe across Windows / macOS / Linux.
 *
 * Examples:
 *   PRP__Timesheets__FOH_John__2026-05-26_to_2026-06-01.pdf
 *   PRP__Roster__BOH__2026-05-26_to_2026-06-01.pdf
 *   PRP__Employee-Payroll__2026-05-26_to_2026-06-01.csv
 *   PRP__Weekly-Report__All__2026-05-26_to_2026-06-01.pdf
 *   PRP__Monthly-Report__Custom-5__May-2026.xlsx
 */

const sanitize = (raw: string): string =>
  raw
    .replace(/[^a-zA-Z0-9-_]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");

const toDate = (d: Date | string): Date => (d instanceof Date ? d : new Date(d));

export interface ExportFilenameOptions {
  /** Business short code (preferred). Falls back to sanitized business name. */
  businessCode?: string | null;
  businessName?: string | null;
  /** What is being exported, e.g. "Timesheets", "Roster", "Employee-Payroll". */
  reportType: string;
  /** Filters/scope tokens applied to the export (department, search, tab, etc.). */
  scope?: Array<string | null | undefined>;
  dateFrom?: Date | string | null;
  dateTo?: Date | string | null;
  /** Use instead of dateFrom/dateTo when the export targets a single period (e.g. "May-2026"). */
  periodLabel?: string | null;
  ext: "pdf" | "xlsx" | "csv";
}

export function buildExportFilename(opts: ExportFilenameOptions): string {
  const bizRaw = (opts.businessCode || opts.businessName || "Business").trim();
  const biz = sanitize(bizRaw).toUpperCase();
  const reportType = sanitize(opts.reportType) || "Export";

  const scopeTokens = (opts.scope || [])
    .filter((s): s is string => !!s && s.trim().length > 0)
    .map((s) => sanitize(s))
    .filter((s) => s.length > 0);
  const scopePart = scopeTokens.length ? `__${scopeTokens.join("_")}` : "";

  let datePart = "";
  if (opts.periodLabel) {
    datePart = `__${sanitize(opts.periodLabel)}`;
  } else if (opts.dateFrom && opts.dateTo) {
    const from = format(toDate(opts.dateFrom), "dd-MM-yyyy");
    const to = format(toDate(opts.dateTo), "dd-MM-yyyy");
    datePart = from === to ? `__${from}` : `__${from}_to_${to}`;
  } else if (opts.dateFrom) {
    datePart = `__${format(toDate(opts.dateFrom), "dd-MM-yyyy")}`;
  }

  return `${biz}__${reportType}${scopePart}${datePart}.${opts.ext}`;
}
