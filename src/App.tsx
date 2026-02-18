import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";

import NotFound from "./pages/NotFound";
import Index from "./pages/Index";
import AuthPage from "./pages/AuthPage";
import KioskPage from "./pages/KioskPage";
import PortalPage from "./pages/PortalPage";
import AdminLayout from "./layouts/AdminLayout";
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

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <AuthProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<AuthPage />} />
            <Route path="/kiosk" element={<KioskPage />} />
            <Route path="/portal" element={<PortalPage />} />
            <Route path="/admin" element={<AdminLayout />}>
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
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
