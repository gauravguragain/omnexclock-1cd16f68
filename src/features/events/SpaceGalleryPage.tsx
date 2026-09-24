import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, ImagePlus, Images, Upload, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useEventsData } from "./useEventsData";

const BUCKET = "venue-space-photos";

export default function SpaceGalleryPage() {
  const { spaceId } = useParams<{ spaceId: string }>();
  const navigate = useNavigate();
  const d = useEventsData();
  const inputRef = useRef<HTMLInputElement>(null);
  const [signedUrls, setSignedUrls] = useState<Record<string, string>>({});
  const [viewerIndex, setViewerIndex] = useState<number | null>(null);
  const [uploading, setUploading] = useState(false);

  const space = useMemo(() => d.venues.find(item => item.id === spaceId) || null, [d.venues, spaceId]);
  const paths = useMemo(() => {
    if (!space) return [] as string[];
    return Array.from(new Set([space.cover_photo_path, ...((space.photo_paths || []) as string[])].filter(Boolean))) as string[];
  }, [space]);

  useEffect(() => {
    if (!paths.length) { setSignedUrls({}); return; }
    let active = true;
    void Promise.all(paths.map(async path => {
      const { data } = await supabase.storage.from(BUCKET).createSignedUrl(path, 3600);
      return [path, data?.signedUrl || ""] as const;
    })).then(entries => { if (active) setSignedUrls(Object.fromEntries(entries)); });
    return () => { active = false; };
  }, [paths]);

  useEffect(() => {
    if (viewerIndex === null) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setViewerIndex(null);
      if (event.key === "ArrowLeft") setViewerIndex(index => index === null ? index : (index - 1 + paths.length) % paths.length);
      if (event.key === "ArrowRight") setViewerIndex(index => index === null ? index : (index + 1) % paths.length);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [viewerIndex, paths.length]);

  const addPhotos = async (files: FileList | null) => {
    if (!files || !space || !d.business) return;
    const images = Array.from(files).filter(file => file.type.startsWith("image/"));
    if (images.length !== files.length) toast.error("Only image files can be added.");
    if (!images.length) return;
    setUploading(true);
    const uploaded: string[] = [];
    for (const file of images) {
      const extension = file.name.split(".").pop()?.toLowerCase() || "jpg";
      const path = `${d.business.id}/${space.id}/${crypto.randomUUID()}.${extension}`;
      const { error } = await supabase.storage.from(BUCKET).upload(path, file, { contentType: file.type });
      if (error) toast.error(`Could not upload ${file.name}: ${error.message}`); else uploaded.push(path);
    }
    if (uploaded.length) {
      const allPaths = [...((space.photo_paths || []) as string[]), ...uploaded];
      const { error } = await (supabase.from("crm_venue_spaces") as any)
        .update({ photo_paths: allPaths, cover_photo_path: space.cover_photo_path || allPaths[0], updated_at: new Date().toISOString() })
        .eq("id", space.id);
      if (error) toast.error(error.message); else { toast.success(`${uploaded.length} photo${uploaded.length === 1 ? "" : "s"} added`); await d.refresh(); }
    }
    setUploading(false);
    if (inputRef.current) inputRef.current.value = "";
  };

  if (!d.business) return null;
  if (!space) return <div className="space-y-4 py-16 text-center"><p className="font-medium">Venue space not found</p><Button variant="outline" onClick={() => navigate(`/b/${window.location.pathname.split("/")[2]}/events/spaces`)}><ArrowLeft className="mr-2 h-4 w-4" />Back to venue spaces</Button></div>;

  return <div className="space-y-5">
    <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <Button variant="ghost" size="sm" className="-ml-2 mb-1" onClick={() => navigate(`/b/${window.location.pathname.split("/")[2]}/events/spaces`)}><ArrowLeft className="mr-2 h-4 w-4" />Venue spaces</Button>
        <h1 className="font-serif text-3xl font-semibold">{space.name}</h1>
        <p className="text-sm text-muted-foreground">{paths.length ? `${paths.length} photo${paths.length === 1 ? "" : "s"} — select any photo to view it full screen.` : "No photos yet."}</p>
      </div>
      <Button onClick={() => inputRef.current?.click()} disabled={uploading}><ImagePlus className="mr-2 h-4 w-4" />{uploading ? "Uploading…" : "Add photos"}</Button>
      <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={event => void addPhotos(event.target.files)} />
    </div>

    {paths.length ? <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {paths.map((path, index) => <Button key={path} type="button" variant="ghost" onClick={() => setViewerIndex(index)} className="group relative h-auto aspect-[4/3] overflow-hidden rounded-md border border-border bg-muted p-0" aria-label={`View photo ${index + 1} full screen`}>
        <img src={signedUrls[path]} alt={`${space.name} photo ${index + 1}`} className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" />
        {path === space.cover_photo_path && <Badge className="absolute left-2 top-2">Cover</Badge>}
        <span className="absolute inset-x-0 bottom-0 bg-background/85 py-2 text-xs font-medium text-foreground opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">View full screen</span>
      </Button>)}
    </div> : <Button type="button" variant="ghost" onClick={() => inputRef.current?.click()} className="flex h-auto w-full flex-col items-center justify-center gap-2 rounded-md border border-dashed border-border py-16 text-muted-foreground hover:bg-muted/50"><Images className="h-10 w-10" /><span className="text-sm">Add the first photos for this space</span></Button>}

    {viewerIndex !== null && paths[viewerIndex] && <div className="fixed inset-0 z-50 flex flex-col bg-black/95" role="dialog" aria-modal="true" aria-label={`${space.name} photo viewer`}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-white">
        <p className="text-sm font-medium">{space.name} — {viewerIndex + 1} of {paths.length}</p>
        <Button type="button" size="icon" variant="ghost" className="text-white hover:bg-white/10 hover:text-white" onClick={() => setViewerIndex(null)} aria-label="Close full screen viewer"><X className="h-5 w-5" /></Button>
      </div>
      <div className="relative flex min-h-0 flex-1 items-center justify-center px-4 pb-4">
        <img src={signedUrls[paths[viewerIndex]]} alt={`${space.name} photo ${viewerIndex + 1}`} className="max-h-full max-w-full object-contain" />
        {paths.length > 1 && <>
          <Button type="button" size="icon" variant="ghost" className="absolute left-4 text-white hover:bg-white/10 hover:text-white" onClick={() => setViewerIndex((viewerIndex - 1 + paths.length) % paths.length)} aria-label="Previous photo"><ChevronLeft className="h-6 w-6" /></Button>
          <Button type="button" size="icon" variant="ghost" className="absolute right-4 text-white hover:bg-white/10 hover:text-white" onClick={() => setViewerIndex((viewerIndex + 1) % paths.length)} aria-label="Next photo"><ChevronRight className="h-6 w-6" /></Button>
        </>}
      </div>
    </div>}
  </div>;
}
