import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller } from "../_shared/auth.ts";
import { loadBeverageDetail } from "../../../src/lib/beverageDetail.ts";

const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async req => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) return json({ error: "Run sheet service unavailable" }, 503);
    const db = createClient(url, key);
    const caller = await getCaller(req, db);
    if (!caller) return json({ error: "Please sign in again" }, 401);
    const body = await req.json();
    if (typeof body.eventId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.eventId)) return json({ error: "Invalid event" }, 400);
    const { data: event, error: eventError } = await db.from("roster_day_events").select("business_id,crm_runsheet_id").eq("id", body.eventId).maybeSingle();
    if (eventError) throw eventError;
    const master = caller.roles.some(r => r.role === "master" && r.business_id === null);
    const allowed = event && (master || caller.roles.some(r => r.business_id === event.business_id && ["admin", "super_admin", "viewer", "roster_admin", "sales_marketing_manager", "food_safety_manager", "owner"].includes(r.role)));
    if (!allowed || !event?.crm_runsheet_id) return json({ error: "Run sheet unavailable or access denied" }, 403);
    const scope = event.business_id;
    const { data: source, error: sourceError } = await db.from("crm_runsheets").select("id,lead_id,booking_id,emailed_at,emailed_to,event_order_number,booking_reference,revision,sales_person,sales_person_phone,event_coordinator,event_coordinator_phone,onsite_contact_name,onsite_contact_phone,adult_guests,kids_guests,setup_items,setup_notes,service_schedule,service_schedule_foh,special_requests,client_notes,ops_notes,foh_notes,staff_sign_name,staff_sign_date,staff_signature").eq("id", event.crm_runsheet_id).eq("business_id", scope).maybeSingle();
    if (sourceError) throw sourceError;
    if (!source || (!source.emailed_at && !source.emailed_to?.length)) return json({ error: "Run sheet unavailable or has not been emailed yet" }, 403);
    const { booking_id, emailed_at, emailed_to, ...rs } = source;
    const bookingQuery = db.from("crm_bookings").select("event_date,start_time,duration_minutes,booking_kind,event_name,event_type,venue_space,service_location,fulfilment_method,adults,kids,kids_5_to_10,kids_under_5,chafing_dishes").eq("business_id", scope);
    const [booking, lead, selection, business] = await Promise.all([
      (booking_id ? bookingQuery.eq("id", booking_id) : bookingQuery.eq("lead_id", rs.lead_id)).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("crm_leads").select("full_name,phone,event_type,venue_space,service_location").eq("business_id", scope).eq("id", rs.lead_id).maybeSingle(),
      db.from("crm_menu_selections").select("id,beverage_package,corkage_enabled,corkage_note,dietary_requirements,allergies").eq("business_id", scope).eq("lead_id", rs.lead_id).order("updated_at", { ascending: false }).limit(1).maybeSingle(),
      db.from("businesses").select("name,phone,email").eq("id", scope).maybeSingle(),
    ]);
    for (const result of [booking, lead, selection, business]) if (result.error) throw result.error;
    const items = selection.data ? await db.from("crm_menu_selection_items").select("id,course,item_name,notes,quantity,service_start_time,service_end_time").eq("selection_id", selection.data.id).eq("business_id", scope).order("created_at") : { data: [], error: null };
    if (items.error) throw items.error;
    const beverage = await loadBeverageDetail(db, scope, selection.data?.beverage_package);
    const { id: selectionId, ...selectionFields } = selection.data || {};
    return json({ rs, b: booking.data, lead: lead.data, selection: { ...selectionFields, beverage_detail: beverage }, items: items.data || [], businessName: business.data?.name || "", businessPhone: business.data?.phone || "", businessEmail: business.data?.email || "" });
  } catch (error) {
    console.error("Roster run sheet load failed", error instanceof Error ? error.message : "Request failed");
    return json({ error: "Could not load the run sheet. Please try again." }, 500);
  }
});