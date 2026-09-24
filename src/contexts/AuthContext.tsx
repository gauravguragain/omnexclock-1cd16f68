import React, { createContext, useContext, useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { logAudit, logMasterAudit } from "@/lib/auditLog";
import type { User } from "@supabase/supabase-js";

interface UserBusinessRole {
  business_id: string | null;
  role: "admin" | "viewer" | "user" | "master" | "roster_admin" | "super_admin" | "sales_marketing_manager" | "food_safety_manager";
  departments?: string[] | null;
}

interface AuthContextType {
  user: User | null;
  isApproved: boolean;
  loading: boolean;
  /** All business roles for this user */
  businessRoles: UserBusinessRole[];
  /** Check if user is admin (or super_admin) of a specific business */
  isAdminOf: (businessId: string) => boolean;
  /** Check if user is super_admin of a specific business */
  isSuperAdminOf: (businessId: string) => boolean;
  /** Check if user is viewer of a specific business */
  isViewerOf: (businessId: string) => boolean;
  /** Check if user is roster admin of a specific business */
  isRosterAdminOf: (businessId: string) => boolean;
  isSalesManagerOf: (businessId: string) => boolean;
  isFoodSafetyManagerOf: (businessId: string) => boolean;
  /** Get roster admin departments for a specific business */
  getRosterAdminDepartments: (businessId: string) => string[];
  /** Check if user has any access (admin, super_admin, viewer, or roster_admin) to a business */
  hasAccessTo: (businessId: string) => boolean;
  /** Check if user is a platform master admin */
  isMaster: boolean;
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
    // Auto-accept any pending invitations matching this user's email so
    // invited admins/roster admins aren't blocked with "Access Denied".
    try {
      await supabase.rpc("accept_pending_invitations_for_user");
    } catch (e) {
      console.warn("accept_pending_invitations_for_user failed", e);
    }

    const [rolesResult, approvedResult] = await Promise.all([
      supabase.from("user_roles").select("business_id, role, departments").eq("user_id", userId),
      supabase.rpc("is_approved", { _user_id: userId }),
    ]);

    const roles: UserBusinessRole[] = (rolesResult.data || [])
      .map((r: any) => ({ business_id: r.business_id, role: r.role, departments: r.departments }));

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
    return businessRoles.some(r => r.business_id === businessId && (r.role === "admin" || r.role === "super_admin"));
  }, [businessRoles]);

  const isSuperAdminOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "super_admin");
  }, [businessRoles]);

  const isViewerOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "viewer");
  }, [businessRoles]);

  const isRosterAdminOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "roster_admin");
  }, [businessRoles]);

  const isSalesManagerOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "sales_marketing_manager");
  }, [businessRoles]);

  const isFoodSafetyManagerOf = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && r.role === "food_safety_manager");
  }, [businessRoles]);

  const getRosterAdminDepartments = useCallback((businessId: string): string[] => {
    const role = businessRoles.find(r => r.business_id === businessId && r.role === "roster_admin");
    return role?.departments || [];
  }, [businessRoles]);

  const hasAccessTo = useCallback((businessId: string) => {
    return businessRoles.some(r => r.business_id === businessId && (r.role === "admin" || r.role === "super_admin" || r.role === "viewer" || r.role === "roster_admin" || r.role === "sales_marketing_manager" || r.role === "food_safety_manager"));
  }, [businessRoles]);

  // Global checks
  const isMaster = businessRoles.some(r => r.role === "master" && !r.business_id);
  const isAdmin = businessRoles.some(r => r.role === "admin" || r.role === "super_admin");
  const isViewer = businessRoles.some(r => r.role === "viewer");

  const signIn = async (email: string, password: string) => {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (!error && data.user) {
      logAudit("user_sign_in", { email, user_id: data.user.id });
      logMasterAudit("user_sign_in", { email, user_id: data.user.id });
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
      isAdminOf, isSuperAdminOf, isViewerOf, isRosterAdminOf, isSalesManagerOf, isFoodSafetyManagerOf, getRosterAdminDepartments,
      hasAccessTo, isMaster,
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
