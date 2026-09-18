import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCaller, serviceClient } from "../_shared/auth.ts";

/** Only project storage files may be fetched server-side (prevents SSRF). */
function isAllowedUrl(value: unknown): boolean {
  if (typeof value !== "string") return false;
  try {
    const target = new URL(value);
    const base = new URL(Deno.env.get("SUPABASE_URL")!);
    return target.protocol === "https:" && target.hostname === base.hostname &&
      target.pathname.startsWith("/storage/v1/object/");
  } catch {
    return false;
  }
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageUrl } = await req.json();
    if (!imageUrl) {
      return new Response(JSON.stringify({ error: "imageUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── AI Provider: Google Gemini (direct, uses GEMINI_API_KEY) ──
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    // Download the logo image and convert to base64
    const imgResponse = await fetch(imageUrl);
    if (!imgResponse.ok) throw new Error("Failed to fetch logo image");

    const imgBuffer = await imgResponse.arrayBuffer();
    const imgBytes = new Uint8Array(imgBuffer);
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < imgBytes.length; i += chunkSize) {
      binary += String.fromCharCode(...imgBytes.slice(i, i + chunkSize));
    }
    const base64 = btoa(binary);
    const mimeType = imgResponse.headers.get("content-type") || "image/png";

    const systemPrompt = `You are a design expert. Analyze the provided logo image and suggest 4 color themes that would work well as app themes based on the logo's colors, mood, and style.

Each theme must have these HSL values (without the hsl() wrapper, just the values like "43 72% 52%"):
- primary: Main accent color
- background: Page background (dark themes preferred)
- foreground: Text color on background
- card: Card/surface background (slightly lighter than background)
- accent: Secondary accent color
- muted: Muted background for subtle elements
- border: Border color

Make themes distinct: one dark luxury, one modern minimal, one bold vibrant, one warm professional.`;

    const geminiResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              parts: [
                {
                  inline_data: {
                    mime_type: mimeType,
                    data: base64,
                  },
                },
                {
                  text: "Analyze this logo and suggest 4 color themes for an app.",
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.4,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                themes: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: {
                      name: { type: "string" },
                      theme: {
                        type: "object",
                        properties: {
                          primary: { type: "string" },
                          background: { type: "string" },
                          foreground: { type: "string" },
                          card: { type: "string" },
                          accent: { type: "string" },
                          muted: { type: "string" },
                          border: { type: "string" },
                        },
                        required: ["primary", "background", "foreground", "card", "accent", "muted", "border"],
                      },
                    },
                    required: ["name", "theme"],
                  },
                },
              },
              required: ["themes"],
            },
          },
        }),
      }
    );

    if (!geminiResponse.ok) {
      const t = await geminiResponse.text();
      console.error("Gemini API error:", geminiResponse.status, t);
      if (geminiResponse.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error("AI analysis failed");
    }

    const aiData = await geminiResponse.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";

    // With responseMimeType: "application/json", Gemini returns clean JSON
    const parsed = JSON.parse(content);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("analyze-theme error:", e);
    return new Response(
      JSON.stringify({ error: "Unable to analyze theme. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
