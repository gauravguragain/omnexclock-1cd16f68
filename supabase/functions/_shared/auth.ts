// Shared authentication / authorization helpers for edge functions.
// Every caller-facing function must verify the Supabase session and the
// caller's role for the business they are trying to touch.

import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

export type BusinessRole = "admin" | "super_admin" | "roster_admin" | "viewer" | "master" | "sales_marketing_manager";

export interface AuthedCaller {
  userId: string;
  email: string | null;
  roles: { role: string; business_id: string | null }[];
  isMaster: boolean;
}

/** Resolves the caller from the Authorization header. Returns null when unauthenticated. */
export async function getCaller(
  req: Request,
  admin: SupabaseClient,
): Promise<AuthedCaller | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return null;

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) return null;

  const { data: roles } = await admin
    .from("user_roles")
    .select("role, business_id")
    .eq("user_id", data.user.id);

  const roleRows = roles ?? [];
  return {
    userId: data.user.id,
    email: data.user.email ?? null,
    roles: roleRows,
    isMaster: roleRows.some((r) => r.role === "master"),
  };
}

/** True when the caller holds one of `allowed` roles for `businessId` (masters always pass). */
export function hasBusinessRole(
  caller: AuthedCaller,
  businessId: string | null | undefined,
  allowed: BusinessRole[] = ["admin", "super_admin", "roster_admin", "viewer", "sales_marketing_manager"],
): boolean {
  if (caller.isMaster) return true;
  if (!businessId) return false;
  return caller.roles.some(
    (r) => r.business_id === businessId && allowed.includes(r.role as BusinessRole),
  );
}

export function serviceClient(): SupabaseClient {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
}

export function jsonError(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
