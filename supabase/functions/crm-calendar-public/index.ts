import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { loadBrand } from "../_shared/emailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } });

// View-only calendar data for the shareable calendar link. Uses the same private
// per-business calendar token as the Google Calendar feed, and returns only the
// fields the calendar popup shows (no emails, phones, or payment amounts).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    let businessId = url.searchParams.get("b") || "";
    let token = url.searchParams.get("t") || "";
    if (req.method === "POST") { const body = await req.json().catch(() => ({})); businessId = body.b || businessId; token = body.t || token; }
    if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f]{32,128}$/i.test(token)) return json({ error: "Calendar not found" }, 404);

    const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: settings } = await db.from("crm_settings").select("business_id").eq("business_id", businessId).eq("calendar_token", token).maybeSingle();
    if (!settings) return json({ error: "Calendar not found" }, 404);

    const [brand, bookingRes, leadRes, sheetRes, custRes, venueRes, payRes] = await Promise.all([
      loadBrand(db, { businessId }),
      db.from("crm_bookings").select("id,business_id,lead_id,customer_id,booking_kind,status,event_date,start_time,end_time,duration_minutes,event_type,venue_space,venue_space_id,service_location,guest_count,adults,kids,notes,title,booking_name").eq("business_id", businessId).not("status", "in", "(cancelled,declined)"),
      db.from("crm_leads").select("id,full_name,event_type").eq("business_id", businessId),
      db.from("crm_runsheets").select("booking_id,lead_id,revision,adult_guests,kids_guests").eq("business_id", businessId),
      db.from("crm_customers").select("id,full_name").eq("business_id", businessId),
      db.from("crm_venue_spaces").select("id,name").eq("business_id", businessId),
      db.from("crm_payments").select("booking_id,amount").eq("business_id", businessId).gt("amount", 0),
    ]);
    let bookings = bookingRes.data;
    if (bookingRes.error) {
      // Fall back to all columns if a listed column doesn't exist, then strip nothing sensitive beyond notes-level data.
      const retry = await db.from("crm_bookings").select("*").eq("business_id", businessId).not("status", "in", "(cancelled,declined)");
      bookings = (retry.data || []).map(({ total_amount, deposit_amount, ...rest }: any) => rest);
    }
    const paidIds = Array.from(new Set((payRes.data || []).map((p: any) => p.booking_id).filter(Boolean)));
    return json({
      business: { name: brand.name, logo_url: brand.logoUrl || null },
      bookings: bookings || [], leads: leadRes.data || [], runsheets: sheetRes.data || [],
      customers: custRes.data || [], venues: venueRes.data || [], paidIds,
    });
  } catch (e) {
    console.error("crm-calendar-public failed", e);
    return json({ error: "Calendar unavailable" }, 500);
  }
});
