import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCaller, hasBusinessRole, jsonError } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { business_id, week_start_date, employees, department_filter } = await req.json();

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Only signed-in admins / roster admins of this business may run a forecast
    const caller = await getCaller(req, supabase);
    if (!caller) return jsonError("Unauthorized", 401, corsHeaders);
    if (!hasBusinessRole(caller, business_id, ["admin", "super_admin", "roster_admin"])) {
      return jsonError("Forbidden", 403, corsHeaders);
    }


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

    // 2. Get historical data - past 12 weeks of shifts + events for deeper learning
    const historyStart = new Date(weekStart);
    historyStart.setDate(historyStart.getDate() - 84); // 12 weeks

    const employeeIds = employees.map((e: any) => e.id);

    const [histShiftsRes, histEventsRes, requestsRes] = await Promise.all([
      supabase
        .from("shifts")
        .select("employee_id, date, day_of_week, start_time, end_time, break_minutes, hours_worked, status, source, employees!inner(name, department, job_title, pay_rate, admin_hourly_rate, business_id)")
        .eq("employees.business_id", business_id)
        .gte("date", fmtDate(historyStart))
        .lt("date", fmtDate(weekStart))
        .in("status", ["published", "draft"])
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
        .in("employee_id", employeeIds),
    ]);

    let histShifts = histShiftsRes.data || [];
    const histEvents = histEventsRes.data || [];

    // Filter historical shifts by department if department filter is active
    if (department_filter && department_filter !== "all") {
      histShifts = histShifts.filter((s: any) =>
        (s.employees as any)?.department?.toUpperCase() === department_filter.toUpperCase()
      );
    }

    // Build unavailability map for the target week
    const unavailable: Record<string, string[]> = {};
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

    // 3. Build deep historical analysis

    // --- Aggregate staffing patterns by event type ---
    const eventTypePatterns: Record<string, {
      total_events: number;
      avg_staff: number;
      avg_guests: number;
      avg_hours_per_staff: number;
      avg_labour_cost: number;
      role_breakdown: Record<string, number>;
      typical_start: string;
      typical_end: string;
    }> = {};

    for (const evt of histEvents) {
      const dayShifts = histShifts.filter((s: any) => s.date === evt.date && s.status === "published");
      if (dayShifts.length === 0) continue;

      const eventType = evt.event_type || "Unknown";
      if (!eventTypePatterns[eventType]) {
        eventTypePatterns[eventType] = {
          total_events: 0, avg_staff: 0, avg_guests: 0,
          avg_hours_per_staff: 0, avg_labour_cost: 0,
          role_breakdown: {}, typical_start: "23:59", typical_end: "00:00",
        };
      }
      const p = eventTypePatterns[eventType];
      p.total_events++;

      const totalGuests = (evt.adult_guests || 0) + (evt.kids_guests || 0);
      p.avg_guests = ((p.avg_guests * (p.total_events - 1)) + totalGuests) / p.total_events;
      p.avg_staff = ((p.avg_staff * (p.total_events - 1)) + dayShifts.length) / p.total_events;

      let totalHours = 0;
      let totalCost = 0;
      for (const s of dayShifts) {
        const emp = s.employees as any;
        const [sh, sm] = (s.start_time || "0:0").split(":").map(Number);
        const [eh, em] = (s.end_time || "0:0").split(":").map(Number);
        let mins = (eh * 60 + em) - (sh * 60 + sm);
        if (mins < 0) mins += 1440;
        const netHrs = Math.max(0, (mins - (s.break_minutes || 0)) / 60);
        totalHours += netHrs;
        totalCost += netHrs * (emp?.admin_hourly_rate || emp?.pay_rate || 0);

        const role = emp?.job_title || "Staff";
        p.role_breakdown[role] = (p.role_breakdown[role] || 0) + 1;

        if (s.start_time < p.typical_start) p.typical_start = s.start_time;
        if (s.end_time > p.typical_end) p.typical_end = s.end_time;
      }
      p.avg_hours_per_staff = ((p.avg_hours_per_staff * (p.total_events - 1)) + (totalHours / dayShifts.length)) / p.total_events;
      p.avg_labour_cost = ((p.avg_labour_cost * (p.total_events - 1)) + totalCost) / p.total_events;
    }

    // Round averages for clarity
    for (const key of Object.keys(eventTypePatterns)) {
      const p = eventTypePatterns[key];
      p.avg_staff = Math.round(p.avg_staff * 10) / 10;
      p.avg_guests = Math.round(p.avg_guests);
      p.avg_hours_per_staff = Math.round(p.avg_hours_per_staff * 100) / 100;
      p.avg_labour_cost = Math.round(p.avg_labour_cost);
      // Average out role breakdown
      for (const r of Object.keys(p.role_breakdown)) {
        p.role_breakdown[r] = Math.round((p.role_breakdown[r] / p.total_events) * 10) / 10;
      }
    }

    // --- Calculate recent employee hours for fair distribution ---
    const recentWeeksCount = 4;
    const recentStart = new Date(weekStart);
    recentStart.setDate(recentStart.getDate() - recentWeeksCount * 7);
    const recentShifts = histShifts.filter((s: any) => s.date >= fmtDate(recentStart) && s.status === "published");

    const recentHoursMap: Record<string, number> = {};
    for (const s of recentShifts) {
      const [sh, sm] = (s.start_time || "0:0").split(":").map(Number);
      const [eh, em] = (s.end_time || "0:0").split(":").map(Number);
      let mins = (eh * 60 + em) - (sh * 60 + sm);
      if (mins < 0) mins += 1440;
      const netHrs = Math.max(0, (mins - (s.break_minutes || 0)) / 60);
      recentHoursMap[s.employee_id] = (recentHoursMap[s.employee_id] || 0) + netHrs;
    }

    // --- Build week-by-week history (last 6 most recent event-weeks) ---
    const weeklySnapshots: any[] = [];
    for (let w = 1; w <= 12; w++) {
      const wStart = new Date(weekStart);
      wStart.setDate(wStart.getDate() - w * 7);
      const wEnd = new Date(wStart);
      wEnd.setDate(wEnd.getDate() + 6);
      const wEvents = histEvents.filter((e: any) => e.date >= fmtDate(wStart) && e.date <= fmtDate(wEnd));
      if (wEvents.length === 0) continue;
      const wShifts = histShifts.filter((s: any) => s.date >= fmtDate(wStart) && s.date <= fmtDate(wEnd) && s.status === "published");

      weeklySnapshots.push({
        week_start: fmtDate(wStart),
        events: wEvents.map((e: any) => ({
          date: e.date,
          event_type: e.event_type,
          adult_guests: e.adult_guests,
          kids_guests: e.kids_guests,
          event_time: e.event_time,
          event_space: e.event_space,
          bev_package: e.bev_package,
          banquet_tier: e.banquet_tier,
        })),
        staffing: wShifts.map((s: any) => ({
          employee: (s.employees as any)?.name,
          department: (s.employees as any)?.department,
          job_title: (s.employees as any)?.job_title,
          date: s.date,
          start_time: s.start_time,
          end_time: s.end_time,
          break_minutes: s.break_minutes,
        })),
      });
      if (weeklySnapshots.length >= 6) break;
    }

    // 4. Prepare employee list with enriched data
    const employeeList = employees.map((e: any) => ({
      id: e.id,
      name: e.name,
      department: e.department,
      job_title: e.job_title,
      pay_rate: e.pay_rate,
      unavailable_dates: unavailable[e.id] || [],
      recent_hours_last_4_weeks: Math.round((recentHoursMap[e.id] || 0) * 100) / 100,
    }));

    // Event days for the target week
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

    const departmentNote = department_filter && department_filter !== "all"
      ? `\n\nDEPARTMENT FILTER ACTIVE: "${department_filter}". You MUST ONLY roster employees from the "${department_filter}" department. All provided employees belong to this department. Do NOT suggest staffing from other departments.`
      : "";

    const systemPrompt = `You are an expert hospitality roster optimization AI for a venue/events business. Your job is to create optimal shift rosters by deeply analyzing historical patterns and upcoming event requirements.

CORE RULES:
- ONLY generate shifts for dates that have events scheduled
- Never roster employees on dates they are unavailable
- Return ONLY valid employee IDs from the provided list
- Include appropriate break times (30 min for shifts > 5 hours, 0 for shorter)${departmentNote}

STAFFING INTELLIGENCE:
1. EVENT-DRIVEN STAFFING: Match staffing levels to event type, guest count, and complexity. Use historical patterns as your baseline.
2. ROLE-BASED ALLOCATION: Ensure the right mix of roles (supervisors/managers for large events, bartenders for cocktail events, etc.). Match the role breakdown seen in historical data for similar event types.
3. GUEST-TO-STAFF RATIO: Maintain ratios consistent with historical patterns. If 100 guests typically needed 8 staff, scale proportionally.
4. FAIR HOUR DISTRIBUTION: Prioritize employees with FEWER recent hours (last 4 weeks) to ensure equitable distribution. Avoid consistently overloading the same staff.
5. LABOUR COST AWARENESS: Keep labour costs in line with historical averages for similar events. Don't over-staff beyond what history shows was effective.
6. SHIFT TIMING & EVENT LIFECYCLE: Each event has a start time (and sometimes an end time) in the "event_time" field. You MUST plan shifts around this:
   - PRE-EVENT (Opening Tasks): Staff must arrive 1.5–2 hours BEFORE the event start time for venue setup, table arrangement, AV checks, bar prep, and décor.
   - DURING EVENT: Full staffing throughout the event duration.
   - POST-EVENT (Closing Tasks): Staff should remain 1–1.5 hours AFTER the event ends for pack-down, cleaning, restocking, and venue close.
   - If the event_time contains a range (e.g. "6:00 PM - 11:00 PM"), use both times. If only a start time is given, estimate the event duration based on event type (weddings ~5-6hrs, corporate ~3-4hrs, birthday ~4-5hrs).
   - Not all staff need to cover the full window — stagger arrivals (setup crew early, service crew closer to start) and departures (some leave after service, others stay for packdown).
   - Supervisors/managers should typically cover the full window (setup to close).
7. PROGRESSIVE LEARNING: As more weeks of data accumulate, your patterns should become more refined. Weight recent weeks more heavily than older ones.

SHIFT ALLOCATION PRINCIPLES:
- Spread shifts across all available employees rather than concentrating on a few
- Consider each employee's total weekly hours for work-life balance
- Senior roles (supervisor/manager) should be rostered for complex or large events
- Newer or junior staff can handle smaller, simpler events with less supervision`;

    const userPrompt = `UPCOMING EVENTS THIS WEEK:
${JSON.stringify(eventDays, null, 2)}

AVAILABLE EMPLOYEES (with recent workload):
${JSON.stringify(employeeList, null, 2)}

HISTORICAL PATTERNS BY EVENT TYPE:
${JSON.stringify(eventTypePatterns, null, 2)}

RECENT WEEK-BY-WEEK ROSTER HISTORY (most recent first):
${JSON.stringify(weeklySnapshots, null, 2)}

INSTRUCTIONS:
Analyze the historical patterns carefully:
- For each upcoming event, find the closest matching event type in history
- Match staffing levels, role mix, and shift timings to what worked before
- Prioritize employees with lower recent hours for fair distribution
- Ensure role coverage matches historical patterns (e.g., if weddings always had 1 supervisor, include one)
- Keep labour costs aligned with historical averages

Generate an optimal roster for this week.`;

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.3-70b-versatile",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_roster",
              description: "Return suggested shifts for each event day with reasoning based on historical analysis",
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
                        reasoning: { type: "string", description: "Detailed explanation referencing historical patterns, guest count comparisons, and role decisions" },
                        estimated_labour_cost: { type: "number", description: "Estimated total labour cost for this day based on employee pay rates" },
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
      const errText = await aiResponse.text();
      console.error("Groq API error:", aiResponse.status, errText);
      
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
