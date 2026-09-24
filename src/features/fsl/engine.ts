// Generic, configuration-driven engine for Food Safety Logs.
// Nothing in here knows about any specific form — everything comes from FormConfig.

export type FormType = "daily_grid" | "weekly_checklist" | "event_log" | "two_step";
export type FieldType = "temperature" | "number" | "text" | "date" | "time" | "datetime" | "dropdown" | "yesno" | "photo" | "signature";

export interface Cond { field: string; value: string }
export interface Limit { min?: number | null; max?: number | null }
export interface ConditionalLimit extends Limit { field: string; value: string }

export interface FieldDef {
  key: string;
  label: string;
  type: FieldType;
  required?: boolean;
  autofill?: "date" | "time" | "datetime" | "staff" | null;
  options?: string[];
  allowAdd?: boolean; // dropdown: staff can add a new value (saved list)
  help?: string;
  min?: number | null;
  max?: number | null;
  conditionalLimits?: ConditionalLimit[];
  hiddenWhen?: Cond[];
  computed?: { fn: "min" | "max"; of: string[]; byField?: { field: string; map: Record<string, "min" | "max"> } } | null;
  step?: "start" | "finish"; // two-step forms
}

export interface HeaderDef { key: string; label: string; type: "text" | "dropdown" | "date" | "month" | "week"; options?: string[]; default?: string }
export interface SectionDef { key: string; label: string; min?: number | null; max?: number | null; attrs?: Record<string, string> }
export interface CheckDef { key: string; label: string; due?: string }

export interface FormConfig {
  name: string;
  title: string;
  code?: string;
  form_type: FormType;
  period: "monthly" | "weekly";
  headers: HeaderDef[];
  sections: SectionDef[];
  sectionAttrs?: { key: string; label: string; options?: string[] }[]; // weekly checklist item attributes
  checks: CheckDef[];
  fields: FieldDef[];
  limitField?: string; // field that section limits apply to
  exception?: { label: string; noteLabel: string; appliesTo: string; neverForField?: string; neverFor: string[] } | null;
  corrective?: { field: string; triggers: Cond[]; defaultInRange?: string } | null;
  instructions?: string;
  openAlertHours?: number | null;
  alertEmails?: string[];
  alerts?: { outOfRange: boolean; overdue: boolean; openTooLong: boolean };
  excel?: ExcelMap;
}

export interface ExcelMap {
  sheet?: string;
  headerCells?: Record<string, string>; // header key -> "B3"
  startRow?: number;                    // first data row
  columns?: Record<string, string>;     // key -> column letter. Daily grid: `${section}|${check}|${field}`; weekly: `attr:${k}` / `day:MON`; event: field key
  titleCell?: string;
}

export const DAYS = ["MON", "TUE", "WED", "THU", "FRI", "SAT", "SUN"];

export type Values = Record<string, any>;

// ---------- Sydney date helpers ----------
export function sydneyNow(): Date {
  const s = new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" });
  return new Date(s);
}
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
export const todayStr = () => ymd(sydneyNow());
export const hm = (d: Date) => `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
export function mondayOf(dateStr: string) {
  const d = new Date(dateStr + "T00:00:00");
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return ymd(d);
}
export function dayCode(dateStr: string) { return DAYS[(new Date(dateStr + "T00:00:00").getDay() + 6) % 7]; }
export function periodKey(cfg: Pick<FormConfig, "period">, dateStr: string) {
  return cfg.period === "weekly" ? mondayOf(dateStr) : dateStr.slice(0, 7);
}
export function to12(t?: string) {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  if (Number.isNaN(h)) return t;
  return `${((h + 11) % 12) + 1}:${String(m || 0).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
}

// ---------- engine ----------
const num = (v: any) => (v === "" || v === null || v === undefined || Number.isNaN(Number(v)) ? null : Number(v));

export function isHidden(f: FieldDef, v: Values) {
  return (f.hiddenWhen || []).some((c) => String(v[c.field] ?? "") === c.value);
}

export function computeValues(cfg: FormConfig, v: Values): Values {
  const out = { ...v };
  for (const f of cfg.fields) {
    if (!f.computed) continue;
    const nums = f.computed.of.map((k) => num(out[k])).filter((x): x is number => x !== null);
    if (!nums.length) { out[f.key] = ""; continue; }
    let fn = f.computed.fn;
    if (f.computed.byField) { const sel = String(out[f.computed.byField.field] ?? ""); fn = f.computed.byField.map[sel] || fn; }
    out[f.key] = fn === "min" ? Math.min(...nums) : Math.max(...nums);
  }
  return out;
}

export function limitFor(cfg: FormConfig, f: FieldDef, v: Values, section?: SectionDef | null): Limit | null {
  for (const c of f.conditionalLimits || []) if (String(v[c.field] ?? "") === c.value) return c;
  if (section && cfg.limitField === f.key && (section.min != null || section.max != null)) return { min: section.min, max: section.max };
  if (f.min != null || f.max != null) return { min: f.min, max: f.max };
  return null;
}

