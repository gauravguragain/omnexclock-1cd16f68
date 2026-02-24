import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Badge } from "@/components/ui/badge";
import { Navigate, Outlet, Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, CalendarDays, DollarSign, BarChart3, Monitor, LogOut, Menu, X, Settings, FileText, UserCog, CalendarRange, MessageSquare, CalendarOff, Building2, Package, Wrench, MoreHorizontal, Sparkles, CreditCard
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { supabase } from "@/integrations/supabase/client";
import WalkthroughTour from "@/components/WalkthroughTour";
import { adminTourSteps } from "@/components/tourSteps";
import NotificationBell from "@/components/NotificationBell";
import { useAdminNotifications } from "@/hooks/useNotifications";
import { Switch } from "@/components/ui/switch";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger
} from "@/components/ui/sheet";

export default function AdminLayout() {
  const { user, isAdminOf, isSuperAdminOf, isViewerOf, isRosterAdminOf, getRosterAdminDepartments, hasAccessTo, isApproved, loading, signOut } = useAuth();
  const { business, businesses, setBusiness } = useBusiness();
  const location = useLocation();
  const { businessCode } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [moreSheetOpen, setMoreSheetOpen] = useState(false);
  const [pendingRequestCount, setPendingRequestCount] = useState(0);
  const { notifications, unreadCount, markRead, markAllRead, clearAll } = useAdminNotifications(business?.id || null);
  useSessionGuard();

  // Ensure the correct business is active based on URL
  useEffect(() => {
    if (businessCode && businesses.length > 0) {
      const match = businesses.find(b => b.business_code === businessCode);
      if (match && match.id !== business?.id) {
        setBusiness(match);
      }
    }
  }, [businessCode, businesses]);

  // Fetch pending request count
  useEffect(() => {
    if (!business) return;
    const fetchCount = async () => {
      const { count } = await supabase
        .from("employee_requests")
        .select("*, employees!inner(business_id)", { count: "exact", head: true })
        .eq("employees.business_id", business.id)
        .eq("status", "pending");
      setPendingRequestCount(count || 0);
    };
    fetchCount();
    const channel = supabase
      .channel("requests-count")
      .on("postgres_changes", { event: "*", schema: "public", table: "employee_requests" }, () => fetchCount())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business]);

  const currentBusinessId = business?.id || "";
  const isAdmin = isAdminOf(currentBusinessId);
  const isSuperAdmin = isSuperAdminOf(currentBusinessId);
  const isViewer = isViewerOf(currentBusinessId);
  const isRosterAdmin = isRosterAdminOf(currentBusinessId);
  const hasAccess = hasAccessTo(currentBusinessId);
  const rosterDepts = getRosterAdminDepartments(currentBusinessId);

  const basePath = `/b/${businessCode}/admin`;

  const allNavItems = [
    { path: basePath, label: "Dashboard", icon: BarChart3, tourId: "dashboard", access: "admin" },
    { path: `${basePath}/employees`, label: "Employees", icon: Users, tourId: "employees", access: "admin" },
    { path: `${basePath}/roster`, label: "Roster", icon: CalendarRange, tourId: "roster", access: "roster" },
    { path: `${basePath}/live`, label: "Live Monitor", icon: Monitor, tourId: "live", access: "admin" },
    { path: `${basePath}/timesheets`, label: "Timesheets", icon: CalendarDays, tourId: "timesheets", access: "roster" },
    { path: `${basePath}/payroll`, label: "Payroll", icon: DollarSign, tourId: "payroll", access: "admin" },
    { path: `${basePath}/pay-details`, label: "Pay Details", icon: CreditCard, tourId: "pay-details", access: "super_admin_only" },
    { path: `${basePath}/requests`, label: "Requests", icon: CalendarOff, tourId: "requests", access: "admin" },
    { path: `${basePath}/forum`, label: "Forum", icon: MessageSquare, tourId: "forum", access: "admin" },
    { path: `${basePath}/inventory`, label: "Inventory", icon: Package, tourId: "inventory", access: "inventory" },
    { path: `${basePath}/service`, label: "Service", icon: Wrench, tourId: "service", access: "admin" },
    { path: `${basePath}/users`, label: "User Management", icon: UserCog, tourId: "users", access: "super_admin_only" },
    { path: `${basePath}/ai-assistant`, label: "AI Assistant", icon: Sparkles, tourId: "ai-assistant", access: "super_admin_only" },
    { path: `${basePath}/my-business`, label: "My Business", icon: Building2, tourId: "my-business", access: "admin" },
    { path: `${basePath}/audit-log`, label: "Audit Log", icon: FileText, tourId: "audit-log", access: "admin_only" },
  ];

  // Determine roster admin department type
  const isRosterAdminFOH = isRosterAdmin && !isAdmin && !isSuperAdmin && rosterDepts.some(d => d.toUpperCase() === "FOH");
  const isRosterAdminBOH = isRosterAdmin && !isAdmin && !isSuperAdmin && rosterDepts.some(d => d.toUpperCase() === "BOH");

  // Filter nav items based on role
  const navItems = allNavItems.filter(item => {
    if (item.access === "super_admin_only") {
      return isSuperAdmin;
    }
    if (isAdmin || isSuperAdmin) return true;
    if (isRosterAdmin && !isAdmin && !isSuperAdmin && !isViewer) {
      if (item.access === "roster") return true;
      if (item.access === "inventory" && isRosterAdminFOH) return true;
      return false;
    }
    if (isViewer) {
      return item.access !== "super_admin_only" && item.access !== "admin_only";
    }
    return true;
  });

  // Bottom nav: Dashboard, Timesheets, Roster, Live Monitor as primary; rest in More
  const primaryLabels = ["Dashboard", "Timesheets", "Roster", "Live Monitor"];
  const bottomNavPrimary = navItems.filter(item => primaryLabels.includes(item.label));
  const bottomNavOverflow = navItems.filter(item => !primaryLabels.includes(item.label));

  // Show loading skeleton while auth is loading OR business is still resolving from URL
  const businessResolving = !!businessCode && (!business || business.business_code !== businessCode);
  
  if (loading || businessResolving) {
    return (
      <div className="min-h-dvh bg-background flex">
        {/* Skeleton sidebar */}
        <aside className="hidden lg:flex w-64 border-r border-border/40 flex-col p-4 gap-4">
          <div className="flex items-center gap-3">
            <div className="h-9 w-9 rounded-lg skeleton-shimmer" />
            <div className="flex-1 space-y-1.5">
              <div className="h-3.5 w-24 rounded skeleton-shimmer" />
              <div className="h-2.5 w-16 rounded skeleton-shimmer" />
            </div>
          </div>
          <div className="space-y-1 mt-2">
            {Array.from({ length: 8 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                <div className="h-4 w-4 rounded skeleton-shimmer" />
                <div className="h-3 rounded skeleton-shimmer" style={{ width: `${60 + (i % 3) * 20}px` }} />
              </div>
            ))}
          </div>
        </aside>
        {/* Skeleton main content */}
        <div className="flex-1 flex flex-col">
          <div className="h-14 border-b border-border/40 flex items-center px-4 gap-3">
            <div className="h-4 w-28 rounded skeleton-shimmer" />
          </div>
          <div className="p-4 lg:p-6 space-y-4">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-24 rounded-xl skeleton-shimmer" />
              ))}
            </div>
            <div className="h-64 rounded-xl skeleton-shimmer" />
          </div>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;

  const businessStatus = business && (business as any).status;
  const isSuspended = businessStatus === "suspended" || businessStatus === "deactivated";

  if (!isApproved || !hasAccess || isSuspended) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground">
            {isSuspended ? "Business Unavailable" : !isApproved ? "Account Pending Approval" : "Access Denied"}
          </h1>
          <p className="text-muted-foreground">
            {isSuspended
              ? `This business has been ${businessStatus} by the platform administrator. Please contact support for assistance.`
              : !isApproved
              ? "Your account is awaiting approval from an administrator."
              : "You don't have access to this business."}
          </p>
          <div className="flex gap-3 justify-center">
            <Link to="/hub"><Button variant="outline">Back to Hub</Button></Link>
            <Button variant="outline" onClick={signOut}>Sign Out</Button>
          </div>
        </div>
      </div>
    );
  }

  // Determine role badge
  const roleBadge = isSuperAdmin
    ? { label: "Super Admin", variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : isRosterAdmin && !isAdmin && !isViewer
    ? { label: `Roster Admin (${rosterDepts.join(", ")})`, variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : isViewer && !isAdmin
    ? { label: "View Only", variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : isAdmin
    ? { label: "Admin", variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : null;

  const isMoreActive = bottomNavOverflow.some(item => location.pathname === item.path);

  return (
    <div className="min-h-dvh bg-background flex standalone-top-pad safe-x">
      {/* Desktop Sidebar — hidden on mobile */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col ${sidebarOpen ? "translate-x-0 shadow-2xl shadow-black/50" : "-translate-x-full"}`}>
        {/* Logo area */}
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          {business?.logo_url ? (
            <img src={business.logo_url} alt="Logo" className="h-9 w-9 rounded-lg object-cover ring-1 ring-border/40" />
          ) : (
            <div className="h-9 w-9 rounded-lg bg-primary/10 flex items-center justify-center">
              <Building2 className="h-4.5 w-4.5 text-primary" />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="text-sm font-semibold text-primary truncate leading-tight">{business?.name || "OmnexClock"}</h1>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide uppercase">Admin Panel</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden ml-auto shrink-0 h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Navigation */}
        <nav className="px-2.5 py-3 space-y-0.5 overflow-y-auto flex-1 scrollbar-hide">
          {navItems.map(({ path, label, icon: Icon, tourId }, index) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                data-tour={tourId}
                onClick={() => setSidebarOpen(false)}
                className={`nav-stagger flex items-center gap-3 px-3 py-3 rounded-lg text-[13px] group relative btn-press ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold shadow-[inset_0_1px_0_hsl(var(--primary)/0.1)]"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
                style={{ animationDelay: `${index * 40}ms` }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary transition-all duration-300" />
                )}
                <Icon className={`h-4 w-4 flex-shrink-0 transition-all duration-200 ${isActive ? "text-primary" : "group-hover:scale-110 group-hover:text-primary/70"}`} />
                <span className="truncate">{label}</span>
                {label === "Requests" && pendingRequestCount > 0 && (
                  <Badge className="ml-auto bg-warning text-warning-foreground text-[10px] px-1.5 py-0 min-w-[20px] justify-center font-semibold badge-live">
                    {pendingRequestCount}
                  </Badge>
                )}
              </Link>
            );
          })}
        </nav>

        {/* User section */}
        <div className="px-2.5 py-3 border-t border-sidebar-border space-y-0.5 flex-shrink-0">
          <div className="px-3 py-2">
            <p className="text-[13px] font-medium text-foreground truncate leading-tight">
              {user?.user_metadata?.full_name || "Admin"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{user?.email}</p>
          </div>
          {isAdmin && (
            <Link
              to={`/b/${businessCode}/kiosk`}
              data-tour="kiosk"
              onClick={async () => {
                await signOut();
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent w-full transition-all duration-200"
            >
              <Clock className="h-4 w-4 flex-shrink-0" />
              Launch Kiosk
            </Link>
          )}
          <Link
            to="/hub"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent w-full transition-all duration-200"
          >
            <Building2 className="h-4 w-4 flex-shrink-0" />
            Business Hub
          </Link>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent w-full transition-all duration-200">
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay for desktop sidebar on mobile */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-64 min-w-0 flex flex-col h-dvh min-h-0">
        {/* Header — compact on mobile, refined spacing */}
        <header className="sticky top-0 z-30 glass border-b border-border/20 px-4 py-2 flex items-center gap-2.5 lg:px-6 lg:py-3 flex-shrink-0">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {business?.logo_url && (
              <img src={business.logo_url} alt="" className="h-7 w-7 rounded-lg object-cover lg:hidden flex-shrink-0 ring-1 ring-border/20" />
            )}
            <h2 className="text-[15px] font-semibold text-foreground tracking-tight truncate lg:text-base">
              {allNavItems.find((n) => n.path === location.pathname)?.label || "Admin"}
            </h2>
            {roleBadge && (
              <Badge variant={roleBadge.variant} className={`${roleBadge.className} inline-flex`}>{roleBadge.label}</Badge>
            )}
          </div>
          <div className="ml-auto flex items-center gap-1.5 lg:gap-2 flex-shrink-0">
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
              onClearAll={clearAll}
            />
          </div>
        </header>
        {/* Content — scrollable below fixed header */}
        <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-3 lg:p-6 page-enter has-bottom-nav lg:pb-6 scroll-native">
          <Outlet />
        </div>
      </main>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="bottom-nav lg:hidden" aria-label="Main navigation">
        <div className="flex items-stretch">
          {bottomNavPrimary.map(({ path, label, icon: Icon }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`bottom-nav-item ${isActive ? "active" : ""}`}
              >
                <Icon className="h-5 w-5" />
                <span className="bottom-nav-label">{label}</span>
                {label === "Requests" && pendingRequestCount > 0 && (
                  <span className="absolute top-1 right-1/4 h-2 w-2 rounded-full bg-warning" />
                )}
              </Link>
            );
          })}

          {/* More button */}
          {bottomNavOverflow.length > 0 && (
            <Sheet open={moreSheetOpen} onOpenChange={setMoreSheetOpen}>
              <SheetTrigger asChild>
                <button
                  className={`bottom-nav-item ${isMoreActive ? "active" : ""}`}
                >
                  <MoreHorizontal className="h-5 w-5" />
                  <span className="bottom-nav-label">More</span>
                </button>
              </SheetTrigger>
              <SheetContent side="bottom" className="rounded-t-2xl max-h-[70dvh] pb-safe">
                <div className="sheet-handle" />
                <SheetHeader className="pb-1">
                  <SheetTitle className="text-sm font-semibold">More</SheetTitle>
                </SheetHeader>
                <div className="grid grid-cols-4 gap-2 py-3">
                  {bottomNavOverflow.map(({ path, label, icon: Icon }) => {
                    const isActive = location.pathname === path;
                    return (
                      <Link
                        key={path}
                        to={path}
                        onClick={() => setMoreSheetOpen(false)}
                        className={`flex flex-col items-center gap-1.5 p-3 rounded-xl touch-active min-h-[68px] transition-colors ${
                          isActive
                            ? "bg-primary/10 text-primary"
                            : "text-muted-foreground hover:bg-secondary/50"
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        <span className="text-[10px] font-medium leading-tight text-center">{label}</span>
                      </Link>
                    );
                  })}
                </div>
                <div className="border-t border-border/40 pt-3 mt-2 space-y-1">
                  {isAdmin && (
                    <Link
                      to={`/b/${businessCode}/kiosk`}
                      onClick={async () => { setMoreSheetOpen(false); await signOut(); }}
                      className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-muted-foreground touch-active"
                    >
                      <Clock className="h-5 w-5" />
                      Launch Kiosk
                    </Link>
                  )}
                  <Link
                    to="/hub"
                    onClick={() => setMoreSheetOpen(false)}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-muted-foreground touch-active"
                  >
                    <Building2 className="h-5 w-5" />
                    Business Hub
                  </Link>
                  <button
                    onClick={() => { setMoreSheetOpen(false); signOut(); }}
                    className="flex items-center gap-3 px-3 py-3 rounded-xl text-sm text-muted-foreground w-full touch-active"
                  >
                    <LogOut className="h-5 w-5" />
                    Sign Out
                  </button>
                </div>
              </SheetContent>
            </Sheet>
          )}
        </div>
      </nav>

      {/* First-time admin walkthrough */}
      <WalkthroughTour
        steps={adminTourSteps}
        storageKey={`admin-tour-seen-${currentBusinessId}`}
      />
    </div>
  );
}