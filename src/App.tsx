import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/contexts/AuthContext";
import { BusinessProvider } from "@/contexts/BusinessContext";
import { ActionLockProvider } from "@/contexts/ActionLockContext";
import React, { Suspense } from "react";
import { Clock } from "lucide-react";

// Lightweight page shell for Suspense fallback
const PageLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background">
    <div className="flex flex-col items-center gap-3">
      <Clock className="h-7 w-7 animate-spin text-primary" />
      <div className="flex gap-1">
        <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '0ms' }} />
        <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '150ms' }} />
        <div className="h-1.5 w-1.5 rounded-full bg-primary/40 animate-bounce" style={{ animationDelay: '300ms' }} />
      </div>
    </div>
  </div>
);

// Lazy-load all page components for faster initial load
const NotFound = React.lazy(() => import("./pages/NotFound"));
const Index = React.lazy(() => import("./pages/Index"));
const AuthPage = React.lazy(() => import("./pages/AuthPage"));
const ResetPasswordPage = React.lazy(() => import("./pages/ResetPasswordPage"));
const RegisterBusinessPage = React.lazy(() => import("./pages/RegisterBusinessPage"));
const BusinessHubPage = React.lazy(() => import("./pages/BusinessHubPage"));
const KioskPage = React.lazy(() => import("./pages/KioskPage"));
const PortalPage = React.lazy(() => import("./pages/PortalPageV2"));
const EmployeePortalEntry = React.lazy(() => import("./pages/EmployeePortalEntry"));
const AdminLayout = React.lazy(() => import("./layouts/AdminLayout"));
const MasterLayout = React.lazy(() => import("./layouts/MasterLayout"));
const DashboardPage = React.lazy(() => import("./pages/admin/DashboardPage"));
const EmployeesPage = React.lazy(() => import("./pages/admin/EmployeesPage"));
const LiveMonitorPage = React.lazy(() => import("./pages/admin/LiveMonitorPage"));
const TimesheetsPage = React.lazy(() => import("./pages/admin/TimesheetsPage"));
const PayrollPage = React.lazy(() => import("./pages/admin/PayrollPage"));
const AuditLogPage = React.lazy(() => import("./pages/admin/AuditLogPage"));
const UsersPage = React.lazy(() => import("./pages/admin/UsersPage"));
const RosterPage = React.lazy(() => import("./pages/admin/RosterPage"));
const ForumPage = React.lazy(() => import("./pages/admin/ForumPage"));
const RequestsPage = React.lazy(() => import("./pages/admin/RequestsPage"));
const MyBusinessPage = React.lazy(() => import("./pages/admin/MyBusinessPage"));
const InventoryPage = React.lazy(() => import("./pages/admin/InventoryPage"));
const ServiceMaintenancePage = React.lazy(() => import("./pages/admin/ServiceMaintenancePage"));
const CateringDeliveryPage = React.lazy(() => import("./pages/admin/CateringDeliveryPage"));

const PayDetailsPage = React.lazy(() => import("./pages/admin/PayDetailsPage"));
const MasterDashboardPage = React.lazy(() => import("./pages/master/MasterDashboardPage"));
const MasterBusinessesPage = React.lazy(() => import("./pages/master/MasterBusinessesPage"));
const MasterUsersPage = React.lazy(() => import("./pages/master/MasterUsersPage"));
const MasterAuditLogPage = React.lazy(() => import("./pages/master/MasterAuditLogPage"));
const MasterSettingsPage = React.lazy(() => import("./pages/master/MasterSettingsPage"));

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 2 * 60_000,    // Data fresh for 2 min — fewer round trips on navigation
      gcTime: 10 * 60_000,      // Cache kept for 10 min
      refetchOnWindowFocus: false, // Don't refetch just because user switched tabs
      refetchOnReconnect: false, // Skip background refetch on reconnect
      retry: 1,                 // Faster failure on network issues
    },
  },
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false} storageKey="omnex-theme">
      <TooltipProvider>
        <AuthProvider>
          <BusinessProvider>
            <ActionLockProvider>
              <Toaster />
              <Sonner />
            <BrowserRouter>
              <Suspense fallback={<PageLoader />}>
                <Routes>
                  <Route path="/" element={<Index />} />
                  <Route path="/auth" element={<AuthPage />} />
                  <Route path="/reset-password" element={<ResetPasswordPage />} />
                  <Route path="/register-business" element={<RegisterBusinessPage />} />
                  <Route path="/hub" element={<BusinessHubPage />} />

                  {/* Business-scoped routes */}
                  <Route path="/b/:businessCode/kiosk" element={<KioskPage />} />
                  {/* Unique obfuscated kiosk URL — harder to guess */}
                  <Route path="/t/:businessCode/ck" element={<KioskPage />} />
                  <Route path="/b/:businessCode/portal" element={<PortalPage />} />
                  <Route path="/b/:businessCode/admin" element={<AdminLayout />}>
                    <Route index element={<DashboardPage />} />
                    <Route path="employees" element={<EmployeesPage />} />
                    <Route path="roster" element={<RosterPage />} />
                    <Route path="live" element={<LiveMonitorPage />} />
                    <Route path="timesheets" element={<TimesheetsPage />} />
                    <Route path="payroll" element={<PayrollPage />} />
                    <Route path="audit-log" element={<AuditLogPage />} />
                    <Route path="users" element={<UsersPage />} />
                    <Route path="forum" element={<ForumPage />} />
                    <Route path="requests" element={<RequestsPage />} />
                    <Route path="my-business" element={<MyBusinessPage />} />
                    <Route path="inventory" element={<InventoryPage />} />
                    <Route path="service" element={<ServiceMaintenancePage />} />
                    
                    <Route path="pay-details" element={<PayDetailsPage />} />
                  </Route>

                  {/* Master admin routes */}
                  <Route path="/master" element={<MasterLayout />}>
                    <Route index element={<MasterDashboardPage />} />
                    <Route path="businesses" element={<MasterBusinessesPage />} />
                    <Route path="users" element={<MasterUsersPage />} />
                    <Route path="audit-log" element={<MasterAuditLogPage />} />
                    <Route path="settings" element={<MasterSettingsPage />} />
                  </Route>

                  {/* Legacy redirects */}
                  <Route path="/admin/*" element={<BusinessHubPage />} />
                  <Route path="/kiosk" element={<BusinessHubPage />} />
                  <Route path="/portal" element={<EmployeePortalEntry />} />

                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </BrowserRouter>
            </ActionLockProvider>
          </BusinessProvider>
        </AuthProvider>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
