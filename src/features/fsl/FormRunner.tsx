import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ArrowLeft, Check, Plus, AlertTriangle, Delete, Camera, Info, Clock, Pencil } from "lucide-react";
import {
  FieldDef, FormConfig, SectionDef, Values, evaluate, autofill, finalizeValues, isHidden, computeValues, limitFor, limitText,
  EXC_KEY, EXC_NOTE, todayStr, periodKey, dayCode, DAYS, formatValue, to12, sydneyNow,
} from "./engine";
import type { FslEntry, FslForm } from "./status";
import { hoursOpen } from "./status";

export interface SavePayload {
  form_id: string; entry_date: string; period_key: string; section_key: string | null; check_key: string | null;
  header_values: Values; field_values: Values; status: "open" | "complete"; out_of_range: boolean; client_id: string;
}

interface RunnerProps {
  form: FslForm;
  entries: FslEntry[];
  staffName: string;
  date?: string; // admin backfill can change this
  onSave: (p: SavePayload) => Promise<void> | void;
  onFinish: (entry: FslEntry, values: Values, outOfRange: boolean) => Promise<void> | void;
  onEdit?: (entry: FslEntry) => void;
  onBack: () => void;
  onAddOption?: (fieldKey: string, value: string) => void;
}

const uid = () => (crypto as any).randomUUID?.() || `${Date.now()}-${Math.random()}`;

// ---------------- Keypad ----------------
function Keypad({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const press = (k: string) => {
    if (k === "⌫") return onChange(value.slice(0, -1));
    if (k === "±") return onChange(value.startsWith("-") ? value.slice(1) : `-${value}`);
    if (k === "." && value.includes(".")) return;
    onChange(value + k);
  };
  return (
    <div className="grid grid-cols-3 gap-2 mt-2">
      {["1", "2", "3", "4", "5", "6", "7", "8", "9", "±", "0", "."].map((k) => (
        <button key={k} type="button" onClick={() => press(k)} className="h-14 rounded-xl bg-secondary text-xl font-semibold active:scale-95 transition">{k === "±" ? "−/+" : k}</button>
      ))}
      <button type="button" onClick={() => press("⌫")} className="col-span-3 h-12 rounded-xl bg-muted flex items-center justify-center active:scale-95"><Delete className="h-5 w-5" /></button>
    </div>
  );
}

async function compress(file: File): Promise<string> {
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); });
  const scale = Math.min(1, 900 / Math.max(img.width, img.height));
  const c = document.createElement("canvas"); c.width = img.width * scale; c.height = img.height * scale;
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.6);
}

