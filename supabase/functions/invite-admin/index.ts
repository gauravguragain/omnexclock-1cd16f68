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
    if (!RESEND_API_KEY) throw new Error("RESEND_API_KEY not configured");

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const anonClient = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claims, error: claimsErr } = await anonClient.auth.getClaims(
      authHeader.replace("Bearer ", "")
    );
    if (claimsErr || !claims?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const userId = claims.claims.sub as string;
    const body = await req.json();
    const { email, role, businessId, departments, appUrl } = body;

    if (!email || !role || !businessId || !appUrl) {
      throw new Error("Missing required fields: email, role, businessId, appUrl");
    }

    // Use service role client for DB operations
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Verify the caller is super_admin of the business
    const { data: callerRole } = await adminClient
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("business_id", businessId)
      .eq("role", "super_admin")
      .single();

    if (!callerRole) {
      return new Response(JSON.stringify({ error: "Only Super Admins can invite users" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get business info
    const { data: business } = await adminClient
      .from("businesses")
      .select("name, business_code")
      .eq("id", businessId)
      .single();

    if (!business) throw new Error("Business not found");

    // Generate a unique token
    const token = crypto.randomUUID();

    // Create invitation record
    const { error: insertErr } = await adminClient.from("admin_invitations").insert({
      business_id: businessId,
      email: email.toLowerCase(),
      role,
      departments: departments || null,
      invited_by: userId,
      token,
    });

    if (insertErr) throw new Error(`Failed to create invitation: ${insertErr.message}`);

    // Build role label and induction guide URL
    const roleLabels: Record<string, string> = {
      super_admin: "Super Admin",
      admin: "Admin",
      viewer: "Viewer",
      roster_admin: "Roster Admin",
    };
    const roleLabel = roleLabels[role] || role;

    // Always use the published URL for links (not the preview URL)
    const publishedUrl = appUrl.includes("preview--") 
      ? "https://omnexclock.lovable.app" 
      : appUrl;

    const inductionGuides: Record<string, string> = {
      super_admin: "/induction-guide-super-admin.html",
      admin: "/induction-guide-admin.html",
      viewer: "/induction-guide-viewer.html",
      roster_admin: "/induction-guide-roster-admin.html",
    };
    const guideUrl = `${publishedUrl}${inductionGuides[role] || "/induction-guide.html"}`;
    const signupUrl = `${publishedUrl}/auth?invite=${token}`;
    const portalUrl = `${publishedUrl}/portal`;

    // Send invitation email
    const html = `
      <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:0 auto;color:#1a1a1a;">
        <div style="text-align:center;padding:30px 0 20px;">
          <h1 style="color:#c9a227;font-size:24px;margin:0;">OmnexClock</h1>
          <p style="color:#666;font-size:13px;margin:4px 0 0;">Time & Workforce Management</p>
        </div>
        
        <div style="background:#f8f9fa;border-radius:12px;padding:30px;margin:16px 0;">
          <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a1a;">You've Been Invited!</h2>
          <p style="color:#555;line-height:1.6;">
            You have been invited to join <strong>${business.name}</strong> as a <strong>${roleLabel}</strong> on OmnexClock.
          </p>
          ${departments && departments.length > 0 ? `
            <p style="color:#555;font-size:13px;">Assigned departments: <strong>${departments.join(", ")}</strong></p>
          ` : ""}
          
          <div style="text-align:center;margin:24px 0;">
            <a href="${signupUrl}" style="display:inline-block;background:#c9a227;color:#000;text-decoration:none;padding:14px 32px;border-radius:8px;font-weight:bold;font-size:14px;">
              Create Your Account
            </a>
          </div>
          
          <p style="color:#888;font-size:12px;text-align:center;">
            This invitation expires in 7 days.
          </p>
        </div>
        
        <div style="background:#fef9e7;border:1px solid #f5e6b8;border-radius:8px;padding:20px;margin:16px 0;">
          <h3 style="margin:0 0 8px;font-size:14px;color:#92400e;">📖 Your ${roleLabel} Induction Guide</h3>
          <p style="color:#555;font-size:13px;line-height:1.5;margin:0 0 12px;">
            We've prepared a comprehensive guide to help you get started with your ${roleLabel} responsibilities.
          </p>
          <a href="${guideUrl}" style="color:#c9a227;font-weight:600;font-size:13px;text-decoration:underline;">
            View Your Induction Guide →
          </a>
        </div>
        
        <div style="background:#f0f4f8;border-radius:8px;padding:16px;margin:16px 0;text-align:center;">
          <p style="color:#555;font-size:13px;margin:0 0 8px;">Looking for the <strong>Employee Portal</strong>?</p>
          <a href="${portalUrl}" style="color:#c9a227;font-weight:600;font-size:13px;text-decoration:underline;">
            Access Employee Portal →
          </a>
        </div>
        
        <p style="color:#999;font-size:11px;text-align:center;margin-top:24px;">
          If you did not expect this invitation, please ignore this email.
        </p>
      </div>
    `;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "OmnexClock <noreply@omnexventures.com>",
        to: [email],
        subject: `You're invited to ${business.name} as ${roleLabel}`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) throw new Error(`Email send failed: ${JSON.stringify(data)}`);

    return new Response(
      JSON.stringify({ success: true, token }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Invite error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
