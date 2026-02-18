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
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("audit_logs").insert({
      user_id: user?.id || null,
      action,
      details,
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}
