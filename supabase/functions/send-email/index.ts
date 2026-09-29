import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCaller, jsonError, serviceClient } from "../_shared/auth.ts";
import { renderMenuHtml } from "../_shared/menuHtml.ts";
import { C, SANS, details, esc, heading, loadBrand, note, p, renderBrandedEmail, signoff, small, button } from "../_shared/emailLayout.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface EmailRequest {
  type: "roster_notification" | "csv_export" | "employee_induction" | "roster_pdf" | "report_pdf" | "runsheet";
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

    // Only signed-in admin-level users may send email through this endpoint
    const admin = serviceClient();
    const caller = await getCaller(req, admin);
    if (!caller) return jsonError("Unauthorized", 401, corsHeaders);
    const canSend =
      caller.isMaster ||
      caller.roles.some((r) =>
        ["admin", "super_admin", "roster_admin", "sales_marketing_manager"].includes(r.role)
      );
    if (!canSend) return jsonError("Forbidden", 403, corsHeaders);

    const body: EmailRequest = await req.json();


    let emailPayload: Record<string, unknown>;
    const firstBiz = caller.roles.find((r) => r.business_id)?.business_id || null;
    const brand = await loadBrand(admin, body.businessName ? { businessName: body.businessName } : { businessId: firstBiz });
    if (body.businessName && brand.name !== body.businessName) brand.name = body.businessName;
    const FROM = (label?: string) => `${brand.name}${label ? ` ${label}` : ""} <noreply@regalmanagement.com.au>`;
    const tbl = (head: string[], rows: string[][]) => `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:8px 0 22px;font-family:${SANS};font-size:13px;"><tr>${head.map((h) => `<th align="left" style="padding:9px 10px;background:${C.ink};color:${C.gold};font-weight:600;font-size:11px;letter-spacing:1px;text-transform:uppercase;">${esc(h)}</th>`).join("")}</tr>${rows.map((r, i) => `<tr style="background:${i % 2 ? C.sand : "#FFFFFF"};">${r.map((c) => `<td style="padding:8px 10px;border-bottom:1px solid ${C.line};color:${C.ink};">${c}</td>`).join("")}</tr>`).join("")}</table>`;

    if (body.type === "roster_notification") {
      if (!body.to || !body.employeeName || !body.shifts) {
        throw new Error("Missing required fields for roster notification");
      }
      const shiftTable = tbl(["Day", "Date", "Start", "End", "Break", "Notes"], body.shifts.map((s) => [esc(s.day), esc(s.date), esc(s.start), esc(s.end), `${esc(s.breakMin)}m`, esc(s.notes || "-")]));
      const events = (body.dayEvents && body.dayEvents.length > 0)
        ? heading("Event details") + body.dayEvents.map((ev) => note(
            `<strong>${esc(ev.date)}${ev.event_space ? ` — ${esc(ev.event_space)}` : ""}</strong>` +
            (ev.event_type ? `<br/>Type: ${esc(ev.event_type)}` : "") +
            `<br/>Tables: ${ev.num_tables || 0} (${ev.chairs_per_table || 0} chairs each) · Tablecloth: ${ev.tablecloth_color === "black" ? "Black" : "White"}` +
            `<br/>${[ev.cold_sparkles ? "Cold sparkles" : "", ev.dry_ice ? "Dry ice" : "", ev.red_carpet ? "Red carpet" : "", ev.decor_access ? "Decor access" : ""].filter(Boolean).join(" · ") || "No extras"}` +
            (ev.notes ? `<br/><em>${esc(ev.notes)}</em>` : ""))).join("")
        : "";
      const portal = body.portalUrl ? heading("Your employee portal") + p(`1. Open <a href="${esc(body.portalUrl)}" style="color:${C.goldDark};">${esc(body.portalUrl)}</a><br/>2. Enter business code: <strong>${esc(body.businessCode || "")}</strong><br/>3. Enter your 4-digit employee code (provided by your manager)`) : "";
      const html = renderBrandedEmail({
        brand, eyebrow: "Roster Update", title: `Your roster for ${body.weekLabel}`, preheader: `Your shifts for ${body.weekLabel}`,
        bodyHtml: p(`Hi ${esc(body.employeeName)},`) + p(`Your roster for <strong>${esc(body.weekLabel)}</strong> has been updated. Here are your shifts:`) + shiftTable + events + portal +
          note(`<strong>Please note:</strong> the shift and break times in this roster are indicative and may vary according to the operational needs of the business and at the discretion of management. You may be asked to start earlier, finish later, or take breaks at different times. Please check with your manager if you have any concerns.`),
        footerNote: "Automated roster notification. Contact your manager with any questions.",
      });
      emailPayload = { from: FROM("Roster"), to: [body.to], subject: `Roster Updated – ${body.weekLabel}`, html };
    } else if (body.type === "csv_export") {
      if (!body.recipientEmail || !body.csvData || !body.subject) {
        throw new Error("Missing required fields for CSV export");
      }
      const csvBase64 = btoa(unescape(encodeURIComponent(body.csvData)));
      const csvLines = body.csvData.split("\n").filter(l => l.trim());
      const parseRow = (line: string): string[] => {
        const cols: string[] = [];
        let cur = "", inQ = false;
        for (const ch of line) {
          if (ch === '"') { inQ = !inQ; continue; }
          if (ch === ',' && !inQ) { cols.push(cur); cur = ""; continue; }
          cur += ch;
        }
        cols.push(cur);
        return cols;
      };
      let tableHtml = "";
      if (csvLines.length > 0) {
        const headers = parseRow(csvLines[0]);
        tableHtml += `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin:16px 0;font-family:${SANS};font-size:12px;"><tr>${headers.map(h => `<th align="left" style="padding:8px 10px;background:${C.ink};color:${C.gold};font-size:11px;">${esc(h)}</th>`).join("")}</tr>`;
        for (let i = 1; i < csvLines.length; i++) {
          const cols = parseRow(csvLines[i]);
          const isTotalRow = (cols[0] || "").includes("TOTAL");
          if (cols.every(c => !c.trim())) {
            tableHtml += `<tr><td colspan="${headers.length}" style="padding:4px;"></td></tr>`;
          } else if (isTotalRow) {
            tableHtml += `<tr style="background:${C.sand};">${cols.map(c => `<td style="padding:8px 10px;border-bottom:1px solid ${C.line};color:${C.goldDark};font-weight:700;">${esc(c)}</td>`).join("")}</tr>`;
          } else {
            tableHtml += `<tr style="background:${i % 2 === 0 ? C.sand : "#FFFFFF"};">${cols.map(c => `<td style="padding:6px 10px;border-bottom:1px solid ${C.line};color:${C.ink};">${esc(c)}</td>`).join("")}</tr>`;
          }
        }
        tableHtml += `</table>`;
      }
      emailPayload = {
        from: FROM("Reports"),
        to: [body.recipientEmail],
        subject: body.subject,
        html: renderBrandedEmail({ brand, eyebrow: "Report", title: body.subject, width: 900, bodyHtml: p("The full CSV is also attached for your records.") + tableHtml, footerNote: "Automated report." }),
        attachments: [{ filename: body.csvFilename || "report.csv", content: csvBase64, type: "text/csv" }],
      };
    } else if (body.type === "employee_induction") {
      if (!body.to || !body.employeeName) {
        throw new Error("Missing required fields for employee induction");
      }
      const portalUrl = body.portalUrl || "https://www.regalmanagement.com.au/portal";
      const code = `<span style="font-family:monospace;font-size:18px;font-weight:bold;color:${C.gold};background:${C.ink};padding:4px 12px;letter-spacing:3px;">${esc(body.employeeCode || "—")}</span>`;
      const html = renderBrandedEmail({
        brand, eyebrow: "Welcome to the Team", title: `Welcome, ${body.employeeName}`, preheader: `Your induction packet for ${brand.name}`,
        bodyHtml:
          p(`We're thrilled to have you join <strong>${esc(brand.name)}</strong>. This packet contains everything you need to get started.`) +
          heading("Your details") +
          details([["Full name", body.employeeName], ["Position", body.jobTitle || "Team Member"], ["Department", body.department || "General"], ["Employee code", code, { raw: true }]]) +
          heading("Getting started") +
          p(`<strong>1. Access the employee portal</strong><br/>Visit <a href="${esc(portalUrl)}" style="color:${C.goldDark};">${esc(portalUrl)}</a> and enter your business code: <strong>${esc(body.businessCode || "")}</strong>`) +
          p(`<strong>2. Log in with your employee code</strong><br/>Use your 4-digit code <strong>${esc(body.employeeCode || "—")}</strong> to access your shifts, timesheets and more.`) +
          p(`<strong>3. Explore your portal</strong><br/>View upcoming shifts, check your timesheets, submit leave requests and stay connected via the team forum.`) +
          heading("On the portal you can") +
          p(`Today's overview · View roster · View timesheets · Team forum · Submit requests · Notifications`) +
          button("Go to employee portal", portalUrl) +
          note(`<strong>Keep your employee code confidential</strong> — do not share it with others. Contact your manager if you have any issues accessing the portal.`, "red"),
        footerNote: "If you received this in error, please contact your manager.",
      });
      emailPayload = { from: FROM(), to: [body.to], subject: `Welcome to ${brand.name}, ${body.employeeName} — Your Induction Packet`, html };
    } else if (body.type === "roster_pdf") {
      if (!body.to || !body.pdfBase64 || !body.weekLabel) {
        throw new Error("Missing required fields for roster PDF email");
      }
      const html = renderBrandedEmail({
        brand, eyebrow: "Roster Report", title: `Weekly roster — ${body.weekLabel}`,
        bodyHtml: p(`Hi ${esc(body.adminName || "Admin")},`) + p(`Please find attached the roster for <strong>${esc(body.weekLabel)}</strong>.${body.senderName ? ` This was sent by <strong>${esc(body.senderName)}</strong>.` : ""}`) +
          note(`<strong>Attachment:</strong> open the roster PDF to view the full schedule with all employee shifts, hours and event details.`) +
          small(`The shift and break times in this roster are indicative and may vary according to the operational needs of the business and at the discretion of management.`),
      });
      emailPayload = { from: FROM(), to: [body.to], subject: `Roster — ${body.weekLabel}`, html,
        attachments: [{ filename: body.pdfFilename || `roster-${body.weekLabel}.pdf`, content: body.pdfBase64, type: "application/pdf" }] };
    } else if (body.type === "report_pdf") {
      if (!body.to || !body.pdfBase64 || !body.subject) {
        throw new Error("Missing required fields for report PDF email");
      }
      const html = renderBrandedEmail({
        brand, eyebrow: "Report", title: body.subject,
        bodyHtml: p("Please find the attached report.") + note(`<strong>Attachment:</strong> ${esc(body.pdfFilename || "report.pdf")} — open it to view the full report.`),
        footerNote: "Automated report.",
      });
      emailPayload = { from: FROM(), to: [body.to], subject: body.subject, html,
        attachments: [{ filename: body.pdfFilename || "report.pdf", content: body.pdfBase64, type: "application/pdf" }] };
    } else if (body.type === "runsheet") {
      const b = body as any;
      if (!b.to || !b.viewUrl || !b.eventTitle) throw new Error("Missing required fields for run sheet email");
      if (!/^https:\/\/[^\s"'<>]+$/.test(b.viewUrl)) throw new Error("Missing required fields for run sheet email");
      const conf = b.kind === "confirmation";
      const html = renderBrandedEmail({
        brand, eyebrow: conf ? "Event Confirmation" : "Event Order & Run Sheet", title: conf ? "Event Confirmation" : "Your Run Sheet",
        preheader: `${conf ? "Event confirmation" : "Run sheet"} for ${b.eventTitle}`,
        bodyHtml:
          p(`Dear ${esc(b.recipientName || "Guest")},`) +
          p(conf
            ? `${b.resend ? "Here again is the event confirmation" : "Thank you for choosing us — we are delighted to confirm your celebration"} for <strong>${esc(b.eventTitle)}</strong>. Please review the details and the event order below, and let us know if anything needs changing.`
            : `${b.resend ? "Here is the run sheet again" : "Here is the run sheet"} for <strong>${esc(b.eventTitle)}</strong>. Please review it before the event.`) +
          details([["Event", b.eventTitle], ["Date", b.dateLabel], ["Time", b.timeLabel], ["Venue", b.venue], ["Guests", b.guestsLabel], ["Event order", b.eventOrder]]) +
          button(conf ? "View event order" : "View run sheet", b.viewUrl) +
          small("The link always shows the latest version. You can print it or save it as a PDF from that page.") +
          (conf ? note(`Your event order includes our <strong>Terms &amp; Conditions</strong> on the final page — please review them and get in touch with any questions. Once you are happy, please <strong>sign the client part of the signature section below the Terms &amp; Conditions</strong> and return it to us by replying to this email with a photo or scan of the signed page.`) : "") +
          (b.message ? p(`<span style="white-space:pre-line;">${esc(b.message)}</span>`) : "") +
          signoff(brand),
      });
      emailPayload = { from: FROM(), to: [b.to],
        subject: `${conf ? "Event confirmed" : "Run sheet"} — ${b.eventTitle}${b.dateLabel ? ` (${b.dateLabel})` : ""}`, html };
    } else if ((body as any).type === "deposit_confirmation") {
      const b = body as any;
      if (!b.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.to) || !b.depositAmount) throw new Error("Missing required fields for deposit email");
      const s = (v: unknown) => (v == null || v === "" ? v : String(v).slice(0, 300));
      const html = renderBrandedEmail({
        brand, eyebrow: "Deposit Confirmation", title: "Deposit received with thanks", preheader: `We've received your deposit for ${s(b.eventTitle)}`,
        bodyHtml:
          p(`Dear ${esc(s(b.recipientName) || "Guest")},`) +
          p(`Thank you — we are pleased to confirm that we have received your deposit for <strong>${esc(s(b.eventTitle))}</strong>${b.eventDate ? ` on <strong>${esc(s(b.eventDate))}</strong>` : ""}. Your date is now secured.`) +
          details([["Deposit received", s(b.depositAmount), { bold: true }], ["Date received", s(b.receivedDate)], ["Payment method", s(b.method)], ["Reference", s(b.reference)],
            ["Total event amount", s(b.totalAmount)], ["Balance remaining", s(b.balanceRemaining), { bold: true }], ["Balance due by", s(b.balanceDueDate), { bold: true }]]) +
          p(`${b.balanceDueDate ? `The remaining balance is due by <strong>${esc(s(b.balanceDueDate))}</strong>. ` : ""}If you have any questions about your payment or event, simply reply to this email and our team will be happy to help.`) +
          signoff(brand),
        footerNote: "Please keep this email for your records.",
      });
      emailPayload = { from: FROM(), to: [b.to], subject: `Deposit received — ${String(b.eventTitle || "your event").slice(0, 120)}`, html };
    } else if ((body as any).type === "menu") {
      const b = body as any;
      if (!b.to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.to) || !Array.isArray(b.sections)) throw new Error("Missing required fields for menu email");
      const viewUrl = typeof b.viewUrl === "string" && /^https:\/\/(www\.)?regalmanagement\.com\.au\/m\/[0-9a-f-]{36}$/.test(b.viewUrl) ? b.viewUrl : undefined;
      const logoUrl = brand.logoUrl || "https://regalmanagement.com.au/regal-logo.png";
      const html = renderMenuHtml({ businessName: brand.name, title: b.title, recipientName: b.recipientName, message: b.message, viewUrl, logoUrl, sections: b.sections.slice(0, 60) }, { forEmail: true });
      emailPayload = { from: FROM(), to: [b.to], subject: `${String(b.title || "Our menu").slice(0, 120)} — ${brand.name}`, html };
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
      console.error("Resend API error:", res.status, data);
      throw new Error("Failed to send email");
    }

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("Email send error:", error);
    let safeMessage = "Unable to send email. Please try again.";
    if (error instanceof Error) {
      if (error.message.includes("Missing required fields")) safeMessage = error.message;
      else if (error.message.includes("Invalid email type")) safeMessage = "Invalid email type";
      else if (error.message.includes("RESEND_API_KEY")) safeMessage = "Email service not configured";
    }
    return new Response(JSON.stringify({ success: false, error: safeMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
