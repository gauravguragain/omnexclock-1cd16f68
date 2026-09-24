import { useEffect, useState } from "react";
import { Link, Navigate, NavLink, Outlet, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { BarChart3, BookOpen, CalendarDays, ChefHat, ClipboardList, Contact, GlassWater, Home, LayoutDashboard, ListFilter, LogOut, Menu, PartyPopper, PlusCircle, Settings, Truck, UserPlus, Users, Warehouse, X, CalendarCheck, Utensils, UserCheck } from "lucide-react";
import { cn } from "@/lib/utils";

const SECTIONS: { title: string; items: { to: string; label: string; icon: any }[] }[] = [
  { title: "", items: [{ to: "", label: "Dashboard", icon: LayoutDashboard }] },
  { title: "Leads", items: [{ to: "leads/events", label: "Event leads", icon: UserPlus }, { to: "leads/catering", label: "Catering leads", icon: Utensils }, { to: "pipeline", label: "Pipeline", icon: ListFilter }] },
  { title: "Events", items: [{ to: "events", label: "Events", icon: PartyPopper }, { to: "catering-bookings", label: "Catering bookings", icon: Truck }, { to: "calendar", label: "Calendar", icon: CalendarDays }, { to: "inspections", label: "Inspections", icon: CalendarCheck }, { to: "tasks", label: "Tasks", icon: ClipboardList }] },
  { title: "People", items: [{ to: "customers", label: "Customers", icon: Users }, { to: "coordinators", label: "Coordinators", icon: UserCheck }, { to: "stakeholders", label: "Stakeholders & vendors", icon: Contact }] },
  { title: "Catering", items: [{ to: "menu-books", label: "Menu books", icon: BookOpen }, { to: "dishes", label: "Dishes", icon: ChefHat }, { to: "drinks", label: "Drinks", icon: GlassWater }] },
  { title: "Venue", items: [{ to: "spaces", label: "Spaces", icon: Warehouse }] },
  { title: "", items: [{ to: "reports", label: "Reports", icon: BarChart3 }, { to: "settings", label: "Settings", icon: Settings }] },
];

export default function EventsLayout({ mode = "events" }: { mode?: "events" | "catering" }) {
  const { user, loading, isApproved, isAdminOf, isSuperAdminOf, isSalesManagerOf, signOut } = useAuth();
  const { business, businesses, setBusiness, applyTheme } = useBusiness();
  const { businessCode } = useParams();
  const [open, setOpen] = useState(false);
  useSessionGuard();
  useEffect(() => {
    const match = businesses.find(b => b.business_code === businessCode);
    if (match && match.id !== business?.id) setBusiness(match);
    if (match) applyTheme(match.theme);
  }, [businessCode, businesses]);

  const resolving = !!businessCode && (!business || business.business_code !== businessCode);
  if (loading || resolving) return <div className="min-h-dvh bg-background p-8"><div className="h-64 rounded-xl skeleton-shimmer" /></div>;
  if (!user) return <Navigate to="/auth?next=events" replace />;
  const id = business!.id;
  const allowed = isApproved && (isAdminOf(id) || isSuperAdminOf(id) || isSalesManagerOf(id));
   if (!allowed) return <div className="min-h-dvh flex items-center justify-center bg-background"><div className="space-y-4 text-center"><h1 className="text-xl font-bold">Access denied</h1><p className="text-muted-foreground">{mode === "catering" ? "Catering" : "Events & Sales"} is for admins and sales managers.</p><Link to="/hub"><Button variant="outline">Back</Button></Link></div></div>;
   const base = `/b/${businessCode}/${mode}`;
   const sections = mode === "catering" ? [
     { title: "Catering", items: [{ to: "leads", label: "Catering leads", icon: Utensils }, { to: "bookings", label: "Catering bookings", icon: Truck }] },
     { title: "People", items: [{ to: "customers", label: "Customers", icon: Users }, { to: "coordinators", label: "Coordinators", icon: UserCheck }, { to: "stakeholders", label: "Stakeholders & vendors", icon: Contact }] },
     { title: "Menus", items: [{ to: "menu-books", label: "Menu books", icon: BookOpen }, { to: "dishes", label: "Dishes", icon: ChefHat }, { to: "drinks", label: "Drinks", icon: GlassWater }] },
   ] : SECTIONS.map(s => ({ ...s, items: s.items.filter(it => it.to !== "leads/catering" && it.to !== "catering-bookings") }));

   const nav = <nav className="space-y-5 p-4">{sections.map((s, i) => <div key={i}>
    {s.title && <p className="mb-1 px-3 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{s.title}</p>}
     {s.items.map(it => <NavLink key={it.to} to={it.to ? `${base}/${it.to}` : base} end onClick={() => setOpen(false)}
      className={({ isActive }) => cn("flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors", isActive ? "bg-primary/10 text-primary font-medium" : "text-muted-foreground hover:bg-muted hover:text-foreground")}>
      <it.icon className="h-4 w-4" />{it.label}</NavLink>)}
  </div>)}</nav>;

   return <div className="min-h-dvh bg-background lg:flex print:!block print:!min-h-0">
    <aside className="hidden w-64 shrink-0 border-r border-border/40 lg:block print:!hidden"><div className="sticky top-0 h-dvh overflow-y-auto">
       <div className="flex items-center gap-3 border-b border-border/40 p-4">{business?.logo_url ? <img src={business.logo_url} alt="" className="h-9 w-9 rounded-lg object-cover" /> : <PartyPopper className="h-6 w-6 text-primary" />}<div><p className="text-sm font-semibold">{business?.name}</p><p className="text-[11px] text-primary">{mode === "catering" ? "Catering" : "Events & Sales"}</p></div></div>
      {nav}
      <div className="space-y-1 border-t border-border/40 p-4"><Link to={`/b/${businessCode}/${mode === "catering" ? "events" : "catering"}`} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary hover:bg-muted">{mode === "catering" ? <PartyPopper className="h-4 w-4" /> : <Utensils className="h-4 w-4" />}{mode === "catering" ? "Open Events & Sales" : "Open Catering"}</Link><Link to={`/b/${businessCode}/admin`} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><Home className="h-4 w-4" />Business Admin</Link><button onClick={signOut} className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted"><LogOut className="h-4 w-4" />Sign out</button></div>
    </div></aside>
     <header className="sticky top-0 z-30 flex items-center justify-between border-b border-border/40 bg-background/95 p-3 backdrop-blur lg:hidden print:!hidden"><p className="font-semibold">{mode === "catering" ? "Catering" : "Events & Sales"}</p><Button size="icon" variant="ghost" aria-label={open ? "Close navigation" : "Open navigation"} onClick={() => setOpen(!open)}>{open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}</Button></header>
    {open && <div className="fixed inset-0 top-14 z-20 overflow-y-auto bg-background lg:hidden">{nav}<div className="space-y-2 p-4"><Link to={`/b/${businessCode}/${mode === "catering" ? "events" : "catering"}`} className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-primary hover:bg-muted">{mode === "catering" ? <PartyPopper className="h-4 w-4" /> : <Utensils className="h-4 w-4" />}{mode === "catering" ? "Open Events & Sales" : "Open Catering"}</Link><Link to={`/b/${businessCode}/admin`} className="text-sm text-muted-foreground">Business Admin</Link></div></div>}
    <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8 print:!p-0"><Outlet /></main>
  </div>;
}
