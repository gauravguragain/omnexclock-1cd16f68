import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceKey);

    // Verify the caller is a master admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check master role
    const { data: roles } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "master")
      .is("business_id", null);

    if (!roles || roles.length === 0) {
      return new Response(JSON.stringify({ error: "Forbidden: Master admin only" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { business_id } = await req.json();
    if (!business_id || typeof business_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing business_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get all employees for this business
    const { data: employees } = await supabase
      .from("employees")
      .select("id")
      .eq("business_id", business_id);

    const employeeIds = (employees || []).map(e => e.id);

    if (employeeIds.length > 0) {
      // Delete related data for these employees
      await supabase.from("clock_events").delete().in("employee_id", employeeIds);
      await supabase.from("shifts").delete().in("employee_id", employeeIds);
      await supabase.from("timesheet_approvals").delete().in("employee_id", employeeIds);
      await supabase.from("payroll_entries").delete().in("employee_id", employeeIds);
      await supabase.from("employee_requests").delete().in("employee_id", employeeIds);
      
      // Delete forum data
      const { data: forumPosts } = await supabase
        .from("forum_posts")
        .select("id")
        .eq("business_id", business_id);
      
      const postIds = (forumPosts || []).map(p => p.id);
      if (postIds.length > 0) {
        await supabase.from("forum_reactions").delete().in("post_id", postIds);
        await supabase.from("forum_comments").delete().in("post_id", postIds);
      }
      await supabase.from("forum_posts").delete().eq("business_id", business_id);

      // Delete employees
      await supabase.from("employees").delete().eq("business_id", business_id);
    }

    // Delete audit logs for this business
    await supabase.from("audit_logs").delete().eq("business_id", business_id);

    // Delete user roles for this business
    await supabase.from("user_roles").delete().eq("business_id", business_id);

    // Delete the business itself
    const { error: deleteError } = await supabase
      .from("businesses")
      .delete()
      .eq("id", business_id);

    if (deleteError) {
      console.error("Failed to delete business:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete business" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: caller.id,
      action: "business_deleted",
      details: { deleted_business_id: business_id },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Delete business error:", error);
    return new Response(JSON.stringify({ error: "Unable to process request" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
