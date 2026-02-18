import React, { createContext, useContext, useEffect, useState } from "react";
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

export function BusinessProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [business, setBusinessState] = useState<Business | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [loading, setLoading] = useState(false);

  const applyTheme = (theme: BusinessTheme) => {
    const root = document.documentElement;
    root.style.setProperty("--primary", theme.primary);
    root.style.setProperty("--background", theme.background);
    root.style.setProperty("--foreground", theme.foreground);
    root.style.setProperty("--card", theme.card);
    root.style.setProperty("--card-foreground", theme.foreground);
    root.style.setProperty("--popover", theme.card);
    root.style.setProperty("--popover-foreground", theme.foreground);
    root.style.setProperty("--accent", theme.accent);
    root.style.setProperty("--accent-foreground", theme.background);
    root.style.setProperty("--primary-foreground", theme.background);
    root.style.setProperty("--muted", theme.muted);
    root.style.setProperty("--border", theme.border);
    root.style.setProperty("--input", theme.border);
    root.style.setProperty("--ring", theme.primary);
    root.style.setProperty("--sidebar-primary", theme.primary);
    root.style.setProperty("--sidebar-background", theme.card);
    root.style.setProperty("--sidebar-foreground", theme.foreground);
    root.style.setProperty("--sidebar-border", theme.border);
    root.style.setProperty("--sidebar-ring", theme.primary);
  };

  const setBusiness = (b: Business | null) => {
    setBusinessState(b);
    if (b) {
      localStorage.setItem("current_business_id", b.id);
      applyTheme(b.theme || defaultTheme);
    } else {
      localStorage.removeItem("current_business_id");
      applyTheme(defaultTheme);
    }
  };

  const fetchBusinesses = async () => {
    if (!user) return;
    setLoading(true);

    // Fetch businesses where user is owner OR has a role
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
      applyTheme(updated.theme);
    }
  };

  useEffect(() => {
    if (user) {
      fetchBusinesses();
    } else {
      setBusinesses([]);
      setBusinessState(null);
      applyTheme(defaultTheme);
    }
  }, [user]);

  return (
    <BusinessContext.Provider value={{ business, businesses, loading, setBusiness, refreshBusiness, applyTheme }}>
      {children}
    </BusinessContext.Provider>
  );
}

export function useBusiness() {
  const ctx = useContext(BusinessContext);
  if (!ctx) throw new Error("useBusiness must be used within BusinessProvider");
  return ctx;
}
