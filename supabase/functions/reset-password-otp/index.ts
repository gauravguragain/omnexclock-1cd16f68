import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function generateOTP(): string {
  const digits = "0123456789";
  let otp = "";
  for (let i = 0; i < 6; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { action, email, otp, newPassword } = await req.json();

    // ── SEND OTP ──
    if (action === "send") {
      if (!email || typeof email !== "string" || !email.includes("@")) {
        return new Response(JSON.stringify({ error: "Valid email is required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Find user by email
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      if (userError) throw userError;

      const targetUser = userData.users.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (!targetUser) {
        return new Response(JSON.stringify({ error: "No admin account found with this email." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Check if user has admin or master role
      const { data: roleData } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", targetUser.id)
        .in("role", ["admin", "master"])
        .limit(1);

      if (!roleData || roleData.length === 0) {
        return new Response(JSON.stringify({ error: "No admin account found with this email." }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Invalidate previous OTPs for this email
      await supabaseAdmin
        .from("password_reset_otps")
        .update({ used: true })
        .eq("email", normalizedEmail)
        .eq("used", false);

      // Generate and store OTP
      const otpCode = generateOTP();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString(); // 10 minutes

      const { error: insertError } = await supabaseAdmin
        .from("password_reset_otps")
        .insert({
          email: normalizedEmail,
          otp_code: otpCode,
          expires_at: expiresAt,
        });

      if (insertError) throw insertError;

      // Send OTP via Resend
      const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
      if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY is not configured");

      const emailHtml = `
        <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;padding:20px;">
          <h2 style="color:#1a1a1a;margin-bottom:8px;">Password Reset</h2>
          <p style="color:#4b5563;">Use the following code to reset your password. This code expires in 10 minutes.</p>
          <div style="background:#f3f4f6;border-radius:8px;padding:20px;text-align:center;margin:24px 0;">
            <span style="font-size:32px;font-weight:bold;letter-spacing:8px;color:#1a1a1a;">${otpCode}</span>
          </div>
          <p style="color:#9ca3af;font-size:13px;">If you did not request this, please ignore this email.</p>
        </div>
      `;

      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${RESEND_API_KEY}`,
        },
        body: JSON.stringify({
          from: "Security <noreply@omnexventures.com>",
          to: [normalizedEmail],
          subject: "Password Reset Code",
          html: emailHtml,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(`Email send failed: ${JSON.stringify(errData)}`);
      }

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── VERIFY OTP ──
    if (action === "verify") {
      if (!email || !otp) {
        return new Response(JSON.stringify({ error: "Email and OTP are required" }), {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      const normalizedEmail = email.trim().toLowerCase();

      const { data: otpRows, error: fetchError } = await supabaseAdmin
        .from("password_reset_otps")
        .select("*")
        .eq("email", normalizedEmail)
        .eq("otp_code", otp.trim())
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .order("created_at", { ascending: false })
        .limit(1);

      if (fetchError) throw fetchError;

      if (!otpRows || otpRows.length === 0) {
        return new Response(
          JSON.stringify({ error: "Invalid or expired code. Please try again." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Return a verification token (the OTP row ID) for the reset step
      return new Response(
        JSON.stringify({ success: true, verificationToken: otpRows[0].id }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── RESET PASSWORD ──
    if (action === "reset") {
      if (!email || !newPassword || !otp) {
        return new Response(
          JSON.stringify({ error: "Email, verification token, and new password are required" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (newPassword.length < 6) {
        return new Response(
          JSON.stringify({ error: "Password must be at least 6 characters" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const normalizedEmail = email.trim().toLowerCase();

      // Verify the token is still valid
      const { data: otpRow, error: otpError } = await supabaseAdmin
        .from("password_reset_otps")
        .select("*")
        .eq("id", otp)
        .eq("email", normalizedEmail)
        .eq("used", false)
        .gte("expires_at", new Date().toISOString())
        .single();

      if (otpError || !otpRow) {
        return new Response(
          JSON.stringify({ error: "Verification expired. Please start over." }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Find the user
      const { data: userData } = await supabaseAdmin.auth.admin.listUsers();
      const targetUser = userData?.users.find(
        (u) => u.email?.toLowerCase() === normalizedEmail
      );

      if (!targetUser) {
        return new Response(
          JSON.stringify({ error: "User not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Update password
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(
        targetUser.id,
        { password: newPassword }
      );

      if (updateError) throw updateError;

      // Mark OTP as used
      await supabaseAdmin
        .from("password_reset_otps")
        .update({ used: true })
        .eq("id", otpRow.id);

      // Cleanup old OTPs for this email
      await supabaseAdmin
        .from("password_reset_otps")
        .delete()
        .eq("email", normalizedEmail)
        .lt("expires_at", new Date().toISOString());

      return new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ error: "Invalid action" }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Password reset error:", error);
    return new Response(JSON.stringify({ error: "Unable to process request. Please try again." }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
