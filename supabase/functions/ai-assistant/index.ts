import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/** Get current Australia/Sydney formatted string */
function ausNowISO(): string {
  return new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

/** Get Sydney date string YYYY-MM-DD */
function ausTodayKey(): string {
  return toSydneyDate(new Date());
}

/** Convert any Date to Sydney YYYY-MM-DD */
function toSydneyDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const dd = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${dd}`;
}

/** Convert timestamp string to Sydney time string (HH:MM AM/PM) */
function toSydneyTime(ts: string): string {
  return new Date(ts).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { messages, businessId, voiceMode } = await req.json();
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

    const todayKey = ausTodayKey();

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
      eventSetupConfigRes,
      userRolesRes,
    ] = await Promise.all([
      supabase.from("businesses").select("*").eq("id", businessId).single(),
      supabase.from("employees").select("*").eq("business_id", businessId),
      supabase.from("clock_events").select("*, employees!inner(name, department, job_title, business_id)").eq("employees.business_id", businessId).order("timestamp", { ascending: false }).limit(1000),
      supabase.from("shifts").select("*, employees!inner(name, department, job_title, business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(1000),
      supabase.from("employee_requests").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(300),
      supabase.from("timesheet_approvals").select("*, employees!inner(name, department, business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(500),
      supabase.from("inventory_items").select("*").eq("business_id", businessId),
      supabase.from("bar_inventory_items").select("*").eq("business_id", businessId),
      supabase.from("inventory_orders").select("*, inventory_items!inner(name, category)").eq("business_id", businessId).order("created_at", { ascending: false }).limit(300),
      supabase.from("bar_inventory_orders").select("*, bar_inventory_items!inner(name, category)").eq("business_id", businessId).order("created_at", { ascending: false }).limit(300),
      supabase.from("roster_day_events").select("*").eq("business_id", businessId).order("date", { ascending: false }).limit(200),
      supabase.from("service_maintenance_tasks").select("*").eq("business_id", businessId),
      supabase.from("payroll_entries").select("*, employees!inner(name, department, pay_rate, admin_hourly_rate, business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(1000),
      supabase.from("audit_logs").select("*").eq("business_id", businessId).order("timestamp", { ascending: false }).limit(200),
      supabase.from("notifications").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(100),
      supabase.from("forum_posts").select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(50),
      supabase.from("event_setup_config").select("*").eq("business_id", businessId),
      supabase.from("user_roles").select("*").eq("business_id", businessId),
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
    const eventSetupConfig = eventSetupConfigRes.data || [];
    const userRoles = userRolesRes.data || [];

    // Compute derived analytics
    const activeEmployees = employees.filter(e => e.active);
    const inactiveEmployees = employees.filter(e => !e.active);
    const departments = [...new Set(activeEmployees.map(e => e.department).filter(Boolean))];
    
    // Today's clock activity — convert each timestamp to Sydney date before comparing
    const todayClockEvents = clockEvents.filter(e => {
      if (!e.timestamp) return false;
      return toSydneyDate(new Date(e.timestamp)) === todayKey;
    });

    // Determine who is CURRENTLY clocked in by finding each employee's LAST event today
    const lastEventByEmployee = new Map<string, { type: string; name: string; time: string }>();
    for (const ev of todayClockEvents) {
      const empName = (ev.employees as any)?.name;
      if (!empName) continue;
      const existing = lastEventByEmployee.get(empName);
      if (!existing || new Date(ev.timestamp) > new Date(existing.time)) {
        lastEventByEmployee.set(empName, { type: ev.event_type, name: empName, time: ev.timestamp });
      }
    }
    const currentlyClockedIn: string[] = [];
    const onBreak: string[] = [];
    for (const [name, info] of lastEventByEmployee) {
      if (info.type === "clock_in" || info.type === "break_end") currentlyClockedIn.push(name);
      else if (info.type === "break_start") onBreak.push(name);
    }
    const clockedInToday = new Set(todayClockEvents.filter(e => e.event_type === "clock_in").map(e => (e.employees as any)?.name));
    
    // Pending requests
    const pendingRequests = requests.filter(r => r.status === "pending");
    const approvedRequests = requests.filter(r => r.status === "approved");
    const rejectedRequests = requests.filter(r => r.status === "rejected");

    // Low stock items
    const lowStockFOH = inventory.filter(i => i.current_count <= i.min_count);
    const lowStockBar = barInventory.filter(i => i.current_count <= i.min_count);

    // Overdue service tasks
    const overdueTasks = serviceTasks.filter(t => t.active && t.next_service_date && t.next_service_date < todayKey);

    const ausNow = ausNowISO();

    const systemPrompt = `You are an elite AI business intelligence assistant exclusively built for "${business?.name || "this business"}". You have FULL, UNRESTRICTED access to every piece of business data. You are the most powerful tool available to the Super Admin — think of yourself as their Chief Intelligence Officer.

TIMEZONE: Australia/Sydney (AEST/AEDT). Current: ${ausNow}. Today: ${todayKey}.
ALWAYS use 12-hour AM/PM format. Present dates as DD/MM/YYYY (Australian standard).

═══════════════════════════════════════════════
📊 LIVE BUSINESS SNAPSHOT
═══════════════════════════════════════════════
• Active Employees: ${activeEmployees.length} | Inactive: ${inactiveEmployees.length}
• Departments: ${departments.join(", ") || "None set"}
• Currently Clocked In RIGHT NOW: ${currentlyClockedIn.length > 0 ? currentlyClockedIn.join(", ") : "Nobody"}
• Currently On Break: ${onBreak.length > 0 ? onBreak.join(", ") : "Nobody"}
• People who clocked in today: ${clockedInToday.size}
• Pending Requests: ${pendingRequests.length}
• Low Stock (FOH): ${lowStockFOH.length} items | Low Stock (Bar): ${lowStockBar.length} items
• Overdue Service Tasks: ${overdueTasks.length}
• Upcoming Events: ${rosterEvents.filter(e => e.date >= todayKey).length}

═══════════════════════════════════════════════
📋 FULL DATA ACCESS
═══════════════════════════════════════════════

BUSINESS PROFILE:
${JSON.stringify(business, null, 2)}

EMPLOYEES (${employees.length} total):
${JSON.stringify(employees.map(e => ({
  id: e.id, name: e.name, code: e.employee_code, department: e.department,
  job_title: e.job_title, active: e.active, email: e.email, phone: e.phone,
  pay_rate: e.pay_rate, admin_hourly_rate: e.admin_hourly_rate,
  created_at: e.created_at,
})), null, 2)}

ADMIN USERS & ROLES (${userRoles.length}):
${JSON.stringify(userRoles.map(r => ({ user_id: r.user_id, role: r.role, departments: r.departments })), null, 2)}

CLOCK EVENTS (last 1000, newest first — all times shown in Sydney timezone):
${JSON.stringify(clockEvents.map(e => ({
  employee: (e.employees as any)?.name,
  department: (e.employees as any)?.department,
  job_title: (e.employees as any)?.job_title,
  type: e.event_type,
  timestamp_utc: e.timestamp,
  sydney_date: toSydneyDate(new Date(e.timestamp)),
  sydney_time: toSydneyTime(e.timestamp),
  notes: e.notes,
  has_photo: !!e.photo_url,
})), null, 2)}

ROSTERED SHIFTS (last 1000):
${JSON.stringify(shifts.map(s => ({
  employee: (s.employees as any)?.name,
  department: (s.employees as any)?.department,
  date: s.date, day: s.day_of_week, start: s.start_time, end: s.end_time,
  break_minutes: s.break_minutes, hours_worked: s.hours_worked,
  status: s.status, source: s.source, notes: s.notes,
})), null, 2)}

EMPLOYEE REQUESTS (last 300):
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
  date: t.date, approved: t.approved, approved_at: t.approved_at,
})), null, 2)}

