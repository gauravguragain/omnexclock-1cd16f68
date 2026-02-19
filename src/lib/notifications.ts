import { supabase } from "@/integrations/supabase/client";

interface NotifyEmployeesParams {
  businessId: string;
  employeeIds: string[];
  type: "shift_change" | "request_update" | "forum_activity" | "general";
  title: string;
  message: string;
  metadata?: any;
}

interface NotifyAdminsParams {
  businessId: string;
  type: "shift_change" | "request_update" | "forum_activity" | "general";
  title: string;
  message: string;
  metadata?: any;
}

export async function notifyEmployees({ businessId, employeeIds, type, title, message, metadata }: NotifyEmployeesParams) {
  if (employeeIds.length === 0) return;
  const rows = employeeIds.map(eid => ({
    business_id: businessId,
    employee_id: eid,
    type,
    title,
    message,
    metadata: metadata || null,
  }));
  await supabase.from("notifications").insert(rows);
}

export async function notifyAdmins({ businessId, type, title, message, metadata }: NotifyAdminsParams) {
  // Get all admin user_ids for this business
  const { data: roles } = await supabase
    .from("user_roles")
    .select("user_id")
    .eq("business_id", businessId)
    .eq("role", "admin");
  if (!roles || roles.length === 0) return;
  const rows = roles.map(r => ({
    business_id: businessId,
    user_id: r.user_id,
    type,
    title,
    message,
    metadata: metadata || null,
  }));
  await supabase.from("notifications").insert(rows);
}
