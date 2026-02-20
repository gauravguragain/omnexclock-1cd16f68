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
    const { messages, businessId } = await req.json();
    if (!messages || !businessId) {
      return new Response(JSON.stringify({ error: "messages and businessId are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch all business data in parallel
    const [
      businessRes,
      employeesRes,
      clockEventsRes,
      shiftsRes,
      requestsRes,
      timesheetApprovalsRes,
      inventoryRes,
      barInventoryRes,
      rosterEventsRes,
      serviceTasksRes,
      payrollRes,
    ] = await Promise.all([
      supabase.from("businesses").select("*").eq("id", businessId).single(),
      supabase.from("employees").select("id, name, employee_code, department, job_title, active, email, phone, pay_rate, admin_hourly_rate").eq("business_id", businessId),
      supabase.from("clock_events").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("timestamp", { ascending: false }).limit(200),
      supabase.from("shifts").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(200),
      supabase.from("employee_requests").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(100),
      supabase.from("timesheet_approvals").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(200),
      supabase.from("inventory_items").select("*").eq("business_id", businessId),
      supabase.from("bar_inventory_items").select("*").eq("business_id", businessId),
      supabase.from("roster_day_events").select("*").eq("business_id", businessId).order("date", { ascending: false }).limit(50),
      supabase.from("service_maintenance_tasks").select("*").eq("business_id", businessId),
      supabase.from("payroll_entries").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(200),
    ]);

    const business = businessRes.data;
    const employees = employeesRes.data || [];
    const clockEvents = clockEventsRes.data || [];
    const shifts = shiftsRes.data || [];
    const requests = requestsRes.data || [];
    const timesheetApprovals = timesheetApprovalsRes.data || [];
    const inventory = inventoryRes.data || [];
    const barInventory = barInventoryRes.data || [];
    const rosterEvents = rosterEventsRes.data || [];
    const serviceTasks = serviceTasksRes.data || [];
    const payroll = payrollRes.data || [];

    const now = new Date().toISOString();

    const systemPrompt = `You are an intelligent AI assistant built into the admin panel of "${business?.name || "this business"}". You have full access to all business data and should answer questions accurately and helpfully.

Current date/time: ${now}

BUSINESS INFO:
${JSON.stringify(business, null, 2)}

EMPLOYEES (${employees.length} total):
${JSON.stringify(employees, null, 2)}

RECENT CLOCK EVENTS (last 200):
${JSON.stringify(clockEvents.map(e => ({
  employee: (e.employees as any)?.name,
  department: (e.employees as any)?.department,
  type: e.event_type,
  timestamp: e.timestamp,
  notes: e.notes,
})), null, 2)}

ROSTERED SHIFTS (last 200):
${JSON.stringify(shifts.map(s => ({
  employee: (s.employees as any)?.name,
  department: (s.employees as any)?.department,
  date: s.date,
  start: s.start_time,
  end: s.end_time,
  break_minutes: s.break_minutes,
  status: s.status,
  source: s.source,
})), null, 2)}

EMPLOYEE REQUESTS (last 100):
${JSON.stringify(requests.map(r => ({
  employee: (r.employees as any)?.name,
  type: r.request_type,
  status: r.status,
  start_date: r.start_date,
  end_date: r.end_date,
  reason: r.reason,
  admin_note: r.admin_note,
})), null, 2)}

TIMESHEET APPROVALS (last 200):
${JSON.stringify(timesheetApprovals.map(t => ({
  employee: (t.employees as any)?.name,
  date: t.date,
  approved: t.approved,
})), null, 2)}

INVENTORY (${inventory.length} items):
${JSON.stringify(inventory, null, 2)}

BAR INVENTORY (${barInventory.length} items):
${JSON.stringify(barInventory, null, 2)}

UPCOMING EVENTS (last 50):
${JSON.stringify(rosterEvents, null, 2)}

SERVICE & MAINTENANCE TASKS (${serviceTasks.length}):
${JSON.stringify(serviceTasks, null, 2)}

PAYROLL ENTRIES (last 200):
${JSON.stringify(payroll.map(p => ({
  employee: (p.employees as any)?.name,
  period: p.period,
  hours: p.employee_hours,
  employee_pay: p.employee_pay,
  admin_pay: p.admin_pay,
  status: p.status,
})), null, 2)}

INSTRUCTIONS:
- Answer questions about any aspect of the business using the data above.
- You can analyze trends, summarize data, identify issues, and provide recommendations.
- Format responses with markdown for readability (headers, lists, bold, tables).
- When calculating hours, note that overnight shifts (clock_out before clock_in) should add 24h.
- Be concise but thorough. If you don't have enough data to answer, say so.
- You are a business intelligence assistant — provide actionable insights when possible.
- All times and dates are in Australian timezone context.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          ...messages,
        ],
        stream: true,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please add credits." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI request failed");
    }

    return new Response(response.body, {
      headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
    });
  } catch (e) {
    console.error("ai-assistant error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
