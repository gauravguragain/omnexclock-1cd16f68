import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { BusinessProvider } from "@/contexts/BusinessContext";

import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import RegisterBusinessPage from "./pages/RegisterBusinessPage";
import BusinessHubPage from "./pages/BusinessHubPage";
import KioskPage from "./pages/KioskPage";
import PortalPage from "./pages/PortalPage";
import AdminLayout from "./layouts/AdminLayout";
import MasterLayout from "./layouts/MasterLayout";
import DashboardPage from "./pages/admin/DashboardPage";
import EmployeesPage from "./pages/admin/EmployeesPage";
import LiveMonitorPage from "./pages/admin/LiveMonitorPage";
import TimesheetsPage from "./pages/admin/TimesheetsPage";
import PayrollPage from "./pages/admin/PayrollPage";
import AuditLogPage from "./pages/admin/AuditLogPage";
import UsersPage from "./pages/admin/UsersPage";
import RosterPage from "./pages/admin/RosterPage";
import ForumPage from "./pages/admin/ForumPage";
import RequestsPage from "./pages/admin/RequestsPage";
import MyBusinessPage from "./pages/admin/MyBusinessPage";
import MasterDashboardPage from "./pages/master/MasterDashboardPage";
import MasterBusinessesPage from "./pages/master/MasterBusinessesPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <BusinessProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/reset-password" element={<ResetPasswordPage />} />
              <Route path="/register-business" element={<RegisterBusinessPage />} />
              <Route path="/hub" element={<BusinessHubPage />} />

              {/* Business-scoped routes */}
              <Route path="/b/:businessCode/kiosk" element={<KioskPage />} />
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
              </Route>

              {/* Master admin routes */}
              <Route path="/master" element={<MasterLayout />}>
                <Route index element={<MasterDashboardPage />} />
                <Route path="businesses" element={<MasterBusinessesPage />} />
              </Route>

              {/* Legacy redirects */}
              <Route path="/admin/*" element={<BusinessHubPage />} />
              <Route path="/kiosk" element={<BusinessHubPage />} />
              <Route path="/portal" element={<BusinessHubPage />} />

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </BusinessProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
