// Loads the full menu-book beverage package (sections + drinks) for a run sheet.
// Mirrored in supabase/functions/crm-runsheet-public/index.ts — keep both in sync.
export async function loadBeverageDetail(db: any, businessId: string, packageName?: string | null) {
  if (!businessId || !packageName) return null;
  const { data: pkg } = await db.from("crm_packages").select("id, name, description, subtitle, menu_title, price_label").eq("business_id", businessId).eq("name", packageName).eq("package_type", "beverage").limit(1).maybeSingle();
  if (!pkg) return null;
  const { data: courses } = await db.from("crm_package_courses").select("id, name, picks, notes, sort_order").eq("package_id", pkg.id).order("sort_order");
  const ids = (courses || []).map((c: any) => c.id);
  const { data: rows } = ids.length ? await db.from("crm_package_course_items").select("course_id, drink_id, dish_id").in("course_id", ids) : { data: [] };
  const drinkIds = [...new Set((rows || []).map((r: any) => r.drink_id).filter(Boolean))];
  const dishIds = [...new Set((rows || []).map((r: any) => r.dish_id).filter(Boolean))];
  const [drinks, dishes] = await Promise.all([
    drinkIds.length ? db.from("crm_drinks").select("id, name").in("id", drinkIds) : { data: [] },
    dishIds.length ? db.from("crm_dishes").select("id, name").in("id", dishIds) : { data: [] },
  ]);
  const names: Record<string, string> = {};
  for (const x of [...(drinks.data || []), ...(dishes.data || [])]) names[x.id] = x.name;
  return {
    name: pkg.name, description: pkg.description || pkg.subtitle || "",
    sections: (courses || []).map((c: any) => ({
      name: c.name, notes: c.notes || "", picks: c.picks,
      items: (rows || []).filter((r: any) => r.course_id === c.id).map((r: any) => names[r.drink_id || r.dish_id]).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b)),
    })),
  };
}
