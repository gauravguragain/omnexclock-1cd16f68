import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Badge } from "@/components/ui/badge";
import { Navigate, Outlet, Link, useLocation, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, CalendarDays, DollarSign, BarChart3, Monitor, LogOut, Menu, X, Settings, FileText, UserCog, CalendarRange, MessageSquare, CalendarOff, Building2
} from "lucide-react";
import { useState, useEffect } from "react";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { supabase } from "@/integrations/supabase/client";

export default function AdminLayout() {
  const { user, isAdmin, isViewer, isApproved, loading, signOut } = useAuth();
  const { business, businesses, setBusiness } = useBusiness();
  const location = useLocation();
  const { businessCode } = useParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

  const basePath = `/b/${businessCode}/admin`;

  const navItems = [
    { path: basePath, label: "Dashboard", icon: BarChart3 },
    { path: `${basePath}/employees`, label: "Employees", icon: Users },
    { path: `${basePath}/roster`, label: "Roster", icon: CalendarRange },
    { path: `${basePath}/live`, label: "Live Monitor", icon: Monitor },
    { path: `${basePath}/timesheets`, label: "Timesheets", icon: CalendarDays },
    { path: `${basePath}/payroll`, label: "Payroll", icon: DollarSign },
    { path: `${basePath}/requests`, label: "Requests", icon: CalendarOff },
    { path: `${basePath}/forum`, label: "Forum", icon: MessageSquare },
    { path: `${basePath}/audit-log`, label: "Audit Log", icon: FileText },
    { path: `${basePath}/users`, label: "User Management", icon: UserCog },
    { path: `${basePath}/my-business`, label: "My Business", icon: Building2 },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if ((!isAdmin && !isViewer) || !isApproved) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4">
          <h1 className="text-xl font-bold text-foreground">
            {!isApproved ? "Account Pending Approval" : "Access Denied"}
          </h1>
          <p className="text-muted-foreground">
            {!isApproved
              ? "Your account is awaiting approval from an administrator."
              : "You don't have admin privileges."}
          </p>
          <Button variant="outline" onClick={signOut}>Sign Out</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0 flex flex-col ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 p-4 border-b border-border">
          {business?.logo_url ? (
            <img src={business.logo_url} alt="Logo" className="h-10 w-10 rounded-lg object-cover" />
          ) : (
            <div className="h-10 w-10 rounded-lg bg-primary/15 flex items-center justify-center">
              <Building2 className="h-5 w-5 text-primary" />
            </div>
          )}
          <div>
            <h1 className="text-sm font-bold text-primary truncate">{business?.name || "OmnexClock"}</h1>
            <p className="text-xs text-muted-foreground">Admin Panel</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="p-3 space-y-1 overflow-y-auto flex-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors ${
                location.pathname === path
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="p-3 border-t border-border space-y-1 flex-shrink-0">
          <div className="px-3 py-1.5">
            <p className="text-sm font-medium text-foreground truncate">
              {user?.user_metadata?.full_name || "Admin"}
            </p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
          {!isViewer && (
            <Link
              to={`/b/${businessCode}/kiosk`}
              onClick={async () => {
                await signOut();
              }}
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary w-full"
            >
              <Clock className="h-4 w-4 flex-shrink-0" />
              Launch Kiosk
            </Link>
          )}
          <Link
            to="/hub"
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary w-full"
          >
            <Building2 className="h-4 w-4 flex-shrink-0" />
            Business Hub
          </Link>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary w-full">
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">
            {navItems.find((n) => n.path === location.pathname)?.label || "Admin"}
          </h2>
          {isViewer && !isAdmin && (
            <Badge variant="outline" className="text-primary border-primary/30 text-xs">View Only</Badge>
          )}
        </header>
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
