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
    const { business_id, week_start_date, employees } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Get events for this week (Mon-Sun)
    const weekStart = new Date(week_start_date + "T00:00:00");
    const weekEnd = new Date(weekStart);
    weekEnd.setDate(weekEnd.getDate() + 6);
    const fmtDate = (d: Date) => d.toISOString().split("T")[0];

    const { data: weekEvents } = await supabase
      .from("roster_day_events")
      .select("*")
      .eq("business_id", business_id)
      .gte("date", fmtDate(weekStart))
      .lte("date", fmtDate(weekEnd))
      .order("date");

    if (!weekEvents || weekEvents.length === 0) {
      return new Response(
        JSON.stringify({ error: "No events found for this week. AI forecast only generates rosters for days with events." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Get historical data - past 8 weeks of shifts + events
    const historyStart = new Date(weekStart);
    historyStart.setDate(historyStart.getDate() - 56);

    const [histShiftsRes, histEventsRes, requestsRes] = await Promise.all([
      supabase
        .from("shifts")
        .select("employee_id, date, day_of_week, start_time, end_time, break_minutes, status, employees!inner(name, department, job_title, business_id)")
        .eq("employees.business_id", business_id)
        .gte("date", fmtDate(historyStart))
        .lt("date", fmtDate(weekStart))
        .eq("status", "published")
        .order("date"),
      supabase
        .from("roster_day_events")
        .select("*")
        .eq("business_id", business_id)
        .gte("date", fmtDate(historyStart))
        .lt("date", fmtDate(weekStart))
        .order("date"),
      // Get approved requests for the target week
      supabase
        .from("employee_requests")
        .select("employee_id, request_type, start_date, end_date, is_recurring, recurring_days, recurring_start_date, recurring_end_date, start_time, end_time")
        .eq("status", "approved")
        .in("employee_id", employees.map((e: any) => e.id)),
    ]);

    const histShifts = histShiftsRes.data || [];
    const histEvents = histEventsRes.data || [];

    // Build unavailability map for the target week
    const unavailable: Record<string, string[]> = {}; // emp_id -> [date1, date2...]
    const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
    for (const req of (requestsRes.data || [])) {
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart);
        d.setDate(d.getDate() + i);
        const ds = fmtDate(d);
        const dayName = FULL_DAYS[i];
        let blocked = false;
        if (req.is_recurring) {
          if ((req.recurring_days || []).includes(dayName)) {
            if (!req.recurring_start_date || ds >= req.recurring_start_date) {
              if (!req.recurring_end_date || ds <= req.recurring_end_date) {
                // Only block if all-day (no specific times)
                if (!req.start_time || !req.end_time) blocked = true;
              }
            }
          }
        } else {
          if (req.start_date && req.end_date && ds >= req.start_date && ds <= req.end_date) {
            if (!req.start_time || !req.end_time) blocked = true;
          } else if (req.start_date && ds === req.start_date) {
            if (!req.start_time || !req.end_time) blocked = true;
          }
        }
        if (blocked) {
          if (!unavailable[req.employee_id]) unavailable[req.employee_id] = [];
          unavailable[req.employee_id].push(ds);
        }
      }
    }

    // 3. Build context for AI
    const eventDays = weekEvents.map((e: any) => ({
      date: e.date,
      day: FULL_DAYS[new Date(e.date + "T00:00:00").getDay() === 0 ? 6 : new Date(e.date + "T00:00:00").getDay() - 1],
      event_type: e.event_type,
      event_space: e.event_space,
      adult_guests: e.adult_guests,
      kids_guests: e.kids_guests,
      event_time: e.event_time,
      bev_package: e.bev_package,
      banquet_tier: e.banquet_tier,
      notes: e.notes,
    }));

    // Group historical shifts by event context
    const historicalContext = histEvents.map((evt: any) => {
      const dayShifts = histShifts.filter((s: any) => s.date === evt.date);
      return {
        date: evt.date,
        event_type: evt.event_type,
        adult_guests: evt.adult_guests,
        kids_guests: evt.kids_guests,
        event_time: evt.event_time,
        staff_count: dayShifts.length,
        shifts: dayShifts.map((s: any) => ({
          employee: (s.employees as any)?.name,
          department: (s.employees as any)?.department,
          job_title: (s.employees as any)?.job_title,
          start_time: s.start_time,
          end_time: s.end_time,
        })),
      };
    });

    const employeeList = employees.map((e: any) => ({
      id: e.id,
      name: e.name,
      department: e.department,
      job_title: e.job_title,
      unavailable_dates: unavailable[e.id] || [],
    }));

    const systemPrompt = `You are a hospitality roster optimization AI for a venue/events business. Your job is to analyze upcoming events and historical staffing patterns to suggest optimal shift rosters.

RULES:
- ONLY generate shifts for dates that have events scheduled
- Consider event type, guest count, and time when deciding staffing levels
- Learn from historical patterns: similar events should have similar staffing
- Never roster employees on dates they are unavailable
- Spread hours fairly across employees when possible
- Supervisors/managers should typically be rostered for larger events
- Match shift times to event times (staff should arrive before events start)
- Include appropriate break times (typically 30 min for shifts > 5 hours)
- Return ONLY valid employee IDs from the provided list`;

    const userPrompt = `UPCOMING EVENTS THIS WEEK:
${JSON.stringify(eventDays, null, 2)}

AVAILABLE EMPLOYEES:
${JSON.stringify(employeeList, null, 2)}

HISTORICAL STAFFING PATTERNS (past 8 weeks):
${JSON.stringify(historicalContext.slice(-20), null, 2)}

Based on the upcoming events and historical patterns, generate an optimal roster. For each event day, suggest which employees should work and their shift times.`;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_roster",
              description: "Return suggested shifts for each event day",
              parameters: {
                type: "object",
                properties: {
                  forecast: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        date: { type: "string", description: "YYYY-MM-DD" },
                        day_of_week: { type: "string" },
                        reasoning: { type: "string", description: "Brief explanation of why this staffing level was chosen" },
                        shifts: {
                          type: "array",
                          items: {
                            type: "object",
                            properties: {
                              employee_id: { type: "string" },
                              employee_name: { type: "string" },
                              start_time: { type: "string", description: "HH:MM 24hr format" },
                              end_time: { type: "string", description: "HH:MM 24hr format" },
                              break_minutes: { type: "number" },
                            },
                            required: ["employee_id", "employee_name", "start_time", "end_time", "break_minutes"],
                          },
                        },
                      },
                      required: ["date", "day_of_week", "shifts", "reasoning"],
                    },
                  },
                },
                required: ["forecast"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "suggest_roster" } },
      }),
    });

    if (!aiResponse.ok) {
      if (aiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "AI rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiResponse.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits required. Please add funds." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      return new Response(JSON.stringify({ error: "AI service error" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      return new Response(JSON.stringify({ error: "AI did not return structured forecast" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const forecast = JSON.parse(toolCall.function.arguments);

    // Validate employee IDs
    const validIds = new Set(employees.map((e: any) => e.id));
    for (const day of forecast.forecast) {
      day.shifts = day.shifts.filter((s: any) => validIds.has(s.employee_id));
    }

    return new Response(JSON.stringify(forecast), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Forecast error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
