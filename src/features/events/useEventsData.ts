import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";

export type Row = Record<string, any>;

export function useEventsData() {
  const { business } = useBusiness();
  const [data, setData] = useState({
    venues: [] as Row[], customers: [] as Row[], stakeholders: [] as Row[], books: [] as Row[],
    packages: [] as Row[], courses: [] as Row[], courseItems: [] as Row[], dishes: [] as Row[], drinks: [] as Row[],
  });
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    if (!business?.id) return;
    const id = business.id;
    const q = (t: string, order = "created_at") => (supabase.from(t as any) as any).select("*").eq("business_id", id).order(order);
    const [venues, customers, stakeholders, books, packages, courses, courseItems, dishes, drinks] = await Promise.all([
      q("crm_venue_spaces", "sort_order"), q("crm_customers", "full_name"), q("crm_stakeholders", "full_name"), q("crm_menu_books", "sort_order"),
      q("crm_packages", "name"), q("crm_package_courses", "sort_order"), q("crm_package_course_items"), q("crm_dishes", "name"), q("crm_drinks", "name"),
    ]);
    setData({
      venues: venues.data || [], customers: customers.data || [], stakeholders: stakeholders.data || [], books: books.data || [],
      packages: packages.data || [], courses: courses.data || [], courseItems: courseItems.data || [], dishes: dishes.data || [], drinks: drinks.data || [],
    });
    setLoading(false);
  }, [business?.id]);
  useEffect(() => { void refresh(); }, [refresh]);
  return { business, ...data, loading, refresh };
}

export const to12 = (t?: string | null) => {
  if (!t) return "";
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
};
export const addMinutes = (t: string, mins: number) => {
  const [h, m] = t.split(":").map(Number); const total = (h * 60 + m + mins + 1440) % 1440;
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
};
export const minutesBetween = (a: string, b: string) => {
  const [ah, am] = a.split(":").map(Number); const [bh, bm] = b.split(":").map(Number);
  let d = bh * 60 + bm - (ah * 60 + am); if (d <= 0) d += 1440; return d;
};
export const bookingEnd = (b: Row) => (b.end_time ? String(b.end_time).slice(0, 5) : addMinutes(String(b.start_time).slice(0, 5), b.duration_minutes || 0));
