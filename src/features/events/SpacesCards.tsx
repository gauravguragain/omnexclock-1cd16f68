import { FormEvent, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Archive, ArchiveRestore, ChevronLeft, ChevronRight, ImagePlus, Images, Pencil, Plus, Star, Trash2, Users } from "lucide-react";
import type { Row } from "./useEventsData";

const BUCKET = "venue-photos";

export default function SpacesCards({ businessId, rows, refresh, eventsThisMonth }: { businessId: string; rows: Row[]; refresh: () => void; eventsThisMonth: (r: Row) => number }) {
  const [status, setStatus] = useState<"active" | "archived">("active");
  const [editing, setEditing] = useState<Row | null>(null); const [formOpen, setFormOpen] = useState(false);
  const [gallery, setGallery] = useState<Row | null>(null); const [idx, setIdx] = useState(0);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const shown = useMemo(() => rows.filter(r => status === "active" ? r.active !== false : r.active === false), [rows, status]);
  const allPaths = useMemo(() => Array.from(new Set(rows.flatMap(r => [...(r.photos || []), r.cover_url].filter(Boolean)))) as string[], [rows]);

  useEffect(() => {
    const missing = allPaths.filter(p => !urls[p]);
    if (!missing.length) return;
    supabase.storage.from(BUCKET).createSignedUrls(missing, 60 * 60 * 6).then(({ data }) => {
      if (!data) return;
      setUrls(u => { const n = { ...u }; data.forEach(d => { if (d.path && d.signedUrl) n[d.path] = d.signedUrl; }); return n; });
    });
  }, [allPaths]); // eslint-disable-line react-hooks/exhaustive-deps

  const cover = (r: Row) => r.cover_url || r.photos?.[0];
  const update = async (id: string, values: Row) => {
    const { error } = await (supabase.from("crm_venue_spaces") as any).update({ ...values, updated_at: new Date().toISOString() }).eq("id", id);
    if (error) { toast.error(error.message); return false; } refresh(); return true;
  };

  const upload = async (r: Row, files: FileList | null) => {
    if (!files?.length) return; setBusy(true);
    const added: string[] = [];
    for (const f of Array.from(files)) {
      if (!f.type.startsWith("image/")) continue;
      const path = `${businessId}/${r.id}/${crypto.randomUUID()}.${f.name.split(".").pop() || "jpg"}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, f, { contentType: f.type });
      if (error) toast.error(error.message); else added.push(path);
    }
    if (added.length) {
      const photos = [...(r.photos || []), ...added];
      if (await update(r.id, { photos, cover_url: r.cover_url || added[0] })) {
        toast.success(`${added.length} photo${added.length > 1 ? "s" : ""} added`);
        setGallery(g => g && g.id === r.id ? { ...g, photos, cover_url: g.cover_url || added[0] } : g);
      }
    }
    setBusy(false);
  };

  const removePhoto = async (r: Row, path: string) => {
    if (!confirm("Delete this photo?")) return;
    await supabase.storage.from(BUCKET).remove([path]);
    const photos = (r.photos || []).filter((p: string) => p !== path);
    const cover_url = r.cover_url === path ? photos[0] || null : r.cover_url;
    if (await update(r.id, { photos, cover_url })) { setGallery(g => g ? { ...g, photos, cover_url } : g); setIdx(i => Math.max(0, Math.min(i, photos.length - 1))); }
  };
  const makeCover = async (r: Row, path: string) => { if (await update(r.id, { cover_url: path })) { setGallery(g => g ? { ...g, cover_url: path } : g); toast.success("Profile picture set"); } };

  const save = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault(); const f = new FormData(e.currentTarget);
    const values = { name: String(f.get("name") || "").trim(), capacity: f.get("capacity") ? Number(f.get("capacity")) : null,
      layouts: String(f.get("layouts") || "").split(",").map(s => s.trim()).filter(Boolean), description: String(f.get("description") || "") || null };
    const t = supabase.from("crm_venue_spaces") as any;
    const res = editing ? await t.update({ ...values, updated_at: new Date().toISOString() }).eq("id", editing.id) : await t.insert({ ...values, business_id: businessId });
    if (res.error) toast.error(res.error.message); else { toast.success("Saved"); setFormOpen(false); refresh(); }
  };

  const photos: string[] = gallery?.photos || [];
  const current = photos[idx];

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-serif text-3xl font-semibold">Spaces</h1><p className="text-sm text-muted-foreground">Halls and rooms, their capacity, layouts and photos.</p></div>
      <Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="mr-2 h-4 w-4" />New space</Button>
    </div>
    <div className="flex gap-2">{(["active", "archived"] as const).map(s => <Button key={s} size="sm" variant={status === s ? "default" : "outline"} className="capitalize" onClick={() => setStatus(s)}>{s} ({rows.filter(r => s === "active" ? r.active !== false : r.active === false).length})</Button>)}</div>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      {shown.map(r => <article key={r.id} className="overflow-hidden rounded-lg border border-border bg-card shadow-sm transition hover:shadow-md">
        <button type="button" className="group relative block aspect-[4/3] w-full bg-muted" onClick={() => { setGallery(r); setIdx(Math.max(0, (r.photos || []).indexOf(cover(r)))); }}>
          {cover(r) && urls[cover(r)] ? <img src={urls[cover(r)]} alt={r.name} className="h-full w-full object-cover transition group-hover:scale-[1.02]" loading="lazy" />
            : <div className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><ImagePlus className="h-8 w-8" /><span className="text-sm">Add photos</span></div>}
          {(r.photos?.length || 0) > 0 && <span className="absolute bottom-2 right-2 flex items-center gap-1 rounded-md bg-background/85 px-2 py-1 text-xs font-medium text-foreground"><Images className="h-3.5 w-3.5" />{r.photos.length}</span>}
        </button>
        <div className="space-y-3 p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="font-serif text-xl font-semibold">{r.name}</h3>
            {r.capacity ? <Badge variant="secondary" className="shrink-0"><Users className="mr-1 h-3 w-3" />{r.capacity}</Badge> : null}
          </div>
          {r.description && <p className="line-clamp-2 text-sm text-muted-foreground">{r.description}</p>}
          {(r.layouts || []).length > 0 && <div className="flex flex-wrap gap-1">{r.layouts.map((l: string) => <Badge key={l} variant="outline">{l}</Badge>)}</div>}
          <div className="flex items-center justify-between border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">{eventsThisMonth(r)} event{eventsThisMonth(r) === 1 ? "" : "s"} this month</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" title="Add photos" asChild><label className="cursor-pointer"><ImagePlus className="h-4 w-4" /><input type="file" accept="image/*" multiple hidden disabled={busy} onChange={e => { upload(r, e.target.files); e.target.value = ""; }} /></label></Button>
              <Button size="icon" variant="ghost" title="Edit" onClick={() => { setEditing(r); setFormOpen(true); }}><Pencil className="h-4 w-4" /></Button>
              <Button size="icon" variant="ghost" title={r.active === false ? "Restore" : "Archive"} onClick={() => update(r.id, { active: r.active === false })}>{r.active === false ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button>
            </div>
          </div>
        </div>
      </article>)}
      {!shown.length && <p className="col-span-full py-8 text-center text-sm text-muted-foreground">Nothing here yet.</p>}
    </div>

    <Dialog open={formOpen} onOpenChange={setFormOpen}><DialogContent>
      <DialogHeader><DialogTitle>{editing ? "Edit space" : "New space"}</DialogTitle></DialogHeader>
      <form onSubmit={save} className="space-y-3">
        <div className="space-y-1"><Label>Space name</Label><Input name="name" required defaultValue={editing?.name || ""} /></div>
        <div className="space-y-1"><Label>Holds (guests)</Label><Input name="capacity" type="number" defaultValue={editing?.capacity ?? ""} /></div>
        <div className="space-y-1"><Label>Layouts</Label><Input name="layouts" placeholder="Banquet, Cocktail, Theatre" defaultValue={(editing?.layouts || []).join(", ")} /></div>
        <div className="space-y-1"><Label>Description</Label><Input name="description" defaultValue={editing?.description || ""} /></div>
        <DialogFooter><Button type="submit">Save</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>

    <Dialog open={!!gallery} onOpenChange={o => !o && setGallery(null)}><DialogContent className="max-w-4xl">
      <DialogHeader><DialogTitle>{gallery?.name} — photos</DialogTitle></DialogHeader>
      {photos.length ? <>
        <div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md bg-muted">
          {current && urls[current] && <img src={urls[current]} alt="" className="h-full w-full object-contain" />}
          {photos.length > 1 && <>
            <Button size="icon" variant="secondary" className="absolute left-2 top-1/2 -translate-y-1/2" onClick={() => setIdx(i => (i - 1 + photos.length) % photos.length)}><ChevronLeft className="h-5 w-5" /></Button>
            <Button size="icon" variant="secondary" className="absolute right-2 top-1/2 -translate-y-1/2" onClick={() => setIdx(i => (i + 1) % photos.length)}><ChevronRight className="h-5 w-5" /></Button>
          </>}
          {current === gallery?.cover_url && <Badge className="absolute left-2 top-2"><Star className="mr-1 h-3 w-3" />Profile picture</Badge>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">{photos.map((p, i) => <button key={p} onClick={() => setIdx(i)} className={`h-16 w-24 shrink-0 overflow-hidden rounded border-2 ${i === idx ? "border-primary" : "border-transparent"}`}>{urls[p] && <img src={urls[p]} alt="" className="h-full w-full object-cover" />}</button>)}</div>
      </> : <p className="py-10 text-center text-sm text-muted-foreground">No photos yet.</p>}
      <DialogFooter className="gap-2 sm:justify-between">
        <Button variant="outline" asChild disabled={busy}><label className="cursor-pointer"><ImagePlus className="mr-2 h-4 w-4" />{busy ? "Uploading…" : "Add photos"}<input type="file" accept="image/*" multiple hidden disabled={busy} onChange={e => { gallery && upload(gallery, e.target.files); e.target.value = ""; }} /></label></Button>
        {current && gallery && <div className="flex gap-2">
          <Button variant="outline" disabled={current === gallery.cover_url} onClick={() => makeCover(gallery, current)}><Star className="mr-2 h-4 w-4" />Set as profile</Button>
          <Button variant="destructive" onClick={() => removePhoto(gallery, current)}><Trash2 className="mr-2 h-4 w-4" />Delete</Button>
        </div>}
      </DialogFooter>
    </DialogContent></Dialog>
  </div>;
}
