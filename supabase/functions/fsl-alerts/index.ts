// Food Safety Logs alerts: out-of-range readings (per entry), overdue checks and long-open two-step entries (scan).
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient } from "../_shared/auth.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

function sydney() { return new Date(new Date().toLocaleString("en-US", { timeZone: "Australia/Sydney" })); }
const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

async function send(to: string[], subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY"); if (!key || !to.length) return;
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" }, body: JSON.stringify({ from: "Food Safety <noreply@omnexventures.com>", to, subject, html }) });
  if (!r.ok) console.error("Resend failed", r.status, await r.text());
}

async function recipients(db: any, businessId: string, cfg: any) {
  const { data: s } = await db.from("fsl_settings").select("alert_emails").eq("business_id", businessId).maybeSingle();
  return Array.from(new Set([...(cfg?.alertEmails || []), ...(s?.alert_emails || [])].filter((e: string) => /@/.test(e))));
}

async function notifyAdmins(db: any, businessId: string, title: string, message: string) {
  const { data: admins } = await db.from("user_roles").select("user_id").eq("business_id", businessId).in("role", ["admin", "super_admin"]);
  for (const a of admins || []) await db.from("notifications").insert({ user_id: a.user_id, business_id: businessId, title, message, type: "food_safety" }).then(() => {}, () => {});
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const db = serviceClient();
  try {
    const body = await req.json().catch(() => ({}));
    if (body.entry_id) {
      const { data: e } = await db.from("fsl_entries").select("*, fsl_forms(config, name)").eq("id", body.entry_id).maybeSingle();
      if (!e || !e.out_of_range || e.alert_sent) return json({ ok: true, skipped: true });
      const cfg = (e as any).fsl_forms?.config || {};
      await db.from("fsl_entries").update({ alert_sent: true }).eq("id", e.id);
      if (cfg.alerts?.outOfRange === false) return json({ ok: true });
      const rows = Object.entries(e.field_values || {}).filter(([k, v]) => !k.startsWith("__") && typeof v !== "object" && !String(v).startsWith("data:")).map(([k, v]) => `<tr><td style="padding:4px 8px;color:#666">${(cfg.fields || []).find((f: any) => f.key === k)?.label || k}</td><td style="padding:4px 8px">${v}</td></tr>`).join("");
      const sec = (cfg.sections || []).find((s: any) => s.key === e.section_key)?.label || "";
      const title = `Out of range: ${cfg.name || "Food safety"}${sec ? ` — ${sec}` : ""}`;
      await send(await recipients(db, e.business_id, cfg), title, `<h2>${title}</h2><p>Recorded by ${e.staff_name} on ${e.entry_date}.</p><table>${rows}</table>`);
      await notifyAdmins(db, e.business_id, title, `Recorded by ${e.staff_name}`);
      return json({ ok: true });
    }
    // Scan mode (cron): overdue daily checks and long-open two-step entries
    const now = sydney(); const today = ymd(now); const hm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    const { data: forms } = await db.from("fsl_forms").select("*").eq("active", true);
    let sent = 0;
    for (const f of forms || []) {
      const cfg = f.config || {};
      const issues: string[] = [];
      if (f.form_type === "daily_grid" && cfg.alerts?.overdue !== false) {
        const { data: es } = await db.from("fsl_entries").select("section_key, check_key").eq("form_id", f.id).eq("entry_date", today);
        for (const c of cfg.checks || []) {
          if (!c.due || hm < c.due) continue;
          // only alert within the hour after the due time to avoid repeats
          const [h, m] = c.due.split(":").map(Number); const mins = now.getHours() * 60 + now.getMinutes() - (h * 60 + m);
          if (mins >= 60) continue;
          const missing = (cfg.sections || []).filter((s: any) => !(es || []).some((e: any) => e.section_key === s.key && e.check_key === c.key)).map((s: any) => s.label);
          if (missing.length) issues.push(`${c.label} check overdue (due ${c.due}): ${missing.join(", ")}`);
        }
      }
      if (f.form_type === "two_step" && cfg.openAlertHours && cfg.alerts?.openTooLong !== false) {
        const cutoff = new Date(Date.now() - cfg.openAlertHours * 36e5).toISOString();
        const { data: open } = await db.from("fsl_entries").select("id, field_values, created_at, alert_sent").eq("form_id", f.id).eq("status", "open").lt("created_at", cutoff).eq("alert_sent", false);
        for (const o of open || []) { issues.push(`Open longer than ${cfg.openAlertHours}h: ${Object.values(o.field_values || {}).filter((v) => typeof v === "string" && !String(v).startsWith("data:")).slice(0, 2).join(" · ")}`); await db.from("fsl_entries").update({ alert_sent: true }).eq("id", o.id); }
      }
      if (issues.length) {
        const title = `${cfg.name}: ${issues.length} issue${issues.length > 1 ? "s" : ""}`;
        await send(await recipients(db, f.business_id, cfg), title, `<h2>${title}</h2><ul>${issues.map((i) => `<li>${i}</li>`).join("")}</ul>`);
        await notifyAdmins(db, f.business_id, title, issues.join("; ").slice(0, 400));
        sent++;
      }
    }
    return json({ ok: true, sent });
  } catch (e) { console.error(e); return json({ error: e instanceof Error ? e.message : "failed" }, 500); }
});
