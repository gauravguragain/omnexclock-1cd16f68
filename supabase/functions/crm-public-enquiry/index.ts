import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { serviceClient } from "../_shared/auth.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

const schema = z.object({
  businessCode: z.string().min(2).max(40), fullName: z.string().min(2).max(150),
  email: z.string().email().max(255).optional().or(z.literal("")), phone: z.string().max(40).optional(),
  eventType: z.string().min(1).max(100), preferredDate: z.string().date().optional().or(z.literal("")),
  flexibleDate: z.boolean().default(false), guestCount: z.number().int().positive().max(10000).optional(),
  message: z.string().max(3000).optional(), website: z.string().max(0).optional(),
});

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (parsed.data.website) return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const admin = serviceClient();
    const { data: business } = await admin.from("businesses").select("id,status").eq("business_code", parsed.data.businessCode).eq("status", "active").maybeSingle();
    if (!business) return new Response(JSON.stringify({ error: "Business not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const email = parsed.data.email?.trim().toLowerCase() || null;
    const phone = parsed.data.phone?.replace(/[^0-9]/g, "") || null;
    let duplicate = null;
    if (email || phone) {
      let query = admin.from("crm_leads").select("id,assigned_to").eq("business_id", business.id).limit(1);
      query = email ? query.eq("normalized_email", email) : query.eq("normalized_phone", phone);
      const { data } = await query.maybeSingle(); duplicate = data;
    }
    if (duplicate) {
      await admin.from("crm_interactions").insert({ business_id: business.id, lead_id: duplicate.id, interaction_type: "message", notes: `New website enquiry${parsed.data.message ? `: ${parsed.data.message}` : ""}`, logged_by: null });
      return new Response(JSON.stringify({ ok: true, matchedExisting: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const { data: settings } = await admin.from("crm_settings").select("fixed_assignee_id").eq("business_id", business.id).maybeSingle();
    const { data: lead, error } = await admin.from("crm_leads").insert({
      business_id: business.id, full_name: parsed.data.fullName.trim(), email: email || null, phone: parsed.data.phone || null,
      source: "website_form", event_type: parsed.data.eventType, preferred_dates: parsed.data.preferredDate ? [parsed.data.preferredDate] : [],
      flexible_date: parsed.data.flexibleDate, estimated_guest_count: parsed.data.guestCount || null, assigned_to: settings?.fixed_assignee_id || null,
    }).select("id").single();
    if (error) throw error;
    if (parsed.data.message && lead) await admin.from("crm_interactions").insert({ business_id: business.id, lead_id: lead.id, interaction_type: "message", notes: parsed.data.message });
    if (lead) await admin.from("crm_tasks").insert({ business_id: business.id, lead_id: lead.id, title: `Contact ${parsed.data.fullName}`, task_type: "new_lead", assigned_to: settings?.fixed_assignee_id || null, due_at: new Date(Date.now() + 4 * 3600000).toISOString(), automated: true });
    return new Response(JSON.stringify({ ok: true, matchedExisting: false }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to submit enquiry" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});