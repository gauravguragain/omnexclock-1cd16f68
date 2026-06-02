import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";

export interface BusinessTheme {
  primary: string;
  background: string;
  foreground: string;
  card: string;
  accent: string;
  muted: string;
  border: string;
}

export interface Business {
  id: string;
  name: string;
  business_code: string;
  owner_id: string;
  logo_url: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  industry: string | null;
  description: string | null;
  theme: BusinessTheme;
  status: string;
  created_at: string;
  updated_at: string;
}

interface BusinessContextType {
  business: Business | null;
  businesses: Business[];
  loading: boolean;
  setBusiness: (b: Business | null) => void;
  refreshBusiness: () => Promise<void>;
  applyTheme: (theme: BusinessTheme) => void;
  resetTheme: () => void;
}

const defaultTheme: BusinessTheme = {
  primary: "43 72% 52%",
  background: "0 0% 0%",
  foreground: "0 0% 96%",
  card: "0 0% 4%",
  accent: "43 72% 52%",
  muted: "0 0% 10%",
  border: "0 0% 16%",
};

const BusinessContext = createContext<BusinessContextType | undefined>(undefined);

/** Parse an HSL string like "43 72% 52%" into {h, s, l} */
function parseHSL(hsl: string): { h: number; s: number; l: number } {
  const parts = hsl.replace(/%/g, "").split(/\s+/).map(Number);
  return { h: parts[0] || 0, s: parts[1] || 0, l: parts[2] || 0 };
}

function hslStr(h: number, s: number, l: number): string {
  return `${h} ${s}% ${Math.round(Math.min(100, Math.max(0, l)))}%`;
}

/**
 * Given a dark-oriented business theme, derive light-mode structural colors.
 * Brand colors (primary, accent) stay the same; structural colors are inverted.
 */
function deriveLightStructural(theme: BusinessTheme) {
  const bg = parseHSL(theme.background);
  const fg = parseHSL(theme.foreground);
  const card = parseHSL(theme.card);
  const muted = parseHSL(theme.muted);
  const border = parseHSL(theme.border);

  return {
    background: hslStr(bg.h, Math.min(bg.s, 10), 99),
    foreground: hslStr(fg.h, Math.min(fg.s, 10), 9),
    card: hslStr(card.h, Math.min(card.s, 10), 100),
    cardForeground: hslStr(fg.h, Math.min(fg.s, 10), 9),
    muted: hslStr(muted.h, Math.min(muted.s, 10), 94),
    mutedForeground: hslStr(muted.h, Math.min(muted.s, 15), 40),
    border: hslStr(border.h, Math.min(border.s, 10), 88),
    secondary: hslStr(muted.h, Math.min(muted.s, 10), 95),
    secondaryForeground: hslStr(fg.h, Math.min(fg.s, 10), 9),
    sidebarBg: hslStr(card.h, Math.min(card.s, 10), 97),
    sidebarAccent: hslStr(muted.h, Math.min(muted.s, 10), 93),
  };
}

