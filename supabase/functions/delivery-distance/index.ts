import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import { getCaller } from "../_shared/auth.ts";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const ORIGIN = "Wentworthville NSW 2145, Australia";
const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";

// Driving distance from Wentworthville to a catering delivery address (signed-in staff only).
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    if (!(await getCaller(req, admin))) return json({ error: "Please sign in" }, 401);
    const body0 = await req.json().catch(() => ({}));
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY"); const KEY = Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !KEY) return json({ error: "Maps is not configured" }, 500);
    const H = { Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": KEY, "Content-Type": "application/json" };
    if (body0.action === "autocomplete") {
      const input = String(body0.input || "").trim(); const token = String(body0.sessionToken || "").slice(0, 64);
      if (input.length < 3 || input.length > 200) return json({ suggestions: [] });
      const r = await fetch(`${GATEWAY}/places/v1/places:autocomplete`, { method: "POST", headers: { ...H, "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text" },
        body: JSON.stringify({ input, sessionToken: token || undefined, includedRegionCodes: ["au"], locationBias: { circle: { center: { latitude: -33.8069, longitude: 150.9722 }, radius: 50000 } } }) });
      const t = await r.text();
      if (!r.ok) { console.error(`Autocomplete failed [${r.status}]: ${t}`); return json({ error: "Address search failed", status: r.status }, r.status); }
      return json({ suggestions: (JSON.parse(t).suggestions || []).map((s: any) => ({ placeId: s.placePrediction?.placeId, text: s.placePrediction?.text?.text })).filter((s: any) => s.placeId).slice(0, 6) });
    }
    const placeId = typeof body0.placeId === "string" && /^[\w-]{10,300}$/.test(body0.placeId) ? body0.placeId : null;
    const dest = String(body0.address || "").trim();
    if (!placeId && (dest.length < 4 || dest.length > 300)) return json({ error: "Enter a valid address" }, 400);
    const res = await fetch(`${GATEWAY}/routes/directions/v2:computeRoutes`, {
      method: "POST",
      headers: { ...H, "X-Goog-FieldMask": "routes.distanceMeters,routes.duration" },
      body: JSON.stringify({ origin: { address: ORIGIN }, destination: placeId ? { placeId } : { address: dest.includes("Australia") ? dest : `${dest}, Australia` }, travelMode: "DRIVE", regionCode: "au" }),
    });
    const body = await res.text();
    if (!res.ok) { console.error(`Routes failed [${res.status}]: ${body}`); return json({ error: "Could not calculate distance", status: res.status, details: body }, res.status); }
    const r = JSON.parse(body)?.routes?.[0];
    if (!r?.distanceMeters) return json({ error: "Address not found — check it or enter the distance manually" }, 404);
    return json({ km: Math.round(r.distanceMeters / 10) / 100, minutes: Math.round(parseInt(String(r.duration || "0")) / 60) });
  } catch (e) { return json({ error: String((e as Error).message || e) }, 500); }
});
