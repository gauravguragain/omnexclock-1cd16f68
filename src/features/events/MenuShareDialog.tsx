import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Loader2, Mail, Printer } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { renderMenuHtml, type MenuSection } from "../../../supabase/functions/_shared/menuHtml";
import type { Row } from "./useEventsData";

type Data = { business: { id: string; name?: string } | null; books: Row[]; packages: Row[]; courses: Row[]; courseItems: Row[]; dishes: Row[]; drinks: Row[]; customers: Row[] };
export type MenuShareLead = { id: string; full_name?: string | null; email?: string | null; customer_id?: string | null };

export function buildMenuSections(d: Data, packageIds: string[], includeDrinks: boolean): MenuSection[] {
  const out: MenuSection[] = [];
  const pkgs = d.books.flatMap(b => d.packages.filter(p => p.book_id === b.id && packageIds.includes(p.id)));
  for (const p of pkgs) {
    const book = d.books.find(b => b.id === p.book_id);
    const courses = d.courses.filter(c => c.package_id === p.id).sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0)).map(c => {
      const picks = [c.picks != null && `Choose ${c.picks}`, c.veg_picks != null && `${c.veg_picks} vegetarian`, c.non_veg_picks != null && `${c.non_veg_picks} non-vegetarian`].filter(Boolean).join(" · ");
      const items = d.courseItems.filter(ci => ci.course_id === c.id).map(ci => {
        const extra = Number(ci.extra_price_per_head) > 0 ? `+$${Number(ci.extra_price_per_head).toFixed(2)} per person` : "";
        if (ci.drink_id) { const x = d.drinks.find(y => y.id === ci.drink_id); return x && { name: x.name, note: extra || undefined }; }
        const x = d.dishes.find(y => y.id === ci.dish_id); if (!x) return null;
        const prot = (ci.protein_options || []).length ? `Choice of ${(ci.protein_options as string[]).join(", ")}` : "";
        return { name: x.name, tag: x.diet === "veg" ? "V" : undefined, note: [prot, extra].filter(Boolean).join(" · ") || undefined };
      }).filter(Boolean) as MenuSection["courses"][number]["items"];
      return { name: c.name, note: picks || undefined, items };
    }).filter(c => c.items.length);
    out.push({ title: p.name, subtitle: book?.name, description: p.description || undefined, courses });
  }
  if (includeDrinks) {
    const active = d.drinks.filter(x => x.active !== false);
    const courses = [["soft", "Soft drinks"], ["hard", "Beer, wine & spirits"]].map(([k, name]) => ({ name, items: active.filter(x => (x.kind || "soft") === k).map(x => ({ name: x.name, price: x.price != null ? Number(x.price) : null })) })).filter(c => c.items.length);
    if (courses.length) out.push({ title: "Drinks list", subtitle: "Beverages", courses });
  }
  return out;
}

export function printMenu(businessName: string, title: string, sections: MenuSection[]) {
  const w = window.open("", "_blank"); if (!w) { toast.error("Allow pop-ups to print the menu"); return; }
  const body = renderMenuHtml({ businessName, title, logoUrl: `${window.location.origin}/regal-logo.png`, sections });
  w.document.write(`<!doctype html><html><head><title>${title.replace(/</g, "")}</title><style>@page{size:A4;margin:0}html,body{margin:0;background:#0d0d0d;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${body}<script>window.onload=()=>setTimeout(()=>window.print(),300)<\/script></body></html>`);
  w.document.close();
}

