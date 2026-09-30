import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { getCaller, hasBusinessRole, serviceClient } from "../_shared/auth.ts";
import { renderBrandedEmail, details, p, note, button, signoff, loadBrand, esc } from "../_shared/emailLayout.ts";

const UUID = /^[0-9a-f-]{36}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const APP = "https://regalmanagement.com.au";
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const money = (n: unknown) => n == null || n === "" ? "" : `$${Number(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const fmtDate = (d?: string | null) => d ? new Date(d + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" }) : "";

async function sendMail(from: string, to: string, subject: string, html: string) {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) throw new Error("Email service not configured");
  const r = await fetch("https://api.resend.com/emails", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify({ from, to: [to], subject, html }) });
  if (!r.ok) { console.error("resend", r.status, await r.text()); throw new Error("Failed to send email"); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const db = serviceClient();
    const body = await req.json().catch(() => ({}));
    const action = String(body.action || "");

    if (action === "test") {
      // One-off sample email, restricted to a single recipient address.
      const to = String(body.to || "").trim();
      if (to.toLowerCase() !== "edu.gauravguragain@gmail.com") return json({ error: "Unauthorized" }, 401);
      const caller = { userId: null as string | null };
      const role = { business_id: "a5184a28-f4fa-4d81-b48d-1b690ca3b7f7" };
      {
        const sample = { name: "Pro Regal Pavilion Pty Ltd (SAMPLE)", bsb: "000-000", account: "0000 0000" };
        const due = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
        const { data: row, error } = await db.from("crm_deposit_requests").insert({
          business_id: role.business_id, recipient_email: String(body.to).trim(), recipient_name: "Sample Guest",
          amount: 500, due_date: due, event_title: "Sample Event (test email)", created_by: caller.userId,
        }).select("id, token").single();
        if (error) throw error;
        const brand = await loadBrand(db, { businessId: role.business_id });
        const link = `${APP}/deposit/${row.token}`;
        const html = renderBrandedEmail({
          brand, eyebrow: "Deposit Payment", title: "Secure your date", preheader: "Deposit payment details for Sample Event (test email)",
          bodyHtml:
            p(`Dear Sample Guest,`) +
            p(`Thank you for choosing ${esc(brand.name)} for <strong>Sample Event (test email)</strong>. To confirm your booking, please transfer the deposit to the account below.`) +
            details([["Deposit amount", money(500), { bold: true }], ["Due by", fmtDate(due), { bold: true }], ["Account name", sample.name, { bold: true }], ["BSB", sample.bsb, { bold: true }], ["Account number", sample.account, { bold: true }], ["Reference", "Sample Guest"]]) +
            note(`<strong>Once your payment has been made successfully</strong>, please upload a screenshot of the transfer receipt using the button below so our team can match and confirm your deposit quickly.`) +
            button("Upload payment screenshot", link) +
            signoff(brand),
          footerNote: "This is a test email with sample bank details. Update your real details in Sales & Marketing → Settings.",
        });
        await sendMail(`${brand.name} <noreply@regalmanagement.com.au>`, String(body.to).trim(), `Deposit payment details — Sample Event (test email)`, html);
        return json({ success: true, id: row.id });
      }
    }

    if (action === "send" || action === "proof_url") {
      const caller = await getCaller(req, db);
      if (!caller) return json({ error: "Unauthorized" }, 401);
      if (action === "proof_url") {
        if (!UUID.test(body.id || "")) return json({ error: "Invalid request" }, 400);
        const { data: r } = await db.from("crm_deposit_requests").select("business_id, proof_path").eq("id", body.id).maybeSingle();
        if (!r?.proof_path || !hasBusinessRole(caller, r.business_id)) return json({ error: "Not found" }, 404);
        const { data } = await db.storage.from("deposit-proofs").createSignedUrl(r.proof_path, 600);
        return json({ url: data?.signedUrl });
      }
      const { leadId, bookingId, to, name, amount, dueDate, eventTitle } = body;
      if (!UUID.test(leadId || "") || (bookingId && !UUID.test(bookingId)) || !EMAIL.test(String(to || "").trim())) return json({ error: "Enter a valid client email." }, 400);
      const { data: lead } = await db.from("crm_leads").select("business_id").eq("id", leadId).maybeSingle();
      if (!lead || !hasBusinessRole(caller, lead.business_id, ["admin", "super_admin", "roster_admin", "sales_marketing_manager"])) return json({ error: "Forbidden" }, 403);
      const { data: s } = await db.from("crm_settings").select("deposit_account_name, deposit_bsb, deposit_account_number, deposit_payment_note").eq("business_id", lead.business_id).maybeSingle();
      if (!s?.deposit_account_name || !s?.deposit_bsb || !s?.deposit_account_number) return json({ error: "Add the deposit bank details in Sales & Marketing → Settings first." }, 400);
      const { data: row, error } = await db.from("crm_deposit_requests").insert({
        business_id: lead.business_id, lead_id: leadId, booking_id: bookingId || null, recipient_email: String(to).trim(), recipient_name: String(name || "").slice(0, 200) || null,
        amount: amount ? Number(amount) : null, due_date: /^\d{4}-\d{2}-\d{2}$/.test(dueDate || "") ? dueDate : null, event_title: String(eventTitle || "").slice(0, 200) || null, created_by: caller.userId,
      }).select("id, token").single();
      if (error) throw error;
      const brand = await loadBrand(db, { businessId: lead.business_id });
      const link = `${APP}/deposit/${row.token}`;
      const html = renderBrandedEmail({
        brand, eyebrow: "Deposit Payment", title: "Secure your date", preheader: `Deposit payment details for ${eventTitle || "your event"}`,
        bodyHtml:
          p(`Dear ${esc(name || "Guest")},`) +
          p(`Thank you for choosing ${esc(brand.name)}${eventTitle ? ` for <strong>${esc(eventTitle)}</strong>` : ""}. To confirm your booking, please transfer the deposit to the account below.`) +
          details([["Deposit amount", money(amount), { bold: true }], ["Due by", fmtDate(dueDate), { bold: true }], ["Account name", s.deposit_account_name, { bold: true }], ["BSB", s.deposit_bsb, { bold: true }], ["Account number", s.deposit_account_number, { bold: true }], ["Reference", name || eventTitle]]) +
          (s.deposit_payment_note ? p(`<span style="white-space:pre-line;">${esc(s.deposit_payment_note)}</span>`) : "") +
          note(`<strong>Once your payment has been made successfully</strong>, please upload a screenshot of the transfer receipt using the button below so our team can match and confirm your deposit quickly.`) +
          button("Upload payment screenshot", link) +
          signoff(brand),
        footerNote: "Your booking is confirmed once the deposit has been received.",
      });
      await sendMail(`${brand.name} <noreply@regalmanagement.com.au>`, String(to).trim(), `Deposit payment details — ${String(eventTitle || brand.name).slice(0, 120)}`, html);
      return json({ success: true, id: row.id });
    }

    // Public actions by token
    if (!UUID.test(body.token || "")) return json({ error: "This link is invalid." }, 400);
    const { data: r } = await db.from("crm_deposit_requests").select("*").eq("token", body.token).maybeSingle();
    if (!r) return json({ error: "This link is invalid or has expired." }, 404);
    const [{ data: s }, brand] = await Promise.all([
      db.from("crm_settings").select("deposit_account_name, deposit_bsb, deposit_account_number, deposit_payment_note, deposit_proof_email, signed_runsheet_email").eq("business_id", r.business_id).maybeSingle(),
      loadBrand(db, { businessId: r.business_id }),
    ]);

    if (action === "view") {
      return json({ request: { name: r.recipient_name, amount: r.amount, due_date: r.due_date, event_title: r.event_title, uploaded_at: r.proof_uploaded_at },
        bank: { account_name: s?.deposit_account_name, bsb: s?.deposit_bsb, account_number: s?.deposit_account_number, note: s?.deposit_payment_note },
        business: { name: brand.name, logo_url: brand.logoUrl, email: brand.email, phone: brand.phone } });
    }

    if (action === "upload") {
      const m = /^data:(image\/(png|jpe?g|webp|heic|heif));base64,(.+)$/i.exec(String(body.file || ""));
      if (!m) return json({ error: "Please attach an image screenshot (PNG, JPG, WEBP or HEIC)." }, 400);
      const bytes = Uint8Array.from(atob(m[3]), (c) => c.charCodeAt(0));
      if (bytes.length > 8 * 1024 * 1024) return json({ error: "Screenshot must be under 8 MB." }, 400);
      const ext = m[2].toLowerCase().replace("jpeg", "jpg");
      const path = `${r.business_id}/${r.id}/${Date.now()}.${ext}`;
      const up = await db.storage.from("deposit-proofs").upload(path, bytes, { contentType: m[1], upsert: false });
      if (up.error) throw up.error;
      await db.from("crm_deposit_requests").update({ proof_path: path, proof_uploaded_at: new Date().toISOString() }).eq("id", r.id);
      const to = s?.deposit_proof_email || s?.signed_runsheet_email || brand.email;
      if (to) {
        const { data: signed } = await db.storage.from("deposit-proofs").createSignedUrl(path, 60 * 60 * 24 * 7);
        const html = renderBrandedEmail({
          brand, eyebrow: "Deposit Screenshot", title: "Payment screenshot received",
          bodyHtml: p(`${esc(r.recipient_name || "A client")} has uploaded a deposit payment screenshot.`) +
            details([["Client", r.recipient_name], ["Client email", r.recipient_email], ["Event", r.event_title], ["Deposit requested", money(r.amount)]]) +
            p("Please check the transfer in your bank account and record the deposit in Payments.") +
            (signed?.signedUrl ? button("View screenshot", signed.signedUrl) : "") +
            p(`<span style="font-size:12px;color:#6B6660;">This link expires in 7 days. The screenshot is also available on the lead's Confirmation step.</span>`),
        });
        await sendMail(`${brand.name} <noreply@regalmanagement.com.au>`, to, `Deposit screenshot — ${String(r.recipient_name || r.event_title || "client").slice(0, 120)}`, html).catch((e) => console.error(e));
      }
      return json({ success: true });
    }
    return json({ error: "Invalid action" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: e instanceof Error && /not configured|Failed to send/.test(e.message) ? e.message : "Something went wrong. Please try again." }, 500);
  }
});
