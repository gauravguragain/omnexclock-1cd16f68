import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller, hasBusinessRole } from "../_shared/auth.ts";

// Returns a short-lived signed URL for an event runsheet PDF.
// Access is granted either to a signed-in staff member of the owning business,
// or to an employee identified by their employee code + business code.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { file_path, employee_code, business_code } = await req.json();
    if (!file_path || typeof file_path !== "string" || file_path.includes("..")) {
      return json({ error: "Invalid input" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Which business owns this runsheet?
    const { data: event } = await admin
      .from("roster_day_events")
      .select("business_id")
      .eq("runsheet_url", file_path)
      .maybeSingle();
    if (!event) return json({ error: "Not found" }, 404);

    let allowed = false;

    const caller = await getCaller(req, admin);
    if (caller && hasBusinessRole(caller, event.business_id)) allowed = true;

    if (!allowed && employee_code && business_code) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, business_id, active, businesses!inner(business_code)")
        .eq("employee_code", employee_code)
        .eq("business_id", event.business_id)
        .maybeSingle();
      if (
        emp?.active &&
        (emp as any).businesses?.business_code?.toUpperCase() ===
          String(business_code).toUpperCase()
      ) {
        allowed = true;
      }
    }

    if (!allowed) return json({ error: "Not allowed" }, 403);

    const { data, error } = await admin.storage
      .from("event-runsheets")
      .createSignedUrl(file_path, 300);
    if (error || !data) return json({ error: "Unable to open runsheet" }, 500);
    return json({ url: data.signedUrl });
  } catch (_e) {
    return json({ error: "Unable to open runsheet" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