export function limitText(l: Limit | null) {
  if (!l) return "";
  if (l.min != null && l.max != null) return `${l.min} to ${l.max}°C`;
  if (l.max != null) return `max ${l.max}°C`;
  if (l.min != null) return `min ${l.min}°C`;
  return "";
}

export interface Evaluation {
  outOfRange: boolean;
  exceptionApplied: boolean;
  fieldIssues: Record<string, string>;
  correctiveRequired: boolean;
  missing: string[];
  errors: string[];
}

export const EXC_KEY = "__exception";
export const EXC_NOTE = "__exception_note";

export function evaluate(cfg: FormConfig, raw: Values, opts: { section?: SectionDef | null; step?: "start" | "finish" | "all" } = {}): Evaluation {
  const v = computeValues(cfg, raw);
  const step = opts.step || "all";
  const fields = cfg.fields.filter((f) => step === "all" || (f.step || "start") === step);
  const fieldIssues: Record<string, string> = {};
  const missing: string[] = [];
  const errors: string[] = [];
  let out = false;
  const exc = cfg.exception;
  const excOn = !!(exc && raw[EXC_KEY]);
  let excApplied = false;
  for (const f of fields) {
    if (isHidden(f, v)) continue;
    const val = v[f.key];
    if (f.required && f.key !== cfg.corrective?.field && (val === undefined || val === null || val === "") && !f.autofill) missing.push(f.label);
    if (f.type === "temperature" || f.type === "number") {
      const n = num(val);
      const l = limitFor(cfg, f, v, opts.section);
      if (n !== null && l) {
        const bad = (l.min != null && n < l.min) || (l.max != null && n > l.max);
        if (bad) {
          const below = l.min != null && n < l.min;
          if (excOn && exc && exc.appliesTo === f.key && below) { excApplied = true; fieldIssues[f.key] = `Below limit — exception: ${exc.label}`; }
          else { out = true; fieldIssues[f.key] = `Out of range (${limitText(l)})`; }
        }
      }
    }
  }
  if (excOn && exc) {
    const item = String(v[exc.neverForField || ""] ?? "").toLowerCase();
    if (exc.neverFor.some((w) => w && item.includes(w.toLowerCase()))) { errors.push(`The exception can never apply to ${exc.neverFor.join(", ")}.`); }
    if (excApplied && !String(raw[EXC_NOTE] || "").trim()) missing.push(exc.noteLabel);
  }
  const triggered = (cfg.corrective?.triggers || []).some((t) => String(v[t.field] ?? "") === t.value);
  const correctiveRequired = !!cfg.corrective && (out || triggered);
  if (correctiveRequired) {
    const ca = String(v[cfg.corrective!.field] ?? "").trim();
    const inFields = fields.some((f) => f.key === cfg.corrective!.field);
    if (inFields && (!ca || ca.toUpperCase() === (cfg.corrective!.defaultInRange || "").toUpperCase())) missing.push("Corrective action");
  }
  return { outOfRange: out || triggered, exceptionApplied: excApplied, fieldIssues, correctiveRequired, missing, errors };
}

export function autofill(cfg: FormConfig, staff: string, step: "start" | "finish" | "all" = "all"): Values {
  const now = sydneyNow();
  const v: Values = {};
  for (const f of cfg.fields) {
    if (step !== "all" && (f.step || "start") !== step) continue;
    if (f.autofill === "date") v[f.key] = ymd(now);
    if (f.autofill === "time") v[f.key] = hm(now);
    if (f.autofill === "datetime") v[f.key] = `${ymd(now)}T${hm(now)}`;
    if (f.autofill === "staff" || f.type === "signature") v[f.key] = staff;
  }
  return v;
}

export function finalizeValues(cfg: FormConfig, raw: Values, ev: Evaluation): Values {
  const v = computeValues(cfg, raw);
  if (cfg.corrective && !ev.correctiveRequired && cfg.corrective.defaultInRange && !String(v[cfg.corrective.field] ?? "").trim()) {
    v[cfg.corrective.field] = cfg.corrective.defaultInRange;
  }
  return v;
}

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "") || `k${Math.random().toString(36).slice(2, 6)}`;

export function formatValue(f: FieldDef | undefined, val: any) {
  if (val === undefined || val === null || val === "") return "";
  if (!f) return String(val);
  if (f.type === "temperature") return `${val}°C`;
  if (f.type === "time") return to12(String(val));
  if (f.type === "datetime") { const [d, t] = String(val).split("T"); return `${d} ${to12(t)}`; }
  if (f.type === "yesno") return val === true || val === "yes" ? "Yes" : "No";
  if (f.type === "photo") return "[photo]";
  return String(val);
}
