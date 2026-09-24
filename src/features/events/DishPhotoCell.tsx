import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ImagePlus, Loader2, RefreshCw, Trash2 } from "lucide-react";
import { DISH_BUCKET } from "./dishPhotos";

export default function DishPhotoCell({ dish, businessId, url, onChanged }: { dish: any; businessId: string; url?: string; onChanged: () => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const upload = async (file: File) => {
    if (!file.type.startsWith("image/")) { toast.error("Choose an image file"); return; }
    setBusy(true);
    const ext = file.name.split(".").pop() || "jpg";
    const path = `${businessId}/${dish.id}/${crypto.randomUUID()}.${ext}`;
    const up = await supabase.storage.from(DISH_BUCKET).upload(path, file, { contentType: file.type });
    if (up.error) { setBusy(false); toast.error(up.error.message); return; }
    const { error } = await (supabase.from("crm_dishes" as any) as any).update({ photo_path: path }).eq("id", dish.id);
    if (dish.photo_path) await supabase.storage.from(DISH_BUCKET).remove([dish.photo_path]);
    setBusy(false);
    if (error) toast.error(error.message); else { toast.success("Photo saved"); onChanged(); }
  };
  const remove = async () => {
    if (!confirm("Remove this photo?")) return;
    await (supabase.from("crm_dishes" as any) as any).update({ photo_path: null }).eq("id", dish.id);
    if (dish.photo_path) await supabase.storage.from(DISH_BUCKET).remove([dish.photo_path]);
    onChanged();
  };
  return (
    <div className="group relative flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <input ref={input} type="file" accept="image/*" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); e.target.value = ""; }} />
      <button type="button" onClick={() => input.current?.click()} title={url ? "Replace photo" : "Add photo"}
        className="flex h-10 w-10 items-center justify-center overflow-hidden rounded-md border border-border bg-muted text-muted-foreground hover:border-primary">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : url ? <img src={url} alt={dish.name} className="h-full w-full object-cover" /> : <ImagePlus className="h-4 w-4" />}
      </button>
      {url && !busy && (
        <>
          <div className="pointer-events-none absolute left-0 top-12 z-50 hidden w-56 overflow-hidden rounded-lg border border-border bg-background shadow-xl group-hover:block">
            <img src={url} alt={dish.name} className="h-56 w-56 object-cover" />
            <p className="truncate px-2 py-1.5 text-xs text-muted-foreground">{dish.name}</p>
          </div>
          <button type="button" onClick={() => input.current?.click()} title="Replace photo" className="text-muted-foreground hover:text-primary"><RefreshCw className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={remove} title="Delete photo" className="text-muted-foreground hover:text-destructive"><Trash2 className="h-3.5 w-3.5" /></button>
        </>
      )}
    </div>
  );
}