FOH INVENTORY (${inventory.length} items):
${JSON.stringify(inventory, null, 2)}

BAR INVENTORY (${barInventory.length} items):
${JSON.stringify(barInventory, null, 2)}

FOH INVENTORY ORDERS (last 300):
${JSON.stringify(inventoryOrders.map(o => ({
  item: (o.inventory_items as any)?.name,
  category: (o.inventory_items as any)?.category,
  quantity: o.quantity, status: o.status, notes: o.notes, created_at: o.created_at,
})), null, 2)}

BAR INVENTORY ORDERS (last 300):
${JSON.stringify(barInventoryOrders.map(o => ({
  item: (o.bar_inventory_items as any)?.name,
  category: (o.bar_inventory_items as any)?.category,
  quantity: o.quantity, status: o.status, notes: o.notes, created_at: o.created_at,
})), null, 2)}

EVENTS (last 200):
${JSON.stringify(rosterEvents, null, 2)}

EVENT SETUP CONFIG:
${JSON.stringify(eventSetupConfig, null, 2)}

SERVICE & MAINTENANCE (${serviceTasks.length} tasks):
${JSON.stringify(serviceTasks, null, 2)}

PAYROLL (last 1000):
${JSON.stringify(payroll.map(p => ({
  employee: (p.employees as any)?.name,
  department: (p.employees as any)?.department,
  pay_rate: (p.employees as any)?.pay_rate,
  admin_rate: (p.employees as any)?.admin_hourly_rate,
  period: p.period, hours: p.employee_hours,
  employee_pay: p.employee_pay, admin_pay: p.admin_pay,
  status: p.status, paid_at: p.paid_at,
})), null, 2)}

