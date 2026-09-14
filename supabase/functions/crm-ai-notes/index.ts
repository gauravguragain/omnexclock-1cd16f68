import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller, hasBusinessRole, serviceClient } from "../_shared/auth.ts";

const schema = z.object({ businessId: z.string().uuid(), notes: z.string().min(10).max(8000) });
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = schema.safeParse(await req.json());
    if (!parsed.success) return new Response(JSON.stringify({ error: "Valid notes are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const caller = await getCaller(req, serviceClient());
    if (!caller || !hasBusinessRole(caller, parsed.data.businessId, ["admin","super_admin","sales_marketing_manager"])) return new Response(JSON.stringify({ error: "Not authorized" }), { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const key = Deno.env.get("GEMINI_API_KEY"); if (!key) throw new Error("AI service is not configured");
    const prompt = `Return only JSON with keys summary (string), questions (string array), decisions (string array), tasks (array of objects with title and suggested_date in YYYY-MM-DD or null). Be concise and never invent facts. Notes: ${parsed.data.notes}`;
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { temperature: 0.2, responseMimeType: "application/json" } }) });
    if (!response.ok) throw new Error(`AI service failed (${response.status})`);
    const body = await response.json(); const text = body.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
    return new Response(text, { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) { return new Response(JSON.stringify({ error: error instanceof Error ? error.message : "Unable to analyse notes" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }); }
});