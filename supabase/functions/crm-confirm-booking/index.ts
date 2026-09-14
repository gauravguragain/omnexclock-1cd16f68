import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient } from "../_shared/auth.ts";

const schema = z.object({ token: z.string().min(32).max(256), action: z.enum(["view","confirm","decline"]) });
async function hash(value: string) { const bytes = new TextEncoder().encode(value); const digest = await crypto.subtle.digest("SHA-256", bytes); return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2,"0")).join(""); }

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = schema.safeParse(await req.json()); if (!parsed.success) return new Response(JSON.stringify({ error: "Invalid confirmation request" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = serviceClient(); const tokenHash = await hash(parsed.data.token);
    const { data: tokenRow } = await admin.from("crm_confirmation_tokens").select("id,booking_id,expires_at,used_at").eq("token_hash", tokenHash).maybeSingle();
    if (!tokenRow || new Date(tokenRow.expires_at) < new Date()) return new Response(JSON.stringify({ error: "This confirmation link is invalid or expired" }), { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const { data: booking } = await admin.from("crm_bookings").select("id,business_id,lead_id,event_date,start_time,duration_minutes,guest_count,venue_space,total_amount,deposit_amount,deposit_due_date,balance_due_date,status,crm_leads(full_name,event_type),businesses(name)").eq("id", tokenRow.booking_id).single();
    if (!booking) return new Response(JSON.stringify({ error: "Booking not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (parsed.data.action !== "view") {
      if (tokenRow.used_at) return new Response(JSON.stringify({ error: "This confirmation has already been completed" }), { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const status = parsed.data.action === "confirm" ? "confirmed" : "declined";
      await admin.from("crm_bookings").update({ status, confirmed_at: status === "confirmed" ? new Date().toISOString() : null }).eq("id", booking.id);
      if (status === "confirmed") {
        await admin.from("crm_leads").update({ status: "confirmed" }).eq("id", booking.lead_id);
        const { data: event } = await admin.from("roster_day_events").insert({ business_id: booking.business_id, date: booking.event_date, event_time: booking.start_time, event_space: booking.venue_space, event_type: booking.crm_leads?.event_type || "Confirmed event", adult_guests: booking.guest_count, notes: `Confirmed CRM booking for ${booking.crm_leads?.full_name || "client"}` }).select("id").single();
        if (event) await admin.from("crm_bookings").update({ roster_event_id: event.id }).eq("id", booking.id);
      }
      await admin.from("crm_confirmation_tokens").update({ used_at: new Date().toISOString() }).eq("id", tokenRow.id);
      booking.status = status;
    }
    return new Response(JSON.stringify({ booking }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to process confirmation" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});