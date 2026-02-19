import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
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
      .select("*, businesses(name)")
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
      const businessName = (task as any).businesses?.name || "OmnexClock";

      const html = `
        <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;background:#ffffff;">
          <div style="text-align:center;padding:30px 20px 16px;background:linear-gradient(135deg,#1a1a1a 0%,#2d2d2d 100%);border-radius:12px 12px 0 0;">
            <h1 style="color:#c9a227;font-size:24px;margin:0;">OmnexClock</h1>
            <p style="color:#a0a0a0;font-size:11px;margin:6px 0 0;text-transform:uppercase;letter-spacing:2px;">Service Reminder</p>
          </div>
          <div style="padding:24px 30px;">
            <div style="padding:16px;background:#fef9e7;border:1px solid #f5e6b8;border-radius:8px;margin-bottom:16px;">
              <h2 style="margin:0 0 8px;font-size:18px;color:#92400e;">⚠️ Service Due Soon</h2>
              <p style="margin:0;font-size:14px;color:#555;line-height:1.6;">
                The following maintenance task for <strong>${businessName}</strong> is due soon:
              </p>
            </div>
            <table style="width:100%;font-size:14px;border-collapse:collapse;">
              <tr>
                <td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;width:40%;">Task</td>
                <td style="padding:10px 12px;background:#f8f9fa;font-weight:bold;">${task.name}</td>
              </tr>
              ${task.description ? `<tr><td style="padding:10px 12px;font-weight:600;color:#555;">Description</td><td style="padding:10px 12px;">${task.description}</td></tr>` : ""}
              <tr>
                <td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;">Due Date</td>
                <td style="padding:10px 12px;background:#f8f9fa;font-weight:bold;color:#dc2626;">${task.next_service_date}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;font-weight:600;color:#555;">Last Service</td>
                <td style="padding:10px 12px;">${task.last_service_date || "Never"}</td>
              </tr>
              <tr>
                <td style="padding:10px 12px;background:#f8f9fa;font-weight:600;color:#555;">Frequency</td>
                <td style="padding:10px 12px;background:#f8f9fa;">Every ${task.frequency_days} days</td>
              </tr>
            </table>
            <p style="margin:20px 0 0;font-size:13px;color:#666;line-height:1.6;">
              Please arrange for this service to be completed before the due date. Once completed, mark it as done in the Service & Maintenance section of your admin panel.
            </p>
          </div>
          <div style="text-align:center;padding:16px 30px;background:#f8f9fa;border-radius:0 0 12px 12px;">
            <p style="color:#999;font-size:11px;margin:0;">This is an automated reminder from <strong>${businessName}</strong>.</p>
          </div>
        </div>
      `;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: `${businessName} <noreply@omnexventures.com>`,
          to: task.reminder_email.split(",").map((e: string) => e.trim()).filter(Boolean),
          subject: `🔧 Service Reminder: ${task.name} — Due ${task.next_service_date}`,
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
