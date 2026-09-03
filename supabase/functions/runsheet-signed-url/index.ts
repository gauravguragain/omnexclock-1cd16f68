import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller, hasBusinessRole } from "../_shared/auth.ts";

// Returns a short-lived signed URL for an event runsheet PDF.
// Access is granted either to a signed-in staff member of the owning business,
// or to an employee identified by their employee code + business code.
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json();
    const filePath = normalizeRunsheetPath(body?.file_path);
    const employeeCode = typeof body?.employee_code === "string" ? body.employee_code.trim() : "";
    const businessCode = typeof body?.business_code === "string" ? body.business_code.trim() : "";
    if (!filePath || filePath.includes("..") || filePath.length > 1024) {
      return json({ error: "Invalid input" }, 400);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) return json({ error: "Service unavailable" }, 503);
    const admin = createClient(
      supabaseUrl,
      serviceRoleKey,
    );

    // Which business owns this runsheet?
    let { data: event } = await admin
      .from("roster_day_events")
      .select("business_id")
      .eq("runsheet_url", filePath)
      .maybeSingle();

    // Older rows may contain a full public or signed storage URL. Resolve them
    // within the business encoded in the object path, then compare normalized
    // paths rather than exposing the bucket publicly again.
    if (!event) {
      const pathBusinessId = filePath.split("/")[0];
      if (/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(pathBusinessId)) {
        const { data: candidates } = await admin
          .from("roster_day_events")
          .select("business_id, runsheet_url")
          .eq("business_id", pathBusinessId)
          .not("runsheet_url", "is", null);
        event = candidates?.find((candidate) => normalizeRunsheetPath(candidate.runsheet_url) === filePath) ?? null;
      }
    }
    if (!event) return json({ error: "Not found" }, 404);

    let allowed = false;

    const caller = await getCaller(req, admin);
    if (caller && hasBusinessRole(caller, event.business_id)) allowed = true;

    if (!allowed && employeeCode && businessCode) {
      const { data: emp } = await admin
        .from("employees")
        .select("id, business_id, active, businesses!inner(business_code)")
        .eq("employee_code", employeeCode)
        .eq("business_id", event.business_id)
        .maybeSingle();
      if (
        emp?.active &&
        (emp as any).businesses?.business_code?.toUpperCase() ===
          businessCode.toUpperCase()
      ) {
        allowed = true;
      }
    }

    if (!allowed) return json({ error: "Not allowed" }, 403);

    const { data, error } = await admin.storage
      .from("event-runsheets")
      .createSignedUrl(filePath, 300);
    if (error || !data) {
      const msg = String(error?.message ?? "");
      if (/not found|NoSuchKey|not_found|does not exist/i.test(msg)) {
        return json(
          { error: "This runsheet file no longer exists in storage. Please remove it and re-upload the PDF." },
          404,
        );
      }
      return json({ error: "Unable to open runsheet" }, 500);
    }
    return json({ url: data.signedUrl });
  } catch (_e) {
    return json({ error: "Unable to open runsheet" }, 500);
  }
});

function normalizeRunsheetPath(value: unknown): string {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  const match = trimmed.match(/\/storage\/v1\/object\/(?:public\/|sign\/)?event-runsheets\/([^?#]+)/i);
  const rawPath = match?.[1] ?? trimmed.split("?")[0];
  try {
    return decodeURIComponent(rawPath).replace(/^\/+/, "");
  } catch {
    return rawPath.replace(/^\/+/, "");
  }
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
