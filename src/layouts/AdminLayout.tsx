import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Badge } from "@/components/ui/badge";
import { Navigate, Outlet, Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, CalendarDays, DollarSign, BarChart3, Monitor, LogOut, Menu, X, Settings, FileText, UserCog, CalendarRange, MessageSquare, CalendarOff, Building2, Package, Wrench
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { supabase } from "@/integrations/supabase/client";
import WalkthroughTour from "@/components/WalkthroughTour";
import { adminTourSteps } from "@/components/tourSteps";
import NotificationBell from "@/components/NotificationBell";
import { useAdminNotifications } from "@/hooks/useNotifications";

export default function AdminLayout() {
  const { user, isAdminOf, isSuperAdminOf, isViewerOf, isRosterAdminOf, getRosterAdminDepartments, hasAccessTo, isApproved, loading, signOut } = useAuth();
  const { business, businesses, setBusiness } = useBusiness();
  const location = useLocation();
  const { businessCode } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    { path: `${basePath}/requests`, label: "Requests", icon: CalendarOff, tourId: "requests", access: "admin" },
    { path: `${basePath}/forum`, label: "Forum", icon: MessageSquare, tourId: "forum", access: "admin" },
    { path: `${basePath}/inventory`, label: "Inventory", icon: Package, tourId: "inventory", access: "inventory" },
    { path: `${basePath}/service`, label: "Service", icon: Wrench, tourId: "service", access: "admin" },
    { path: `${basePath}/users`, label: "User Management", icon: UserCog, tourId: "users", access: "super_admin_only" },
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

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Clock className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
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
  const roleBadge = isRosterAdmin && !isAdmin && !isViewer
    ? { label: `Roster Admin (${rosterDepts.join(", ")})`, variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : isViewer && !isAdmin
    ? { label: "View Only", variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : isSuperAdmin
    ? { label: "Super Admin", variant: "outline" as const, className: "text-primary border-primary/30 text-[10px] font-medium" }
    : null;

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
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
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 group relative ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
                style={{ animationDelay: `${index * 30}ms` }}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                )}
                <Icon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isActive ? "" : "group-hover:scale-110"}`} />
                <span className="truncate">{label}</span>
                {label === "Requests" && pendingRequestCount > 0 && (
                  <Badge className="ml-auto bg-warning text-warning-foreground text-[10px] px-1.5 py-0 min-w-[20px] justify-center font-semibold animate-pulse">
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

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border/40 px-4 py-3 flex items-center gap-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            {allNavItems.find((n) => n.path === location.pathname)?.label || "Admin"}
          </h2>
          {roleBadge && (
            <Badge variant={roleBadge.variant} className={roleBadge.className}>{roleBadge.label}</Badge>
          )}
          <div className="ml-auto">
            <NotificationBell
              notifications={notifications}
              unreadCount={unreadCount}
              onMarkRead={markRead}
              onMarkAllRead={markAllRead}
              onClearAll={clearAll}
            />
          </div>
        </header>
        <div className="p-4 lg:p-6 page-enter">
          <Outlet />
        </div>
      </main>

      {/* First-time admin walkthrough */}
      <WalkthroughTour
        steps={adminTourSteps}
        storageKey={`admin-tour-seen-${currentBusinessId}`}
      />
    </div>
  );
}