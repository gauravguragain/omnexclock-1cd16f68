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

    // Verify the caller is an admin
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

    const { user_id } = await req.json();
    if (!user_id || typeof user_id !== "string") {
      return new Response(JSON.stringify({ error: "Missing user_id" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Prevent self-deletion
    if (user_id === caller.id) {
      return new Response(JSON.stringify({ error: "Cannot delete your own account" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Authorisation: platform masters may delete anyone; otherwise the caller must be a
    // super_admin/admin of EVERY business the target user belongs to, and the target may
    // not be a platform master.
    const [{ data: callerRoles }, { data: targetRoles }] = await Promise.all([
      supabase.from("user_roles").select("role, business_id").eq("user_id", caller.id),
      supabase.from("user_roles").select("role, business_id").eq("user_id", user_id),
    ]);

    const isMaster = (callerRoles ?? []).some((r) => r.role === "master");
    if (!isMaster) {
      const targetIsMaster = (targetRoles ?? []).some((r) => r.role === "master");
      const adminBusinessIds = new Set(
        (callerRoles ?? [])
          .filter((r) => ["admin", "super_admin"].includes(r.role) && r.business_id)
          .map((r) => r.business_id as string),
      );
      const targetBusinessIds = (targetRoles ?? [])
        .map((r) => r.business_id)
        .filter((b): b is string => !!b);

      const sameTenant =
        targetBusinessIds.length > 0 &&
        targetBusinessIds.every((b) => adminBusinessIds.has(b));

      if (targetIsMaster || !sameTenant) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }


    // Delete user roles first
    await supabase.from("user_roles").delete().eq("user_id", user_id);

    // Delete audit logs related to this user
    await supabase.from("audit_logs").delete().eq("user_id", user_id);
    await supabase.from("master_audit_logs").delete().eq("user_id", user_id);

    // Delete profile
    await supabase.from("profiles").delete().eq("id", user_id);

    // Delete auth user (requires service role)
    const { error: deleteError } = await supabase.auth.admin.deleteUser(user_id);
    if (deleteError) {
      console.error("Failed to delete auth user:", deleteError);
      return new Response(JSON.stringify({ error: "Failed to delete user" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Audit log
    await supabase.from("audit_logs").insert({
      user_id: caller.id,
      action: "user_deleted",
      details: { deleted_user_id: user_id },
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Delete user error:", error);
    return new Response(JSON.stringify({ error: "Unable to process request" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
