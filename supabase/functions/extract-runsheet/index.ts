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

    // ── AI Provider: Google Gemini (direct, uses GEMINI_API_KEY) ──
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");
    if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY not configured");

    // Fetch the PDF and convert to base64
    console.log("[extract-runsheet] Fetching PDF from:", pdfUrl);
    const pdfResponse = await fetch(pdfUrl);
    if (!pdfResponse.ok) throw new Error(`Failed to fetch PDF: ${pdfResponse.status} ${pdfResponse.statusText}`);
    const pdfBuffer = await pdfResponse.arrayBuffer();
    const pdfBytes = new Uint8Array(pdfBuffer);
    
    // Convert to base64 in chunks to avoid stack overflow on large files
    let pdfBase64 = "";
    const chunkSize = 8192;
    for (let i = 0; i < pdfBytes.length; i += chunkSize) {
      pdfBase64 += String.fromCharCode(...pdfBytes.slice(i, i + chunkSize));
    }
    pdfBase64 = btoa(pdfBase64);

    console.log("[extract-runsheet] PDF fetched, size:", pdfBytes.length, "bytes. Calling Gemini...");

    const systemPrompt = `You are a data extraction assistant. You will receive a PDF runsheet for an event venue. Extract the following fields from the document. If a field is not found, set it to null.

Rules:
- event_date: The date of the event in YYYY-MM-DD format.
- event_time: The time of the event as a readable string (e.g. "6:00 PM - 11:00 PM").
- event_space: The name of the event space/room/venue area.
- event_type: The type of event (e.g. Wedding, Birthday, Corporate, etc.).
- tablecloth_color: The tablecloth color. Default to "black" if not specified.
- adult_guests: Number of adult guests. Integer only.
- kids_guests: Number of kids/children guests. Integer only.
- chairs_per_table: Number of chairs per table. Default is 8.
- num_tables: Calculate as Math.ceil((adult_guests + kids_guests) / chairs_per_table).
- cold_sparkles: true/false
- dry_ice: true/false
- red_carpet: true/false
- smoke_machine: true/false
- decor_access: true/false
- live_stall: true/false
- live_stall_details: Details if live_stall is true, otherwise null.
- host_name: The name of the host/client.
- host_contact_number: The contact phone number of the host/client.
- bev_package: The beverage package or all beverage-related information. Scan the entire document for ANY mentions of drinks, alcohol, wine, beer, spirits, cocktails, soft drinks, juice, water, coffee, tea, BYO, corkage, bar tab, drink packages, or similar. If absolutely nothing beverage-related is found, set to null.
- banquet_tier: The banquet tier or menu tier name (e.g. "Premium", "Gold", "Silver"). Just the tier name.
- notes: Any other important details or special requests.`;

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            {
              parts: [
                { text: systemPrompt + "\n\nExtract all event details from this runsheet PDF." },
                {
                  inline_data: {
                    mime_type: "application/pdf",
                    data: pdfBase64,
                  },
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 8192,
            responseMimeType: "application/json",
            responseSchema: {
              type: "object",
              properties: {
                event_date: { type: "string", nullable: true },
                event_time: { type: "string", nullable: true },
                event_space: { type: "string", nullable: true },
                event_type: { type: "string", nullable: true },
                tablecloth_color: { type: "string", nullable: true },
                adult_guests: { type: "integer", nullable: true },
                kids_guests: { type: "integer", nullable: true },
                chairs_per_table: { type: "integer", nullable: true },
                num_tables: { type: "integer", nullable: true },
                cold_sparkles: { type: "boolean", nullable: true },
                dry_ice: { type: "boolean", nullable: true },
                red_carpet: { type: "boolean", nullable: true },
                smoke_machine: { type: "boolean", nullable: true },
                decor_access: { type: "boolean", nullable: true },
                live_stall: { type: "boolean", nullable: true },
                live_stall_details: { type: "string", nullable: true },
                host_name: { type: "string", nullable: true },
                host_contact_number: { type: "string", nullable: true },
                bev_package: { type: "string", nullable: true },
                banquet_tier: { type: "string", nullable: true },
                notes: { type: "string", nullable: true },
              },
            },
          },
        }),
      }
    );

    if (!response.ok) {
      const t = await response.text();
      console.error("Gemini API error:", response.status, t);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded, please try again later." }), {
          status: 429,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw new Error(`AI extraction failed: ${response.status}`);
    }

    const aiData = await response.json();
    const content = aiData.candidates?.[0]?.content?.parts?.[0]?.text || "";
    console.log("[extract-runsheet] Gemini response length:", content.length);

    const extracted = JSON.parse(content);

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
      JSON.stringify({ error: "Unable to extract runsheet data. Please try again." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
