import { useState, useEffect, useCallback, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

/* ── Types ─────────────────────────────────────────────── */

export interface PortalShift {
  id: string;
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  hours_worked: number | null;
  notes: string | null;
  week_start_date: string;
}

export interface TimesheetEntry {
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_start: string | null;
  break_end: string | null;
  break_minutes: number;
  total_hours: number;
  net_hours: number;
}

export interface EmployeeInfo {
  employee_id: string;
  employee_name: string;
  current_status: string;
  last_event_time: string | null;
}

export interface PortalData {
  employeeInfo: EmployeeInfo | null;
  shifts: PortalShift[];
  timesheets: TimesheetEntry[];
  timesheetApprovals: Map<string, boolean>;
  forumPosts: any[];
  myRequests: any[];
  lastSyncedAt: Date | null;
}

interface UsePortalDataReturn extends PortalData {
  authenticated: boolean;
  loading: boolean;
  login: (employeeCode: string, businessCode: string | null) => Promise<boolean>;
  logout: () => void;
  refreshData: () => Promise<void>;
  employeeCode: string;
}

const POLL_INTERVAL = 15_000;
const AUTO_LOGOUT_MS = 5 * 60 * 1000;

/* ── Hook ──────────────────────────────────────────────── */

export function usePortalData(urlBusinessCode: string | null): UsePortalDataReturn {
  const [authenticated, setAuthenticated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [employeeCode, setEmployeeCode] = useState("");
  const [employeeInfo, setEmployeeInfo] = useState<EmployeeInfo | null>(null);
  const [shifts, setShifts] = useState<PortalShift[]>([]);
  const [timesheets, setTimesheets] = useState<TimesheetEntry[]>([]);
  const [timesheetApprovals, setTimesheetApprovals] = useState<Map<string, boolean>>(new Map());
  const [forumPosts, setForumPosts] = useState<any[]>([]);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [lastSyncedAt, setLastSyncedAt] = useState<Date | null>(null);

  const employeeCodeRef = useRef("");
  const bizCodeRef = useRef<string | null>(null);
  const fetchingRef = useRef(false);

  bizCodeRef.current = urlBusinessCode?.toUpperCase() || null;

  /* ── Core data fetcher ─────────────────────────────── */
  const fetchPortalData = useCallback(async (empCode: string): Promise<boolean> => {
    if (fetchingRef.current) return true; // prevent concurrent fetches
    fetchingRef.current = true;

    try {
      const bizCode = bizCodeRef.current;

      const [statusRes, shiftsRes, tsRes, forumRes, requestsRes, approvalsRes] = await Promise.all([
        supabase.rpc("get_employee_status", { _employee_code: empCode, _business_code: bizCode }),
        supabase.rpc("get_employee_shifts", { _employee_code: empCode, _business_code: bizCode }),
        supabase.rpc("get_employee_timesheets", { _employee_code: empCode, _business_code: bizCode }),
        supabase.rpc("get_forum_posts", { _employee_code: empCode, _business_code: bizCode }),
        supabase.rpc("get_employee_requests", { _employee_code: empCode, _business_code: bizCode }),
        supabase.rpc("get_employee_timesheet_approvals", { _employee_code: empCode, _business_code: bizCode }),
      ]);

      // Check if employee exists
      if (statusRes.error || !statusRes.data || (statusRes.data as any[]).length === 0) {
        return false;
      }

      const info = (statusRes.data as any[])[0] as EmployeeInfo;
      setEmployeeInfo(info);
      setShifts((shiftsRes.data as PortalShift[]) || []);
      setTimesheets((tsRes.data as TimesheetEntry[]) || []);
      setForumPosts(forumRes.data || []);
      setMyRequests(requestsRes.data || []);

      const approvalMap = new Map<string, boolean>();
      for (const a of (approvalsRes.data || []) as any[]) {
        approvalMap.set(a.approval_date, a.is_approved);
      }
      setTimesheetApprovals(approvalMap);
      setLastSyncedAt(new Date());

      return true;
    } catch {
      // silently fail for intermittent network issues
      return true; // don't log out on network error
    } finally {
      fetchingRef.current = false;
    }
  }, []);

  /* ── Login ─────────────────────────────────────────── */
  const login = useCallback(async (empCode: string, _bizCode: string | null): Promise<boolean> => {
    setLoading(true);
    employeeCodeRef.current = empCode;
    const ok = await fetchPortalData(empCode);
    if (ok) {
      setEmployeeCode(empCode);
      setAuthenticated(true);
    }
    setLoading(false);
    return ok;
  }, [fetchPortalData]);

  /* ── Logout ────────────────────────────────────────── */
  const logout = useCallback(() => {
    setAuthenticated(false);
    setEmployeeCode("");
    employeeCodeRef.current = "";
    setEmployeeInfo(null);
    setShifts([]);
    setTimesheets([]);
    setTimesheetApprovals(new Map());
    setForumPosts([]);
    setMyRequests([]);
    setLastSyncedAt(null);
  }, []);

  /* ── Manual refresh ────────────────────────────────── */
  const refreshData = useCallback(async () => {
    if (!employeeCodeRef.current) return;
    const ok = await fetchPortalData(employeeCodeRef.current);
    if (!ok) logout();
  }, [fetchPortalData, logout]);

  /* ── Keep employeeCodeRef in sync ──────────────────── */
  useEffect(() => {
    employeeCodeRef.current = employeeCode;
  }, [employeeCode]);

  /* ── Auto-refresh: polling + visibility + focus ──── */
  useEffect(() => {
    if (!authenticated || !employeeCode) return;

    const refresh = () => { void fetchPortalData(employeeCode); };

    const intervalId = setInterval(refresh, POLL_INTERVAL);
    const onFocus = () => refresh();
    const onVisibility = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      clearInterval(intervalId);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [authenticated, employeeCode, fetchPortalData]);

  /* ── Realtime: shifts + clock_events + timesheet_approvals ── */
  useEffect(() => {
    if (!authenticated || !employeeCode || !employeeInfo?.employee_id) return;

    const empId = employeeInfo.employee_id;
    const refresh = () => { void fetchPortalData(employeeCode); };

    const channel = supabase
      .channel(`portal-sync-${empId}`)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "shifts",
        filter: `employee_id=eq.${empId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "clock_events",
        filter: `employee_id=eq.${empId}`,
      }, refresh)
      .on("postgres_changes", {
        event: "*", schema: "public", table: "timesheet_approvals",
        filter: `employee_id=eq.${empId}`,
      }, refresh)
      .subscribe();

    return () => { void supabase.removeChannel(channel); };
  }, [authenticated, employeeCode, employeeInfo?.employee_id, fetchPortalData]);

  /* ── Auto-logout on inactivity ─────────────────────── */
  useEffect(() => {
    if (!authenticated) return;
    let timer: NodeJS.Timeout;
    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(logout, AUTO_LOGOUT_MS);
    };
    reset();
    window.addEventListener("click", reset);
    window.addEventListener("keydown", reset);
    window.addEventListener("touchstart", reset);
    return () => {
      clearTimeout(timer);
      window.removeEventListener("click", reset);
      window.removeEventListener("keydown", reset);
      window.removeEventListener("touchstart", reset);
    };
  }, [authenticated, logout]);

  return {
    authenticated,
    loading,
    employeeCode,
    employeeInfo,
    shifts,
    timesheets,
    timesheetApprovals,
    forumPosts,
    myRequests,
    lastSyncedAt,
    login,
    logout,
    refreshData,
  };
}
