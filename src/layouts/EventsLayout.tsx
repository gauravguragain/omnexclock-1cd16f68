import { OutletSuspense } from "@/components/OutletFallback";
import ForceRefreshButton from "@/components/ForceRefreshButton";
import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import type { Business } from "@/contexts/BusinessContext";
import { defaultTheme } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { BarChart3, BookOpen, Building2, CalendarDays, ChefHat, ClipboardList, Contact, GlassWater, LayoutDashboard, ListFilter, LogOut, Menu, PartyPopper, PlusCircle, Settings, Truck, UserPlus, Users, Warehouse, X, CalendarCheck, Utensils, UserCheck, Wallet, History } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS: { title: string; items: { to: string; label: string; icon: any }[] }[] = [
  { title: "", items: [{ to: "", label: "Dashboard", icon: LayoutDashboard }, { to: "@@calendar", label: "Calendar", icon: CalendarDays }, { to: "@@payments", label: "Payments", icon: Wallet }] },
  { title: "Leads", items: [{ to: "leads/events", label: "Event leads", icon: UserPlus }, { to: "pipeline", label: "Pipeline", icon: ListFilter }] },
  { title: "Events", items: [{ to: "events", label: "Events", icon: PartyPopper }, { to: "inspections", label: "Inspections", icon: CalendarCheck }, { to: "tasks", label: "Tasks", icon: ClipboardList }] },
  { title: "Catering", items: [{ to: "@leads", label: "Catering leads", icon: Utensils }, { to: "@bookings", label: "Catering bookings", icon: Truck }] },
  { title: "People", items: [{ to: "customers", label: "Customers", icon: Users }, { to: "coordinators", label: "Coordinators", icon: UserCheck }, { to: "stakeholders", label: "Stakeholders & vendors", icon: Contact }] },
  { title: "Menus", items: [{ to: "menu-books", label: "Menu books", icon: BookOpen }, { to: "dishes", label: "Dishes", icon: ChefHat }, { to: "drinks", label: "Drinks", icon: GlassWater }] },
  { title: "Venue", items: [{ to: "spaces", label: "Spaces", icon: Warehouse }] },
  { title: "", items: [{ to: "reports", label: "Reports", icon: BarChart3 }, { to: "audit", label: "Audit log", icon: History }, { to: "settings", label: "Settings", icon: Settings }] },
];