export default function MenuShareDialog({ open, onOpenChange, data: d, source, lead, defaultPackageIds = [], defaultDrinks = false }: { open: boolean; onOpenChange: (o: boolean) => void; data: Data; source: "menu_books" | "drinks" | "lead_menu"; lead?: MenuShareLead; defaultPackageIds?: string[]; defaultDrinks?: boolean }) {
  const { user } = useAuth();
  const [pkgIds, setPkgIds] = useState<string[]>(defaultPackageIds);
  const [drinks, setDrinks] = useState(defaultDrinks);
  const [customerId, setCustomerId] = useState(lead?.customer_id || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [name, setName] = useState(lead?.full_name || "");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const bizName = d.business?.name || "Pro Regal";
  const books = d.books.filter(b => b.active !== false);
  const sections = useMemo(() => buildMenuSections(d, pkgIds, drinks), [d, pkgIds, drinks]);
  const title = pkgIds.length ? (drinks ? "Menu & drinks" : "Menu") : "Drinks list";
  const togglePkg = (id: string, on: boolean) => setPkgIds(ids => on ? [...new Set([...ids, id])] : ids.filter(x => x !== id));
  const pickCustomer = (id: string) => { setCustomerId(id); const c = d.customers.find(x => x.id === id); if (c) { setEmail(c.email || ""); setName(c.full_name || ""); } };

  const send = async () => {
    if (!sections.length) return toast.error("Select at least one package or the drinks list");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) return toast.error("Enter a valid email address");
    setSending(true);
    try {
      const { data, error } = await supabase.functions.invoke("send-email", { body: { type: "menu", to: email.trim(), recipientName: name || undefined, businessName: bizName, title, message: message || undefined, sections } });
      if (error || (data as any)?.success === false) throw new Error((data as any)?.error || error?.message || "Email failed");
      const linked = customerId || d.customers.find(c => (c.email || "").toLowerCase() === email.trim().toLowerCase())?.id || null;
      const summary = [...d.packages.filter(p => pkgIds.includes(p.id)).map(p => p.name), ...(drinks ? ["Drinks list"] : [])].join(", ");
      await (supabase.from("crm_menu_sends" as any) as any).insert({ business_id: d.business!.id, customer_id: linked, lead_id: lead?.id || null, recipient_email: email.trim(), source, summary, package_ids: pkgIds, include_drinks: drinks, sent_by: user?.id || null });
      if (lead?.id) await (supabase.from("crm_timeline_events" as any) as any).insert({ business_id: d.business!.id, lead_id: lead.id, event_type: "menu_sent", title: `Menu emailed to ${email.trim()}`, details: { summary }, actor_id: user?.id || null });
      toast.success(`Menu sent to ${email.trim()}${linked && source !== "lead_menu" ? " · saved to customer profile" : ""}`);
      onOpenChange(false);
    } catch (e: any) { toast.error(e.message); } finally { setSending(false); }
  };

  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
    <DialogHeader><DialogTitle className="font-serif text-2xl">Print or email menu</DialogTitle><DialogDescription>Pick any menu books and packages, and optionally the drinks list. Printed and emailed in Pro Regal black and gold.</DialogDescription></DialogHeader>
    <div className="space-y-4">
      <div className="max-h-64 space-y-3 overflow-y-auto rounded-md border p-3">
        {books.map(b => { const pk = d.packages.filter(p => p.book_id === b.id && p.active !== false); const all = pk.length > 0 && pk.every(p => pkgIds.includes(p.id)); return <div key={b.id}>
          <label className="flex items-center gap-2 font-medium"><Checkbox checked={all} onCheckedChange={v => pk.forEach(p => togglePkg(p.id, v === true))} disabled={!pk.length} />{b.name}<span className="text-xs font-normal text-muted-foreground">({pk.length})</span></label>
          <div className="ml-6 mt-1.5 grid gap-1 sm:grid-cols-2">{pk.map(p => <label key={p.id} className="flex items-center gap-2 text-sm"><Checkbox checked={pkgIds.includes(p.id)} onCheckedChange={v => togglePkg(p.id, v === true)} />{p.name}</label>)}</div>
        </div>; })}
        {!books.length && <p className="text-sm text-muted-foreground">No menu books yet.</p>}
        <label className="flex items-center gap-2 border-t pt-3 font-medium"><Checkbox checked={drinks} onCheckedChange={v => setDrinks(v === true)} />Drinks list with prices <span className="text-xs font-normal text-muted-foreground">({d.drinks.filter(x => x.active !== false).length})</span></label>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {!lead && <div className="space-y-1.5 sm:col-span-2"><Label>Customer</Label><select value={customerId} onChange={e => pickCustomer(e.target.value)} className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm"><option value="">Not linked — type an email below</option>{d.customers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.email ? ` · ${c.email}` : ""}</option>)}</select></div>}
        <div className="space-y-1.5"><Label>Recipient name</Label><Input value={name} onChange={e => setName(e.target.value)} /></div>
        <div className="space-y-1.5"><Label>Email</Label><Input type="email" value={email} onChange={e => setEmail(e.target.value)} /></div>
        <div className="space-y-1.5 sm:col-span-2"><Label>Message (optional)</Label><Textarea rows={3} maxLength={1000} value={message} onChange={e => setMessage(e.target.value)} /></div>
      </div>
      <p className="text-xs text-muted-foreground">{sections.length} section{sections.length === 1 ? "" : "s"} selected.{!lead && " Emails sent to a linked customer are recorded on their profile as Menu sent."}</p>
    </div>
    <DialogFooter className="gap-2"><Button variant="outline" disabled={!sections.length} onClick={() => printMenu(bizName, title, sections)}><Printer className="mr-2 h-4 w-4" />Print</Button><Button disabled={sending || !sections.length} onClick={send}>{sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}Email menu</Button></DialogFooter>
  </DialogContent></Dialog>;
}
