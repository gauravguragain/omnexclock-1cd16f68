import { supabase } from "@/integrations/supabase/client";

export function getDeviceInfo() {
  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
    language: navigator.language,
    screenSize: `${screen.width}x${screen.height}`,
  };
}

export async function logAudit(action: string, details: Record<string, any>) {
  try {
    const businessId = localStorage.getItem("current_business_id");
    // Use server-side RPC that validates business access
    await supabase.rpc("log_audit_entry", {
      _action: action,
      _details: details,
      _business_id: businessId || null,
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}

export async function logMasterAudit(action: string, details: Record<string, any>) {
  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from("master_audit_logs").insert({
      user_id: user.id,
      action,
      details,
    });
  } catch (e) {
    console.error("Master audit log failed:", e);
  }
}