function applyThemeToDOM(theme: BusinessTheme, isDark: boolean) {
  const root = document.documentElement;

  // Brand colors — same in both modes
  root.style.setProperty("--primary", theme.primary);
  root.style.setProperty("--accent", theme.accent);
  root.style.setProperty("--ring", theme.primary);
  root.style.setProperty("--sidebar-primary", theme.primary);
  root.style.setProperty("--sidebar-ring", theme.primary);

  if (isDark) {
    // Dark mode: apply the business theme directly
    root.style.setProperty("--background", theme.background);
    root.style.setProperty("--foreground", theme.foreground);
    root.style.setProperty("--card", theme.card);
    root.style.setProperty("--card-foreground", theme.foreground);
    root.style.setProperty("--popover", theme.card);
    root.style.setProperty("--popover-foreground", theme.foreground);
    root.style.setProperty("--accent-foreground", theme.background);
    root.style.setProperty("--primary-foreground", theme.background);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--border", theme.border);
    root.style.setProperty("--input", theme.border);
    root.style.setProperty("--sidebar-background", theme.card);
    root.style.setProperty("--sidebar-foreground", theme.foreground);
    root.style.setProperty("--sidebar-border", theme.border);
  } else {
    // Light mode: derive structural colors from business theme
    const light = deriveLightStructural(theme);
    root.style.setProperty("--background", light.background);
    root.style.setProperty("--foreground", light.foreground);
    root.style.setProperty("--card", light.card);
    root.style.setProperty("--card-foreground", light.cardForeground);
    root.style.setProperty("--popover", light.card);
    root.style.setProperty("--popover-foreground", light.cardForeground);
    root.style.setProperty("--accent-foreground", light.foreground);
    root.style.setProperty("--primary-foreground", "0 0% 100%");
    root.style.setProperty("--muted", light.muted);
    root.style.setProperty("--muted-foreground", light.mutedForeground);
    root.style.setProperty("--secondary", light.secondary);
    root.style.setProperty("--secondary-foreground", light.secondaryForeground);
    root.style.setProperty("--border", light.border);
    root.style.setProperty("--input", light.border);
    root.style.setProperty("--sidebar-background", light.sidebarBg);
    root.style.setProperty("--sidebar-foreground", light.foreground);
    root.style.setProperty("--sidebar-border", light.border);
    root.style.setProperty("--sidebar-accent", light.sidebarAccent);
    root.style.setProperty("--sidebar-accent-foreground", light.foreground);
  }
}

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user, businessRoles } = useAuth();
  const [business, setBusinessState] = useState<Business | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);

  const getCurrentMode = useCallback((): boolean => {
    return document.documentElement.classList.contains("dark");
  }, []);

  const applyTheme = useCallback((theme: BusinessTheme) => {
    applyThemeToDOM(theme, getCurrentMode());
  }, [getCurrentMode]);

  const resetTheme = () => {
    const root = document.documentElement;
    const props = [
      "--primary", "--background", "--foreground", "--card", "--card-foreground",
      "--popover", "--popover-foreground", "--accent", "--accent-foreground",
      "--primary-foreground", "--muted", "--muted-foreground", "--border", "--input", "--ring",
      "--secondary", "--secondary-foreground",
      "--sidebar-primary", "--sidebar-background", "--sidebar-foreground",
      "--sidebar-border", "--sidebar-ring", "--sidebar-accent", "--sidebar-accent-foreground",
    ];
    props.forEach(p => root.style.removeProperty(p));
  };

  // Watch for class changes on <html> (dark/light toggle) and re-apply theme
  useEffect(() => {
    const observer = new MutationObserver(() => {
      if (business?.theme) {
        applyThemeToDOM(business.theme || defaultTheme, getCurrentMode());
      }
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, [business, getCurrentMode]);

  const setBusiness = (b: Business | null) => {
    setBusinessState(b);
    if (b) {
      localStorage.setItem("current_business_id", b.id);
      applyThemeToDOM(b.theme || defaultTheme, getCurrentMode());
    } else {
      localStorage.removeItem("current_business_id");
      applyThemeToDOM(defaultTheme, getCurrentMode());
    }
  };

  const fetchBusinesses = async () => {
    if (!user) return;
    setLoading(true);

    const { data: roleData } = await supabase
      .from("user_roles")
      .select("business_id")
      .eq("user_id", user.id);

    const businessIds = [...new Set((roleData || []).map(r => r.business_id).filter(Boolean))];

    let data: any[] = [];
    if (businessIds.length > 0) {
      const { data: bizData } = await supabase
        .from("businesses")
        .select("*")
        .in("id", businessIds);
      data = bizData || [];
    }

    if (data && data.length > 0) {
      const mapped = data.map((b: any) => ({
        ...b,
        theme: b.theme || defaultTheme,
        status: b.status || "active",
      }));
      setBusinesses(mapped);

      const savedId = localStorage.getItem("current_business_id");
      const found = mapped.find((b: Business) => b.id === savedId);
      setBusiness(found || mapped[0]);
    } else {
      setBusinesses([]);
      setBusinessState(null);
    }
    setLoading(false);
  };

  const refreshBusiness = async () => {
    if (!business) return;
    const { data } = await supabase
      .from("businesses")
      .select("*")
      .eq("id", business.id)
      .single();
    if (data) {
      const updated = { ...data, theme: data.theme || defaultTheme } as Business;
      setBusinessState(updated);
      setBusinesses((prev) => prev.map((b) => (b.id === updated.id ? updated : b)));
      applyThemeToDOM(updated.theme, getCurrentMode());
    }
  };

  useEffect(() => {
    if (user) {
      fetchBusinesses();
    } else {
      setBusinesses([]);
      setBusinessState(null);
      applyThemeToDOM(defaultTheme, getCurrentMode());
    }
    // Re-fetch when the user's business role assignments change (e.g. right after
    // an invitation is auto-accepted on first sign-in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, businessRoles.map(r => r.business_id).filter(Boolean).sort().join(",")]);

  return (
    <BusinessContext.Provider value={{ business, businesses, loading, setBusiness, refreshBusiness, applyTheme, resetTheme }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within BusinessProvider");
  return ctx;
}
