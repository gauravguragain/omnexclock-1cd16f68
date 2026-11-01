export function canViewRosterRunsheet(roles: { role: string; business_id: string | null }[], businessId: string) {
  return roles.some(r =>
    (r.role === "master" && r.business_id === null) ||
    (r.business_id === businessId && ["admin", "super_admin", "viewer", "roster_admin", "sales_marketing_manager", "food_safety_manager", "owner"].includes(r.role)),
  );
}