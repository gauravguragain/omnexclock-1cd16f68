import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Check, ChevronDown, ImageOff, Loader2, UtensilsCrossed, X } from "lucide-react";
import { toast } from "sonner";
import { signDishPhotos } from "@/features/events/dishPhotos";

type Dish = { id: string; name: string; diet: string; photo_path: string | null };
type Course = { id: string; name: string; picks: number | null; veg_picks: number | null; non_veg_picks: number | null; dishes: Dish[] };

function DishPicker({ course, value, onChange, urls, taken, diet }: { course: Course; value: string; onChange: (id: string) => void; urls: Record<string, string>; taken: string[]; diet?: "veg" | "nonveg" }) {
  const [open, setOpen] = useState(false);
  const [hover, setHover] = useState<Dish | null>(null);
  const selected = course.dishes.find((d) => d.id === value);
  const preview = hover || selected || null;
  const img = (d: Dish | null) => (d?.photo_path ? urls[d.photo_path] : undefined);
  return (
    <Popover open={open} onOpenChange={(o) => { setOpen(o); if (!o) setHover(null); }}>
      <PopoverTrigger asChild>
        <button type="button" className="flex h-11 w-full items-center justify-between gap-2 rounded-md border border-input bg-background px-3 text-left text-sm hover:border-primary">
          <span className="flex min-w-0 items-center gap-2">
            {selected && img(selected) && <img src={img(selected)} alt="" className="h-7 w-7 shrink-0 rounded object-cover" />}
            <span className={`truncate ${selected ? "" : "text-muted-foreground"}`}>{selected ? selected.name : "Choose a dish"}</span>
          </span>
          <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(calc(100vw-2rem),560px)] p-0">
        <div className="flex">
          <ul className="max-h-72 flex-1 overflow-y-auto py-1" onMouseLeave={() => setHover(null)}>
            {selected && <li><button type="button" className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted" onClick={() => { onChange(""); setOpen(false); }}><X className="h-3 w-3" />Clear choice</button></li>}
            {course.dishes.filter((d) => !diet || (diet === "veg" ? d.diet === "veg" : d.diet !== "veg")).map((d) => {
              const disabled = taken.includes(d.id) && d.id !== value;
              return (
                <li key={d.id}>
                  <button type="button" disabled={disabled} onMouseEnter={() => setHover(d)} onFocus={() => setHover(d)}
                    onClick={() => { onChange(d.id); setOpen(false); }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40">
                    {img(d) ? <img src={img(d)} alt="" className="h-8 w-8 shrink-0 rounded object-cover sm:hidden" /> : null}
                    <span className={`inline-block h-2.5 w-2.5 shrink-0 rounded-sm border ${d.diet === "veg" ? "border-primary bg-primary/30" : "border-destructive bg-destructive/30"}`} />
                    <span className="flex-1">{d.name}</span>
                    {d.id === value && <Check className="h-4 w-4 text-primary" />}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="hidden w-56 shrink-0 border-l border-border p-3 sm:block">
            {preview ? (
              img(preview) ? <img src={img(preview)} alt={preview.name} className="aspect-square w-full rounded-md object-cover" />
                : <div className="flex aspect-square w-full flex-col items-center justify-center gap-2 rounded-md bg-muted text-xs text-muted-foreground"><ImageOff className="h-5 w-5" />No photo yet</div>
            ) : <div className="flex aspect-square w-full items-center justify-center rounded-md bg-muted p-3 text-center text-xs text-muted-foreground">Hover over a dish to see a photo</div>}
            {preview && <p className="mt-2 text-sm font-medium">{preview.name}</p>}
            {preview && <p className="text-xs text-muted-foreground">{preview.diet === "veg" ? "Vegetarian" : "Non-vegetarian"}</p>}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default function GuestMenuPage() {
  const { token } = useParams();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [picks, setPicks] = useState<Record<string, string[]>>({});
  const [dietary, setDietary] = useState("");
  const [allergies, setAllergies] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: r } = await (supabase.rpc as any)("get_guest_menu", { _token: token });
      setData(r); setLoading(false);
      if (r?.package?.courses) {
        const courses: Course[] = r.package.courses;
        setPicks(Object.fromEntries(courses.map((c) => {
          const separate = c.veg_picks != null || c.non_veg_picks != null;
          const slots = separate ? [...Array(c.veg_picks || 0).fill("veg:"), ...Array(c.non_veg_picks || 0).fill("nonveg:")] : Array(Math.max(1, c.picks || 1)).fill("");
          return [c.id, slots];
        })));
        setUrls(await signDishPhotos(courses.flatMap((c) => c.dishes.map((d) => d.photo_path))));
      }
      if (r?.status === "submitted") setDone(true);
    })();
  }, [token]);

  const courses: Course[] = useMemo(() => (data?.package?.courses || []).filter((c: Course) => c.dishes.length), [data]);

  const submit = async () => {
    const missing = courses.find((c) => (picks[c.id] || []).some((v) => !v));
    if (missing && !confirm(`You haven't chosen every dish for ${missing.name}. Submit anyway?`)) return;
    setSaving(true);
    const clean = Object.fromEntries(Object.entries(picks).map(([k, v]) => [k, v.map(x => x.replace(/^(veg|nonveg):/, "")).filter(Boolean)]));
    const { error } = await (supabase.rpc as any)("submit_guest_menu", { _token: token, _picks: clean, _dietary: dietary, _allergies: allergies });
    setSaving(false);
    if (error) toast.error(error.message); else setDone(true);
  };

  if (loading) return <div className="flex min-h-screen items-center justify-center bg-background"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  if (!data) return <div className="flex min-h-screen items-center justify-center bg-background p-6 text-center text-muted-foreground">This menu link is not valid. Please contact the venue for a new link.</div>;

  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-2xl px-4 py-10">
        <div className="mb-8 text-center">
          <p className="text-xs uppercase tracking-[0.2em] text-primary">{data.business?.name}</p>
          <h1 className="mt-2 font-serif text-3xl font-semibold">Choose your menu</h1>
          <p className="mt-2 text-sm text-muted-foreground">{data.lead?.name ? `For ${data.lead.name} · ` : ""}{data.package?.name}</p>
        </div>
        {done ? (
          <div className="rounded-lg border border-border bg-card p-8 text-center">
            <Check className="mx-auto h-10 w-10 text-primary" />
            <h2 className="mt-3 text-xl font-semibold">Thank you — your menu has been sent</h2>
            <p className="mt-2 text-sm text-muted-foreground">Our events team has received your choices and will be in touch if anything needs confirming.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {courses.length === 0 && <p className="text-center text-sm text-muted-foreground">This package has no dishes to choose from yet.</p>}
            {courses.map((c) => {
              const separate = c.veg_picks != null || c.non_veg_picks != null;
              const coursePicks = picks[c.id] || [];
              return (
              <section key={c.id} className="rounded-lg border border-border bg-card p-5">
                <div className="mb-3 flex items-center gap-2"><UtensilsCrossed className="h-4 w-4 text-primary" /><h2 className="font-semibold">{c.name}</h2>
                  <span className="ml-auto text-xs text-muted-foreground">{separate ? `${c.veg_picks || 0} veg · ${c.non_veg_picks || 0} non-veg` : `Choose ${Math.max(1, c.picks || 1)}`}</span></div>
                <div className="space-y-2">
                  {coursePicks.map((v, i) => {
                    const diet = v.startsWith("veg:") ? "veg" : v.startsWith("nonveg:") ? "nonveg" : undefined;
                    const value = v.replace(/^(veg|nonveg):/, "");
                    return <div key={i} className="space-y-1">
                      {diet && <p className="text-xs font-medium text-muted-foreground">{diet === "veg" ? "Vegetarian choice" : "Non-vegetarian choice"}</p>}
                      <DishPicker course={c} value={value} urls={urls} taken={coursePicks.map(x => x.replace(/^(veg|nonveg):/, ""))} diet={diet}
                        onChange={(id) => setPicks((p) => ({ ...p, [c.id]: p[c.id].map((x, j) => (j === i ? `${diet ? `${diet}:` : ""}${id}` : x)) }))} />
                    </div>;
                  })}
                </div>
              </section>
            ); })}
            <section className="space-y-4 rounded-lg border border-border bg-card p-5">
              <div className="space-y-1.5"><Label>Dietary requirements</Label><Textarea value={dietary} onChange={(e) => setDietary(e.target.value)} placeholder="e.g. 10 vegan guests" /></div>
              <div className="space-y-1.5"><Label>Allergies</Label><Textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g. nut allergy" /></div>
            </section>
            <Button className="h-12 w-full" onClick={submit} disabled={saving || !courses.length}>{saving ? <Loader2 className="h-4 w-4 animate-spin" /> : "Confirm and send my menu"}</Button>
          </div>
        )}
      </div>
    </div>
  );
}