// ---------------- Field input ----------------
export function FieldInput({ f, value, onChange, issue, cfg, values, section, onAddOption }: {
  f: FieldDef; value: any; onChange: (v: any) => void; issue?: string; cfg: FormConfig; values: Values; section?: SectionDef | null; onAddOption?: (k: string, v: string) => void;
}) {
  const [adding, setAdding] = useState("");
  const [pad, setPad] = useState(false);
  const lim = limitFor(cfg, f, values, section);
  const label = (
    <div className="flex items-center justify-between gap-2 mb-1.5">
      <label className="text-sm font-medium">{f.label}{f.required && <span className="text-destructive"> *</span>}</label>
      {lim && <span className="text-[11px] text-muted-foreground">{limitText(lim)}</span>}
    </div>
  );
  const help = f.help ? <p className="text-xs text-muted-foreground mt-1">{f.help}</p> : null;
  const err = issue ? <p className="text-xs text-destructive mt-1 flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{issue}</p> : null;
  if (f.computed) return <div>{label}<div className="h-12 rounded-xl border border-border px-3 flex items-center text-lg font-semibold">{value === "" || value == null ? "—" : `${value}°C`}</div><p className="text-xs text-muted-foreground mt-1">Calculated automatically</p>{err}</div>;
  switch (f.type) {
    case "temperature": case "number":
      return (
        <div>{label}
          <button type="button" onClick={() => setPad(!pad)} className={`w-full h-14 rounded-xl border px-4 text-left text-2xl font-semibold ${issue ? "border-destructive text-destructive" : "border-border"}`}>
            {value === "" || value == null ? <span className="text-muted-foreground text-base font-normal">Tap to enter</span> : `${value}${f.type === "temperature" ? "°C" : ""}`}
          </button>
          {pad && <Keypad value={String(value ?? "")} onChange={onChange} />}
          {err}{help}
        </div>
      );
    case "dropdown": {
      const opts = f.options || [];
      return (
        <div>{label}
          <div className="flex flex-wrap gap-2">
            {opts.map((o) => (
              <button key={o} type="button" onClick={() => onChange(o)} className={`min-h-12 px-4 rounded-xl border text-sm font-medium transition ${value === o ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card"}`}>{o}</button>
            ))}
          </div>
          {f.allowAdd && (
            <div className="flex gap-2 mt-2">
              <Input className="h-11" placeholder="Add new…" value={adding} onChange={(e) => setAdding(e.target.value)} />
              <Button type="button" variant="outline" className="h-11" disabled={!adding.trim()} onClick={() => { onAddOption?.(f.key, adding.trim()); onChange(adding.trim()); setAdding(""); }}><Plus className="h-4 w-4" /></Button>
            </div>
          )}
          {err}{help}
        </div>
      );
    }
    case "yesno":
      return <div>{label}<div className="grid grid-cols-2 gap-2">{["yes", "no"].map((o) => <button key={o} type="button" onClick={() => onChange(o)} className={`h-12 rounded-xl border font-medium ${value === o ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{o === "yes" ? "Yes" : "No"}</button>)}</div>{err}{help}</div>;
    case "date": return <div>{label}<Input type="date" className="h-12" value={value || ""} onChange={(e) => onChange(e.target.value)} />{err}{help}</div>;
    case "time": return <div>{label}<Input type="time" className="h-12" value={value || ""} onChange={(e) => onChange(e.target.value)} />{err}{help}</div>;
    case "datetime": return <div>{label}<Input type="datetime-local" className="h-12" value={value || ""} onChange={(e) => onChange(e.target.value)} />{err}{help}</div>;
    case "signature": return <div>{label}<div className="h-12 rounded-xl border border-border px-3 flex items-center gap-2 text-sm"><Check className="h-4 w-4 text-primary" />{value || "—"}</div>{err}</div>;
    case "photo":
      return (
        <div>{label}
          <label className="h-12 rounded-xl border border-dashed border-border flex items-center justify-center gap-2 text-sm cursor-pointer">
            <Camera className="h-4 w-4" />{value ? "Replace photo" : "Take / choose photo"}
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) onChange(await compress(file)); }} />
          </label>
          {value && <img src={value} alt="" className="mt-2 max-h-40 rounded-lg" />}
          {help}
        </div>
      );
    default:
      return <div>{label}<Textarea rows={2} className={issue ? "border-destructive" : ""} value={value || ""} onChange={(e) => onChange(e.target.value)} />{err}{help}</div>;
  }
}

// ---------------- Entry form ----------------
export function EntryForm({ cfg, section, step = "all", staffName, initial, submitLabel = "Save", onSubmit, onAddOption, extraAction }: {
  cfg: FormConfig; section?: SectionDef | null; step?: "start" | "finish" | "all"; staffName: string; initial?: Values; submitLabel?: string;
  onSubmit: (v: Values, outOfRange: boolean) => Promise<void> | void; onAddOption?: (k: string, v: string) => void; extraAction?: string;
}) {
  const [vals, setVals] = useState<Values>(() => ({ ...autofill(cfg, staffName, step), ...(initial || {}) }));
  const [busy, setBusy] = useState(false);
  const [tried, setTried] = useState(false);
  const cv = computeValues(cfg, vals);
  const ev = evaluate(cfg, vals, { section, step });
  const fields = cfg.fields.filter((f) => (step === "all" || (f.step || "start") === step) && !isHidden(f, cv));
  const excField = cfg.exception && fields.some((f) => f.key === cfg.exception!.appliesTo);
  const submit = async (another = false) => {
    setTried(true);
    if (ev.missing.length || ev.errors.length) return;
    setBusy(true);
    try {
      await onSubmit(finalizeValues(cfg, vals, ev), ev.outOfRange);
      if (another) { setVals(autofill(cfg, staffName, step)); setTried(false); }
    } finally { setBusy(false); }
  };
  return (
    <div className="space-y-4">
      {fields.map((f) => {
        const isCA = cfg.corrective?.field === f.key;
        return (
          <div key={f.key} className={isCA && ev.correctiveRequired ? "rounded-xl border border-destructive/60 bg-destructive/5 p-3" : ""}>
            {isCA && ev.correctiveRequired && <p className="text-xs font-semibold text-destructive mb-2 flex items-center gap-1"><AlertTriangle className="h-3.5 w-3.5" />Corrective action is compulsory</p>}
            <FieldInput f={f} value={cv[f.key]} values={cv} cfg={cfg} section={section} issue={ev.fieldIssues[f.key]} onAddOption={onAddOption}
              onChange={(v) => setVals((p) => ({ ...p, [f.key]: v }))} />
            {isCA && !ev.correctiveRequired && cfg.corrective?.defaultInRange && <p className="text-xs text-muted-foreground mt-1">Leave blank to record “{cfg.corrective.defaultInRange}”.</p>}
          </div>
        );
      })}
      {excField && (
        <div className="rounded-xl border border-border p-3 space-y-2">
          <label className="flex items-center gap-3 text-sm min-h-10"><input type="checkbox" className="h-5 w-5 accent-[hsl(var(--primary))]" checked={!!vals[EXC_KEY]} onChange={(e) => setVals((p) => ({ ...p, [EXC_KEY]: e.target.checked }))} />{cfg.exception!.label}</label>
          {vals[EXC_KEY] && <Textarea rows={2} placeholder={cfg.exception!.noteLabel} value={vals[EXC_NOTE] || ""} onChange={(e) => setVals((p) => ({ ...p, [EXC_NOTE]: e.target.value }))} />}
          {cfg.exception!.neverFor.length > 0 && <p className="text-xs text-muted-foreground">Never allowed for: {cfg.exception!.neverFor.join(", ")}</p>}
        </div>
      )}
      {ev.outOfRange && <div className="rounded-xl bg-destructive/15 text-destructive p-3 text-sm font-medium flex gap-2"><AlertTriangle className="h-5 w-5 shrink-0" />Out of range — record what you did about it.</div>}
      {tried && (ev.missing.length > 0 || ev.errors.length > 0) && (
        <div className="rounded-xl bg-destructive/10 p-3 text-sm text-destructive">{[...ev.errors, ...(ev.missing.length ? [`Please complete: ${ev.missing.join(", ")}`] : [])].map((m) => <p key={m}>{m}</p>)}</div>
      )}
      <div className="grid gap-2 pt-1">
        <Button size="lg" className="h-14 text-base" disabled={busy} onClick={() => submit(false)}>{busy ? "Saving…" : submitLabel}</Button>
        {extraAction && <Button size="lg" variant="outline" className="h-12" disabled={busy} onClick={() => submit(true)}>{extraAction}</Button>}
      </div>
    </div>
  );
}

function EntryLine({ form, e, onEdit }: { form: FslForm; e: FslEntry; onEdit?: (e: FslEntry) => void }) {
  const cfg = form.config;
  const main = cfg.fields.filter((f) => f.type !== "photo" && f.type !== "signature").slice(0, 4);
  return (
    <div className={`rounded-xl border p-3 text-sm ${e.out_of_range ? "border-destructive/50" : "border-border"}`}>
      <div className="flex justify-between gap-2">
        <div className="font-medium">{main.map((f) => formatValue(f, e.field_values[f.key])).filter(Boolean).join(" · ") || "Entry"}{e.edited && " *"}</div>
        {onEdit && <button onClick={() => onEdit(e)} className="text-muted-foreground"><Pencil className="h-4 w-4" /></button>}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{e.staff_name} · {new Date(e.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })}{e.pending ? " · waiting to sync" : ""}{e.out_of_range ? " · out of range" : ""}</div>
    </div>
  );
}

// ---------------- Runner ----------------
export function FormRunner({ form, entries, staffName, date, onSave, onFinish, onEdit, onBack, onAddOption }: RunnerProps) {
  const cfg = form.config;
  const d = date || todayStr();
  const pk = periodKey(cfg, d);
  const mine = useMemo(() => entries.filter((e) => e.form_id === form.id), [entries, form.id]);
  const today = mine.filter((e) => e.entry_date === d);
  const [sec, setSec] = useState<SectionDef | null>(null);
  const [check, setCheck] = useState<string | null>(null);
  const [mode, setMode] = useState<"home" | "entry" | "all" | "finish">("home");
  const [finishing, setFinishing] = useState<FslEntry | null>(null);
  const [allCheck, setAllCheck] = useState<string | null>(null);
  const [allVals, setAllVals] = useState<Record<string, string>>({});
  const [header, setHeader] = useState<Values>(() => Object.fromEntries(cfg.headers.map((h) => [h.key, h.default ?? (h.type === "month" ? d.slice(0, 7) : h.type === "week" ? pk : "")])));
  const [ok, setOk] = useState<string | null>(null);

  const base = (extra: Partial<SavePayload>): SavePayload => ({
    form_id: form.id, entry_date: d, period_key: pk, section_key: null, check_key: null, header_values: header, field_values: {}, status: "complete", out_of_range: false, client_id: uid(), ...extra,
  });
  const flash = (m: string) => { setOk(m); setTimeout(() => setOk(null), 1800); };

  const top = (
    <div className="flex items-center gap-2 mb-4">
      <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => (mode === "home" ? onBack() : (setMode("home"), setSec(null), setCheck(null)))}><ArrowLeft className="h-5 w-5" /></Button>
      <div className="min-w-0">
        <p className="font-semibold truncate">{cfg.name}</p>
        <p className="text-xs text-muted-foreground truncate">{cfg.title}{cfg.code ? ` · ${cfg.code}` : ""}</p>
      </div>
    </div>
  );
  const instr = cfg.instructions ? <div className="rounded-xl bg-primary/10 border border-primary/20 p-3 text-sm flex gap-2 mb-4"><Info className="h-4 w-4 text-primary shrink-0 mt-0.5" /><p>{cfg.instructions}</p></div> : null;
  const toast = ok ? <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 rounded-full bg-primary text-primary-foreground px-5 py-3 text-sm font-medium shadow-lg flex items-center gap-2"><Check className="h-4 w-4" />{ok}</div> : null;

  // ---------- DAILY GRID ----------
  if (cfg.form_type === "daily_grid") {
    const doneFor = (s: string, c: string) => today.find((e) => e.section_key === s && e.check_key === c);
    if (mode === "entry" && sec && check) {
      const c = cfg.checks.find((x) => x.key === check)!;
      return <div>{top}{toast}<p className="text-lg font-semibold mb-1">{sec.label} — {c.label}</p><p className="text-xs text-muted-foreground mb-4">{d}</p>
        <EntryForm cfg={cfg} section={sec} staffName={staffName} onAddOption={onAddOption}
          onSubmit={async (v, oor) => { await onSave(base({ section_key: sec.key, check_key: check, field_values: v, out_of_range: oor })); flash("Saved"); setMode("home"); setSec(null); setCheck(null); }} /></div>;
    }
    if (mode === "all" && allCheck) {
      const c = cfg.checks.find((x) => x.key === allCheck)!;
      const tf = cfg.fields.find((f) => f.key === cfg.limitField) || cfg.fields.find((f) => f.type === "temperature");
      const pending = cfg.sections.filter((s) => !doneFor(s.key, allCheck));
      const evals = pending.map((s) => ({ s, ev: evaluate(cfg, { [tf!.key]: allVals[s.key] ?? "", [cfg.corrective?.field || "_"]: allVals[`${s.key}__ca`] ?? "" }, { section: s }) }));
      return (
        <div>{top}{toast}<p className="text-lg font-semibold mb-4">Record all — {c.label}</p>
          <div className="space-y-3">
            {evals.map(({ s, ev }) => (
              <div key={s.key} className={`rounded-xl border p-3 ${ev.outOfRange ? "border-destructive/60" : "border-border"}`}>
                <div className="flex items-center justify-between gap-3">
                  <div><p className="font-medium">{s.label}</p><p className="text-[11px] text-muted-foreground">{limitText(limitFor(cfg, tf!, {}, s))}</p></div>
                  <Input inputMode="text" pattern="-?[0-9.]*" className="w-28 h-12 text-lg text-right" placeholder="°C" value={allVals[s.key] ?? ""}
                    onChange={(e) => setAllVals((p) => ({ ...p, [s.key]: e.target.value.replace(/[^0-9.\-]/g, "") }))} />
                </div>
                {ev.outOfRange && <Textarea className="mt-2 border-destructive" rows={2} placeholder="Corrective action (compulsory)" value={allVals[`${s.key}__ca`] || ""} onChange={(e) => setAllVals((p) => ({ ...p, [`${s.key}__ca`]: e.target.value }))} />}
              </div>
            ))}
            {!pending.length && <p className="text-sm text-muted-foreground">All units are done for this check.</p>}
          </div>
          <Button size="lg" className="w-full h-14 mt-4" onClick={async () => {
            for (const { s, ev } of evals) {
              if (allVals[s.key] === undefined || allVals[s.key] === "") continue;
              if (ev.missing.length) { flash(`${s.label}: corrective action needed`); return; }
            }
            let n = 0;
            for (const { s, ev } of evals) {
              if (allVals[s.key] === undefined || allVals[s.key] === "") continue;
              const raw = { ...autofill(cfg, staffName), [tf!.key]: allVals[s.key], ...(cfg.corrective ? { [cfg.corrective.field]: allVals[`${s.key}__ca`] || "" } : {}) };
              await onSave(base({ section_key: s.key, check_key: allCheck, field_values: finalizeValues(cfg, raw, ev), out_of_range: ev.outOfRange, client_id: uid() })); n++;
            }
            setAllVals({}); flash(`${n} saved`); setMode("home");
          }}>Save all</Button>
        </div>
      );
    }
    return (
      <div>{top}{toast}{instr}
        <div className="grid grid-cols-3 gap-2 mb-4">
          {cfg.checks.map((c) => <Button key={c.key} variant="outline" className="h-12 text-xs" onClick={() => { setAllCheck(c.key); setMode("all"); }}>Record all {c.label}</Button>)}
        </div>
        <div className="space-y-3">
          {cfg.sections.map((s) => (
            <div key={s.key} className="rounded-2xl border border-border p-3">
              <div className="flex justify-between mb-2"><p className="font-semibold">{s.label}</p><span className="text-xs text-muted-foreground">{limitText({ min: s.min, max: s.max })}</span></div>
              <div className="grid grid-cols-3 gap-2">
                {cfg.checks.map((c) => {
                  const e = doneFor(s.key, c.key);
                  const tf = cfg.limitField ? e?.field_values[cfg.limitField] : undefined;
                  return e ? (
                    <button key={c.key} onClick={() => onEdit?.(e)} className={`rounded-xl p-2 text-left text-xs ${e.out_of_range ? "bg-destructive/15 text-destructive" : "bg-emerald-500/10"}`}>
                      <div className="font-semibold flex items-center gap-1"><Check className="h-3 w-3" />{c.label}{e.edited && " *"}</div>
                      <div>{tf !== undefined ? `${tf}°C` : "Done"}</div>
                      <div className="text-muted-foreground truncate">{e.staff_name} {new Date(e.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })}</div>
                    </button>
                  ) : (
                    <button key={c.key} onClick={() => { setSec(s); setCheck(c.key); setMode("entry"); }} className="rounded-xl border border-dashed border-border p-2 text-left text-xs min-h-16 active:scale-95">
                      <div className="font-semibold">{c.label}</div><div className="text-muted-foreground">{c.due ? `due ${to12(c.due)}` : "Tap to record"}</div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // ---------- WEEKLY CHECKLIST ----------
  if (cfg.form_type === "weekly_checklist") {
    const day = dayCode(d);
    const signed = mine.filter((e) => e.period_key === pk && e.check_key === day);
    return (
      <div>{top}{toast}{instr}
        {cfg.headers.filter((h) => h.type === "dropdown").map((h) => (
          <div key={h.key} className="mb-4"><p className="text-sm font-medium mb-1.5">{h.label}</p>
            <div className="flex flex-wrap gap-2">{(h.options || []).map((o) => <button key={o} onClick={() => setHeader((p) => ({ ...p, [h.key]: o }))} className={`h-11 px-4 rounded-xl border text-sm ${header[h.key] === o ? "bg-primary text-primary-foreground border-primary" : "border-border"}`}>{o}</button>)}</div>
          </div>
        ))}
        <p className="text-sm text-muted-foreground mb-3">Week commencing {pk} · Today is {day}</p>
        <div className="space-y-2">
          {cfg.sections.length === 0 && <p className="text-sm text-muted-foreground">No items have been set up yet. Ask your admin to add them.</p>}
          {cfg.sections.map((s) => {
            const e = signed.find((x) => x.section_key === s.key && (!header.area || !x.header_values?.area || x.header_values.area === header.area));
            return (
              <div key={s.key} className={`rounded-2xl border p-3 ${e ? "border-emerald-500/40 bg-emerald-500/5" : "border-border"}`}>
                <div className="flex justify-between gap-3 items-start">
                  <div className="min-w-0">
                    <p className="font-semibold">{s.label}</p>
                    <div className="text-xs text-muted-foreground mt-1 space-y-0.5">{(cfg.sectionAttrs || []).map((a) => s.attrs?.[a.key] ? <p key={a.key}><span className="font-medium">{a.label}:</span> {s.attrs[a.key]}</p> : null)}</div>
                  </div>
                  {e ? <div className="text-xs text-right shrink-0"><Check className="h-5 w-5 text-emerald-500 ml-auto" />{e.staff_name}<br />{new Date(e.created_at).toLocaleTimeString("en-AU", { hour: "numeric", minute: "2-digit", timeZone: "Australia/Sydney" })}</div>
                    : <Button className="h-12 shrink-0" onClick={async () => { await onSave(base({ section_key: s.key, check_key: day, field_values: autofill(cfg, staffName) })); flash("Signed off"); }}>Sign off</Button>}
                </div>
              </div>
            );
          })}
        </div>
        <div className="mt-4 grid grid-cols-7 gap-1 text-[10px] text-center text-muted-foreground">{DAYS.map((x) => <div key={x} className={x === day ? "text-primary font-bold" : ""}>{x}<br />{mine.filter((e) => e.period_key === pk && e.check_key === x).length}/{cfg.sections.length}</div>)}</div>
      </div>
    );
  }

  // ---------- TWO-STEP ----------
  if (cfg.form_type === "two_step") {
    const open = mine.filter((e) => e.status === "open");
    if (mode === "entry") return <div>{top}{toast}<p className="text-lg font-semibold mb-4">Start</p>
      <EntryForm cfg={cfg} step="start" staffName={staffName} submitLabel="Start" onAddOption={onAddOption}
        onSubmit={async (v, oor) => { await onSave(base({ field_values: v, status: "open", out_of_range: oor })); flash("Started"); setMode("home"); }} /></div>;
    if (mode === "finish" && finishing) return <div>{top}{toast}
      <p className="text-lg font-semibold">Finish</p>
      <p className="text-sm text-muted-foreground mb-4">{cfg.fields.filter((f) => (f.step || "start") === "start").map((f) => formatValue(f, finishing.field_values[f.key])).filter(Boolean).join(" · ")}</p>
      <EntryForm cfg={cfg} step="finish" staffName={staffName} submitLabel="Finish" onAddOption={onAddOption}
        onSubmit={async (v, oor) => { await onFinish(finishing, v, oor); flash("Finished"); setFinishing(null); setMode("home"); }} /></div>;
    const limit = cfg.openAlertHours || 0;
    return (
      <div>{top}{toast}{instr}
        <Button size="lg" className="w-full h-14 mb-4" onClick={() => setMode("entry")}><Plus className="h-5 w-5 mr-2" />Start</Button>
        <p className="text-sm font-semibold mb-2">Open ({open.length})</p>
        <div className="space-y-2">
          {open.map((e) => {
            const h = hoursOpen(e);
            return (
              <button key={e.id} disabled={e.pending} onClick={() => { setFinishing(e); setMode("finish"); }} className={`w-full text-left rounded-2xl border p-3 ${limit && h > limit ? "border-destructive/60 bg-destructive/5" : "border-border"}`}>
                <div className="flex justify-between"><p className="font-semibold">{cfg.fields.filter((f) => f.type === "text" && (f.step || "start") === "start").map((f) => e.field_values[f.key]).filter(Boolean).join(" · ") || "Entry"}</p><Badge variant="outline" className="gap-1"><Clock className="h-3 w-3" />{h < 1 ? `${Math.round(h * 60)}m` : `${Math.floor(h)}h ${Math.round((h % 1) * 60)}m`}</Badge></div>
                <p className="text-xs text-muted-foreground mt-1">Started by {e.staff_name} · {e.entry_date}{e.pending ? " · waiting to sync" : " · tap to finish"}</p>
              </button>
            );
          })}
          {!open.length && <p className="text-sm text-muted-foreground">Nothing open.</p>}
        </div>
        {today.filter((e) => e.status === "complete").length > 0 && <><p className="text-sm font-semibold mt-5 mb-2">Finished today</p><div className="space-y-2">{mine.filter((e) => e.status === "complete" && e.finished_at?.slice(0, 10) === d).map((e) => <EntryLine key={e.id} form={form} e={e} onEdit={onEdit} />)}</div></>}
      </div>
    );
  }

  // ---------- EVENT LOG ----------
  if (mode === "entry") return <div>{top}{toast}<p className="text-lg font-semibold mb-4">New entry</p>
    <EntryForm cfg={cfg} staffName={staffName} extraAction="Save & add another" onAddOption={onAddOption}
      onSubmit={async (v, oor) => { await onSave(base({ field_values: v, out_of_range: oor, client_id: uid() })); flash("Saved"); }} />
    <Button variant="ghost" className="w-full mt-2" onClick={() => setMode("home")}>Done</Button></div>;
  return (
    <div>{top}{toast}{instr}
      <Button size="lg" className="w-full h-14 mb-4" onClick={() => setMode("entry")}><Plus className="h-5 w-5 mr-2" />Add entry</Button>
      <p className="text-sm font-semibold mb-2">Today ({today.length})</p>
      <div className="space-y-2">{today.slice().reverse().map((e) => <EntryLine key={e.id} form={form} e={e} onEdit={onEdit} />)}{!today.length && <p className="text-sm text-muted-foreground">No entries yet today.</p>}</div>
    </div>
  );
}

// ---------------- Edit dialog content ----------------
export function EditEntryForm({ form, entry, onSubmit, onCancel }: { form: FslForm; entry: FslEntry; onSubmit: (v: Values, oor: boolean, reason: string) => Promise<void>; onCancel: () => void }) {
  const cfg = form.config;
  const [vals, setVals] = useState<Values>({ ...entry.field_values });
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const section = cfg.sections.find((s) => s.key === entry.section_key) || null;
  const cv = computeValues(cfg, vals);
  const ev = evaluate(cfg, vals, { section, step: cfg.form_type === "two_step" && entry.status === "open" ? "start" : "all" });
  return (
    <div className="space-y-4">
      {cfg.fields.filter((f) => !isHidden(f, cv) && (entry.status === "complete" || (f.step || "start") === "start")).map((f) => (
        <FieldInput key={f.key} f={f.type === "signature" ? { ...f, type: "text" } : f} cfg={cfg} values={cv} section={section} value={cv[f.key]} issue={ev.fieldIssues[f.key]} onChange={(v) => setVals((p) => ({ ...p, [f.key]: v }))} />
      ))}
      <div><label className="text-sm font-medium">Reason for change <span className="text-destructive">*</span></label><Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></div>
      <div className="flex gap-2 justify-end">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button disabled={busy || reason.trim().length < 3} onClick={async () => { setBusy(true); try { const changed: Values = {}; const fin = computeValues(cfg, vals); for (const k of Object.keys(fin)) if (JSON.stringify(fin[k]) !== JSON.stringify(entry.field_values[k])) changed[k] = fin[k]; await onSubmit(changed, ev.outOfRange, reason.trim()); } finally { setBusy(false); } }}>Save change</Button>
      </div>
    </div>
  );
}

export { sydneyNow };
