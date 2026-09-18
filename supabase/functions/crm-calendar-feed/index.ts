import { createClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const pad = (n: number) => String(n).padStart(2, "0");
const toUtc = (date: Date) =>
  `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}T${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}Z`;
const esc = (text: string) => String(text || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const pretty = (text: string) => String(text || "").replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
const fold = (line: string) => line.match(/.{1,73}/g)?.join("\r\n ") ?? line;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const businessId = url.searchParams.get("b") || "";
    const token = url.searchParams.get("t") || "";
    if (!/^[0-9a-f-]{36}$/i.test(businessId) || !/^[0-9a-f]{32,128}$/i.test(token)) {
      return new Response("Calendar not found", { status: 404, headers: corsHeaders });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // The feed is only readable with the private per-business token.
    const { data: settings } = await supabase
      .from("crm_settings")
      .select("business_id")
      .eq("business_id", businessId)
      .eq("calendar_token", token)
      .maybeSingle();
    if (!settings) {
      return new Response("Calendar not found", { status: 404, headers: corsHeaders });
    }
    const [businessRes, leadRes, inspectionRes, bookingRes, taskRes] = await Promise.all([
      supabase.from("businesses").select("id,name").eq("id", businessId).maybeSingle(),
      supabase.from("crm_leads").select("id,full_name,phone,email,venue_space").eq("business_id", businessId),
      supabase.from("crm_inspections").select("*").eq("business_id", businessId).neq("status", "cancelled"),
      supabase.from("crm_bookings").select("*").eq("business_id", businessId),
      supabase.from("crm_tasks").select("*").eq("business_id", businessId).eq("status", "open"),
    ]);
    if (!businessRes.data) return new Response("Calendar not found", { status: 404, headers: corsHeaders });

    const business = businessRes.data;
    const leadName = new Map((leadRes.data || []).map((l: any) => [l.id, l]));
    const lines: string[] = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "PRODID:-//Regal Clock//Sales & Marketing//EN",
      "CALSCALE:GREGORIAN",
      "METHOD:PUBLISH",
      `X-WR-CALNAME:${esc(business.name)} — Sales & Marketing`,
      "X-WR-TIMEZONE:Australia/Sydney",
      "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
      "X-PUBLISHED-TTL:PT1H",
    ];

    const addEvent = (uid: string, start: Date, end: Date, summary: string, description: string, location: string) => {
      if (Number.isNaN(start.getTime())) return;
      lines.push(
        "BEGIN:VEVENT",
        `UID:${uid}@regal-clock`,
        `DTSTAMP:${toUtc(new Date())}`,
        `DTSTART:${toUtc(start)}`,
        `DTEND:${toUtc(Number.isNaN(end.getTime()) ? new Date(start.getTime() + 3600000) : end)}`,
        fold(`SUMMARY:${esc(summary)}`),
        fold(`DESCRIPTION:${esc(description)}`),
        fold(`LOCATION:${esc(location)}`),
        "END:VEVENT",
      );
    };

    (inspectionRes.data || []).forEach((row: any) => {
      const start = new Date(row.starts_at || row.proposed_at);
      const end = new Date(row.ends_at || start.getTime() + 3600000);
      const lead: any = leadName.get(row.lead_id);
      addEvent(
        `inspection-${row.id}`,
        start,
        end,
        `Site inspection — ${lead?.full_name || "Client"}`,
        [lead?.phone, lead?.email, row.pre_notes].filter(Boolean).join(" · "),
        pretty(row.venue_space) || business.name,
      );
    });

    (bookingRes.data || []).forEach((row: any) => {
      const start = new Date(`${row.event_date}T${String(row.start_time || "17:30").slice(0, 8)}+10:00`);
      const end = new Date(start.getTime() + Number(row.duration_minutes || 300) * 60000);
      const lead: any = leadName.get(row.lead_id);
      addEvent(
        `booking-${row.id}`,
        start,
        end,
        `Event — ${lead?.full_name || "Client"} (${row.guest_count || 0} guests)`,
        [lead?.phone, lead?.email, `Status: ${row.status}`].filter(Boolean).join(" · "),
        pretty(row.venue_space) || business.name,
      );
    });

    (taskRes.data || []).forEach((row: any) => {
      const start = new Date(row.due_at);
      const lead: any = row.lead_id ? leadName.get(row.lead_id) : null;
      addEvent(
        `task-${row.id}`,
        start,
        new Date(start.getTime() + 1800000),
        `Task — ${row.title}`,
        [lead?.full_name, row.description].filter(Boolean).join(" · "),
        business.name,
      );
    });

    lines.push("END:VCALENDAR");
    return new Response(lines.join("\r\n"), {
      headers: {
        ...corsHeaders,
        "Content-Type": "text/calendar; charset=utf-8",
        "Cache-Control": "public, max-age=900",
        "Content-Disposition": 'inline; filename="sales-calendar.ics"',
      },
    });
  } catch (error) {
    console.error("crm-calendar-feed failed", error);
    return new Response("Calendar unavailable", { status: 500, headers: corsHeaders });
  }
});