export default function EventsLayout({ mode = "events" }: { mode?: "events" | "catering" }) {
  const { user, loading, isApproved, isAdminOf, isSuperAdminOf, isSalesManagerOf, isMaster, signOut } = useAuth();
  const { business, businesses, setBusiness, applyTheme } = useBusiness();
  const { businessCode } = useParams();
  const [urlBusiness, setUrlBusiness] = useState<Business | null>(null);
  const [open, setOpen] = useState(false);
  useSessionGuard();
  useEffect(() => {
    const match = businesses.find(b => b.business_code === businessCode);
    if (match) {
      if (match.id !== business?.id) setBusiness(match);
      applyTheme(match.theme);
      return;
    }
    // Resolve the business straight from the URL code (e.g. master accounts
    // browsing a business without a selected business context).
    if (!businessCode || !user) return;
    (supabase as any).from("businesses").select("*").eq("business_code", businessCode).maybeSingle()
      .then(({ data }: any) => {
        if (!data) return;
        const mapped: Business = { ...data, theme: data.theme || defaultTheme, status: data.status || "active" };
        setUrlBusiness(mapped);
        if (data?.theme) applyTheme(mapped.theme);
        // Adopt it as the selected business so business-scoped hooks (CRM data, etc.) follow.
        if (business?.id !== mapped.id) setBusiness(mapped);
      });
  }, [businessCode, businesses, user]);

  const resolved = business?.business_code === businessCode ? business : urlBusiness;
  const resolving = !!businessCode && !resolved;
  if (loading || resolving) return <div className="min-h-dvh bg-background p-8"><div className="h-64 rounded-xl skeleton-shimmer" /></div>;
  if (!user) return <Navigate to="/auth?next=events" replace />;
  const id = resolved!.id;
  const allowed = isApproved && (isMaster || isAdminOf(id) || isSuperAdminOf(id) || isSalesManagerOf(id));
   if (!allowed) return <div className="min-h-dvh flex items-center justify-center bg-background"><div className="space-y-4 text-center"><h1 className="text-xl font-bold">Access denied</h1><p className="text-muted-foreground">{mode === "catering" ? "Catering" : "Events & Sales"} is for admins and sales managers.</p><Link to="/hub"><Button variant="outline">Back</Button></Link></div></div>;
   const base = `/b/${businessCode}/${mode}`;
   const sections = mode === "catering" ? [
     { title: "", items: [{ to: "@@calendar", label: "Calendar", icon: CalendarDays }, { to: "@@payments", label: "Payments", icon: Wallet }] },
     { title: "Catering", items: [{ to: "leads", label: "Catering leads", icon: Utensils }, { to: "bookings", label: "Catering bookings", icon: Truck }] },
     { title: "People", items: [{ to: "customers", label: "Customers", icon: Users }, { to: "coordinators", label: "Coordinators", icon: UserCheck }, { to: "stakeholders", label: "Stakeholders & vendors", icon: Contact }] },
     { title: "Menus", items: [{ to: "menu-books", label: "Menu books", icon: BookOpen }, { to: "dishes", label: "Dishes", icon: ChefHat }, { to: "drinks", label: "Drinks", icon: GlassWater }] },
   ] : SECTIONS.map(s => ({ ...s, items: s.items.filter(it => it.to !== "leads/catering" && it.to !== "catering-bookings") }));

   const nav = <nav className="space-y-5 p-4">{sections.map((s, i) => <div key={i}>
    {s.title && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.title}</p>}
     {s.items.map(it => <NavLink key={it.to} to={it.to.startsWith("@@") ? `/b/${businessCode}/events/${it.to.slice(2)}` : it.to.startsWith("@") ? `/b/${businessCode}/catering/${it.to.slice(1)}` : it.to ? `${base}/${it.to}` : base} end onClick={() => setOpen(false)}
      className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      <it.icon className="h-4 w-4" />{it.label}</NavLink>)}
  </div>)}</nav>;

   return <div className="min-h-dvh bg-background lg:flex print:!block print:!min-h-0">
    <aside className="hidden w-64 shrink-0 border-r border-border/40 lg:block print:!hidden"><div className="sticky top-0 h-dvh overflow-y-auto">
       <div className="flex items-center gap-3 border-b border-border/40 p-4">{resolved?.logo_url ? <img src={resolved.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <PartyPopper className="h-6 w-6 text-primary" />}<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{resolved?.name}</p><p className="text-[11px] text-primary">{mode === "catering" ? "Catering" : "Events & Sales"}</p></div><ForceRefreshButton className="h-8 w-8 shrink-0" /></div>
      {nav}
      <div className="space-y-1 border-t border-border/40 p-4"><Link to="/hub" className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><Building2 className="h-4 w-4" />Business Hub</Link><button onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" />Sign out</button></div>
    </div></aside>
     <header className="sticky top-0 z-40 border-b border-border/40 bg-background/95 backdrop-blur lg:hidden print:!hidden" style={{ paddingTop: "env(safe-area-inset-top)" }}>
       <div className="flex h-14 items-center gap-2 px-2" style={{ paddingLeft: "max(0.5rem, env(safe-area-inset-left))", paddingRight: "max(0.5rem, env(safe-area-inset-right))" }}>
         <Button size="icon" variant="ghost" className="h-11 w-11 shrink-0" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</Button>
         {resolved?.logo_url && <img src={resolved.logo_url} alt="" className="h-8 w-8 rounded-md object-cover" />}
<div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{resolved?.name}</p><p className="text-[11px] text-primary">{mode === "catering" ? "Catering" : "Events & Sales"}</p></div>
          <ForceRefreshButton className="h-9 w-9 shrink-0" />
        </div>
     </header>
     {open && <div className="fixed inset-0 z-50 lg:hidden print:!hidden">
       <button aria-label="Close navigation" className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={() => setOpen(false)} />
       <div className="absolute inset-y-0 left-0 flex w-[82%] max-w-xs flex-col border-r border-border bg-background shadow-2xl animate-in slide-in-from-left" style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}>
         <div className="flex items-center justify-between border-b border-border/40 p-3"><p className="pl-2 text-sm font-semibold">Menu</p><Button size="icon" variant="ghost" className="h-11 w-11" aria-label="Close navigation" onClick={() => setOpen(false)}><X className="h-6 w-6" /></Button></div>
         <div className="flex-1 overflow-y-auto">{nav}</div>
         <div className="space-y-1 border-t border-border/40 p-4"><Link to="/hub" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-muted"><Building2 className="h-4 w-4" />Business Hub</Link><button onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-3 text-sm text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" />Sign out</button></div>
       </div>
     </div>}
     <main className="min-w-0 flex-1 p-4 pb-24 sm:p-6 sm:pb-24 lg:p-8 print:!p-0"><OutletSuspense><Outlet /></OutletSuspense></main>
     <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-border/40 bg-background/95 backdrop-blur lg:hidden print:!hidden" style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
       {(mode === "catering"
         ? [{ to: "leads", label: "Leads", icon: Utensils }, { to: "bookings", label: "Bookings", icon: Truck }, { to: "customers", label: "Customers", icon: Users }, { to: "menu-books", label: "Menus", icon: BookOpen }]
         : [{ to: "", label: "Home", icon: LayoutDashboard }, { to: "leads/events", label: "Leads", icon: UserPlus }, { to: "events", label: "Events", icon: PartyPopper }, { to: "calendar", label: "Calendar", icon: CalendarDays }]
       ).map(it => <NavLink key={it.to} to={it.to ? `${base}/${it.to}` : base} end className={({ isActive }) => cn("flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px]", isActive ? "text-primary font-medium" : "text-muted-foreground")}><it.icon className="h-5 w-5" />{it.label}</NavLink>)}
       <button onClick={() => setOpen(true)} className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-[11px] text-muted-foreground"><Menu className="h-5 w-5" />More</button>
     </nav>
  </div>;
}
