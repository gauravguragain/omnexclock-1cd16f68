import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { format } from "date-fns";
import { Archive, ArchiveRestore, Building2, ChevronLeft, ChevronRight, ImagePlus, Images, Pencil, Search, Star, Trash2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useCrmData } from "@/features/sales/useCrmData";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { type Row, useEventsData } from "./useEventsData";

const BUCKET = "venue-space-photos";

type PendingPhoto = { file: File; preview: string; key: string };

export default function SpacesPage() {
  const d = useEventsData();
  const crm = useCrmData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("active");
  const [editing, setEditing] = useState<Row | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [gallerySpace, setGallerySpace] = useState<Row | null>(null);
  const [galleryIndex, setGalleryIndex] = useState(0);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [keptPaths, setKeptPaths] = useState<string[]>([]);
  const [pending, setPending] = useState<PendingPhoto[]>([]);
  const [coverKey, setCoverKey] = useState("");
  const [saving, setSaving] = useState(false);
  const month = format(new Date(), "yyyy-MM");

  const shown = useMemo(() => d.venues.filter(space => {
    const matchesStatus = status === "all" || (status === "active" ? space.active !== false : space.active === false);
    return matchesStatus && JSON.stringify(space).toLowerCase().includes(search.toLowerCase());
  }), [d.venues, search, status]);

  useEffect(() => {
    const paths = Array.from(new Set(d.venues.flatMap(space => space.photo_paths || []).filter(Boolean))) as string[];
    if (!paths.length) { setSignedUrls({}); return; }
    let active = true;
    void Promise.all(paths.map(async path => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      return [path, data?.signedUrl || ""] as const;
    })).then(entries => { if (active) setSignedUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [d.venues]);

  const eventCount = (space: Row) => crm.bookings.filter(booking =>
    (booking.venue_space_id === space.id || booking.venue_space === space.name)
    && String(booking.event_date).startsWith(month)
    && booking.status !== "cancelled"
  ).length;

  const count = (value: string) => d.venues.filter(space => value === "all" || (value === "active" ? space.active !== false : space.active === false)).length;
  const coverPath = (space: Row) => space.cover_photo_path || space.photo_paths?.[0] || "";
  const coverUrl = (space: Row) => signedUrls[coverPath(space)] || "";

  const openEditor = (space: Row | null) => {
    pending.forEach(photo => URL.revokeObjectURL(photo.preview));
    const paths = [...(space?.photo_paths || [])];
    setPending([]);
    setKeptPaths(paths);
    setCoverKey(space?.cover_photo_path || paths[0] || "");
    setEditing(space);
    setEditorOpen(true);
  };

  const addPhotos = (files: FileList | null) => {
    if (!files) return;
    const images = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (images.length !== files.length) toast.error("Only image files can be added.");
    const additions = images.map(file => ({ file, preview: URL.createObjectURL(file), key: `new-${crypto.randomUUID()}` }));
    setPending(current => [...current, ...additions]);
    if (!coverKey && additions[0]) setCoverKey(additions[0].key);
    if (inputRef.current) inputRef.current.value = "";
  };

  const removePending = (key: string) => {
    setPending(current => {
      const item = current.find(photo => photo.key === key);
      if (item) URL.revokeObjectURL(item.preview);
      return current.filter(photo => photo.key !== key);
    });
    if (coverKey === key) setCoverKey(keptPaths[0] || "");
  };

  const removeExisting = (path: string) => {
    const next = keptPaths.filter(item => item !== path);
    setKeptPaths(next);
    if (coverKey === path) setCoverKey(next[0] || pending[0]?.key || "");
  };

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!d.business) return;
    setSaving(true);
    const form = new FormData(event.currentTarget);
    const values = {
      name: String(form.get("name") || "").trim(),
      capacity: form.get("capacity") ? Number(form.get("capacity")) : null,
      layouts: String(form.get("layouts") || "").split(",").map(item => item.trim()).filter(Boolean),
      description: String(form.get("description") || "").trim() || null,
    };
    const table = supabase.from("crm_venue_spaces") as any;
    let spaceId = editing?.id as string | undefined;
    if (spaceId) {
      const { error } = await table.update({ ...values, updated_at: new Date().toISOString() }).eq("id", spaceId);
      if (error) { toast.error(error.message); setSaving(false); return; }
    } else {
      const { data, error } = await table.insert({ ...values, business_id: d.business.id }).select("id").single();
      if (error || !data?.id) { toast.error(error?.message || "The venue space could not be created."); setSaving(false); return; }
      spaceId = data.id;
    }
    const uploaded: { key: string; path: string }[] = [];
    for (const photo of pending) {
      const extension = photo.file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${d.business.id}/${spaceId}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, photo.file, { contentType: photo.file.type });
      if (error) { toast.error(`Could not upload ${photo.file.name}: ${error.message}`); continue; }
      uploaded.push({ key: photo.key, path });
    }
    const allPaths = [...keptPaths, ...uploaded.map(photo => photo.path)];
    const selectedCover = uploaded.find(photo => photo.key === coverKey)?.path || (allPaths.includes(coverKey) ? coverKey : allPaths[0]) || null;
    const { error: updateError } = await table.update({ photo_paths: allPaths, cover_photo_path: selectedCover, updated_at: new Date().toISOString() }).eq("id", spaceId);
    if (updateError) { toast.error(updateError.message); setSaving(false); return; }
    const removedPaths = (editing?.photo_paths || []).filter((path: string) => !keptPaths.includes(path));
    if (removedPaths.length) await supabase.storage.from(BUCKET).remove(removedPaths);
    pending.forEach(photo => URL.revokeObjectURL(photo.preview));
    setPending([]);
    setEditorOpen(false);
    setSaving(false);
    toast.success("Venue space saved");
    await d.refresh();
  };

  const setActive = async (space: Row) => {
    const { error } = await (supabase.from("crm_venue_spaces") as any).update({ active: space.active === false }).eq("id", space.id);
    if (error) toast.error(error.message); else await d.refresh();
  };

  const openGallery = (space: Row) => {
    const paths = space.photo_paths || [];
    const initial = Math.max(0, paths.indexOf(coverPath(space)));
    setGalleryIndex(initial);
    setGallerySpace(space);
  };

  const galleryPaths = (gallerySpace?.photo_paths || []) as string[];
  const moveGallery = (direction: number) => setGalleryIndex(index => (index + direction + galleryPaths.length) % galleryPaths.length);

  if (!d.business) return null;
  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div><h1 className="font-serif text-3xl font-semibold">Venue spaces</h1><p className="text-sm text-muted-foreground">Manage every hall and room, with a cover photo and full image gallery.</p></div>
      <Button onClick={() => openEditor(null)}><ImagePlus className="mr-2 h-4 w-4" />Add space</Button>
    </div>
    <div className="flex flex-wrap items-center gap-2">
      {["active", "archived", "all"].map(value => <Button key={value} size="sm" variant={status === value ? "default" : "outline"} onClick={() => setStatus(value)} className="capitalize">{value} ({count(value)})</Button>)}
      <div className="relative ml-auto w-full max-w-xs"><Search className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" /><Input className="h-9 pl-9" placeholder="Search spaces" value={search} onChange={event => setSearch(event.target.value)} /></div>
    </div>
    {shown.length ? <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
      {shown.map(space => <Card key={space.id} className="overflow-hidden">
        <Button type="button" variant="ghost" onClick={() => (space.photo_paths?.length ? openGallery(space) : openEditor(space))} className="group relative block h-auto aspect-[16/10] w-full overflow-hidden rounded-none bg-muted p-0 text-left hover:bg-muted" aria-label={space.photo_paths?.length ? `Open ${space.name} photo gallery` : `Add photos for ${space.name}`}>
          {coverUrl(space) ? <img src={coverUrl(space)} alt={`${space.name} cover`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <span className="flex h-full flex-col items-center justify-center gap-2 text-muted-foreground"><Building2 className="h-10 w-10" /><span className="text-sm">Add venue photos</span></span>}
          {!!space.photo_paths?.length && <Badge className="absolute bottom-3 right-3 gap-1 bg-background/90 text-foreground shadow-sm hover:bg-background"><Images className="h-3.5 w-3.5" />{space.photo_paths.length}</Badge>}
          {space.active === false && <Badge variant="secondary" className="absolute left-3 top-3">Archived</Badge>}
        </Button>
        <CardContent className="space-y-4 p-5">
          <div className="flex items-start justify-between gap-3"><div className="min-w-0"><h2 className="break-words font-serif text-xl font-semibold">{space.name}</h2><p className="text-sm text-muted-foreground">{space.capacity ? `Up to ${space.capacity} guests` : "Capacity not set"}</p></div><Badge variant="outline" className="shrink-0">{eventCount(space)} this month</Badge></div>
          {space.description && <p className="line-clamp-2 text-sm text-muted-foreground">{space.description}</p>}
          <div className="flex min-h-6 flex-wrap gap-1.5">{space.layouts?.length ? space.layouts.map((layout: string) => <Badge key={layout} variant="secondary">{layout}</Badge>) : <span className="text-xs text-muted-foreground">No layouts added</span>}</div>
          <div className="flex justify-end gap-1 border-t border-border pt-3"><Button size="icon" variant="ghost" title="Edit venue space" aria-label={`Edit ${space.name}`} onClick={() => openEditor(space)}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" title={space.active === false ? "Restore venue space" : "Archive venue space"} aria-label={`${space.active === false ? "Restore" : "Archive"} ${space.name}`} onClick={() => setActive(space)}>{space.active === false ? <ArchiveRestore className="h-4 w-4" /> : <Archive className="h-4 w-4" />}</Button></div>
        </CardContent>
      </Card>)}
    </div> : <div className="rounded-md border border-dashed py-16 text-center"><Building2 className="mx-auto h-10 w-10 text-muted-foreground" /><p className="mt-3 font-medium">No venue spaces found</p><p className="text-sm text-muted-foreground">Add a space or change the filters above.</p></div>}

    <Dialog open={editorOpen} onOpenChange={setEditorOpen}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl"><DialogHeader><DialogTitle className="font-serif text-2xl">{editing ? "Edit venue space" : "Add venue space"}</DialogTitle></DialogHeader>
      <form key={editing?.id || "new"} onSubmit={save} className="space-y-5">
        <div className="grid gap-4 sm:grid-cols-2"><div className="space-y-1.5"><Label htmlFor="space-name">Space name *</Label><Input id="space-name" name="name" required defaultValue={editing?.name || ""} /></div><div className="space-y-1.5"><Label htmlFor="space-capacity">Capacity</Label><Input id="space-capacity" name="capacity" type="number" min="0" defaultValue={editing?.capacity ?? ""} /></div></div>
        <div className="space-y-1.5"><Label htmlFor="space-layouts">Layouts</Label><Input id="space-layouts" name="layouts" placeholder="Banquet, Cocktail, Theatre" defaultValue={(editing?.layouts || []).join(", ")} /></div>
        <div className="space-y-1.5"><Label htmlFor="space-description">Description</Label><Textarea id="space-description" name="description" rows={3} defaultValue={editing?.description || ""} /></div>
        <section className="space-y-3 border-t border-border pt-5"><div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="font-medium">Photos</h3><p className="text-xs text-muted-foreground">Choose one cover photo. Select any card later to open the gallery.</p></div><Button type="button" variant="outline" size="sm" onClick={() => inputRef.current?.click()}><Upload className="mr-2 h-4 w-4" />Add photos</Button><input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => addPhotos(event.target.files)} /></div>
          {(keptPaths.length || pending.length) ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {keptPaths.map(path => <div key={path} className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-muted"><img src={signedUrls[path]} alt="Venue" className="h-full w-full object-cover" />{coverKey === path && <Badge className="absolute left-2 top-2 gap-1"><Star className="h-3 w-3" />Cover</Badge>}<div className="absolute bottom-2 right-2 flex gap-1"><Button type="button" size="icon" variant="secondary" className="h-8 w-8" title="Use as cover" onClick={() => setCoverKey(path)}><Star className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="destructive" className="h-8 w-8" title="Remove photo" onClick={() => removeExisting(path)}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>)}
            {pending.map(photo => <div key={photo.key} className="relative aspect-[4/3] overflow-hidden rounded-md border border-border bg-muted"><img src={photo.preview} alt={photo.file.name} className="h-full w-full object-cover" />{coverKey === photo.key && <Badge className="absolute left-2 top-2 gap-1"><Star className="h-3 w-3" />Cover</Badge>}<div className="absolute bottom-2 right-2 flex gap-1"><Button type="button" size="icon" variant="secondary" className="h-8 w-8" title="Use as cover" onClick={() => setCoverKey(photo.key)}><Star className="h-3.5 w-3.5" /></Button><Button type="button" size="icon" variant="destructive" className="h-8 w-8" title="Remove photo" onClick={() => removePending(photo.key)}><Trash2 className="h-3.5 w-3.5" /></Button></div></div>)}
          </div> : <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} className="flex h-auto w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-10 text-muted-foreground hover:bg-muted/50"><ImagePlus className="h-8 w-8" /><span className="text-sm">Add a cover photo and gallery</span></Button>}
        </section>
        <DialogFooter><Button type="button" variant="outline" onClick={() => setEditorOpen(false)}>Cancel</Button><Button disabled={saving}>{saving ? "Saving…" : "Save space"}</Button></DialogFooter>
      </form>
    </DialogContent></Dialog>

    <Dialog open={!!gallerySpace} onOpenChange={open => !open && setGallerySpace(null)}><DialogContent className="max-w-5xl overflow-hidden p-0"><DialogHeader className="px-5 pt-5"><DialogTitle className="font-serif text-2xl">{gallerySpace?.name}</DialogTitle></DialogHeader>
      {galleryPaths.length > 0 && <div className="space-y-3 px-5 pb-5"><div className="relative flex aspect-[16/10] items-center justify-center overflow-hidden rounded-md bg-muted"><img src={signedUrls[galleryPaths[galleryIndex]]} alt={`${gallerySpace?.name} photo ${galleryIndex + 1}`} className="h-full w-full object-contain" />{galleryPaths.length > 1 && <><Button type="button" size="icon" variant="secondary" className="absolute left-3" onClick={() => moveGallery(-1)} aria-label="Previous photo"><ChevronLeft className="h-5 w-5" /></Button><Button type="button" size="icon" variant="secondary" className="absolute right-3" onClick={() => moveGallery(1)} aria-label="Next photo"><ChevronRight className="h-5 w-5" /></Button></>}</div>
        <div className="flex gap-2 overflow-x-auto pb-1">{galleryPaths.map((path, index) => <Button key={path} type="button" variant="ghost" onClick={() => setGalleryIndex(index)} className={`h-16 w-24 shrink-0 overflow-hidden rounded-md border-2 p-0 ${index === galleryIndex ? "border-primary" : "border-transparent"}`} aria-label={`View photo ${index + 1}`}><img src={signedUrls[path]} alt="" className="h-full w-full object-cover" /></Button>)}</div><p className="text-center text-xs text-muted-foreground">{galleryIndex + 1} of {galleryPaths.length}</p></div>}
    </DialogContent></Dialog>
  </div>;
}