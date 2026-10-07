import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller, hasBusinessRole, serviceClient } from "../_shared/auth.ts";

const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

const SCHEMA = `Return ONLY JSON: {"name":string,"title":string (as printed),"code":string|null,"form_type":"daily_grid"|"weekly_checklist"|"event_log"|"two_step","period":"monthly"|"weekly",
"headers":[{"key","label","type":"text"|"dropdown"|"month"|"week","options"?:string[]}],
"sections":[{"key","label","min"?:number,"max"?:number}] (items staff choose from, e.g. fridges; empty for event logs),
"sectionAttrs":[{"key","label","options"?}] (weekly checklist item columns other than the item name and days),
"checks":[{"key","label","due"?:"HH:MM"}] (e.g. AM/Mid/PM for daily grid),
"fields":[{"key","label" (exactly as on sheet),"type":"temperature"|"number"|"text"|"date"|"time"|"datetime"|"dropdown"|"yesno"|"photo"|"signature","required"?:bool,"autofill"?:"date"|"time"|"datetime"|"staff","options"?:string[],"min"?:number,"max"?:number,"conditionalLimits"?:[{"field","value","min"?,"max"?}],"hiddenWhen"?:[{"field","value"}],"step"?:"start"|"finish"}],
"limitField"?:string (field that section limits apply to),
"corrective":{"field":string,"triggers":[{"field","value"}],"defaultInRange"?:string}|null,
"exception":null|{"label","noteLabel","appliesTo","neverForField","neverFor":string[]},
"instructions":string (footer notes for staff),"openAlertHours"?:number,
"excel":{"headerCells":{headerKey:"B2"},"startRow":number (first empty data row),"columns":{key:"C"}}}
Excel column keys: daily_grid "section|check|field"; weekly "section", "attr:<key>", "day:MON".."day:SUN"; event logs the field key.
Use snake_case keys. Temperature limits in °C. Never invent fields that are not on the sheet.`;

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { businessId, sheetName, gridText, mode, formConfig } = await req.json();
    if (!businessId || !gridText) return json({ error: "businessId and gridText are required" }, 400);
    const caller = await getCaller(req, serviceClient());
    if (!caller || !hasBusinessRole(caller, businessId, ["admin", "super_admin"])) return json({ error: "Not authorized" }, 403);
    const key = Deno.env.get("GEMINI_API_KEY"); if (!key) return json({ error: "AI service is not configured" }, 500);
    const prompt = mode === "entries"
      ? `You read a FILLED paper food-safety (HACCP) log sheet exported to Excel and extract every recorded entry for this form configuration:\n${JSON.stringify(formConfig).slice(0, 12000)}\n
Return ONLY JSON: {"header_values":{headerKey:value},"entries":[{"entry_date":"YYYY-MM-DD","section_key":string|null,"check_key":string|null,"staff_name":string|null,"field_values":{fieldKey:value}}]}
Rules: use the config's section/check/field keys exactly. daily_grid: one entry per filled section+check per day (check_key from checks). weekly_checklist: one entry per ticked/initialled item per day (section_key = item key, check_key = "MON".."SUN"). event_log/two_step: one entry per filled row, section_key and check_key null.
Infer full dates from the month/year headers. Temperatures as numbers. Times as "HH:MM" 24h. Dates "YYYY-MM-DD". yesno as "yes"/"no". staff_name = initials/name/signature written on that row if any. Skip empty rows. Never invent values.\n\nSheet name: ${sheetName}\nCells (address=value):\n${String(gridText).slice(0, 30000)}`
      : `You convert a paper food-safety (HACCP) log sheet from Excel into a form configuration.\n${SCHEMA}\n\nSheet name: ${sheetName}\nCells (address=value):\n${String(gridText).slice(0, 15000)}`;
    const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1, responseMimeType: "application/json", maxOutputTokens: mode === "entries" ? 32768 : 8192 } }),
    });
    if (!r.ok) { const t = await r.text(); console.error("AI failed", r.status, t); return json({ error: `AI service failed (${r.status})` }, 502); }
    const body = await r.json();
    const text = body.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) { return json({ error: e instanceof Error ? e.message : "Unable to read sheet" }, 500); }
});
