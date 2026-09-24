import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { createClient } from "npm:@supabase/supabase-js@2";

const UUID = /^[0-9a-f-]{36}$/i;
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const id = url.searchParams.get("id") || ""; const t = url.searchParams.get("t") || "";
    if (!UUID.test(id) || !UUID.test(t)) return json({ error: "Invalid link" }, 400);
    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rs } = await db.from("crm_runsheets").select("*").eq("id", id).eq("share_token", t).maybeSingle();
    if (!rs) return json({ error: "Run sheet not found" }, 404);
    const [lead, booking, biz, sel] = await Promise.all([
      rs.lead_id ? db.from("crm_leads").select("full_name, phone, event_type, venue_space").eq("id", rs.lead_id).maybeSingle() : { data: null },
      rs.booking_id ? db.from("crm_bookings").select("event_date, start_time, duration_minutes, venue_space, event_type").eq("id", rs.booking_id).maybeSingle()
        : rs.lead_id ? db.from("crm_bookings").select("event_date, start_time, duration_minutes, venue_space, event_type").eq("lead_id", rs.lead_id).limit(1).maybeSingle() : { data: null },
      db.from("businesses").select("name").eq("id", rs.business_id).maybeSingle(),
      rs.lead_id ? db.from("crm_menu_selections").select("id, beverage_package, corkage_enabled, dietary_requirements, allergies").eq("lead_id", rs.lead_id).order("updated_at", { ascending: false }).limit(1).maybeSingle() : { data: null },
    ]);
    let items: unknown[] = [];
    if (sel.data?.id) {
      const r = await db.from("crm_menu_selection_items").select("id, course, item_name, quantity, service_start_time, service_end_time, created_at").eq("selection_id", sel.data.id).order("created_at");
      items = r.data || [];
    }
    // strip anything price-related and internal
    const { share_token: _s, ops_notes: _o, distributed_to: _d, ...safe } = rs;
    return json({ rs: safe, lead: lead.data, booking: booking.data, businessName: biz.data?.name || "", selection: sel.data, items });
  } catch (e) {
    console.error(e);
    return json({ error: "Unable to load run sheet" }, 500);
  }
});
