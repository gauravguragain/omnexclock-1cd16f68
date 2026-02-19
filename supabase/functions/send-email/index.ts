import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailRequest {
  type: "roster_notification" | "csv_export" | "employee_induction" | "roster_pdf";
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
  // employee_induction fields
  employeeCode?: string;
  jobTitle?: string;
  department?: string;
  businessName?: string;
  // roster_pdf fields
  pdfBase64?: string;
  pdfFilename?: string;
  adminName?: string;
  senderName?: string;
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
    } else if (body.type === "employee_induction") {
      if (!body.to || !body.employeeName) {
        throw new Error("Missing required fields for employee induction");
      }

      const portalUrl = body.portalUrl || "https://omnexclock.lovable.app/portal";

      const html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;background:#ffffff;">
          <!-- Header -->
          <div style="text-align:center;padding:40px 20px 20px;background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);border-radius:12px 12px 0 0;">
            <h1 style="color:#c9a227;font-size:28px;margin:0;letter-spacing:1px;">OmnexClock</h1>
            <p style="color:#a0a0a0;font-size:12px;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px;">Time & Workforce Management</p>
          </div>
          
          <!-- Welcome Banner -->
          <div style="background:#fef9e7;padding:24px 30px;border-left:4px solid #c9a227;">
            <h2 style="margin:0 0 8px;font-size:22px;color:#1a1a1a;">Welcome to the Team, ${body.employeeName}! 🎉</h2>
            <p style="color:#555;font-size:14px;margin:0;line-height:1.6;">
              We're thrilled to have you join <strong>${body.businessName || "our team"}</strong>. This packet contains everything you need to get started.
            </p>
          </div>
          
          <!-- Your Details Card -->
          <div style="padding:24px 30px;">
            <h3 style="color:#1a1a1a;font-size:16px;margin:0 0 16px;border-bottom:2px solid #c9a227;padding-bottom:8px;">📋 Your Details</h3>
            <table style="width:100%;font-size:14px;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 12px;background:#f8f9fa;border-radius:6px 0 0 0;font-weight:600;color:#555;width:40%;">Full Name</td>
                <td style="padding:10px 12px;background:#f8f9fa;border-radius:0 6px 0 0;">${body.employeeName}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-weight:600;color:#555;">Position</td>
                <td style="padding:10px 12px;">${body.jobTitle || "Team Member"}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;">Department</td>
                <td style="padding:10px 12px;background:#f8f9fa;">${body.department || "General"}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-weight:600;color:#555;">Employee Code</td>
                <td style="padding:10px 12px;"><span style="font-family:monospace;font-size:18px;font-weight:bold;color:#c9a227;background:#1a1a1a;padding:4px 12px;border-radius:4px;letter-spacing:3px;">${body.employeeCode || "—"}</span></td>
              </tr>
            </table>
          </div>
          
          <!-- Getting Started -->
          <div style="padding:0 30px 24px;">
            <h3 style="color:#1a1a1a;font-size:16px;margin:0 0 16px;border-bottom:2px solid #c9a227;padding-bottom:8px;">🚀 Getting Started</h3>
            
            <!-- Step 1 -->
            <div style="display:flex;margin-bottom:16px;">
              <div style="flex-shrink:0;width:32px;height:32px;background:#c9a227;color:#000;border-radius:50%;text-align:center;line-height:32px;font-weight:bold;font-size:14px;margin-right:12px;">1</div>
              <div>
                <p style="margin:0;font-weight:600;font-size:14px;color:#1a1a1a;">Access the Employee Portal</p>
                <p style="margin:4px 0 0;font-size:13px;color:#666;line-height:1.5;">Visit <a href="${portalUrl}" style="color:#c9a227;text-decoration:underline;">${portalUrl}</a> and enter your Business Code: <strong>${body.businessCode || ""}</strong></p>
              </div>
            </div>
            
            <!-- Step 2 -->
            <div style="display:flex;margin-bottom:16px;">
              <div style="flex-shrink:0;width:32px;height:32px;background:#c9a227;color:#000;border-radius:50%;text-align:center;line-height:32px;font-weight:bold;font-size:14px;margin-right:12px;">2</div>
              <div>
                <p style="margin:0;font-weight:600;font-size:14px;color:#1a1a1a;">Log In With Your Employee Code</p>
                <p style="margin:4px 0 0;font-size:13px;color:#666;line-height:1.5;">Use your 4-digit employee code <strong style="font-family:monospace;color:#c9a227;">${body.employeeCode || "—"}</strong> to access your shifts, timesheets, and more.</p>
              </div>
            </div>
            
            <!-- Step 3 -->
            <div style="display:flex;margin-bottom:0;">
              <div style="flex-shrink:0;width:32px;height:32px;background:#c9a227;color:#000;border-radius:50%;text-align:center;line-height:32px;font-weight:bold;font-size:14px;margin-right:12px;">3</div>
              <div>
                <p style="margin:0;font-weight:600;font-size:14px;color:#1a1a1a;">Explore Your Portal</p>
                <p style="margin:4px 0 0;font-size:13px;color:#666;line-height:1.5;">Once logged in, you can view your upcoming shifts, check your timesheets, submit leave requests, and stay connected via the team forum.</p>
              </div>
            </div>
          </div>
          
          <!-- What You Can Do -->
          <div style="padding:0 30px 24px;">
            <h3 style="color:#1a1a1a;font-size:16px;margin:0 0 16px;border-bottom:2px solid #c9a227;padding-bottom:8px;">📱 What You Can Do on the Portal</h3>
            <div style="display:grid;gap:8px;">
              <div style="padding:10px 14px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;font-size:13px;">
                📅 <strong>Today's Overview</strong> — See today's shift and event setup details at a glance
              </div>
              <div style="padding:10px 14px;background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;font-size:13px;">
                📋 <strong>View Roster</strong> — Check your upcoming shifts week by week
              </div>
              <div style="padding:10px 14px;background:#fef3c7;border:1px solid #fde68a;border-radius:6px;font-size:13px;">
                📊 <strong>View Timesheets</strong> — Review your worked hours and approval status
              </div>
              <div style="padding:10px 14px;background:#f3e8ff;border:1px solid #e9d5ff;border-radius:6px;font-size:13px;">
                💬 <strong>Team Forum</strong> — Stay connected with announcements and discussions
              </div>
              <div style="padding:10px 14px;background:#fce7f3;border:1px solid #fbcfe8;border-radius:6px;font-size:13px;">
                📝 <strong>Submit Requests</strong> — Apply for leave or flag availability changes
              </div>
              <div style="padding:10px 14px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;font-size:13px;">
                🔔 <strong>Notifications</strong> — Receive updates on roster changes and request approvals
              </div>
            </div>
          </div>
          
          <!-- CTA Button -->
          <div style="text-align:center;padding:0 30px 30px;">
            <a href="${portalUrl}" style="display:inline-block;background:#c9a227;color:#000;text-decoration:none;padding:14px 40px;border-radius:8px;font-weight:bold;font-size:15px;letter-spacing:0.5px;">
              Go to Employee Portal →
            </a>
          </div>
          
          <!-- Important Notes -->
          <div style="padding:20px 30px;background:#fef2f2;border-top:1px solid #fecaca;">
            <h4 style="margin:0 0 8px;font-size:13px;color:#991b1b;">🔒 Important Security Notes</h4>
            <ul style="margin:0;padding:0 0 0 16px;font-size:12px;color:#7f1d1d;line-height:1.7;">
              <li>Keep your employee code <strong>confidential</strong> — do not share it with others.</li>
              <li>Contact your manager if you have any issues accessing the portal.</li>
            </ul>
          </div>
          
          <!-- Footer -->
          <div style="text-align:center;padding:20px 30px;background:#f8f9fa;border-radius:0 0 12px 12px;">
            <p style="color:#999;font-size:11px;margin:0;">
              This is an automated welcome email from <strong>${body.businessName || "OmnexClock"}</strong>.<br/>
              If you received this in error, please contact your manager.
            </p>
          </div>
        </div>
      `;

      emailPayload = {
        from: `${body.businessName || "OmnexClock"} <noreply@omnexventures.com>`,
        to: [body.to],
        subject: `Welcome to ${body.businessName || "the team"}, ${body.employeeName}! 🎉 — Your Induction Packet`,
        html,
      };
    } else if (body.type === "roster_pdf") {
      if (!body.to || !body.pdfBase64 || !body.weekLabel) {
        throw new Error("Missing required fields for roster PDF email");
      }

      const html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;background:#ffffff;">
          <!-- Header -->
          <div style="text-align:center;padding:30px 20px 16px;background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);border-radius:12px 12px 0 0;">
            <h1 style="color:#c9a227;font-size:24px;margin:0;letter-spacing:1px;">OmnexClock</h1>
            <p style="color:#a0a0a0;font-size:11px;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px;">Roster Report</p>
          </div>
          
          <!-- Body -->
          <div style="padding:24px 30px;">
            <h2 style="margin:0 0 12px;font-size:18px;color:#1a1a1a;">📋 Weekly Roster — ${body.weekLabel}</h2>
            <p style="color:#555;font-size:14px;line-height:1.6;">
              Hi ${body.adminName || 'Admin'},
            </p>
            <p style="color:#555;font-size:14px;line-height:1.6;">
              Please find the attached roster for <strong>${body.weekLabel}</strong>.
              ${body.senderName ? `This was sent by <strong>${body.senderName}</strong>.` : ''}
            </p>
            <div style="margin:20px 0;padding:14px 16px;background:#f0f9ff;border:1px solid #bae6fd;border-radius:6px;">
              <p style="margin:0;font-size:13px;color:#0369a1;font-weight:600;">📎 Attachment</p>
              <p style="margin:4px 0 0;font-size:12px;color:#475569;">
                The roster PDF is attached to this email. Open it to view the full schedule with all employee shifts, hours, and event details.
              </p>
            </div>
          </div>
          
          <!-- Disclaimer -->
          <div style="padding:16px 30px;background:#fef9e7;border-top:1px solid #f5e6b8;">
            <p style="margin:0;font-size:11px;color:#92400e;line-height:1.5;">
              <strong>⚠️ Disclaimer:</strong> The shift and break times stated in this roster are indicative and may vary according to the operational needs of the business and at the discretion of management.
            </p>
          </div>
          
          <!-- Footer -->
          <div style="text-align:center;padding:16px 30px;background:#f8f9fa;border-radius:0 0 12px 12px;">
            <p style="color:#999;font-size:11px;margin:0;">
              This is an automated email from <strong>${body.businessName || "OmnexClock"}</strong>.
            </p>
          </div>
        </div>
      `;

      emailPayload = {
        from: `${body.businessName || "OmnexClock"} <noreply@omnexventures.com>`,
        to: [body.to],
        subject: `Roster — ${body.weekLabel}`,
        html,
        attachments: [
          {
            filename: body.pdfFilename || `roster-${body.weekLabel}.pdf`,
            content: body.pdfBase64,
            type: "application/pdf",
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
