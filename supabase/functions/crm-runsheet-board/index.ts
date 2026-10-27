import { createClient } from "npm:@supabase/supabase-js@2";

const cors = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// Static staff QR: lists every emailed, non-cancelled run sheet for a business.
// Token = sha256(calendar_token + ":runsheets"), so it never reveals the calendar key.
async function boardToken(cal: string) {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${cal}:runsheets`));
  return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, "0")).join("");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  try {
    const u = new URL(req.url);
    const b = u.searchParams.get("b") || "", t = u.searchParams.get("t") || "";
    if (!/^[0-9a-f-]{36}$/i.test(b) || !/^[0-9a-f]{64}$/i.test(t)) return json({ error: "Not found" }, 404);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: s } = await db.from("crm_settings").select("calendar_token").eq("business_id", b).maybeSingle();
    if (!s?.calendar_token || (await boardToken(s.calendar_token)) !== t.toLowerCase()) return json({ error: "Not found" }, 404);

    const [rsRes, bkRes, ldRes] = await Promise.all([
      db.from("crm_runsheets").select("id,booking_id,lead_id,internal_share_token,event_order_number").eq("business_id", b).or("emailed_at.not.is.null,emailed_to.neq.{}"),
      db.from("crm_bookings").select("id,lead_id,event_date,event_type,booking_kind,status,event_name").eq("business_id", b),
      db.from("crm_leads").select("id,full_name,event_type").eq("business_id", b),
    ]);
    const bookings = bkRes.data || [], leads = ldRes.data || [];
    const items = (rsRes.data || []).filter((r: any) => r.internal_share_token).map((r: any) => {
      const bk: any = bookings.find((x: any) => x.id === r.booking_id) || bookings.find((x: any) => r.lead_id && x.lead_id === r.lead_id) || {};
      const ld: any = leads.find((l: any) => l.id === r.lead_id) || {};
      if (["cancelled", "declined"].includes(bk.status)) return null;
      const type = String(bk.event_type || ld.event_type || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
      const name = ld.full_name || bk.event_name || "Run sheet";
      return { id: r.id, t: r.internal_share_token, label: type ? `${type} – ${name}` : name, date: bk.event_date || "", kind: bk.booking_kind === "catering" ? "Catering" : "Event", order: r.event_order_number || "" };
    }).filter(Boolean);
    return json({ items });
  } catch (e) { return json({ error: String(e) }, 500); }
});
