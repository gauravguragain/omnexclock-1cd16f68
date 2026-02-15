import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Simple in-memory rate limiter (per IP, resets on cold start)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const RATE_LIMIT_MAX = 10;
const RATE_LIMIT_WINDOW_MS = 60_000;

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return true;
  }
  entry.count++;
  return entry.count <= RATE_LIMIT_MAX;
}

function getSafeErrorMessage(error: any): string {
  console.error("Kiosk clock error:", error);
  if (error?.code === "23505") return "Duplicate entry detected";
  if (error?.code?.startsWith("23")) return "Data validation failed";
  return "Unable to process request. Please try again.";
}

const VALID_EVENT_TYPES = ["clock_in", "clock_out", "break_start", "break_end"];
const CODE_REGEX = /^[0-9A-Za-z\-]{1,20}$/;
const MAX_PHOTO_SIZE = 5_000_000; // ~3.5MB base64

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for") || "unknown";

  if (!checkRateLimit(clientIp)) {
    return new Response(
      JSON.stringify({ error: "Too many attempts. Please wait before trying again." }),
      { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    let body: any;
    try {
      body = await req.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid request format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { employee_code, event_type, photo_base64, device_info } = body;

    // Input validation
    if (!employee_code || typeof employee_code !== "string" || !CODE_REGEX.test(employee_code)) {
      return new Response(JSON.stringify({ error: "Invalid employee code format" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!event_type || !VALID_EVENT_TYPES.includes(event_type)) {
      return new Response(JSON.stringify({ error: "Invalid event type" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (photo_base64 && (typeof photo_base64 !== "string" || photo_base64.length > MAX_PHOTO_SIZE)) {
      return new Response(JSON.stringify({ error: "Photo too large or invalid" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate employee
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, name, active")
      .eq("employee_code", employee_code)
      .maybeSingle();

    if (empError || !employee) {
      // Log failed attempt
      await supabase.from("audit_logs").insert({
        user_id: null,
        action: "kiosk_invalid_code",
        details: { employee_code, ip: clientIp },
      });
      return new Response(JSON.stringify({ error: "Invalid employee code" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employee.active) {
      return new Response(JSON.stringify({ error: "Employee is deactivated" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Status validation
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const { data: todayEvents } = await supabase
      .from("clock_events")
      .select("event_type, created_at")
      .eq("employee_id", employee.id)
      .gte("created_at", today.toISOString())
      .order("created_at", { ascending: false });

    const lastEventType = todayEvents && todayEvents.length > 0 ? todayEvents[0].event_type : null;

    let currentStatus: string;
    switch (lastEventType) {
      case "clock_in": currentStatus = "clocked_in"; break;
      case "clock_out": currentStatus = "clocked_out"; break;
      case "break_start": currentStatus = "on_break"; break;
      case "break_end": currentStatus = "clocked_in"; break;
      default: currentStatus = "clocked_out"; break;
    }

    const validTransitions: Record<string, string[]> = {
      clocked_out: ["clock_in"],
      clocked_in: ["clock_out", "break_start"],
      on_break: ["break_end"],
    };

    const allowed = validTransitions[currentStatus] || ["clock_in"];
    if (!allowed.includes(event_type)) {
      return new Response(JSON.stringify({
        error: `Invalid action. Current status: ${currentStatus}. Allowed: ${allowed.join(", ")}`,
      }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let photo_url: string | null = null;

    if (photo_base64) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `${employee.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("clock-photos")
        .upload(fileName, bytes, { contentType: "image/jpeg", upsert: false });

      if (!uploadError) {
        // Store the path, not a public URL (bucket is now private)
        photo_url = fileName;
      }
    }

    const { data: clockEvent, error: clockError } = await supabase
      .from("clock_events")
      .insert({
        employee_id: employee.id,
        event_type,
        photo_url,
        device_info: device_info || null,
      })
      .select()
      .single();

    if (clockError) {
      await supabase.from("audit_logs").insert({
        user_id: null,
        action: "kiosk_error",
        details: { error: clockError.message, code: clockError.code, employee_code, ip: clientIp },
      });
      return new Response(JSON.stringify({ error: getSafeErrorMessage(clockError) }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await supabase.from("audit_logs").insert({
      user_id: null,
      action: `kiosk_${event_type}`,
      details: { employee_id: employee.id, employee_name: employee.name, event_type },
    });

    return new Response(
      JSON.stringify({
        success: true,
        employee_name: employee.name,
        event_type,
        timestamp: clockEvent.timestamp,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Kiosk clock unhandled error:", error);
    return new Response(
      JSON.stringify({ error: "Unable to process request. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
