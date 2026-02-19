import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailRequest {
  type: "roster_notification" | "csv_export";
  // roster_notification fields
  to?: string;
  employeeName?: string;
  weekLabel?: string;
  shifts?: { day: string; date: string; start: string; end: string; breakMin: number; notes?: string }[];
  dayEvents?: { date: string; event_space?: string; event_type?: string; num_tables?: number; chairs_per_table?: number; tablecloth_color?: string; cold_sparkles?: boolean; dry_ice?: boolean; red_carpet?: boolean; decor_access?: boolean; notes?: string }[];
  portalUrl?: string;
  businessCode?: string;
  // csv_export fields
  recipientEmail?: string;
  subject?: string;
  csvData?: string;
  csvFilename?: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const body: EmailRequest = await req.json();

    let emailPayload: Record<string, unknown>;

    if (body.type === "roster_notification") {
      if (!body.to || !body.employeeName || !body.shifts) {
        throw new Error("Missing required fields for roster notification");
      }

      const shiftRows = body.shifts
        .map(
          (s) =>
            `<tr>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${s.day}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${s.date}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${s.start}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${s.end}</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${s.breakMin}m</td>
              <td style="padding:8px 12px;border:1px solid #e5e7eb;">${s.notes || "-"}</td>
            </tr>`
        )
        .join("");

      const html = `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
          <h2 style="color:#1a1a1a;">Roster Update</h2>
          <p>Hi ${body.employeeName},</p>
          <p>Your roster for <strong>${body.weekLabel}</strong> has been updated. Here are your shifts:</p>
          <table style="width:100%;border-collapse:collapse;margin:16px 0;">
            <thead>
              <tr style="background:#f3f4f6;">
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Day</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Date</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Start</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">End</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Break</th>
                <th style="padding:8px 12px;border:1px solid #e5e7eb;text-align:left;">Notes</th>
              </tr>
            </thead>
            <tbody>${shiftRows}</tbody>
          </table>
          ${(body.dayEvents && body.dayEvents.length > 0) ? `
          <h3 style="color:#1a1a1a;margin-top:24px;font-size:16px;">📋 Event Details</h3>
          ${body.dayEvents.map(ev => `
            <div style="margin:8px 0;padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;">
              <div style="font-size:13px;font-weight:600;color:#0369a1;">${ev.date}${ev.event_space ? ` — ${ev.event_space}` : ''}</div>
              ${ev.event_type ? `<div style="font-size:12px;color:#475569;margin-top:4px;">Type: <strong>${ev.event_type}</strong></div>` : ''}
              <div style="font-size:12px;color:#475569;margin-top:2px;">Tables: ${ev.num_tables || 0} (${ev.chairs_per_table || 0} chairs each) · Tablecloth: ${ev.tablecloth_color === 'black' ? '⬛ Black' : '⬜ White'}</div>
              <div style="font-size:11px;color:#64748b;margin-top:4px;">${[
                ev.cold_sparkles ? '✨ Cold Sparkles' : '',
                ev.dry_ice ? '🌫️ Dry Ice' : '',
                ev.red_carpet ? '🔴 Red Carpet' : '',
                ev.decor_access ? '🎨 Decor Access' : '',
              ].filter(Boolean).join(' · ') || 'No extras'}</div>
              ${ev.notes ? `<div style="font-size:11px;color:#94a3b8;margin-top:4px;font-style:italic;">${ev.notes}</div>` : ''}
            </div>
          `).join('')}
          ` : ''}
          ${body.portalUrl ? `
          <div style="margin-top:20px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;">
            <p style="margin:0;font-size:13px;color:#166534;font-weight:600;">📱 Access Your Employee Portal</p>
            <p style="margin:4px 0 0;font-size:12px;color:#15803d;line-height:1.5;">
              1. Open <a href="${body.portalUrl}" style="color:#0369a1;text-decoration:underline;">${body.portalUrl}</a><br/>
              2. Enter Business Code: <strong>${body.businessCode || ''}</strong><br/>
              3. Enter your 4-digit Employee Code (provided by your manager)
            </p>
          </div>
          ` : ''}
          <div style="margin-top:20px;padding:14px 16px;background:#fef9e7;border:1px solid #f5e6b8;border-radius:6px;">
            <p style="margin:0;font-size:12px;color:#92400e;line-height:1.5;">
              <strong>⚠️ Disclaimer:</strong> The shift and break times stated in this roster are indicative and may vary according to the operational needs of the business and at the discretion of management. You may be required to start earlier, finish later, or take breaks at different times depending on business demands. Please check with your manager if you have any concerns.
            </p>
          </div>
          <p style="color:#6b7280;font-size:13px;margin-top:16px;">This is an automated notification. Please contact your manager if you have questions.</p>
        </div>
      `;

      emailPayload = {
        from: "Roster <noreply@omnexventures.com>",
        to: [body.to],
        subject: `Roster Updated – ${body.weekLabel}`,
        html,
      };
    } else if (body.type === "csv_export") {
      if (!body.recipientEmail || !body.csvData || !body.subject) {
        throw new Error("Missing required fields for CSV export");
      }

      // Convert CSV string to base64 for attachment
      const csvBase64 = btoa(unescape(encodeURIComponent(body.csvData)));

      emailPayload = {
        from: "Reports <noreply@omnexventures.com>",
        to: [body.recipientEmail],
        subject: body.subject,
        html: `
          <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
            <h2 style="color:#1a1a1a;">${body.subject}</h2>
            <p>Please find the attached CSV report.</p>
            <p style="color:#6b7280;font-size:13px;">This is an automated report from your workforce management system.</p>
          </div>
        `,
        attachments: [
          {
            filename: body.csvFilename || "report.csv",
            content: csvBase64,
            type: "text/csv",
          },
        ],
      };
    } else {
      throw new Error("Invalid email type");
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify(emailPayload),
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(`Resend API error [${res.status}]: ${JSON.stringify(data)}`);
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Email send error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ success: false, error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