AUDIT LOGS (last 200):
${JSON.stringify(auditLogs.map(a => ({
  action: a.action, timestamp: a.timestamp, details: a.details,
})), null, 2)}

NOTIFICATIONS (last 100):
${JSON.stringify(notifications.map(n => ({
  title: n.title, message: n.message, type: n.type,
  read: n.read, created_at: n.created_at,
})), null, 2)}

FORUM POSTS (last 50):
${JSON.stringify(forumPosts.map(f => ({
  title: f.title, content: f.content, created_at: f.created_at,
})), null, 2)}

═══════════════════════════════════════════════
🧠 YOUR CAPABILITIES & INSTRUCTIONS
═══════════════════════════════════════════════

1. **TREND & PATTERN ANALYSIS**: Proactively identify:
   - Attendance reliability scores per employee (% days on-time)
   - Overtime frequency & cost impact
   - Peak staffing days/hours vs understaffed periods
   - Inventory consumption velocity & reorder predictions
   - Payroll cost trends week-over-week, month-over-month
   - Seasonal event patterns & staffing correlations
   - Employee request patterns (who requests most leave, when)
   - Department efficiency comparisons

2. **CHARTS & GRAPHS**: Generate interactive charts using this exact format:
\`\`\`chart
{
  "type": "bar" | "line" | "pie" | "area",
  "title": "Descriptive chart title",
  "data": [{"label": "Category", "value": 123}, ...],
  "xKey": "label",
  "yKey": "value",
  "color": "#D4A843"
}
\`\`\`
   - You can include MULTIPLE charts in one response
   - Keep data arrays max 20 entries — aggregate if needed
   - Always pick the best chart type for the data (pie for proportions, line for trends, bar for comparisons, area for cumulative)

3. **COMPREHENSIVE REPORTS**: Generate detailed reports with:
   - Executive summary with key metrics
   - Detailed markdown tables
   - Trend indicators (↑ ↓ →)
   - Actionable recommendations
   - Risk flags and alerts

4. **SMART ALERTS & PROACTIVE INSIGHTS**: When asked for a summary or "what should I know", proactively flag:
   - ⚠️ Employees with excessive overtime
   - ⚠️ Unapproved timesheets older than 3 days
   - ⚠️ Low/out-of-stock inventory items
   - ⚠️ Overdue service/maintenance tasks
   - ⚠️ Pending requests needing attention
   - ⚠️ Scheduling gaps or overstaffing
   - ⚠️ Unusual clock patterns (very short shifts, missed breaks)

5. **CALCULATIONS & OVERNIGHT/PAST-MIDNIGHT SHIFTS**: 
   - 2 decimal places for hours and pay
   - CRITICAL: All clock events are attributed to the SYDNEY DATE of the clock_in. Use the "sydney_date" field provided.
   - If an employee clocks in at 10 PM on Monday and clocks out at 3 AM Tuesday, that ENTIRE shift belongs to Monday.
   - The clock_out, break_start, and break_end that happen after midnight still belong to the clock_in date.
   - For overnight shifts: total_hours = clock_out - clock_in (this naturally handles crossing midnight since we use full timestamps).
   - If the computed hours are negative, add 24 hours (this means the shift crossed midnight).
   - Break deductions apply to net hours: net_hours = total_hours - break_minutes/60
   - Currency in AUD ($)
   - Labor cost = hours × rate (use admin_hourly_rate for business cost, pay_rate for employee pay)
   - ALWAYS use the sydney_date and sydney_time fields for display — NEVER parse or show raw UTC timestamps to the user.

6. **COMPARISONS & BENCHMARKS**:
   - Compare departments, employees, weeks, months
   - Provide rankings when useful (top performers, highest cost centers)
   - Show percentage changes and growth rates

7. **FORMATTING**:
   - Use markdown extensively: headers (##, ###), **bold**, tables, lists
   - Use emoji sparingly for visual clarity (📊 📈 ⚠️ ✅ ❌ 💰)
   - Be concise but thorough
   - Present dates as DD/MM/YYYY, times as 12h AM/PM

8. **PERSONALITY**: You are a sharp, professional business intelligence assistant. You don't just answer questions — you provide context, comparisons, and actionable recommendations. If you spot something concerning in the data, mention it proactively. Always ground answers in actual data.

9. **WHEN DATA IS INSUFFICIENT**: Say so honestly and suggest what data would help. Never fabricate numbers.`;

    const voiceSystemAddendum = `

VOICE MODE — YOU ARE HAVING A REAL-TIME SPOKEN CONVERSATION. OVERRIDE ALL OTHER FORMATTING RULES.

PERSONALITY: You are a chill, friendly coworker. Not an AI. Not an assistant. Just a mate who knows the business inside out.

ABSOLUTE RULES:
- 1-2 sentences MAX. Never more unless they specifically ask for detail.
- ZERO markdown. ZERO bullet points. ZERO headers. ZERO tables. ZERO emojis. ZERO asterisks.
- NEVER say "Based on the data", "According to the records", "Let me check", "I can see that", "It appears that", "Upon reviewing".
- NEVER start with "Sure!", "Of course!", "Great question!", "Absolutely!".
- NEVER repeat what they just asked back to them.
- NEVER end with "Is there anything else?" or "Would you like to know more?" or "Let me know if you need anything".
- Just answer. Like a human would. Then stop talking.

DATES & TIMES — SPEAK LIKE A HUMAN:
- "yesterday" not "2025-02-20" or "February 20th, 2025"
- "last Tuesday" not "on the 18th of February"
- "half six" or "6:30" not "18:30:00" or "6:30 PM"
- "this morning" not "today at 09:00"
- "a couple hours ago" not "at 14:32"
- "last week" not "the week of February 10th"
- Use relative time whenever possible.

NUMBERS:
- "about 40 hours" not "39.75 hours"
- "a bit over eight grand" not "$8,247.50"
- Round naturally like humans do in conversation.

NAMES:
- First names only. Never "Employee ID" or full formal names.
- "Bikrant's been in since half six" not "Bikrant (Employee ID: BK001) clocked in at 06:30:00"

GOOD EXAMPLES:
- "Nah, nobody's in yet."
- "Yeah, Mamata and Sarun are working. Bikrant started early, around half six."
- "All good, timesheets are sorted."
- "You're low on napkins and straws."
- "Three people called in sick last week."
- "Payroll's done, came to about twelve grand total."

BAD EXAMPLES (NEVER DO THIS):
- "Based on my analysis of the clock events data, I can confirm that..."
- "Here's a summary of the current staffing situation:"
- "According to the records, Employee Bikrant (ID: BK001) initiated a clock-in event at 06:30:00 on 2025-02-21."
- "The total payroll expenditure for the period amounts to $12,450.75."`;

    const finalSystemPrompt = voiceMode ? systemPrompt + voiceSystemAddendum : systemPrompt;

    // Use Groq API (free tier) with Llama model
    let response: Response;
    
    const aiMessages = [
      { role: "system", content: finalSystemPrompt },
      ...messages,
    ];

    response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: aiMessages,
        stream: true,
        max_tokens: 4096,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI usage limit reached. Please add credits to your workspace." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Lovable AI error:", response.status, t);
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
