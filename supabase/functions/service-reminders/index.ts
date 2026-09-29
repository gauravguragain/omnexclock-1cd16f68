import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { renderBrandedEmail, loadBrand, details, note, p, small, esc, button, heading } from "../_shared/emailLayout.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Find tasks due within 7 days that haven't had reminders sent and have a reminder email
    const sevenDaysFromNow = new Date();
    sevenDaysFromNow.setDate(sevenDaysFromNow.getDate() + 7);
    const todayStr = new Date().toISOString().split("T")[0];
    const futureStr = sevenDaysFromNow.toISOString().split("T")[0];

    const { data: tasks, error } = await supabase
      .from("service_maintenance_tasks")
      .select("*, businesses(name, logo_url, phone, email, address)")
      .eq("active", true)
      .eq("reminder_sent", false)
      .not("reminder_email", "is", null)
      .not("next_service_date", "is", null)
      .lte("next_service_date", futureStr)
      .gte("next_service_date", todayStr);

    if (error) throw error;

    console.log(`Found ${tasks?.length || 0} service tasks needing reminders`);

    let sentCount = 0;
    for (const task of tasks || []) {
      const businessName = (task as any).businesses?.name || "Pro Regal Management";

      const bz = (task as any).businesses || {};
      const brand = { name: businessName, logoUrl: bz.logo_url, phone: bz.phone, email: bz.email, address: bz.address };
      const html = renderBrandedEmail({
        brand, eyebrow: "Service Reminder", title: "Service due soon", preheader: `${task.name} is due ${task.next_service_date}`,
        bodyHtml: p(`The following maintenance task for <strong>${esc(businessName)}</strong> is due soon:`) +
          details([["Task", task.name, { bold: true }], ["Description", task.description], ["Due date", task.next_service_date, { bold: true, color: "#A1322B" }], ["Last service", task.last_service_date || "Never"], ["Frequency", `Every ${task.frequency_days} days`]]) +
          p("Please arrange for this service to be completed before the due date. Once completed, mark it as done in the Service &amp; Maintenance section of your admin panel."),
        footerNote: "Automated service reminder.",
      });

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${businessName} <noreply@regalmanagement.com.au>`,
          to: task.reminder_email.split(",").map((e: string) => e.trim()).filter(Boolean),
          subject: `Service Reminder: ${task.name} — Due ${task.next_service_date}`,
          html,
        }),
      });

      if (res.ok) {
        // Mark reminder as sent
        await supabase
          .from("service_maintenance_tasks")
          .update({ reminder_sent: true })
          .eq("id", task.id);
        sentCount++;
        console.log(`Sent reminder for "${task.name}" to ${task.reminder_email}`);
      } else {
        const errData = await res.json();
        console.error(`Failed to send reminder for "${task.name}":`, errData);
      }
    }

    return new Response(
      JSON.stringify({ success: true, reminders_sent: sentCount }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Service reminder error:", error);
    return new Response(
      JSON.stringify({ success: false, error: "Unable to process service reminders." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
