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
      .select("name, business_code, logo_url, phone, email, address")
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

    if (insertErr) {
      console.error("Insert invitation error:", insertErr);
      throw new Error("Failed to create invitation");
    }

    // Build role label and induction guide URL
    const roleLabels: Record<string, string> = {
      super_admin: "Super Admin",
      owner: "Owner",
      admin: "Admin",
      viewer: "Viewer",
      roster_admin: "Roster Admin",
      sales_marketing_manager: "Sales & Marketing Manager",
      food_safety_manager: "Food Safety Manager",
    };
    const roleLabel = roleLabels[role] || role;

    // Always use the published URL for links (not the preview URL)
    const publishedUrl = appUrl.includes("preview--") 
      ? "https://www.regalmanagement.com.au" 
      : appUrl;

    const inductionGuides: Record<string, string> = {
      super_admin: "/induction-guide-super-admin.html",
      admin: "/induction-guide-admin.html",
      viewer: "/induction-guide-viewer.html",
      roster_admin: "/induction-guide-roster-admin.html",
      sales_marketing_manager: "/induction-guide-sales.html",
      food_safety_manager: "/induction-guide-food-safety.html",
      owner: "/induction-guide-owner.html",
    };
    const guideUrl = `${publishedUrl}${inductionGuides[role] || "/induction-guide.html"}`;
    const signupUrl = `${publishedUrl}/auth?invite=${token}`;
    const portalUrl = `${publishedUrl}/portal`;

    // Send invitation email
    const html = renderBrandedEmail({
      brand: { name: business.name, logoUrl: (business as any).logo_url, phone: (business as any).phone, email: (business as any).email, address: (business as any).address },
      eyebrow: "Team Invitation", title: "You've been invited", preheader: `Join ${business.name} as ${roleLabel}`,
      bodyHtml: p(`You have been invited to join <strong>${esc(business.name)}</strong> as a <strong>${esc(roleLabel)}</strong> on Pro Regal Management.`) +
        (departments && departments.length > 0 ? p(`Assigned departments: <strong>${esc(departments.join(", "))}</strong>`) : "") +
        button("Create your account", signupUrl) +
        small("This invitation expires in 7 days.") +
        heading(`Your ${esc(roleLabel)} induction guide`) +
        p(`We've prepared a guide to help you get started with your ${esc(roleLabel)} responsibilities. <a href="${esc(guideUrl)}" style="color:#916942;">View your induction guide</a>.`) +
        note(`Looking for the <strong>Employee Portal</strong>? <a href="${esc(portalUrl)}" style="color:#916942;">Access it here</a>.`),
      footerNote: "If you did not expect this invitation, please ignore this email.",
    });

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: `${business.name} <noreply@regalmanagement.com.au>`,
        to: [email],
        subject: `You're invited to ${business.name} as ${roleLabel}`,
        html,
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("Email send failed:", data);
      throw new Error("Failed to send invitation email");
    }

    return new Response(
      JSON.stringify({ success: true, token }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: unknown) {
    console.error("Invite error:", error);
    // Sanitize error messages to avoid leaking internal details
    let safeMessage = "Unable to process invitation. Please try again.";
    if (error instanceof Error) {
      if (error.message.includes("Missing required fields")) safeMessage = error.message;
      else if (error.message.includes("Business not found")) safeMessage = "Business not found";
      else if (error.message.includes("RESEND_API_KEY")) safeMessage = "Email service not configured";
    }
    return new Response(
      JSON.stringify({ success: false, error: safeMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
