import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Get current Australia/Sydney ISO string */
function ausNowISO(): string {
  return new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

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

    // Fetch all business data in parallel — comprehensive dataset
    const [
      businessRes,
      employeesRes,
      clockEventsRes,
      shiftsRes,
      requestsRes,
      timesheetApprovalsRes,
      inventoryRes,
      barInventoryRes,
      inventoryOrdersRes,
      barInventoryOrdersRes,
      rosterEventsRes,
      serviceTasksRes,
      payrollRes,
      auditLogsRes,
      notificationsRes,
      forumPostsRes,
    ] = await Promise.all([
      supabase.from("businesses").select("*").eq("id", businessId).single(),
      supabase.from("employees").select("*").eq("business_id", businessId),
      supabase.from("clock_events").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("timestamp", { ascending: false }).limit(500),
      supabase.from("shifts").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(500),
      supabase.from("employee_requests").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(200),
      supabase.from("timesheet_approvals").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(500),
      supabase.from("inventory_items").select("*").eq("business_id", businessId),
      supabase.from("bar_inventory_items").select("*").eq("business_id", businessId),
      supabase.from("inventory_orders").select("*, inventory_items!inner(name, category)").eq("business_id", businessId).order("created_at", { ascending: false }).limit(200),
      supabase.from("bar_inventory_orders").select("*, bar_inventory_items!inner(name, category)").eq("business_id", businessId).order("created_at", { ascending: false }).limit(200),
      supabase.from("roster_day_events").select("*").eq("business_id", businessId).order("date", { ascending: false }).limit(100),
      supabase.from("service_maintenance_tasks").select("*").eq("business_id", businessId),
      supabase.from("payroll_entries").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(500),
      supabase.from("audit_logs").select("*").eq("business_id", businessId).order("timestamp", { ascending: false }).limit(100),
      supabase.from("notifications").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(50),
      supabase.from("forum_posts").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(50),
    ]);

    const business = businessRes.data;
    const employees = employeesRes.data || [];
    const clockEvents = clockEventsRes.data || [];
    const shifts = shiftsRes.data || [];
    const requests = requestsRes.data || [];
    const timesheetApprovals = timesheetApprovalsRes.data || [];
    const inventory = inventoryRes.data || [];
    const barInventory = barInventoryRes.data || [];
    const inventoryOrders = inventoryOrdersRes.data || [];
    const barInventoryOrders = barInventoryOrdersRes.data || [];
    const rosterEvents = rosterEventsRes.data || [];
    const serviceTasks = serviceTasksRes.data || [];
    const payroll = payrollRes.data || [];
    const auditLogs = auditLogsRes.data || [];
    const notifications = notificationsRes.data || [];
    const forumPosts = forumPostsRes.data || [];

    const ausNow = ausNowISO();

    const systemPrompt = `You are an intelligent AI business assistant built into the admin panel of "${business?.name || "this business"}". You are the business's personal AI — you have FULL access to ALL business data and can analyze trends, patterns, generate reports, graphs, and provide deep actionable insights.

TIMEZONE: All dates and times are in Australia/Sydney (AEST/AEDT). Current date/time in Sydney: ${ausNow}. ALWAYS present times in 12-hour AM/PM format consistent with Australian conventions.

BUSINESS PROFILE:
${JSON.stringify(business, null, 2)}

EMPLOYEES (${employees.length} total, including inactive):
${JSON.stringify(employees.map(e => ({
  id: e.id, name: e.name, code: e.employee_code, department: e.department, 
  job_title: e.job_title, active: e.active, email: e.email, phone: e.phone,
  pay_rate: e.pay_rate, admin_hourly_rate: e.admin_hourly_rate,
})), null, 2)}

CLOCK EVENTS (last 500, newest first):
${JSON.stringify(clockEvents.map(e => ({
  employee: (e.employees as any)?.name,
  department: (e.employees as any)?.department,
  type: e.event_type,
  timestamp: e.timestamp,
  notes: e.notes,
})), null, 2)}

ROSTERED SHIFTS (last 500):
${JSON.stringify(shifts.map(s => ({
  employee: (s.employees as any)?.name,
  department: (s.employees as any)?.department,
  date: s.date, start: s.start_time, end: s.end_time,
  break_minutes: s.break_minutes, hours_worked: s.hours_worked,
  status: s.status, source: s.source, notes: s.notes,
})), null, 2)}

EMPLOYEE REQUESTS (last 200):
${JSON.stringify(requests.map(r => ({
  employee: (r.employees as any)?.name,
  type: r.request_type, status: r.status,
  start_date: r.start_date, end_date: r.end_date,
  start_time: r.start_time, end_time: r.end_time,
  reason: r.reason, admin_note: r.admin_note,
  is_recurring: r.is_recurring, recurring_days: r.recurring_days,
  created_at: r.created_at,
})), null, 2)}

TIMESHEET APPROVALS (last 500):
${JSON.stringify(timesheetApprovals.map(t => ({
  employee: (t.employees as any)?.name,
  date: t.date, approved: t.approved,
  approved_at: t.approved_at,
})), null, 2)}

FOH INVENTORY (${inventory.length} items):
${JSON.stringify(inventory, null, 2)}

BAR INVENTORY (${barInventory.length} items):
${JSON.stringify(barInventory, null, 2)}

FOH INVENTORY ORDERS (last 200):
${JSON.stringify(inventoryOrders.map(o => ({
  item: (o.inventory_items as any)?.name,
  category: (o.inventory_items as any)?.category,
  quantity: o.quantity, status: o.status, notes: o.notes,
  created_at: o.created_at,
})), null, 2)}

BAR INVENTORY ORDERS (last 200):
${JSON.stringify(barInventoryOrders.map(o => ({
  item: (o.bar_inventory_items as any)?.name,
  category: (o.bar_inventory_items as any)?.category,
  quantity: o.quantity, status: o.status, notes: o.notes,
  created_at: o.created_at,
})), null, 2)}

EVENTS (last 100):
${JSON.stringify(rosterEvents, null, 2)}

SERVICE & MAINTENANCE (${serviceTasks.length} tasks):
${JSON.stringify(serviceTasks, null, 2)}

PAYROLL (last 500):
${JSON.stringify(payroll.map(p => ({
  employee: (p.employees as any)?.name,
  department: (p.employees as any)?.department,
  period: p.period, hours: p.employee_hours,
  employee_pay: p.employee_pay, admin_pay: p.admin_pay,
  status: p.status, paid_at: p.paid_at,
})), null, 2)}

RECENT AUDIT LOGS (last 100):
${JSON.stringify(auditLogs.map(a => ({
  action: a.action, timestamp: a.timestamp, details: a.details,
})), null, 2)}

RECENT NOTIFICATIONS (last 50):
${JSON.stringify(notifications.map(n => ({
  title: n.title, message: n.message, type: n.type,
  read: n.read, created_at: n.created_at,
})), null, 2)}

FORUM POSTS (last 50):
${JSON.stringify(forumPosts.map(f => ({
  title: f.title, content: f.content, created_at: f.created_at,
})), null, 2)}

CAPABILITIES & INSTRUCTIONS:
1. TRENDS & PATTERNS: Identify workforce patterns (attendance reliability, overtime frequency, peak staffing days), inventory consumption trends, payroll cost trends, seasonal event patterns. Proactively surface insights.

2. CHARTS & GRAPHS: When the user asks for a graph, chart, or visual report, include a special JSON block formatted as:
\`\`\`chart
{
  "type": "bar" | "line" | "pie" | "area",
  "title": "Chart title",
  "data": [{"label": "Category", "value": 123}, ...],
  "xKey": "label",
  "yKey": "value",
  "color": "#D4A843"
}
\`\`\`
Use this for any visual data representation. You can include multiple charts in one response. Keep data arrays reasonable (max 20 entries — aggregate if needed).

3. REPORTS: Generate detailed text reports with tables, summaries, and key metrics. Use markdown tables for structured data.

4. CALCULATIONS: Use 2 decimal places for all hour/pay calculations. For overnight shifts, add 24h if clock-out < clock-in. Break deductions apply.

5. FORMAT: Use markdown extensively — headers, bold, tables, lists. Be concise but thorough. Present currency in AUD ($).

6. PERSONALITY: You are a professional, knowledgeable business intelligence assistant. Provide actionable recommendations. If data is insufficient, say so honestly.

7. ALL TIMES must be presented in 12-hour AM/PM format (Australian standard).`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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
