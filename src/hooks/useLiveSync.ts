import { useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

const VISIBLE_POLL_MS = 20_000;

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
    let poller: ReturnType<typeof setInterval> | undefined;
    let subscribedOnce = false;
    const fire = (delay = 400) => { clearTimeout(timer); timer = setTimeout(() => cb.current(), delay); };
    const channel = supabase.channel(`live-${key}-${businessId}-${Math.random().toString(36).slice(2, 8)}`);
    key.split(",").forEach(table => {
      channel.on("postgres_changes" as any, { event: "*", schema: "public", table, filter: `business_id=eq.${businessId}` }, fire);
    });
    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        if (subscribedOnce) fire(0);
        subscribedOnce = true;
      }
    });
    const onVis = () => { if (document.visibilityState === "visible") fire(0); };
    const onFocus = () => fire(0);
    const onOnline = () => fire(0);
    poller = setInterval(() => {
      if (document.visibilityState === "visible" && navigator.onLine) fire(0);
    }, VISIBLE_POLL_MS);
    const tableSet = new Set(key.split(","));
    const onWrite = (e: Event) => { const t = (e as CustomEvent).detail?.table; if (t === "*" || tableSet.has(t)) fire(); };
    const onRefresh = () => fire(0);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("focus", onFocus);
    window.addEventListener("online", onOnline);
    window.addEventListener("app:db-write", onWrite);
    window.addEventListener("app:data-refresh", onRefresh);
    return () => {
      clearTimeout(timer);
      clearInterval(poller);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("app:db-write", onWrite);
      window.removeEventListener("app:data-refresh", onRefresh);
      supabase.removeChannel(channel);
    };
  }, [key, businessId]);
}
