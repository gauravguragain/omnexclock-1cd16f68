import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { transcript, employees, weekDates } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const employeeList = employees.map((e: any) => `- "${e.name}" (id: ${e.id})`).join("\n");
    const dateList = weekDates.map((wd: any) => `- ${wd.dayName}: ${wd.date}`).join("\n");

    const systemPrompt = `You are a roster command parser. Given a spoken command, extract shift actions.

Available employees:
${employeeList}

Current week dates:
${dateList}

Parse the command into one or more shift actions. Each action should have:
- employee_id: the UUID of the employee (match by name — FIRST NAME ONLY is enough for a match. Case-insensitive. If someone says "Gaurav", match the employee whose first name is "Gaurav" regardless of last name.)
- employee_name: the full name of the matched employee from the list above (NOT the spoken name)
- date: YYYY-MM-DD format
- day_of_week: full day name (e.g. "Friday")
- start_time: HH:MM in 24h format
- end_time: HH:MM in 24h format
- break_minutes: default 30 unless specified
- notes: any extra notes mentioned

IMPORTANT matching rules:
- Match on FIRST NAME alone. "roster gaurav" should match an employee named "Gaurav Sharma" or "Gaurav Singh" etc.
- If multiple employees share the same first name, pick the best match but still return it (don't error).
- Partial/phonetic matches are OK — "steve" matches "Steven", "mike" matches "Michael", "rob" matches "Robert".
- Only set match_error if absolutely no employee could plausibly match the spoken name.

Time parsing rules:
- "5:30pm" = "17:30", "12am" = "00:00", "12pm" = "12:00", "midnight" = "00:00"
- If someone says "5:30 to 12" and context suggests PM to midnight, use "17:30" to "00:00"
- "9 to 5" = "09:00" to "17:00", "morning" = 09:00-17:00, "evening" = 17:00-00:00, "night" = 18:00-02:00

If you cannot match an employee name, set employee_id to null and include the spoken name in a "match_error" field.
If the command is not a roster action, return an empty actions array with an "error" field explaining why.`;

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
          { role: "user", content: `Parse this voice command: "${transcript}"` },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "roster_actions",
              description: "Return parsed roster shift actions from the voice command",
              parameters: {
                type: "object",
                properties: {
                  actions: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        employee_id: { type: "string", description: "UUID of matched employee, or null" },
                        employee_name: { type: "string", description: "Name as spoken" },
                        match_error: { type: "string", description: "Error if employee not found" },
                        date: { type: "string", description: "YYYY-MM-DD" },
                        day_of_week: { type: "string" },
                        start_time: { type: "string", description: "HH:MM 24h" },
                        end_time: { type: "string", description: "HH:MM 24h" },
                        break_minutes: { type: "number" },
                        notes: { type: "string" },
                      },
                      required: ["employee_name", "date", "day_of_week", "start_time", "end_time"],
                    },
                  },
                  error: { type: "string", description: "Error message if command is not a roster action" },
                },
                required: ["actions"],
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "roster_actions" } },
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI gateway error:", response.status, t);
      throw new Error("AI gateway error");
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall) {
      throw new Error("No tool call returned from AI");
    }

    const parsed = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("parse-roster-voice error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
