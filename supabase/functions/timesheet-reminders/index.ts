import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const now = new Date();
    const cutoff = new Date(now);
    cutoff.setHours(cutoff.getHours() - 48);
    const cutoffDate = cutoff.toISOString().split("T")[0];

    // Find clock events from > 48 hours ago that don't have approved timesheets
    const { data: businesses } = await supabase
      .from("businesses")
      .select("id")
      .eq("status", "approved");

    if (!businesses || businesses.length === 0) {
      return new Response(JSON.stringify({ message: "No businesses" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let totalReminders = 0;

    for (const biz of businesses) {
      // Get employees with clock events older than 48h
      const { data: clockEvents } = await supabase
        .from("clock_events")
        .select("employee_id, timestamp, employees!inner(name, business_id)")
        .eq("employees.business_id", biz.id)
        .eq("event_type", "clock_out")
        .lt("timestamp", cutoff.toISOString());

      if (!clockEvents || clockEvents.length === 0) continue;

      // Get unique dates per employee
      const empDates = new Map<string, Set<string>>();
      for (const ce of clockEvents) {
        const dateStr = new Date(ce.timestamp).toISOString().split("T")[0];
        if (!empDates.has(ce.employee_id)) empDates.set(ce.employee_id, new Set());
        empDates.get(ce.employee_id)!.add(dateStr);
      }

      // Check which of these have approved timesheets
      const empIds = [...empDates.keys()];
      const { data: approvals } = await supabase
        .from("timesheet_approvals")
        .select("employee_id, date")
        .in("employee_id", empIds)
        .eq("approved", true);

      const approvedSet = new Set(
        (approvals || []).map(a => `${a.employee_id}_${a.date}`)
      );

      // Find unapproved entries
      const unapproved: { employee_id: string; employee_name: string; dates: string[] }[] = [];
      for (const ce of clockEvents) {
        const emp = ce.employee_id;
        const dates = empDates.get(emp);
        if (!dates) continue;
        const unapprovedDates = [...dates].filter(d => !approvedSet.has(`${emp}_${d}`));
        if (unapprovedDates.length > 0) {
          const existing = unapproved.find(u => u.employee_id === emp);
          if (!existing) {
            unapproved.push({
              employee_id: emp,
              employee_name: (ce.employees as any)?.name || "Unknown",
              dates: unapprovedDates,
            });
          }
        }
      }

      if (unapproved.length === 0) continue;

      // Get admin users for this business
      const { data: adminRoles } = await supabase
        .from("user_roles")
        .select("user_id")
        .eq("business_id", biz.id)
        .in("role", ["admin", "super_admin"]);

      if (!adminRoles || adminRoles.length === 0) continue;

      // Check if we already sent a reminder today
      const todayStr = now.toISOString().split("T")[0];
      const { data: existingNotifs } = await supabase
        .from("notifications")
        .select("id")
        .eq("business_id", biz.id)
        .eq("type", "timesheet_reminder")
        .gte("created_at", todayStr + "T00:00:00Z")
        .limit(1);

      if (existingNotifs && existingNotifs.length > 0) continue; // Already sent today

      const totalUnapproved = unapproved.reduce((sum, u) => sum + u.dates.length, 0);
      const empNames = unapproved.slice(0, 3).map(u => u.employee_name).join(", ");
      const moreText = unapproved.length > 3 ? ` and ${unapproved.length - 3} more` : "";

      // Send notification to each admin
      for (const role of adminRoles) {
        await supabase.from("notifications").insert({
          business_id: biz.id,
          user_id: role.user_id,
          type: "timesheet_reminder",
          title: "⏰ Unapproved Timesheets",
          message: `${totalUnapproved} timesheet entries pending approval (${empNames}${moreText}). These are older than 48 hours.`,
          metadata: { unapproved_count: totalUnapproved, employee_count: unapproved.length },
        });
        totalReminders++;
      }
    }

    return new Response(
      JSON.stringify({ message: `Sent ${totalReminders} reminder notifications` }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Reminder error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
