import { supabase } from "@/integrations/supabase/client";

export const DISH_BUCKET = "dish-photos";

/** Returns a map of storage path -> signed URL (valid 1 day). */
export async function signDishPhotos(paths: (string | null | undefined)[]): Promise<Record<string, string>> {
  const list = Array.from(new Set(paths.filter(Boolean) as string[]));
  if (!list.length) return {};
  const { data } = await supabase.storage.from(DISH_BUCKET).createSignedUrls(list, 60 * 60 * 24);
  const out: Record<string, string> = {};
  (data || []).forEach((d) => { if (d.path && d.signedUrl) out[d.path] = d.signedUrl; });
  return out;
}
