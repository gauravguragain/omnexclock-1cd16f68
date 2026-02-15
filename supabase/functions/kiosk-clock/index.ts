import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    const { employee_code, event_type, photo_base64, device_info } = await req.json();

    if (!employee_code || !event_type) {
      return new Response(JSON.stringify({ error: "Missing employee_code or event_type" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate employee code
    const { data: employee, error: empError } = await supabase
      .from("employees")
      .select("id, name, active")
      .eq("employee_code", employee_code)
      .maybeSingle();

    if (empError || !employee) {
      return new Response(JSON.stringify({ error: "Invalid employee code" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!employee.active) {
      return new Response(JSON.stringify({ error: "Employee is deactivated" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let photo_url: string | null = null;

    // Upload photo if provided
    if (photo_base64) {
      const base64Data = photo_base64.replace(/^data:image\/\w+;base64,/, "");
      const bytes = Uint8Array.from(atob(base64Data), (c) => c.charCodeAt(0));
      const fileName = `${employee.id}/${Date.now()}.jpg`;

      const { error: uploadError } = await supabase.storage
        .from("clock-photos")
        .upload(fileName, bytes, { contentType: "image/jpeg", upsert: false });

      if (!uploadError) {
        const { data: urlData } = supabase.storage
          .from("clock-photos")
          .getPublicUrl(fileName);
        photo_url = urlData.publicUrl;
      }
    }

    // Insert clock event
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
      return new Response(JSON.stringify({ error: clockError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        employee_name: employee.name,
        event_type,
        timestamp: clockEvent.timestamp,
        photo_url,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
