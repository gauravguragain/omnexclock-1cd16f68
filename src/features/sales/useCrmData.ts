import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import type { CrmInspection, CrmInteraction, CrmLead, CrmOption, CrmTask } from "./types";

export function useCrmData() {
  const { business } = useBusiness();
  const [leads, setLeads] = useState<CrmLead[]>([]); const [options, setOptions] = useState<CrmOption[]>([]);
  const [inspections, setInspections] = useState<CrmInspection[]>([]); const [tasks, setTasks] = useState<CrmTask[]>([]);
  const [interactions, setInteractions] = useState<CrmInteraction[]>([]); const [settings, setSettings] = useState<any>(null);
  const [runsheets, setRunsheets] = useState<any[]>([]); const [bookings, setBookings] = useState<any[]>([]); const [menuItems, setMenuItems] = useState<any[]>([]); const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!business?.id) return; setLoading(true);
    const [leadRes, optionRes, inspectionRes, taskRes, interactionRes, settingRes, bookingRes, menuRes, runsheetRes, spaceRes] = await Promise.all([
      supabase.from("crm_leads").select("*").eq("business_id", business.id).order("created_at", { ascending: false }),
      supabase.from("crm_options").select("*").eq("business_id", business.id).order("sort_order"),
      supabase.from("crm_inspections").select("*").eq("business_id", business.id).order("starts_at"),
      supabase.from("crm_tasks").select("*").eq("business_id", business.id).order("due_at"),
      supabase.from("crm_interactions").select("*").eq("business_id", business.id).order("occurred_at", { ascending: false }),
      supabase.from("crm_settings").select("*").eq("business_id", business.id).maybeSingle(),
      supabase.from("crm_bookings").select("*").eq("business_id", business.id).order("event_date"),
      supabase.from("crm_menu_items").select("*").eq("business_id", business.id).order("sort_order"),
      supabase.from("crm_runsheets").select("*").eq("business_id", business.id),
      (supabase.from("crm_venue_spaces" as any) as any).select("*").eq("business_id", business.id).eq("active", true).order("sort_order"),
    ]);
    setLeads((leadRes.data || []) as CrmLead[]); const spaces = (spaceRes.data || []) as any[]; const baseOpts = (optionRes.data || []) as CrmOption[]; setOptions(spaces.length ? [...baseOpts.filter(o => o.option_type !== "venue_space"), ...spaces.map((v, i) => ({ id: v.id, option_type: "venue_space", label: v.name, value: v.name, description: v.capacity ? `Holds ${v.capacity}` : null, image_url: null, sort_order: i, active: true, price_per_head: null, flat_price: null }))] : baseOpts);
    setInspections((inspectionRes.data || []) as CrmInspection[]); setTasks((taskRes.data || []) as CrmTask[]);
    setInteractions((interactionRes.data || []) as unknown as CrmInteraction[]); setSettings(settingRes.data);
    setBookings(bookingRes.data || []); setMenuItems(menuRes.data || []); setRunsheets(runsheetRes.data || []); setLoading(false);
  }, [business?.id]);

  useEffect(() => { void refresh(); }, [refresh]);
  return { business, leads, options, inspections, tasks, interactions, settings, bookings, menuItems, runsheets, loading, refresh };
}