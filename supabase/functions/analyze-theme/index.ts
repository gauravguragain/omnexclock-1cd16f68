import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    if (!GROQ_API_KEY) throw new Error("GROQ_API_KEY not configured");

    const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${GROQ_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "llama-3.2-90b-vision-preview",
        messages: [
          {
            role: "system",
            content: `You are a design expert. Analyze the provided logo image and suggest 4 color themes that would work well as app themes based on the logo's colors, mood, and style.

Each theme must have these HSL values (without the hsl() wrapper, just the values like "43 72% 52%"):
- primary: Main accent color
- background: Page background (dark themes preferred)
- foreground: Text color on background
- card: Card/surface background (slightly lighter than background)
- accent: Secondary accent color
- muted: Muted background for subtle elements
- border: Border color

Return ONLY valid JSON in this exact format, no other text:
{
  "themes": [
    {
      "name": "Theme Name",
      "theme": {
        "primary": "H S% L%",
        "background": "H S% L%",
        "foreground": "H S% L%",
        "card": "H S% L%",
        "accent": "H S% L%",
        "muted": "H S% L%",
        "border": "H S% L%"
      }
    }
  ]
}

Make themes distinct: one dark luxury, one modern minimal, one bold vibrant, one warm professional.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: imageUrl },
              },
              {
                type: "text",
                text: "Analyze this logo and suggest 4 color themes for an app. Return only JSON.",
              },
            ],
          },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("Groq API error:", response.status, t);
      throw new Error("AI analysis failed");
      
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from response (may be wrapped in markdown code blocks)
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const parsed = JSON.parse(jsonStr.trim());

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
