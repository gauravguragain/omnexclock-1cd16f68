import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { ShieldCheck, LogOut, WifiOff, RefreshCw, Delete, ChevronRight } from "lucide-react";
import { FormRunner, EditEntryForm, SavePayload } from "@/features/fsl/FormRunner";
import { formStatus, statusTone, FslEntry, FslForm } from "@/features/fsl/status";
import { todayStr, Values } from "@/features/fsl/engine";
import { toast } from "sonner";

const BC_KEY = "fsl_business_code";
type Staff = { employee_id: string; name: string; business_id: string; is_supervisor: boolean; business_name: string };
type QItem = { kind: "save"; payload: SavePayload } | { kind: "finish"; id: string; values: Values; oor: boolean };

const qKey = (bc: string) => `fsl_queue_${bc}`;
const cacheKey = (bc: string) => `fsl_cache_${bc}`;
const readQ = (bc: string): QItem[] => { try { return JSON.parse(localStorage.getItem(qKey(bc)) || "[]"); } catch { return []; } };
const writeQ = (bc: string, q: QItem[]) => localStorage.setItem(qKey(bc), JSON.stringify(q));
const isNetErr = (e: any) => !navigator.onLine || /fetch|network|Failed to fetch|Load failed/i.test(String(e?.message || e));

function addDays(d: string, n: number) { const x = new Date(d + "T00:00:00"); x.setDate(x.getDate() + n); return x.toISOString().slice(0, 10); }

