import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { serviceClient } from "../_shared/auth.ts";

// Maintenance utility: projects every emailed CRM run sheet into Daily Event Setup
// (roster_day_events) by calling the crm_sync_runsheet_roster RPC. Idempotent.
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const admin = serviceClient();
    const { data: sheets, error } = await admin
      .from("crm_runsheets")
      .select("id")
      .or("emailed_at.not.is.null,emailed_to.neq.{}");
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    let synced = 0;
    const failed: { id: string; error: string }[] = [];
    for (const sheet of sheets ?? []) {
      const { error: syncError } = await admin.rpc("crm_sync_runsheet_roster", { _id: sheet.id });
      if (syncError) failed.push({ id: sheet.id, error: syncError.message });
      else synced += 1;
    }
    return new Response(JSON.stringify({ total: sheets?.length ?? 0, synced, failed }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Backfill failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
