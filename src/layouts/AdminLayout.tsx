import { useAuth } from "@/contexts/AuthContext";
import { Navigate, Outlet, Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Users, Clock, CalendarDays, DollarSign, BarChart3, Monitor, LogOut, Menu, X, Settings, FileText, UserCog, CalendarRange, MessageSquare, CalendarOff
} from "lucide-react";
import { useState } from "react";
import { useSessionGuard } from "@/hooks/useSessionGuard";

const navItems = [
  { path: "/admin", label: "Dashboard", icon: BarChart3 },
  { path: "/admin/employees", label: "Employees", icon: Users },
  { path: "/admin/roster", label: "Roster", icon: CalendarRange },
  { path: "/admin/live", label: "Live Monitor", icon: Monitor },
  { path: "/admin/timesheets", label: "Timesheets", icon: CalendarDays },
  { path: "/admin/payroll", label: "Payroll", icon: DollarSign },
  { path: "/admin/audit-log", label: "Audit Log", icon: FileText },
  { path: "/admin/forum", label: "Forum", icon: MessageSquare },
  { path: "/admin/requests", label: "Requests", icon: CalendarOff },
  { path: "/admin/users", label: "User Management", icon: UserCog },
];

export default function AdminLayout() {
  const { user, isAdmin, isApproved, loading, signOut } = useAuth();
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  useSessionGuard();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Clock className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // UX guard only — all data access is protected by RLS policies server-side.
  if (!user) return <Navigate to="/" replace />;
  if (!isAdmin || !isApproved) {
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
      <aside className={`fixed inset-y-0 left-0 z-50 w-64 bg-card border-r border-border transform transition-transform lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="flex items-center gap-3 p-4 border-b border-border">
          <img src="/logo.jpeg" alt="Logo" className="h-10 w-10 rounded-lg object-cover" />
          <div>
            <h1 className="text-sm font-bold gold-text">Pro Regal Pavilion</h1>
            <p className="text-xs text-muted-foreground">Time Clock Admin</p>
          </div>
          <Button variant="ghost" size="icon" className="lg:hidden ml-auto" onClick={() => setSidebarOpen(false)}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <nav className="p-3 space-y-1">
          {navItems.map(({ path, label, icon: Icon }) => (
            <Link
              key={path}
              to={path}
              onClick={() => setSidebarOpen(false)}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-colors ${
                location.pathname === path
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </nav>

        <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-border space-y-1">
          <button
            onClick={async () => {
              await signOut();
              window.location.href = "/kiosk";
            }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary w-full"
          >
            <Clock className="h-4 w-4" />
            Launch Kiosk
          </button>
          <button onClick={signOut} className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary w-full">
            <LogOut className="h-4 w-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-black/50 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 lg:ml-64">
        <header className="sticky top-0 z-30 bg-card/80 backdrop-blur border-b border-border px-4 py-3 flex items-center gap-3 lg:px-6">
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setSidebarOpen(true)}>
            <Menu className="h-5 w-5" />
          </Button>
          <h2 className="text-lg font-semibold text-foreground">
            {navItems.find((n) => n.path === location.pathname)?.label || "Admin"}
          </h2>
        </header>
        <div className="p-4 lg:p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
