import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Building2, LogOut, Menu, X, Shield, LayoutDashboard, Users, FileText, Settings } from "lucide-react";
import { useState, useEffect } from "react";

export default function MasterLayout() {
  const { user, isMaster, loading, signOut } = useAuth();
  const { resetTheme } = useBusiness();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  // Always use default OmnexClock theme
  useEffect(() => { resetTheme(); }, []);

  const navItems = [
    { path: "/master", label: "Dashboard", icon: LayoutDashboard },
    { path: "/master/businesses", label: "Businesses", icon: Building2 },
    { path: "/master/users", label: "Users", icon: Users },
    { path: "/master/audit-log", label: "Audit Log", icon: FileText },
    { path: "/master/settings", label: "Settings", icon: Settings },
  ];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="flex flex-col items-center gap-3">
          <Shield className="h-8 w-8 animate-spin text-primary" />
          <p className="text-xs text-muted-foreground animate-pulse">Loading...</p>
        </div>
      </div>
    );
  }

  if (!user) return <Navigate to="/auth" replace />;
  if (!isMaster) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center space-y-4 animate-fade-in">
          <h1 className="text-xl font-bold text-foreground">Access Denied</h1>
          <p className="text-muted-foreground">You don't have master admin privileges.</p>
          <div className="flex gap-3 justify-center">
            <Link to="/hub"><Button variant="outline">Back to Hub</Button></Link>
            <Button variant="outline" onClick={signOut}>Sign Out</Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex">
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-sidebar border-r border-sidebar-border transform transition-all duration-300 ease-in-out lg:translate-x-0 flex flex-col ${sidebarOpen ? "translate-x-0 shadow-2xl shadow-black/50" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 px-4 py-4 border-b border-sidebar-border">
          <div className="h-9 w-9 rounded-lg bg-primary/12 flex items-center justify-center">
            <Shield className="h-4.5 w-4.5 text-primary" />
          </div>
          <div>
            <h1 className="text-sm font-semibold text-primary leading-tight">OmnexClock</h1>
            <p className="text-[10px] text-muted-foreground/60 font-medium tracking-wide uppercase">Master Admin</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden ml-auto h-8 w-8" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="px-2.5 py-3 space-y-0.5 overflow-y-auto flex-1">
          {navItems.map(({ path, label, icon: Icon }, index) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                onClick={() => setSidebarOpen(false)}
                className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] transition-all duration-200 group relative ${
                  isActive
                    ? "bg-primary/10 text-primary font-semibold"
                    : "text-muted-foreground hover:text-foreground hover:bg-sidebar-accent"
                }`}
              >
                {isActive && (
                  <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 rounded-r-full bg-primary" />
                )}
                <Icon className={`h-4 w-4 flex-shrink-0 transition-transform duration-200 ${isActive ? "" : "group-hover:scale-110"}`} />
                <span className="truncate">{label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="px-2.5 py-3 border-t border-sidebar-border space-y-0.5 flex-shrink-0">
          <div className="px-3 py-2">
            <p className="text-[13px] font-medium text-foreground truncate leading-tight">
              {user?.user_metadata?.full_name || "Master Admin"}
            </p>
            <p className="text-[10px] text-muted-foreground/60 truncate mt-0.5">{user?.email}</p>
          </div>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-muted-foreground hover:text-foreground hover:bg-sidebar-accent w-full transition-all duration-200">
            <LogOut className="h-4 w-4 flex-shrink-0" />
            Sign Out
          </button>
        </div>
      </aside>

      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm lg:hidden transition-opacity duration-300" onClick={() => setSidebarOpen(false)} />
      )}

      <main className="flex-1 lg:ml-64 min-w-0">
        <header className="sticky top-0 z-30 glass border-b border-border/40 px-4 py-3 flex items-center gap-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden h-9 w-9" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-base font-semibold text-foreground tracking-tight">
            {navItems.find((n) => n.path === location.pathname)?.label || "Master Admin"}
          </h2>
        </header>
        <div className="p-4 lg:p-6 page-enter">
          <Outlet />
        </div>
      </main>
    </div>
  );
}