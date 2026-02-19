import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { pdfUrl } = await req.json();
    if (!pdfUrl) {
      return new Response(JSON.stringify({ error: "pdfUrl is required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    // Fetch the PDF and convert to base64
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) throw new Error("Failed to fetch PDF");
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are a data extraction assistant. You will receive a PDF runsheet for an event venue. Extract the following fields from the document. If a field is not found, set it to null.

Rules:
- event_space: The name of the event space/room/venue area. Extract the exact text from the runsheet, do NOT use a dropdown value. Write it exactly as it appears in the PDF.
- event_type: The type of event (e.g. Wedding, Birthday, Corporate, etc.). Extract the exact text from the runsheet.
- tablecloth_color: The tablecloth color. If not specified or says "standard", default to "black".
- adult_guests: Number of adult guests. Integer only.
- kids_guests: Number of kids/children guests. Integer only.
- chairs_per_table: Number of chairs per table. Default is 8. If stated as 10, use 10.
- num_tables: Calculate as Math.ceil((adult_guests + kids_guests) / chairs_per_table). Must be a whole number, round UP always. If explicitly stated in the document, use the stated number instead.
- cold_sparkles: true/false - whether cold sparkles are included.
- dry_ice: true/false - whether dry ice is included.
- red_carpet: true/false - whether red carpet is included.
- smoke_machine: true/false - whether a smoke machine / fog machine is included.
- decor_access: true/false - whether decor access is included/required.
- live_stall: true/false - whether there is a live food stall or live station.
- live_stall_details: If live_stall is true, describe what's included (e.g. "Live pasta station, dessert bar"). Otherwise null.
- host_name: The name of the host/client. Look for "Client", "Host", "Customer Name", or similar labels in the runsheet.
- host_contact_number: The contact phone number of the host/client. Look for phone/mobile/contact number associated with the client.
- bev_package: The beverage package selected for the event (e.g. "Gold Package", "Silver Package", "BYO", "Premium Bar", etc.). Look for "Beverage", "Bev Package", "Drinks Package", "Bar Package" or similar labels.
- notes: Any other important details or special requests mentioned.

Return ONLY valid JSON, no markdown, no extra text.`,
          },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
              {
                type: "text",
                text: "Extract all event details from this runsheet PDF. Return only JSON.",
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
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const t = await response.text();
      console.error("AI error:", response.status, t);
      throw new Error("AI extraction failed");
    }

    const aiData = await response.json();
    const content = aiData.choices?.[0]?.message?.content || "";

    // Extract JSON from response
    let jsonStr = content;
    const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1];
    }

    const extracted = JSON.parse(jsonStr.trim());

    // Ensure num_tables is calculated if not set but guests/chairs are
    if (extracted.num_tables == null && (extracted.adult_guests != null || extracted.kids_guests != null)) {
      const totalGuests = (extracted.adult_guests || 0) + (extracted.kids_guests || 0);
      const chairs = extracted.chairs_per_table || 8;
      if (totalGuests > 0) {
        extracted.num_tables = Math.ceil(totalGuests / chairs);
      }
    }

    return new Response(JSON.stringify(extracted), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-runsheet error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
