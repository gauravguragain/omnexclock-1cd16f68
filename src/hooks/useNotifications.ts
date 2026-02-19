import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface Notification {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  metadata: any;
  created_at: string;
}

// Admin notifications hook (authenticated user)
export function useAdminNotifications(businessId: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!businessId) return;
    const { data } = await supabase
      .from("notifications")
      .select("*")
      .eq("business_id", businessId)
      .not("user_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(50);
    const items = (data || []) as Notification[];
    setNotifications(items);
    setUnreadCount(items.filter(n => !n.read).length);
  }, [businessId]);

  useEffect(() => {
    fetchNotifications();
    if (!businessId) return;
    const channel = supabase
      .channel(`admin-notifications-${businessId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `business_id=eq.${businessId}` }, () => fetchNotifications())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [businessId, fetchNotifications]);

  const markRead = async (id: string) => {
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    fetchNotifications();
  };

  const markAllRead = async () => {
    if (!businessId) return;
    await supabase.from("notifications").update({ read: true }).eq("business_id", businessId).eq("read", false).not("user_id", "is", null);
    fetchNotifications();
  };

  const clearAll = async () => {
    if (!businessId) return;
    await supabase.from("notifications").delete().eq("business_id", businessId).not("user_id", "is", null);
    fetchNotifications();
  };

  return { notifications, unreadCount, markRead, markAllRead, clearAll, refetch: fetchNotifications };
}

// Employee notifications hook (via RPC)
export function useEmployeeNotifications(employeeCode: string | null, businessCode: string | null) {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const fetchNotifications = useCallback(async () => {
    if (!employeeCode) return;
    const { data } = await supabase.rpc("get_employee_notifications", {
      _employee_code: employeeCode,
      _business_code: businessCode,
    });
    const items = (data || []) as Notification[];
    setNotifications(items);
    setUnreadCount(items.filter(n => !n.read).length);
  }, [employeeCode, businessCode]);

  useEffect(() => {
    fetchNotifications();
    if (!employeeCode) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [employeeCode, fetchNotifications]);

  const markRead = async (id: string) => {
    if (!employeeCode) return;
    await supabase.rpc("mark_employee_notification_read", {
      _employee_code: employeeCode,
      _notification_id: id,
      _business_code: businessCode,
    });
    fetchNotifications();
  };

  const markAllRead = async () => {
    if (!employeeCode) return;
    await supabase.rpc("mark_all_employee_notifications_read", {
      _employee_code: employeeCode,
      _business_code: businessCode,
    });
    fetchNotifications();
  };

  return { notifications, unreadCount, markRead, markAllRead, refetch: fetchNotifications };
}
