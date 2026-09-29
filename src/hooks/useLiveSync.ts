import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Live sync: re-runs `onChange` (debounced) whenever any of the given tables
 * change for this business, plus when the tab regains focus.
 */
export function useLiveSync(tables: string[], businessId: string | undefined, onChange: () => void) {
  const cb = useRef(onChange);
  cb.current = onChange;
  const key = tables.join(",");

  useEffect(() => {
    if (!businessId) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const fire = () => { clearTimeout(timer); timer = setTimeout(() => cb.current(), 400); };
    const channel = supabase.channel(`live-${key}-${businessId}-${Math.random().toString(36).slice(2, 8)}`);
    key.split(",").forEach(table => {
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table, filter: `business_id=eq.${businessId}` }, fire);
    });
    channel.subscribe();
    const onVis = () => { if (document.visibilityState === "visible") fire(); };
    const tableSet = new Set(key.split(","));
    const onWrite = (e: Event) => { const t = (e as CustomEvent).detail?.table; if (t === "*" || tableSet.has(t)) fire(); };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("app:db-write", onWrite);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("app:db-write", onWrite);
      supabase.removeChannel(channel);
    };
  }, [key, businessId]);
}
