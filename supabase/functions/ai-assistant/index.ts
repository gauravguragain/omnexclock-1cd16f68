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

// Classify query using Groq (fast) — simple, web, or business
async function classifyQuery(userMessage: string, groqKey: string): Promise<"simple" | "business" | "web" | "both"> {
  try {
    const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${groqKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.1-8b-instant",
        messages: [
          {
            role: "system",
            content: `Classify this message into exactly one category. Reply with ONLY one word:
- "simple": greetings, small talk, jokes, general conversation, simple questions NOT about business data (e.g. "hi", "how are you", "tell me a joke", "what can you do", "thanks")
- "business": about employees, shifts, timesheets, clock events, payroll, inventory, requests, roster events, service tasks, or ANY internal company/staff data
- "web": about general knowledge, news, weather, industry trends, regulations, best practices, how-to guides NOT specific to the company
- "both": needs BOTH internal business data AND external web information`
          },
          { role: "user", content: userMessage }
        ],
        max_tokens: 5,
        temperature: 0,
      }),
    });
    if (!res.ok) return "business"; // fallback to safest option
    const data = await res.json();
    const answer = (data.choices?.[0]?.message?.content || "").trim().toLowerCase();
    if (answer.includes("simple")) return "simple";
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

// Handle simple queries with Groq (fast, lightweight)
async function handleSimpleWithGroq(
  messages: any[],
  businessName: string,
  voiceMode: boolean,
  groqKey: string,
): Promise<Response> {
  const systemPrompt = `You are the AI assistant for "${businessName}". You're friendly, helpful, and conversational. Timezone: Sydney AEST/AEDT. Now: ${ausNowISO()}.

You handle general conversation, greetings, and simple questions. For business-specific data queries (employees, timesheets, payroll, etc.), let the user know you can help with those too — just ask!

Keep responses concise and warm.${voiceMode ? "\nVOICE MODE: 1-2 sentences max. No markdown/emojis/bullet points. Talk like a mate. Just answer and stop." : ""}`;

  const groqMessages = [
    { role: "system", content: systemPrompt },
    ...messages.map((m: any) => ({ role: m.role, content: m.content })),
  ];

  const res = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${groqKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-70b-versatile",
      messages: groqMessages,
      max_tokens: 1024,
      temperature: 0.7,
      stream: true,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error("Groq API error:", res.status, errText);
    throw new Error("Groq request failed");
  }

  // Groq already returns OpenAI-compatible SSE, pass through directly
  return new Response(res.body, {
    headers: { ...corsHeaders, "Content-Type": "text/event-stream" },
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

    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get business name for simple queries (lightweight lookup)
    const businessNameRes = await supabase.from("businesses").select("name").eq("id", businessId).single();
    const businessName = businessNameRes.data?.name || "Your Business";

    // Classify the user's latest message using Groq (fast)
    const lastUserMsg = [...messages].reverse().find((m: any) => m.role === "user")?.content || "";
    const queryType = await classifyQuery(lastUserMsg, GROQ_API_KEY);
    console.log(`Query classified as: ${queryType} | Model: ${queryType === "simple" ? "Groq" : "Gemini"}`);

    // ─── SIMPLE QUERIES → GROQ (fast, no data fetch needed) ───
    if (queryType === "simple") {
      return await handleSimpleWithGroq(messages, businessName, voiceMode, GROQ_API_KEY);
    }

    // ─── BUSINESS / WEB / BOTH → GEMINI (accurate, data-grounded) ───
    const todayKey = ausTodayKey();

    // Fetch ALL business data
    const [
      businessRes, employeesRes, clockEventsRes, shiftsRes,
      requestsRes, timesheetApprovalsRes, inventoryRes, barInventoryRes,
      rosterEventsRes, serviceTasksRes, payrollRes,
    ] = await Promise.all([
      supabase.from("businesses").select("name,business_code,industry,email,phone").eq("id", businessId).single(),
      supabase.from("employees").select("id,name,employee_code,department,job_title,active,pay_rate,admin_hourly_rate").eq("business_id", businessId),
      supabase.from("clock_events").select("event_type,timestamp,notes,employees!inner(name,department,business_id)").eq("employees.business_id", businessId).order("timestamp", { ascending: false }).limit(500),
      supabase.from("shifts").select("date,day_of_week,start_time,end_time,break_minutes,hours_worked,status,notes,employees!inner(name,department,business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(500),
      supabase.from("employee_requests").select("request_type,status,start_date,end_date,reason,admin_note,created_at,employees!inner(name,business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(100),
      supabase.from("timesheet_approvals").select("date,approved,employees!inner(name,business_id)").eq("employees.business_id", businessId).order("date", { ascending: false }).limit(200),
      supabase.from("inventory_items").select("name,category,current_count,min_count,unit").eq("business_id", businessId),
      supabase.from("bar_inventory_items").select("name,category,current_count,min_count,unit").eq("business_id", businessId),
      supabase.from("roster_day_events").select("date,event_type,event_time,host_name,adult_guests,kids_guests,notes,event_space,bev_package,banquet_tier").eq("business_id", businessId).order("date", { ascending: false }).limit(100),
      supabase.from("service_maintenance_tasks").select("name,frequency_days,last_service_date,next_service_date,active").eq("business_id", businessId),
      supabase.from("payroll_entries").select("period,employee_hours,employee_pay,admin_pay,status,employees!inner(name,business_id)").eq("employees.business_id", businessId).order("created_at", { ascending: false }).limit(200),
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

    // Build compact data
    const compactClock = clockEvents.map(e => `${(e.employees as any)?.name}|${e.event_type}|${toSydneyDate(new Date(e.timestamp))} ${toSydneyTime(e.timestamp)}`).join("\n");
    const compactShifts = shifts.map(s => `${(s.employees as any)?.name}|${s.date}|${s.start_time}-${s.end_time}|${s.hours_worked}h|${s.status}`).join("\n");
    const compactRequests = requests.map(r => `${(r.employees as any)?.name}|${r.request_type}|${r.status}|${r.start_date||""}-${r.end_date||""}|${r.reason||""}`).join("\n");
    const compactEvents = rosterEvents.map(e => `${e.date}|${e.event_type||""}|${e.event_time||""}|${e.host_name||""}|A:${e.adult_guests||0}K:${e.kids_guests||0}|${e.event_space||""}|${e.notes||""}`).join("\n");
    const compactEmployees = employees.map(e => `${e.name}|${e.employee_code}|${e.department||""}|${e.job_title||""}|${e.active?"Y":"N"}|$${e.pay_rate}/$${e.admin_hourly_rate}`).join("\n");
    const compactInventory = [...inventory, ...barInventory].map(i => `${i.name}|${i.category||""}|${i.current_count}/${i.min_count}${i.unit?" "+i.unit:""}`).join("\n");
    const compactPayroll = payroll.map(p => `${(p.employees as any)?.name}|${p.period}|${p.employee_hours}h|$${p.employee_pay}/$${p.admin_pay}|${p.status}`).join("\n");
    const compactTimesheets = timesheetApprovals.map(t => `${(t.employees as any)?.name}|${t.date}|${t.approved?"✓":"✗"}`).join("\n");
    const compactService = serviceTasks.map(t => `${t.name}|every ${t.frequency_days}d|last:${t.last_service_date||"never"}|next:${t.next_service_date||"?"}|${t.active?"active":"off"}`).join("\n");

    const systemPrompt = `You are the AI assistant for "${business?.name}". You have REAL-TIME access to the business database. Timezone: Sydney AEST/AEDT. Now: ${ausNowISO()}. Today: ${todayKey}. Use DD/MM/YYYY, 12h AM/PM.

CRITICAL DATA INTEGRITY RULES:
- You MUST ONLY reference data that appears EXACTLY in the datasets below. This is REAL production data pulled from the database moments ago.
- NEVER invent, estimate, assume, or fabricate ANY names, numbers, dates, hours, amounts, or statistics.
- If data is missing, empty, or insufficient to answer a question, say "I don't have that data" or "There are no records for that". NEVER fill gaps with made-up values.
- When quoting numbers (hours, pay, counts), they MUST match the exact values in the data below. Do NOT round, estimate, or calculate values that aren't directly in the data unless doing simple arithmetic on provided numbers.
- If an employee name is not in the EMPLOYEES list below, say you can't find them. Do NOT make up employee details.
- Cross-check your response against the raw data before answering. If you catch yourself about to state something not backed by the data below, STOP and correct it.

LIVE SNAPSHOT: ${activeEmployees.length} active employees, ${departments.join("/")||"no"} departments. Clocked in now: ${currentlyClockedIn.join(", ")||"nobody"}. On break: ${onBreak.join(", ")||"nobody"}. ${pendingRequests.length} pending requests. ${lowStockFOH.length+lowStockBar.length} low stock items. ${overdueTasks.length} overdue tasks. ${upcomingEvents.length} upcoming events.

=== EMPLOYEES (name|code|dept|title|active|payRate/adminRate) ===
${compactEmployees || "(no employees)"}

=== CLOCK EVENTS (name|type|date time) — most recent first ===
${compactClock || "(no clock events)"}

=== SHIFTS (name|date|time|hours|status) — most recent first ===
${compactShifts || "(no shifts)"}

=== REQUESTS (name|type|status|dates|reason) ===
${compactRequests || "(no requests)"}

=== TIMESHEETS (name|date|approved) ===
${compactTimesheets || "(no timesheet records)"}

=== EVENTS (date|type|time|host|guests|space|notes) ===
${compactEvents || "(no events)"}

=== INVENTORY (name|category|count/min) ===
${compactInventory || "(no inventory)"}

=== PAYROLL (name|period|hours|empPay/adminPay|status) ===
${compactPayroll || "(no payroll records)"}

=== SERVICE TASKS (name|freq|last|next|status) ===
${compactService || "(no service tasks)"}

RESPONSE RULES:
- Respond conversationally. Summarise and interpret — do NOT dump raw data tables.
- Use specific names, numbers and dates from the data above, woven into natural sentences.
- Only use markdown tables if the user explicitly asks for a table.
- Charts: \`\`\`chart {"type":"bar|line|pie|area","title":"...","data":[{"label":"...","value":N}],"xKey":"label","yKey":"value","color":"#D4A843"}\`\`\`
- Overnight shifts: if clock_out < clock_in, add 24h. Net = total - break/60. Currency AUD.
- Use admin_hourly_rate for business cost, pay_rate for employee pay.
- Flag anomalies proactively (overtime, missing approvals, low stock).
- NAME MATCHING: Match user-mentioned names to the EMPLOYEES list using fuzzy/first-name matching. "steve" → "Steven", etc. If no match, say so.
- WEB SEARCH: If web research data is provided, integrate naturally and cite sources. Distinguish between internal facts and external info.`;

    const voiceAddendum = `
VOICE MODE: 1-2 sentences max. No markdown/emojis/bullet points. Talk like a mate. Use relative times ("yesterday","last Tuesday"). Round numbers naturally. First names only. Just answer and stop.`;

    // Handle web search if needed
    let webResults = "";
    if (queryType === "web" || queryType === "both") {
      webResults = await webSearch(lastUserMsg, GEMINI_API_KEY);
      console.log(`Web search returned ${webResults.length} chars`);
    }

    let finalSystemPrompt = systemPrompt;

    if (queryType === "web") {
      finalSystemPrompt = `You are the AI assistant for "${business?.name}". Timezone: Sydney AEST/AEDT. Now: ${ausNowISO()}. Today: ${todayKey}. Use DD/MM/YYYY, 12h AM/PM.

The user asked a general/web question. Use the web research below to answer. You still know this business context: ${business?.industry || "hospitality"} industry, ${activeEmployees.length} employees.

WEB RESEARCH:
${webResults || "No web results available."}

RULES:
- Respond conversationally. Cite sources where possible.
- If the web research is insufficient, say so honestly.
- Charts are fine when they add value: \`\`\`chart {"type":"bar|line|pie|area","title":"...","data":[{"label":"...","value":N}],"xKey":"label","yKey":"value","color":"#D4A843"}\`\`\`
- NEVER fabricate data or statistics.`;
    } else if (queryType === "both" && webResults) {
      finalSystemPrompt += `\n\nWEB RESEARCH (external data to complement business analysis):\n${webResults}`;
    }

    if (voiceMode) finalSystemPrompt += voiceAddendum;

    // Build Gemini conversation format
    const geminiContents = [];
    for (const msg of messages) {
      geminiContents.push({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }],
      });
    }

    // Use Gemini streaming API
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:streamGenerateContent?alt=sse&key=${GEMINI_API_KEY}`;
    
    const response = await fetch(geminiUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: finalSystemPrompt }] },
        contents: geminiContents,
        generationConfig: {
          maxOutputTokens: 4096,
          temperature: 0.3,
        },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Gemini API error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again in a moment." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI request failed");
    }

    // Transform Gemini SSE stream to OpenAI-compatible SSE stream
    const reader = response.body!.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();
    
    const transformedStream = new ReadableStream({
      async start(controller) {
        let buffer = "";
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) {
              controller.enqueue(encoder.encode("data: [DONE]\n\n"));
              controller.close();
              break;
            }
            
            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split("\n");
            buffer = lines.pop() || "";
            
            for (const line of lines) {
              if (!line.startsWith("data: ")) continue;
              const jsonStr = line.slice(6).trim();
              if (!jsonStr || jsonStr === "[DONE]") continue;
              
              try {
                const geminiChunk = JSON.parse(jsonStr);
                const text = geminiChunk.candidates?.[0]?.content?.parts?.[0]?.text || "";
                if (text) {
                  const openaiChunk = {
                    choices: [{
                      delta: { content: text },
                      index: 0,
                      finish_reason: null,
                    }],
                  };
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(openaiChunk)}\n\n`));
                }
              } catch {
                // Skip malformed chunks
              }
            }
          }
        } catch (e) {
          console.error("Stream transform error:", e);
          controller.error(e);
        }
      },
    });

    return new Response(transformedStream, {
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