export default function FoodSafetyStaffPage() {
  const { businessCode: routeBc } = useParams();
  const [sp] = useSearchParams();
  const [bc, setBc] = useState<string>(() => (routeBc || sp.get("b") || localStorage.getItem(BC_KEY) || "").toUpperCase());
  const [bcInput, setBcInput] = useState("");
  const [pin, setPin] = useState("");
  const [code, setCode] = useState<string>(() => sessionStorage.getItem("fsl_pin") || "");
  const [staff, setStaff] = useState<Staff | null>(() => { try { return JSON.parse(sessionStorage.getItem("fsl_staff") || "null"); } catch { return null; } });
  const [forms, setForms] = useState<FslForm[]>([]);
  const [entries, setEntries] = useState<FslEntry[]>([]);
  const [openForm, setOpenForm] = useState<string | null>(null);
  const [editing, setEditing] = useState<FslEntry | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [queued, setQueued] = useState(0);
  const [loading, setLoading] = useState(false);

  useEffect(() => { if (bc) localStorage.setItem(BC_KEY, bc); }, [bc]);
  useEffect(() => { document.title = "Food Safety Logs"; document.documentElement.classList.add("dark"); }, []);

  const load = useCallback(async () => {
    if (!staff || !code) return;
    setLoading(true);
    const t = todayStr();
    const { data, error } = await supabase.rpc("fsl_staff_data" as any, { _code: code, _business_code: bc, _from: addDays(t, -7), _to: t });
    setLoading(false);
    if (error) {
      const c = localStorage.getItem(cacheKey(bc));
      if (c) { const p = JSON.parse(c); setForms(p.forms); setEntries(p.entries); }
      if (!isNetErr(error)) toast.error(error.message);
      return;
    }
    const d = data as any;
    const q = readQ(bc);
    const pending: FslEntry[] = q.filter((x): x is Extract<QItem, { kind: "save" }> => x.kind === "save").map((x) => ({ ...(x.payload as any), id: x.payload.client_id, staff_name: staff.name, created_at: new Date().toISOString(), pending: true, backfilled: false, edited: false, form_version: 1, business_id: staff.business_id, finished_at: null, finished_by_name: null }));
    setForms(d.forms || []); setEntries([...(d.entries || []), ...pending]);
    localStorage.setItem(cacheKey(bc), JSON.stringify({ forms: d.forms || [], entries: d.entries || [] }));
  }, [staff, code, bc]);

  const sync = useCallback(async () => {
    if (!code || !navigator.onLine) return;
    const q = readQ(bc); if (!q.length) { setQueued(0); return; }
    const rest: QItem[] = [];
    for (const item of q) {
      try {
        const { data, error } = item.kind === "save"
          ? await supabase.rpc("fsl_staff_save" as any, { _code: code, _business_code: bc, _entry: item.payload as any })
          : await supabase.rpc("fsl_staff_finish" as any, { _code: code, _business_code: bc, _entry_id: item.id, _values: item.values as any, _out_of_range: item.oor });
        if (error) { if (isNetErr(error)) rest.push(item); else toast.error(error.message); }
        else if ((data as any)?.out_of_range) supabase.functions.invoke("fsl-alerts", { body: { entry_id: (data as any).id } }).catch(() => {});
      } catch { rest.push(item); }
    }
    writeQ(bc, rest); setQueued(rest.length);
    if (rest.length < q.length) { toast.success(`Synced ${q.length - rest.length} saved entr${q.length - rest.length === 1 ? "y" : "ies"}`); load(); }
  }, [code, bc, load]);

  useEffect(() => { setQueued(readQ(bc).length); }, [bc]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    const on = () => { setOnline(true); sync(); }; const off = () => setOnline(false);
    window.addEventListener("online", on); window.addEventListener("offline", off);
    const i = setInterval(() => { sync(); if (navigator.onLine) load(); }, 60_000);
    return () => { window.removeEventListener("online", on); window.removeEventListener("offline", off); clearInterval(i); };
  }, [sync, load]);

  const login = async () => {
    const { data, error } = await supabase.rpc("fsl_staff_login" as any, { _code: pin, _business_code: bc });
    if (error || !data) { toast.error(error && isNetErr(error) ? "You're offline — connect to sign in" : "PIN not recognised"); setPin(""); return; }
    sessionStorage.setItem("fsl_pin", pin); sessionStorage.setItem("fsl_staff", JSON.stringify(data));
    setCode(pin); setStaff(data as any); setPin("");
  };
  const logout = () => { sessionStorage.removeItem("fsl_pin"); sessionStorage.removeItem("fsl_staff"); setStaff(null); setCode(""); setOpenForm(null); };

  const save = async (p: SavePayload) => {
    const optimistic: FslEntry = { ...(p as any), id: p.client_id, staff_name: staff!.name, created_at: new Date().toISOString(), pending: true, backfilled: false, edited: false, form_version: 1, business_id: staff!.business_id, finished_at: null, finished_by_name: null };
    try {
      const { data, error } = await supabase.rpc("fsl_staff_save" as any, { _code: code, _business_code: bc, _entry: p as any });
      if (error) throw error;
      setEntries((prev) => [...prev, data as any]);
      if ((data as any).out_of_range) supabase.functions.invoke("fsl-alerts", { body: { entry_id: (data as any).id } }).catch(() => {});
    } catch (e: any) {
      if (!isNetErr(e)) { toast.error(e.message); throw e; }
      writeQ(bc, [...readQ(bc), { kind: "save", payload: p }]); setQueued(readQ(bc).length);
      setEntries((prev) => [...prev, optimistic]);
      toast.message("Saved on this device — will sync when back online");
    }
  };
  const finish = async (e: FslEntry, values: Values, oor: boolean) => {
    try {
      const { data, error } = await supabase.rpc("fsl_staff_finish" as any, { _code: code, _business_code: bc, _entry_id: e.id, _values: values as any, _out_of_range: oor });
      if (error) throw error;
      setEntries((prev) => prev.map((x) => (x.id === e.id ? (data as any) : x)));
      if ((data as any).out_of_range) supabase.functions.invoke("fsl-alerts", { body: { entry_id: e.id } }).catch(() => {});
    } catch (err: any) {
      if (!isNetErr(err)) { toast.error(err.message); throw err; }
      writeQ(bc, [...readQ(bc), { kind: "finish", id: e.id, values, oor }]); setQueued(readQ(bc).length);
      setEntries((prev) => prev.map((x) => (x.id === e.id ? { ...x, status: "complete", field_values: { ...x.field_values, ...values }, pending: true } : x)));
      toast.message("Saved on this device — will sync when back online");
    }
  };
  const addOption = (formId: string) => (key: string, value: string) => {
    // options added by staff show immediately; admins persist them in the Form Editor (saved list is kept from entries)
    setForms((prev) => prev.map((f) => f.id !== formId ? f : { ...f, config: { ...f.config, fields: f.config.fields.map((x) => x.key === key ? { ...x, options: Array.from(new Set([...(x.options || []), value])) } : x) } }));
  };
  // Saved lists: merge values staff have used before into dropdowns that allow adding
  const formsWithLists = useMemo(() => forms.map((f) => ({ ...f, config: { ...f.config, fields: f.config.fields.map((x) => x.allowAdd ? { ...x, options: Array.from(new Set([...(x.options || []), ...entries.filter((e) => e.form_id === f.id).map((e) => e.field_values[x.key]).filter(Boolean)])) } : x) } })), [forms, entries]);

  const shell = (children: React.ReactNode) => (
    <div className="min-h-dvh bg-background text-foreground">
      <div className="max-w-md mx-auto px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">{children}</div>
    </div>
  );

  if (!bc) return shell(
    <div className="pt-16 space-y-4 text-center">
      <ShieldCheck className="h-12 w-12 text-primary mx-auto" /><h1 className="text-xl font-semibold">Food Safety Logs</h1>
      <p className="text-sm text-muted-foreground">Enter your business code</p>
      <Input className="h-14 text-center text-lg uppercase" value={bcInput} onChange={(e) => setBcInput(e.target.value)} />
      <Button size="lg" className="w-full h-14" disabled={!bcInput.trim()} onClick={() => setBc(bcInput.trim().toUpperCase())}>Continue</Button>
    </div>
  );

  if (!staff) return shell(
    <div className="pt-10 text-center">
      <ShieldCheck className="h-12 w-12 text-primary mx-auto" />
      <h1 className="text-xl font-semibold mt-3">Food Safety Logs</h1>
      <p className="text-sm text-muted-foreground mt-1">Enter your staff PIN</p>
      <div className="flex justify-center gap-3 my-6">{[0, 1, 2, 3].map((i) => <div key={i} className={`h-4 w-4 rounded-full ${pin.length > i ? "bg-primary" : "bg-muted"}`} />)}</div>
      <div className="grid grid-cols-3 gap-3">
        {["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "⌫"].map((k) => k === "" ? <div key="x" /> : (
          <button key={k} onClick={() => setPin((p) => (k === "⌫" ? p.slice(0, -1) : (p + k).slice(0, 8)))} className="h-16 rounded-2xl bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-100 border border-border text-2xl font-semibold active:scale-95 flex items-center justify-center">{k === "⌫" ? <Delete className="h-6 w-6" /> : k}</button>
        ))}
      </div>
      <Button size="lg" className="w-full h-14 mt-5" disabled={pin.length < 4} onClick={login}>Sign in</Button>
      <button className="text-xs text-muted-foreground mt-6" onClick={() => { localStorage.removeItem(BC_KEY); setBc(""); }}>Business: {bc} · change</button>
    </div>
  );

  const current = formsWithLists.find((f) => f.id === openForm);
  const banner = (!online || queued > 0) && (
    <div className="rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 p-2.5 text-xs flex items-center gap-2 mb-3"><WifiOff className="h-4 w-4" />{!online ? "Offline — entries are saved on this device." : ""} {queued > 0 && `${queued} waiting to sync.`}</div>
  );

  return shell(
    <>
      {banner}
      {current ? (
        <FormRunner form={current} entries={entries} staffName={staff.name} onSave={save} onFinish={finish} onBack={() => setOpenForm(null)}
          onEdit={staff.is_supervisor ? (e) => !e.pending && setEditing(e) : undefined} onAddOption={addOption(current.id)} />
      ) : (
        <>
          <div className="flex items-center justify-between mb-5">
            <div><p className="text-xs text-muted-foreground">{staff.business_name}</p><h1 className="text-xl font-semibold">Hi {staff.name.split(" ")[0]}</h1><p className="text-xs text-muted-foreground">{new Date().toLocaleDateString("en-AU", { weekday: "long", day: "numeric", month: "long", timeZone: "Australia/Sydney" })}{staff.is_supervisor && " · Supervisor"}</p></div>
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={() => { sync(); load(); }}><RefreshCw className={`h-5 w-5 ${loading ? "animate-spin" : ""}`} /></Button>
              <Button variant="ghost" size="icon" className="h-11 w-11" onClick={logout}><LogOut className="h-5 w-5" /></Button>
            </div>
          </div>
          <div className="space-y-3">
            {formsWithLists.map((f) => {
              const s = formStatus(f, entries);
              return (
                <button key={f.id} onClick={() => setOpenForm(f.id)} className="w-full text-left rounded-2xl border border-border bg-card p-4 active:scale-[0.99] transition flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2"><p className="font-semibold truncate">{f.config.name}</p>{f.config.code && <span className="text-[10px] text-muted-foreground">{f.config.code}</span>}</div>
                    <p className="text-sm text-muted-foreground mt-0.5">{s.summary}</p>
                  </div>
                  <span className={`text-[11px] px-2.5 py-1 rounded-full font-medium ${statusTone[s.status]}`}>{s.status}</span>
                  <ChevronRight className="h-5 w-5 text-muted-foreground" />
                </button>
              );
            })}
            {!formsWithLists.length && !loading && <p className="text-sm text-muted-foreground text-center py-10">No food safety forms are active yet.</p>}
          </div>
        </>
      )}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto"><DialogHeader><DialogTitle>Edit entry</DialogTitle></DialogHeader>
          {editing && current && <EditEntryForm form={current} entry={editing} onCancel={() => setEditing(null)} onSubmit={async (v, oor, reason) => {
            const { error } = await supabase.rpc("fsl_staff_edit" as any, { _code: code, _business_code: bc, _entry_id: editing.id, _values: v as any, _out_of_range: oor, _reason: reason });
            if (error) { toast.error(error.message); return; }
            toast.success("Entry updated"); setEditing(null); load();
          }} />}
        </DialogContent>
      </Dialog>
    </>
  );
}
