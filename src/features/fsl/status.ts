import { FormConfig, dayCode, hm, sydneyNow, todayStr, periodKey } from "./engine";

export interface FslForm { id: string; business_id: string; name: string; form_type: string; active: boolean; sort_order: number; version: number; config: FormConfig; template_path?: string | null }
export interface FslEntry {
  id: string; business_id: string; form_id: string; form_version: number; client_id?: string | null; entry_date: string; period_key: string;
  section_key: string | null; check_key: string | null; header_values: Record<string, any>; field_values: Record<string, any>;
  status: "open" | "complete"; out_of_range: boolean; backfilled: boolean; edited: boolean; staff_name: string | null;
  finished_by_name: string | null; finished_at: string | null; created_at: string; pending?: boolean;
}

export type Status = "Not started" | "In progress" | "Complete" | "Overdue" | "Active";

export interface FormStatus { status: Status; summary: string; done: number; total: number; overdue: { section: string; check: string; due: string }[]; unsigned: string[]; open: FslEntry[] }

export function hoursOpen(e: FslEntry) { return (Date.now() - new Date(e.created_at).getTime()) / 36e5; }

export function formStatus(form: FslForm, entries: FslEntry[], date = todayStr()): FormStatus {
  const cfg = form.config;
  const mine = entries.filter((e) => e.form_id === form.id);
  const today = mine.filter((e) => e.entry_date === date);
  const nowHm = hm(sydneyNow());
  const isToday = date === todayStr();
  const res: FormStatus = { status: "Not started", summary: "", done: 0, total: 0, overdue: [], unsigned: [], open: [] };
  if (cfg.form_type === "daily_grid") {
    res.total = cfg.sections.length * cfg.checks.length;
    for (const s of cfg.sections) for (const c of cfg.checks) {
      const hit = today.some((e) => e.section_key === s.key && e.check_key === c.key);
      if (hit) res.done++;
      else if (c.due && (!isToday || nowHm > c.due)) res.overdue.push({ section: s.label, check: c.label, due: c.due });
    }
    res.summary = `${res.done} of ${res.total} checks`;
    res.status = res.done === res.total && res.total ? "Complete" : res.overdue.length ? "Overdue" : res.done ? "In progress" : "Not started";
  } else if (cfg.form_type === "weekly_checklist") {
    const pk = periodKey(cfg, date); const d = dayCode(date);
    const signed = mine.filter((e) => e.period_key === pk && e.check_key === d);
    res.total = cfg.sections.length;
    for (const s of cfg.sections) { if (signed.some((e) => e.section_key === s.key)) res.done++; else res.unsigned.push(s.label); }
    res.summary = res.total ? `${res.done} of ${res.total} items signed today` : "No items set up yet";
    res.status = !res.total ? "Not started" : res.done === res.total ? "Complete" : res.done ? "In progress" : "Not started";
  } else if (cfg.form_type === "two_step") {
    res.open = mine.filter((e) => e.status === "open");
    const limit = cfg.openAlertHours || 0;
    const tooLong = limit ? res.open.filter((e) => hoursOpen(e) > limit).length : 0;
    res.summary = `${res.open.length} open${tooLong ? ` · ${tooLong} over ${limit}h` : ""} · ${today.length} started today`;
    res.done = today.length;
    res.status = tooLong ? "Overdue" : res.open.length ? "In progress" : today.length ? "Complete" : "Active";
  } else {
    res.done = today.length;
    res.summary = `${today.length} ${today.length === 1 ? "entry" : "entries"} today`;
    res.status = today.length ? "Complete" : "Active";
  }
  return res;
}

export const statusTone: Record<Status, string> = {
  "Not started": "bg-muted text-muted-foreground",
  "In progress": "bg-primary/15 text-primary",
  Complete: "bg-emerald-500/15 text-emerald-500",
  Overdue: "bg-destructive/15 text-destructive",
  Active: "bg-secondary text-secondary-foreground",
};
