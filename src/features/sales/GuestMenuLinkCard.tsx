import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Copy, Link2, Mail } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function GuestMenuLinkCard({ lead, packages, onSubmitted }: { lead: any; packages: any[]; onSubmitted: () => void }) {
  const [links, setLinks] = useState<any[]>([]);
  const [pkg, setPkg] = useState("");
  const load = async () => {
    const { data } = await (supabase.from("crm_guest_menu_links" as any) as any).select("*").eq("lead_id", lead.id).order("created_at", { ascending: false });
    setLinks(data || []);
  };
  useEffect(() => { load(); }, [lead.id]);
  const url = (t: string) => `${window.location.origin}/menu/${t}`;
  const create = async () => {
    if (!pkg) { toast.error("Choose a package first"); return; }
    const { data, error } = await (supabase.from("crm_guest_menu_links" as any) as any).insert({ business_id: lead.business_id, lead_id: lead.id, package_id: pkg }).select().single();
    if (error) { toast.error(error.message); return; }
    await navigator.clipboard?.writeText(url(data.token)).catch(() => {});
    toast.success("Guest menu link created and copied");
    load();
  };
  const latest = links[0];
  const pkgName = (id: string) => packages.find((p) => p.id === id)?.name || "Package";
  const mail = (t: string, id: string) => `mailto:${lead.email || ""}?subject=${encodeURIComponent(`Choose your menu – ${pkgName(id)}`)}&body=${encodeURIComponent(`Hi ${lead.full_name || ""},\n\nPlease choose your dishes for the ${pkgName(id)} package using this link:\n${url(t)}\n\nThank you.`)}`;
  return (
    <div className="space-y-3 rounded-lg border border-border p-4">
      <div className="flex items-center gap-2"><Link2 className="h-4 w-4 text-primary" /><p className="text-sm font-semibold">Send guest menu link</p></div>
      <p className="text-xs text-muted-foreground">The guest picks dishes from this package only. Their choices fill in this Menu tab when they send it.</p>
      <div className="flex gap-2">
        <select value={pkg} onChange={(e) => setPkg(e.target.value)} className="h-10 min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm">
          <option value="">Choose a package</option>
          {packages.map((p) => <option key={p.id} value={p.id}>{p.book} · {p.name}</option>)}
        </select>
        <Button type="button" onClick={create}>Create link</Button>
      </div>
      {latest && (
        <div className="space-y-2 rounded-md bg-muted/50 p-3 text-xs">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">{pkgName(latest.package_id)}</span>
            <Badge variant={latest.status === "submitted" ? "default" : "outline"}>{latest.status === "submitted" ? "Guest submitted" : "Waiting for guest"}</Badge>
            {latest.submitted_at && <span className="text-muted-foreground">{format(new Date(latest.submitted_at), "d MMM yyyy, h:mm a")}</span>}
          </div>
          <p className="break-all text-muted-foreground">{url(latest.token)}</p>
          <div className="flex flex-wrap gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => { navigator.clipboard.writeText(url(latest.token)); toast.success("Link copied"); }}><Copy className="mr-1 h-3.5 w-3.5" />Copy</Button>
            <Button type="button" size="sm" variant="outline" asChild><a href={mail(latest.token, latest.package_id)}><Mail className="mr-1 h-3.5 w-3.5" />Email guest</a></Button>
            {latest.status === "submitted" && <Button type="button" size="sm" variant="outline" onClick={onSubmitted}>Reload guest choices</Button>}
          </div>
        </div>
      )}
    </div>
  );
}
