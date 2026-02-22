import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function ausNowISO(): string {
  return new Date().toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: true,
  });
}

function ausTodayKey(): string {
  return toSydneyDate(new Date());
}

function toSydneyDate(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Australia/Sydney", year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d);
  const y = parts.find(p => p.type === "year")!.value;
  const m = parts.find(p => p.type === "month")!.value;
  const dd = parts.find(p => p.type === "day")!.value;
  return `${y}-${m}-${dd}`;
}

function toSydneyTime(ts: string): string {
  return new Date(ts).toLocaleString("en-AU", {
    timeZone: "Australia/Sydney",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

// Classify whether a question needs web search, business data, or both
async function classifyQuery(userMessage: string, groqKey: string): Promise<"business" | "web" | "both"> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${groqKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: `Classify the user's question into exactly one category. Reply with ONLY one word — "business", "web", or "both".
- "business": about employees, shifts, timesheets, clock events, payroll, inventory, requests, roster events, or any internal company/staff data.
- "web": about general knowledge, news, weather, industry trends, regulations, best practices, how-to guides, or anything NOT specific to the company's internal data.
- "both": needs internal business data AND external web information to answer properly (e.g. "how do our staff hours compare to industry average?").
Reply with ONLY the single word.` },
          { role: "user", content: userMessage },
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (!res.ok) return "business";
    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    if (answer.includes("both")) return "both";
    if (answer.includes("web")) return "web";
    return "business";
  } catch {
    return "business";
  }
}

// Search the web using Gemini with Google Search grounding
async function webSearch(query: string, geminiKey: string): Promise<string> {
  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${geminiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [{ parts: [{ text: `Research the following topic and provide a concise, factual summary with key data points. Topic: ${query}` }] }],
          tools: [{ google_search: {} }],
        }),
      }
    );
    if (!res.ok) {
      console.error("Gemini search error:", res.status, await res.text());
      return "";
    }
    const data = await res.json();
    const parts = data.candidates?.[0]?.content?.parts || [];
    const textParts = parts.filter((p: any) => p.text).map((p: any) => p.text);
    // Also extract grounding sources if available
    const grounding = data.candidates?.[0]?.groundingMetadata;
    let sources = "";
    if (grounding?.groundingChunks) {
      sources = "\nSources: " + grounding.groundingChunks
        .filter((c: any) => c.web)
        .slice(0, 5)
        .map((c: any) => `${c.web.title}: ${c.web.uri}`)
        .join(" | ");
    }
    return textParts.join("\n") + sources;
  } catch (e) {
    console.error("Web search error:", e);
    return "";
  }
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

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const todayKey = ausTodayKey();

    // Fetch data with reduced limits to fit Groq's 12K TPM
    const [
      businessRes, employeesRes, clockEventsRes, shiftsRes,
      requestsRes, timesheetApprovalsRes, inventoryRes, barInventoryRes,
      rosterEventsRes, serviceTasksRes, payrollRes,
    ] = await Promise.all([
      supabase.from("businesses").select("name,business_code,industry,email,phone").eq("id", businessId).single(),
      supabase.from("employees").select("id,name,employee_code,department,job_title,active,pay_rate,admin_hourly_rate").eq("business_id", businessId),
      supabase.from("clock_events").select("event_type,timestamp,notes,employees!inner(name,department,business_id)").eq("employees.business_id", businessId).order("timestamp", { ascending: false }).limit(200),
      supabase.from("shifts").select("date,day_of_week,start_time,end_time,break_minutes,hours_worked,status,notes,employees!inner(name,department,business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(200),
      supabase.from("employee_requests").select("request_type,status,start_date,end_date,reason,admin_note,created_at,employees!inner(name,business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(50),
      supabase.from("timesheet_approvals").select("date,approved,employees!inner(name,business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(100),
      supabase.from("inventory_items").select("name,category,current_count,min_count,unit").eq("business_id", businessId),
      supabase.from("bar_inventory_items").select("name,category,current_count,min_count,unit").eq("business_id", businessId),
      supabase.from("roster_day_events").select("date,event_type,event_time,host_name,adult_guests,kids_guests,notes,event_space,bev_package,banquet_tier").eq("business_id", businessId).order("date", { ascending: false }).limit(50),
      supabase.from("service_maintenance_tasks").select("name,frequency_days,last_service_date,next_service_date,active").eq("business_id", businessId),
      supabase.from("payroll_entries").select("period,employee_hours,employee_pay,admin_pay,status,employees!inner(name,business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(100),
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

    const activeEmployees = employees.filter(e => e.active);
    const departments = [...new Set(activeEmployees.map(e => e.department).filter(Boolean))];

    // Today's clock activity
    const todayClockEvents = clockEvents.filter(e => e.timestamp && toSydneyDate(new Date(e.timestamp)) === todayKey);
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

    const pendingRequests = requests.filter(r => r.status === "pending");
    const lowStockFOH = inventory.filter(i => i.current_count <= i.min_count);
    const lowStockBar = barInventory.filter(i => i.current_count <= i.min_count);
    const overdueTasks = serviceTasks.filter(t => t.active && t.next_service_date && t.next_service_date < todayKey);
    const upcomingEvents = rosterEvents.filter(e => e.date >= todayKey);

    // Build compact data — NO pretty printing (saves ~60% tokens)
    const compactClock = clockEvents.slice(0, 100).map(e => `${(e.employees as any)?.name}|${e.event_type}|${toSydneyDate(new Date(e.timestamp))} ${toSydneyTime(e.timestamp)}`).join("\n");
    const compactShifts = shifts.slice(0, 100).map(s => `${(s.employees as any)?.name}|${s.date}|${s.start_time}-${s.end_time}|${s.hours_worked}h|${s.status}`).join("\n");
    const compactRequests = requests.map(r => `${(r.employees as any)?.name}|${r.request_type}|${r.status}|${r.start_date||""}-${r.end_date||""}|${r.reason||""}`).join("\n");
    const compactEvents = rosterEvents.map(e => `${e.date}|${e.event_type||""}|${e.event_time||""}|${e.host_name||""}|A:${e.adult_guests||0}K:${e.kids_guests||0}|${e.event_space||""}|${e.notes||""}`).join("\n");
    const compactEmployees = employees.map(e => `${e.name}|${e.employee_code}|${e.department||""}|${e.job_title||""}|${e.active?"Y":"N"}|$${e.pay_rate}/$${e.admin_hourly_rate}`).join("\n");
    const compactInventory = [...inventory, ...barInventory].map(i => `${i.name}|${i.category||""}|${i.current_count}/${i.min_count}${i.unit?" "+i.unit:""}`).join("\n");
    const compactPayroll = payroll.slice(0, 50).map(p => `${(p.employees as any)?.name}|${p.period}|${p.employee_hours}h|$${p.employee_pay}/$${p.admin_pay}|${p.status}`).join("\n");
    const compactTimesheets = timesheetApprovals.slice(0, 50).map(t => `${(t.employees as any)?.name}|${t.date}|${t.approved?"✓":"✗"}`).join("\n");
    const compactService = serviceTasks.map(t => `${t.name}|every ${t.frequency_days}d|last:${t.last_service_date||"never"}|next:${t.next_service_date||"?"}|${t.active?"active":"off"}`).join("\n");

    const systemPrompt = `You are the AI assistant for "${business?.name}". Full data access. Timezone: Sydney AEST/AEDT. Now: ${ausNowISO()}. Today: ${todayKey}. Use DD/MM/YYYY, 12h AM/PM.

SNAPSHOT: ${activeEmployees.length} active employees, ${departments.join("/")||"no"} departments. Clocked in now: ${currentlyClockedIn.join(", ")||"nobody"}. On break: ${onBreak.join(", ")||"nobody"}. ${pendingRequests.length} pending requests. ${lowStockFOH.length+lowStockBar.length} low stock items. ${overdueTasks.length} overdue tasks. ${upcomingEvents.length} upcoming events.

EMPLOYEES (name|code|dept|title|active|payRate/adminRate):
${compactEmployees}

CLOCK EVENTS (name|type|date time):
${compactClock}

SHIFTS (name|date|time|hours|status):
${compactShifts}

REQUESTS (name|type|status|dates|reason):
${compactRequests}

TIMESHEETS (name|date|approved):
${compactTimesheets}

EVENTS (date|type|time|host|guests|space|notes):
${compactEvents}

INVENTORY (name|category|count/min):
${compactInventory}

PAYROLL (name|period|hours|empPay/adminPay|status):
${compactPayroll}

SERVICE TASKS (name|freq|last|next|status):
${compactService}

RULES:
- ALWAYS respond in a natural, conversational tone. Analyse the data behind the scenes and present insights/answers as plain English sentences and paragraphs.
- NEVER dump raw data tables, pipe-delimited values, or large lists into your response. Summarise and interpret instead.
- Use specific names, numbers and dates where relevant, but weave them into sentences naturally (e.g. "Sarah worked 38 hours last week" not a table row).
- Only use markdown tables if the user explicitly asks for a table or comparison grid. Otherwise keep it conversational.
- Charts are fine when they add value: \`\`\`chart {"type":"bar|line|pie|area","title":"...","data":[{"label":"...","value":N}],"xKey":"label","yKey":"value","color":"#D4A843"}\`\`\`
- Overnight shifts: clock_out - clock_in (add 24h if negative). Net = total - break/60. Currency AUD.
- Use admin_hourly_rate for business cost, pay_rate for employee pay.
- Flag anomalies proactively (overtime, missing approvals, low stock) but explain them conversationally.
- NAME MATCHING: When the user mentions a staff member by name, use fuzzy/first-name matching to identify them from the EMPLOYEES list. Match on FIRST NAME alone — "steve" matches "Steven", "mike" matches "Michael", "rob" matches "Robert", "bec" matches "Rebecca", etc. Partial and phonetic matches are OK. If multiple employees share the same first name, pick the best contextual match. If absolutely no match, say you couldn't find that person and suggest similar names. NEVER say you don't know who someone is if their first name clearly matches an employee.
- Never fabricate data. Say if insufficient.
- WEB SEARCH: If web research data is provided below, integrate it naturally with business data. Cite sources when sharing web info. Clearly distinguish between internal business facts and external web information.`;

    const voiceAddendum = `
VOICE MODE: 1-2 sentences max. No markdown/emojis/bullet points. Talk like a mate. Use relative times ("yesterday","last Tuesday"). Round numbers naturally. First names only. Just answer and stop.`;

    // Classify the user's latest message
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    let queryType: "business" | "web" | "both" = "business";
    let webResults = "";

    if (GEMINI_API_KEY && lastUserMsg) {
      queryType = await classifyQuery(lastUserMsg, GROQ_API_KEY);
      console.log(`Query classified as: ${queryType}`);

      if (queryType === "web" || queryType === "both") {
        webResults = await webSearch(lastUserMsg, GEMINI_API_KEY);
        console.log(`Web search returned ${webResults.length} chars`);
      }
    }

    let finalSystemPrompt = systemPrompt;

    // For pure web queries, slim down business data to save tokens
    if (queryType === "web") {
      finalSystemPrompt = `You are the AI assistant for "${business?.name}". Timezone: Sydney AEST/AEDT. Now: ${ausNowISO()}. Today: ${todayKey}. Use DD/MM/YYYY, 12h AM/PM.

The user asked a general/web question. Use the web research below to answer. You still know this business context: ${business?.industry || "hospitality"} industry, ${activeEmployees.length} employees.

WEB RESEARCH:
${webResults || "No web results available."}

RULES:
- Respond conversationally. Cite sources where possible.
- If the web research is insufficient, say so honestly.
- Charts are fine when they add value: \`\`\`chart {"type":"bar|line|pie|area","title":"...","data":[{"label":"...","value":N}],"xKey":"label","yKey":"value","color":"#D4A843"}\`\`\`
- Never fabricate data.`;
    } else if (queryType === "both" && webResults) {
      finalSystemPrompt += `\n\nWEB RESEARCH (external data to complement business analysis):\n${webResults}`;
    }

    if (voiceMode) finalSystemPrompt += voiceAddendum;

    const aiMessages = [
      { role: "system", content: finalSystemPrompt },
      ...messages,
    ];

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: aiMessages,
        stream: true,
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      if (response.status === 429 || response.status === 413) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Groq API error:", response.status, t);
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
