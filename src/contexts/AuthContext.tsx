import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/auditLog";
import type { User } from "@supabase/supabase-js";

interface UserBusinessRole {
  business_id: string;
  role: "admin" | "viewer" | "user";
}

interface AuthContextType {
  user: User | null;
  isApproved: boolean;
  loading: boolean;
  /** All business roles for this user */
  businessRoles: UserBusinessRole[];
  /** Check if user is admin of a specific business */
  isAdminOf: (businessId: string) => boolean;
  /** Check if user is viewer of a specific business */
  isViewerOf: (businessId: string) => boolean;
  /** Check if user has any access (admin or viewer) to a business */
  hasAccessTo: (businessId: string) => boolean;
  /** Legacy: true if user is admin of ANY business */
  isAdmin: boolean;
  /** Legacy: true if user is viewer of ANY business */
  isViewer: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isApproved, setIsApproved] = useState(false);
  const [businessRoles, setBusinessRoles] = useState<UserBusinessRole[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchRoles = useCallback(async (userId: string) => {
    const [rolesResult, approvedResult] = await Promise.all([
      supabase.from("user_roles").select("business_id, role").eq("user_id", userId),
      supabase.rpc("is_approved", { _user_id: userId }),
    ]);

    const roles: UserBusinessRole[] = (rolesResult.data || [])
      .filter((r: any) => r.business_id)
      .map((r: any) => ({ business_id: r.business_id, role: r.role }));

    setBusinessRoles(roles);
    setIsApproved(!!approvedResult.data);
  }, []);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        setTimeout(async () => {
          await fetchRoles(session.user.id);
          setLoading(false);
        }, 0);
      } else {
        setBusinessRoles([]);
        setIsApproved(false);
        setLoading(false);
      }
    });

    supabase.auth.getSession().then(async ({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchRoles(session.user.id);
      }
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const isAdminOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "admin");
  }, [businessRoles]);

  const isViewerOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "viewer");
  }, [businessRoles]);

  const hasAccessTo = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && (r.role === "admin" || r.role === "viewer"));
  }, [businessRoles]);

  // Legacy global checks
  const isAdmin = businessRoles.some(r => r.role === "admin");
  const isViewer = businessRoles.some(r => r.role === "viewer");

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      logAudit("user_sign_in", { email, user_id: data.user.id });
    }
    return { error: error?.message ?? null };
  };

  const signUp = async (email: string, password: string, fullName: string) => {
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: fullName },
        emailRedirectTo: window.location.origin,
      },
    });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{
      user, isApproved, loading, businessRoles,
      isAdminOf, isViewerOf, hasAccessTo,
      isAdmin, isViewer,
      signIn, signUp, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
