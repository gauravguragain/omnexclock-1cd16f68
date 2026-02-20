import { useEffect, useState, useMemo, useCallback } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { TimeDropdownPicker } from "@/components/TimeDropdownPicker";
import { logAudit } from "@/lib/auditLog";
import { notifyEmployees } from "@/lib/notifications";
import { useAuth } from "@/contexts/AuthContext";
import {
  ChevronLeft, ChevronRight, Plus, Trash2, Copy, Send, Clock, AlertCircle, CalendarOff, Clipboard, ClipboardPaste, X, Mail, Download, FileDown, CalendarIcon, ChevronDown, Sparkles, BrainCircuit,
} from "lucide-react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import type { Tables } from "@/integrations/supabase/types";
import { toAusDate, toAusFormatted } from "@/lib/dateUtils";
import RosterDayEvents from "@/components/RosterDayEvents";
import RosterVoiceCommand from "@/components/RosterVoiceCommand";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

type Employee = Tables<"employees">;
type Shift = Tables<"shifts">;

/* ── helpers ─────────────────────────────────────────────── */

function getMonday(d: Date): Date {
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const mon = new Date(d);
  mon.setDate(diff);
  mon.setHours(0, 0, 0, 0);
  return mon;
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function fmtDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const FULL_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

function formatTime12(t: string): string {
  if (!t) return "";
  const [h, m] = t.split(":");
  const hr = parseInt(h);
  const ampm = hr >= 12 ? "PM" : "AM";
  const h12 = hr === 0 ? 12 : hr > 12 ? hr - 12 : hr;
  return `${h12}:${m} ${ampm}`;
}

function calcNetHours(start: string, end: string, breakMin: number): number {
  if (!start || !end) return 0;
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  let mins = (eh * 60 + em) - (sh * 60 + sm);
  if (mins < 0) mins += 24 * 60; // overnight
  return Math.max(0, (mins - breakMin) / 60);
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

function isAllDayUnavailability(req: any): boolean {
  return !req.start_time || !req.end_time;
}

function timesOverlap(startA: string, endA: string, startB: string, endB: string): boolean {
  const a0 = timeToMinutes(startA);
  const a1 = timeToMinutes(endA);
  const b0 = timeToMinutes(startB);
  const b1 = timeToMinutes(endB);
  return a0 < b1 && b0 < a1;
}

/* ── component ───────────────────────────────────────────── */

interface ShiftForm {
  employee_id: string;
  date: string;
  day_of_week: string;
  start_time: string;
  end_time: string;
  break_minutes: string;
  notes: string;
}

const EMPTY_SHIFT: ShiftForm = {
  employee_id: "", date: "", day_of_week: "", start_time: "09:00", end_time: "17:00", break_minutes: "30", notes: "",
};

export default function RosterPage() {
  const { runAction } = useActionLock();
  const { isViewer, isAdminOf, isSuperAdminOf, isRosterAdminOf, getRosterAdminDepartments } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [weekStart, setWeekStart] = useState(() => getMonday(new Date()));
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [approvedRequests, setApprovedRequests] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingShift, setEditingShift] = useState<Shift | null>(null);
  const [form, setForm] = useState<ShiftForm>(EMPTY_SHIFT);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [showPublishConfirm, setShowPublishConfirm] = useState(false);
  const [copiedShift, setCopiedShift] = useState<Shift | null>(null);
  const [forecasting, setForecasting] = useState(false);

  const currentBusinessId = business?.id || "";
  const isAdmin = isAdminOf(currentBusinessId) || isSuperAdminOf(currentBusinessId);
  const isRosterAdmin = isRosterAdminOf(currentBusinessId) && !isAdmin;
  const rosterDepts = getRosterAdminDepartments(currentBusinessId);
  // Roster admins are locked to their department
  const lockedDepartment = isRosterAdmin && rosterDepts.length > 0 ? rosterDepts[0] : null;
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");

  // Email roster state
  const [emailDialogOpen, setEmailDialogOpen] = useState(false);
  const [adminUsers, setAdminUsers] = useState<{ id: string; email: string; full_name: string | null; role: string }[]>([]);
  const [selectedAdminIds, setSelectedAdminIds] = useState<string[]>([]);
  const [sendingEmail, setSendingEmail] = useState(false);

  const weekDates = useMemo(() => DAYS.map((_, i) => addDays(weekStart, i)), [weekStart]);
  const weekEnd = addDays(weekStart, 6);
  const weekLabel = `${toAusFormatted(weekStart, { day: "numeric", month: "short" })} – ${toAusFormatted(weekEnd, { day: "numeric", month: "short", year: "numeric" })}`;

  const departments = useMemo(() => {
    const depts = [...new Set(employees.map(e => e.department).filter(Boolean))] as string[];
    return depts.sort();
  }, [employees]);

  // Auto-lock department filter for roster admins
  useEffect(() => {
    if (lockedDepartment) {
      setDepartmentFilter(lockedDepartment);
    }
  }, [lockedDepartment]);

  const filteredEmployees = useMemo(() => {
    // For roster admins, always filter by their departments
    if (isRosterAdmin && rosterDepts.length > 0) {
      return employees.filter(e => e.department && rosterDepts.map(d => d.toUpperCase()).includes(e.department.toUpperCase()));
    }
    if (departmentFilter === "all") return employees;
    return employees.filter(e => e.department === departmentFilter);
  }, [employees, departmentFilter, isRosterAdmin, rosterDepts]);

  /* ── data fetching ── */

  const fetchData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const ws = fmtDate(weekStart);
    const we = fmtDate(addDays(weekStart, 6));
    const [empRes, shiftRes, reqRes] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).eq("business_id", business.id).order("name"),
      supabase.from("shifts").select("*, employees!inner(business_id)").eq("employees.business_id", business.id).eq("week_start_date", ws).order("start_time"),
      supabase.from("employee_requests").select("*, employees!inner(name, business_id)").eq("employees.business_id", business.id).eq("status", "approved"),
    ]);
    setEmployees(empRes.data || []);
    setShifts(shiftRes.data || []);
    setApprovedRequests(reqRes.data || []);
    setLoading(false);
  }, [weekStart, business]);

  useEffect(() => { fetchData(); }, [fetchData]);

  // Fetch admin users for email dialog
  const fetchAdminUsers = useCallback(async () => {
    if (!business) return;
    const { data: roles } = await supabase
      .from("user_roles")
      .select("user_id, role")
      .eq("business_id", business.id)
      .in("role", ["admin", "super_admin", "roster_admin"]);
    if (!roles || roles.length === 0) { setAdminUsers([]); return; }
    const userIds = [...new Set(roles.map(r => r.user_id))];
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, email, full_name")
      .in("id", userIds);
    if (!profiles) { setAdminUsers([]); return; }
    const roleMap = new Map<string, string>();
    for (const r of roles) {
      const existing = roleMap.get(r.user_id);
      if (!existing || r.role === "super_admin" || (r.role === "admin" && existing === "roster_admin")) {
        roleMap.set(r.user_id, r.role);
      }
    }
    setAdminUsers(profiles.map(p => ({
      id: p.id,
      email: p.email,
      full_name: p.full_name,
      role: roleMap.get(p.id) || "admin",
    })));
  }, [business]);

  const openEmailDialog = async () => {
    await fetchAdminUsers();
    setSelectedAdminIds([]);
    setEmailDialogOpen(true);
  };

  const buildRosterPDFDoc = (): jsPDF => {
    const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
    const pageWidth = doc.internal.pageSize.getWidth();

    // Header
    doc.setFillColor(26, 26, 26);
    doc.rect(0, 0, pageWidth, 22, "F");
    doc.setTextColor(201, 162, 39);
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.text("OmnexClock", 14, 14);
    doc.setTextColor(160, 160, 160);
    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.text("Weekly Roster", 58, 14);

    // Week label
    doc.setTextColor(26, 26, 26);
    doc.setFontSize(12);
    doc.setFont("helvetica", "bold");
    doc.text(`Roster: ${weekLabel}`, 14, 32);

    if (business) {
      doc.setFontSize(9);
      doc.setFont("helvetica", "normal");
      doc.setTextColor(100, 100, 100);
      doc.text(`Business: ${business.name}`, 14, 38);
    }

    // Department filter note
    if (departmentFilter !== "all") {
      doc.setFontSize(8);
      doc.setTextColor(150, 100, 0);
      doc.text(`Filtered: ${departmentFilter} department only`, 14, 43);
    }

    // Build table data — only include employees who have at least one shift this week
    const headers = ["Employee", ...DAYS.map((d, i) => `${d}\n${toAusFormatted(weekDates[i], { day: "numeric", month: "short" })}`), "Total"];
    const rosteredEmployees = filteredEmployees.filter(emp => {
      const empShifts = shiftMap[emp.id];
      if (!empShifts) return false;
      return Object.values(empShifts).some((dayShifts: any[]) => dayShifts.length > 0);
    });
    const tableData = rosteredEmployees.map(emp => {
      const row: string[] = [emp.name + (emp.department ? `\n${emp.department}` : "")];
      for (let dayIdx = 0; dayIdx < 7; dayIdx++) {
        const dayShifts = shiftMap[emp.id]?.[dayIdx] || [];
        if (dayShifts.length > 0) {
          row.push(dayShifts.map(s =>
            `${formatTime12(s.start_time)} – ${formatTime12(s.end_time)}` +
            (s.break_minutes > 0 ? `\n(${s.break_minutes}m break)` : "") +
            (s.notes ? `\n${s.notes}` : "")
          ).join("\n"));
        } else {
          row.push("—");
        }
      }
      row.push(`${(weeklyTotals[emp.id] || 0).toFixed(2)}h`);
      return row;
    });

    autoTable(doc, {
      startY: departmentFilter !== "all" ? 47 : 42,
      head: [headers],
      body: tableData,
      theme: "grid",
      styles: {
        fontSize: 7,
        cellPadding: 2,
        lineColor: [200, 200, 200],
        lineWidth: 0.3,
        overflow: "linebreak",
      },
      headStyles: {
        fillColor: [40, 40, 40],
        textColor: [201, 162, 39],
        fontStyle: "bold",
        fontSize: 7.5,
        halign: "center",
      },
      columnStyles: {
        0: { cellWidth: 32, halign: "left", fontStyle: "bold" },
        8: { cellWidth: 18, halign: "center", fontStyle: "bold" },
      },
      alternateRowStyles: { fillColor: [248, 249, 250] },
    });

    // Footer
    const finalY = (doc as any).lastAutoTable?.finalY || 50;
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14);
    doc.setFont("helvetica", "italic");
    const disclaimerY = Math.min(finalY + 8, doc.internal.pageSize.getHeight() - 12);
    doc.text(
      "⚠ Disclaimer: Shift and break times are indicative and subject to management discretion.",
      14,
      disclaimerY
    );
    doc.setTextColor(150, 150, 150);
    doc.setFont("helvetica", "normal");
    doc.text(
      `Generated: ${new Date().toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" })}`,
      14,
      disclaimerY + 4
    );

    return doc;
  };

  const generateRosterPDF = (): string => {
    const doc = buildRosterPDFDoc();
    return doc.output("datauristring").split(",")[1];
  };

  const handleDownloadPDF = () => {
    const doc = buildRosterPDFDoc();
    const filename = `roster-${fmtDate(weekStart)}-to-${fmtDate(addDays(weekStart, 6))}.pdf`;
    doc.save(filename);
    toast({ title: "PDF downloaded", description: filename });
    logAudit("roster_pdf_downloaded", { week_start: fmtDate(weekStart) });
  };

  const handleSendRosterEmail = async () => {
    if (selectedAdminIds.length === 0) {
      toast({ title: "No recipients selected", variant: "destructive" });
      return;
    }
    setSendingEmail(true);
    try {
      const pdfBase64 = generateRosterPDF();
      const pdfFilename = `roster-${fmtDate(weekStart)}-to-${fmtDate(addDays(weekStart, 6))}.pdf`;

      // Get current user's name
      const { data: currentProfile } = await supabase
        .from("profiles")
        .select("full_name, email")
        .eq("id", (await supabase.auth.getUser()).data.user?.id || "")
        .single();

      let sentCount = 0;
      for (const adminId of selectedAdminIds) {
        const admin = adminUsers.find(a => a.id === adminId);
        if (!admin) continue;
        try {
          await supabase.functions.invoke("send-email", {
            body: {
              type: "roster_pdf",
              to: admin.email,
              adminName: admin.full_name || admin.email,
              weekLabel,
              pdfBase64,
              pdfFilename,
              businessName: business?.name,
              senderName: currentProfile?.full_name || currentProfile?.email || "Admin",
            },
          });
          sentCount++;
        } catch (err) {
          console.error(`Failed to email ${admin.email}:`, err);
        }
      }

      if (sentCount > 0) {
        toast({ title: "Roster sent!", description: `PDF roster emailed to ${sentCount} admin(s).` });
        await logAudit("roster_email_sent", {
          week_start: fmtDate(weekStart),
          recipients: selectedAdminIds.length,
        });
      } else {
        toast({ title: "Failed to send", description: "No emails were sent.", variant: "destructive" });
      }
      setEmailDialogOpen(false);
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    } finally {
      setSendingEmail(false);
    }
  };

  /* ── AI forecast handler ── */
  const handleAiForecast = async () => {
    if (!business) return;
    setForecasting(true);
    try {
      const { data, error } = await supabase.functions.invoke("ai-roster-forecast", {
        body: {
          business_id: business.id,
          week_start_date: fmtDate(weekStart),
          department_filter: departmentFilter,
          employees: filteredEmployees.map(e => ({
            id: e.id,
            name: e.name,
            department: e.department,
            job_title: e.job_title,
            pay_rate: e.pay_rate,
          })),
        },
      });
      if (error) throw error;
      if (data?.error) {
        toast({ title: "AI Forecast", description: data.error, variant: "destructive" });
        return;
      }
      // Insert all forecast shifts as drafts with source='ai_forecast'
      const forecast = data?.forecast || [];
      let insertCount = 0;
      for (const day of forecast) {
        for (const shift of day.shifts) {
          const actionDate = new Date(day.date + "T00:00:00");
          const dayIdx = (actionDate.getDay() + 6) % 7;
          const actionWeekStart = new Date(actionDate);
          actionWeekStart.setDate(actionDate.getDate() - dayIdx);
          const { error: insertErr } = await supabase.from("shifts").insert({
            employee_id: shift.employee_id,
            date: day.date,
            day_of_week: day.day_of_week,
            start_time: shift.start_time,
            end_time: shift.end_time,
            break_minutes: shift.break_minutes ?? 30,
            week_start_date: fmtDate(actionWeekStart),
            status: "draft",
            source: "ai_forecast",
          });
          if (!insertErr) insertCount++;
        }
      }
      await logAudit("ai_roster_forecast", { week: fmtDate(weekStart), shifts_created: insertCount, reasoning: forecast.map((d: any) => ({ date: d.date, reasoning: d.reasoning })) });
      fetchData();
      toast({
        title: "🤖 AI Forecast Complete",
        description: `Generated ${insertCount} draft shifts across ${forecast.length} event day(s). Review and adjust as needed.`,
      });
    } catch (err: any) {
      console.error("Forecast error:", err);
      toast({ title: "Forecast Error", description: err.message || "Failed to generate forecast", variant: "destructive" });
    } finally {
      setForecasting(false);
    }
  };

  /* ── Clear AI forecast shifts ── */
  const handleClearAiForecast = async () => {
    if (!business) return;
    const aiShifts = shifts.filter(s => (s as any).source === "ai_forecast");
    if (aiShifts.length === 0) {
      toast({ title: "No AI forecasts", description: "There are no AI forecast shifts to clear this week." });
      return;
    }
    try {
      const ids = aiShifts.map(s => s.id);
      const { error } = await supabase.from("shifts").delete().in("id", ids);
      if (error) throw error;
      await logAudit("ai_forecast_cleared", { week: fmtDate(weekStart), shifts_removed: ids.length });
      fetchData();
      toast({ title: "AI Forecast Cleared", description: `Removed ${ids.length} AI forecast shift(s).` });
    } catch (err: any) {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    }
  };

  /* ── realtime ── */
  useEffect(() => {
    const channel = supabase
      .channel("roster-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        fetchData();
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchData]);

  /* ── shift map: employeeId -> dayIndex -> shifts ── */
  const shiftMap = useMemo(() => {
    const map: Record<string, Record<number, Shift[]>> = {};
    for (const s of shifts) {
      if (!map[s.employee_id]) map[s.employee_id] = {};
      const dayIdx = weekDates.findIndex(d => fmtDate(d) === s.date);
      if (dayIdx >= 0) {
        if (!map[s.employee_id][dayIdx]) map[s.employee_id][dayIdx] = [];
        map[s.employee_id][dayIdx].push(s);
      }
    }
    return map;
  }, [shifts, weekDates]);

  /* ── weekly totals per employee ── */
  const weeklyTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    for (const s of shifts) {
      const hrs = s.hours_worked ?? calcNetHours(s.start_time, s.end_time, s.break_minutes);
      totals[s.employee_id] = (totals[s.employee_id] || 0) + hrs;
    }
    return totals;
  }, [shifts]);

  /* ── week status ── */
  const weekStatus = useMemo(() => {
    if (shifts.length === 0) return "empty";
    const allPublished = shifts.every(s => s.status === "published");
    const allDraft = shifts.every(s => s.status === "draft");
    if (allPublished) return "published";
    if (allDraft) return "draft";
    return "mixed";
  }, [shifts]);

  /* ── handlers ── */

  const openAddShift = (employeeId: string, dayIdx: number) => {
    const date = fmtDate(weekDates[dayIdx]);
    setEditingShift(null);
    setForm({
      ...EMPTY_SHIFT,
      employee_id: employeeId,
      date,
      day_of_week: FULL_DAYS[dayIdx],
    });
    setDialogOpen(true);
  };

  const openEditShift = (shift: Shift) => {
    setEditingShift(shift);
    setForm({
      employee_id: shift.employee_id,
      date: shift.date,
      day_of_week: shift.day_of_week,
      start_time: shift.start_time,
      end_time: shift.end_time,
      break_minutes: String(shift.break_minutes),
      notes: shift.notes || "",
    });
    setDialogOpen(true);
  };

  const handleSaveShift = async () => {
    if (saving) return;
    if (!form.start_time || !form.end_time) {
      toast({ title: "Missing times", description: "Start and end time are required.", variant: "destructive" });
      return;
    }
    await runAction(async () => {
      setSaving(true);
      try {
        const payload = {
          employee_id: form.employee_id,
          date: form.date,
          day_of_week: form.day_of_week,
          start_time: form.start_time,
          end_time: form.end_time,
          break_minutes: parseInt(form.break_minutes) || 0,
          notes: form.notes.trim() || null,
          week_start_date: fmtDate(weekStart),
          status: "draft" as const,
        };

        const dayName = form.day_of_week;
        const dayStr = form.date;
        const dayRequests = approvedRequests.filter(r => {
          if (r.employee_id !== form.employee_id) return false;
          if (r.is_recurring) {
            if (!(r.recurring_days || []).includes(dayName)) return false;
            if (r.recurring_start_date && dayStr < r.recurring_start_date) return false;
            if (r.recurring_end_date && dayStr > r.recurring_end_date) return false;
            return true;
          }
          if (r.start_date && r.end_date) return dayStr >= r.start_date && dayStr <= r.end_date;
          if (r.start_date) return dayStr === r.start_date;
          return false;
        });

        const overlappingReq = dayRequests.find(r => {
          if (isAllDayUnavailability(r)) return true;
          return timesOverlap(form.start_time, form.end_time, r.start_time, r.end_time);
        });

        if (overlappingReq) {
          const label = overlappingReq.request_type === "leave" ? "leave" : "unavailability";
          if (isAllDayUnavailability(overlappingReq)) {
            toast({ title: "Cannot roster", description: `This employee has an approved all-day ${label} on this date.`, variant: "destructive" });
            setSaving(false);
            return;
          } else {
            toast({
              title: "Shift overlaps unavailability",
              description: `This shift overlaps with approved ${label} (${formatTime12(overlappingReq.start_time)} – ${formatTime12(overlappingReq.end_time)}). Please adjust the shift times.`,
              variant: "destructive",
            });
            setSaving(false);
            return;
          }
        }

        if (editingShift) {
          const { error } = await supabase.from("shifts").update(payload).eq("id", editingShift.id);
          if (error) throw error;
          await logAudit("shift_edit", { shift_id: editingShift.id, ...payload });
          toast({ title: "Shift updated" });
        } else {
          const { error } = await supabase.from("shifts").insert(payload);
          if (error) throw error;
          await logAudit("shift_add", payload);
          toast({ title: "Shift added" });
        }
        setDialogOpen(false);
        fetchData();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    });
  };

  const handleDeleteShift = async (shiftId: string) => {
    await runAction(async () => {
      const shift = shifts.find(s => s.id === shiftId);
      const wasPublished = shift?.status === "published";

      const { error } = await supabase.from("shifts").delete().eq("id", shiftId);
      if (error) {
        toast({ title: "Error", description: error.message, variant: "destructive" });
      } else {
        await logAudit("shift_delete", { shift_id: shiftId, was_published: wasPublished });
        if (wasPublished) {
          toast({
            title: "Shift removed — please re-publish",
            description: "This was a published shift. Publish the week again to notify the employee of the change.",
            variant: "destructive",
          });
          const empId = shift.employee_id;
          const empPublishedIds = shifts
            .filter(s => s.employee_id === empId && s.status === "published" && s.id !== shiftId)
            .map(s => s.id);
          if (empPublishedIds.length > 0) {
            await supabase.from("shifts").update({ status: "draft" }).in("id", empPublishedIds);
          }
        } else {
          toast({ title: "Shift deleted" });
        }
        if (editingShift?.id === shiftId) setDialogOpen(false);
        fetchData();
      }
    });
  };

  const handlePublishWeek = async () => {
    const draftIds = shifts.filter(s => s.status === "draft").map(s => s.id);
    if (draftIds.length === 0) {
      toast({ title: "Nothing to publish", description: "All shifts are already published." });
      return;
    }
    await runAction(async () => {
      setPublishing(true);
      try {
        const draftShifts = shifts.filter(s => s.status === "draft");

        const { error } = await supabase.from("shifts").update({ status: "published" }).in("id", draftIds);
        if (error) throw error;
        await logAudit("roster_publish", { week_start: fmtDate(weekStart), count: draftIds.length });
        toast({ title: "Roster published", description: `${draftIds.length} shift(s) are now visible to employees.` });
        fetchData();

        const affectedEmployeeIds = [...new Set(draftShifts.map(s => s.employee_id))];
        if (business) {
          notifyEmployees({
            businessId: business.id,
            employeeIds: affectedEmployeeIds,
            type: "shift_change",
            title: "Roster Updated",
            message: `Your roster for the week of ${fmtDate(weekStart)} has been published.`,
            metadata: { week_start: fmtDate(weekStart) },
          });
        }

        sendRosterEmails(draftShifts);
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setPublishing(false);
      }
    });
  };

  const sendRosterEmails = async (changedShifts: Shift[]) => {
    // Group changed shifts by employee
    const byEmployee = new Map<string, Shift[]>();
    for (const s of changedShifts) {
      if (!byEmployee.has(s.employee_id)) byEmployee.set(s.employee_id, []);
      byEmployee.get(s.employee_id)!.push(s);
    }

    // Get all shifts for affected employees this week (so email shows full roster)
    const affectedEmployeeIds = Array.from(byEmployee.keys());
    const allShiftsThisWeek = shifts.filter(s => affectedEmployeeIds.includes(s.employee_id));

    // Group all shifts by employee
    const allByEmployee = new Map<string, Shift[]>();
    for (const s of allShiftsThisWeek) {
      if (!allByEmployee.has(s.employee_id)) allByEmployee.set(s.employee_id, []);
      allByEmployee.get(s.employee_id)!.push(s);
    }

    // Fetch day events for this week
    let dayEventsData: any[] = [];
    if (business) {
      const dates = weekDates.map(d => fmtDate(d));
      const { data } = await supabase.from("roster_day_events").select("*").eq("business_id", business.id).in("date", dates);
      dayEventsData = data || [];
    }

    const portalUrl = "https://omnexclock.lovable.app/portal";

    let sentCount = 0;
    for (const [empId, empShifts] of allByEmployee) {
      const emp = employees.find(e => e.id === empId);
      if (!emp?.email) continue;

      const shiftData = empShifts
        .sort((a, b) => a.date.localeCompare(b.date))
        .map(s => ({
          day: s.day_of_week,
          date: new Date(s.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
          start: formatTime12(s.start_time),
          end: formatTime12(s.end_time),
          breakMin: s.break_minutes,
          notes: s.notes || undefined,
        }));

      // Get events for dates this employee has shifts
      const empDates = new Set(empShifts.map(s => s.date));
      const empDayEvents = dayEventsData
        .filter(ev => empDates.has(ev.date))
        .map(ev => ({
          date: new Date(ev.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short" }),
          event_space: ev.event_space,
          event_type: ev.event_type,
          num_tables: ev.num_tables,
          chairs_per_table: ev.chairs_per_table,
          tablecloth_color: ev.tablecloth_color,
          cold_sparkles: ev.cold_sparkles,
          dry_ice: ev.dry_ice,
          red_carpet: ev.red_carpet,
          decor_access: ev.decor_access,
          notes: ev.notes,
        }));

      try {
        await supabase.functions.invoke("send-email", {
          body: {
            type: "roster_notification",
            to: emp.email,
            employeeName: emp.name,
            weekLabel: weekLabel,
            shifts: shiftData,
            dayEvents: empDayEvents,
            portalUrl,
            businessCode: business?.business_code,
          },
        });
        sentCount++;
      } catch (err) {
        console.error(`Failed to email ${emp.name}:`, err);
      }
    }

    if (sentCount > 0) {
      toast({ title: "Emails sent", description: `Roster notifications sent to ${sentCount} employee(s).` });
      await logAudit("roster_notification_emails_sent", { week_start: fmtDate(weekStart), employees_notified: sentCount });
    }
  };

  const handleCopyPrevWeek = async () => {
    const prevWeekStart = addDays(weekStart, -7);
    const { data: prevShifts } = await supabase
      .from("shifts")
      .select("*")
      .eq("week_start_date", fmtDate(prevWeekStart));

    if (!prevShifts || prevShifts.length === 0) {
      toast({ title: "No shifts found", description: "Previous week has no shifts to copy.", variant: "destructive" });
      return;
    }

    const newShifts = prevShifts.map(s => ({
      employee_id: s.employee_id,
      date: fmtDate(addDays(new Date(s.date), 7)),
      day_of_week: s.day_of_week,
      start_time: s.start_time,
      end_time: s.end_time,
      break_minutes: s.break_minutes,
      notes: s.notes,
      week_start_date: fmtDate(weekStart),
      status: "draft" as const,
    }));

    const { error } = await supabase.from("shifts").insert(newShifts);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      await logAudit("roster_copy_week", { from: fmtDate(prevWeekStart), to: fmtDate(weekStart), count: newShifts.length });
      toast({ title: "Copied!", description: `${newShifts.length} shift(s) copied as drafts.` });
      fetchData();
    }
  };

  const handleCopyShift = (shift: Shift) => {
    setCopiedShift(shift);
    toast({ title: "Shift copied", description: `${formatTime12(shift.start_time)} – ${formatTime12(shift.end_time)}. Click an empty cell to paste.` });
  };

  const handlePasteShift = async (employeeId: string, dayIdx: number) => {
    if (!copiedShift) return;
    const date = fmtDate(weekDates[dayIdx]);
    const dayOfWeek = FULL_DAYS[dayIdx];
    await runAction(async () => {
      setSaving(true);
      try {
        const payload = {
          employee_id: employeeId,
          date,
          day_of_week: dayOfWeek,
          start_time: copiedShift.start_time,
          end_time: copiedShift.end_time,
          break_minutes: copiedShift.break_minutes,
          notes: copiedShift.notes,
          week_start_date: fmtDate(weekStart),
          status: "draft" as const,
        };
        const { error } = await supabase.from("shifts").insert(payload);
        if (error) throw error;
        await logAudit("shift_paste", { from_shift_id: copiedShift.id, ...payload });
        toast({ title: "Shift pasted" });
        fetchData();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    });
  };

  const netHours = calcNetHours(form.start_time, form.end_time, parseInt(form.break_minutes) || 0);

  const hasAiShifts = shifts.some(s => (s as any).source === "ai_forecast");

  return (
    <div className="space-y-4">
      {/* ── Header Bar ── */}
      <div className="rounded-xl border border-border/60 bg-card/80 backdrop-blur-sm shadow-sm">
        {/* Row 1: Week Navigation + Status + Department */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 px-4 py-3">
          {/* Week Nav */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-0.5">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" onClick={() => setWeekStart(addDays(weekStart, -7))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="ghost" className="min-w-[170px] sm:min-w-[190px] justify-center gap-2 rounded-lg hover:bg-muted h-8 px-2 sm:px-3 font-semibold text-xs sm:text-sm">
                    <CalendarIcon className="h-3.5 w-3.5 text-primary" />
                    {weekLabel}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="center">
                  <Calendar
                    mode="single"
                    selected={undefined}
                    onSelect={(date) => {
                      if (date) setWeekStart(getMonday(date));
                    }}
                    modifiers={{
                      weekStart: weekStart,
                      weekEnd: addDays(weekStart, 6),
                      weekMid: { from: addDays(weekStart, 1), to: addDays(weekStart, 5) },
                    }}
                    modifiersClassNames={{
                      weekStart: "bg-primary/15 text-primary rounded-l-md rounded-r-none",
                      weekEnd: "bg-primary/15 text-primary rounded-r-md rounded-l-none",
                      weekMid: "bg-primary/10 text-primary rounded-none",
                    }}
                    className="p-3 pointer-events-auto"
                    weekStartsOn={1}
                  />
                </PopoverContent>
              </Popover>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full hover:bg-muted" onClick={() => setWeekStart(addDays(weekStart, 7))}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
            <Button variant="ghost" size="sm" onClick={() => setWeekStart(getMonday(new Date()))} className="text-xs text-muted-foreground hover:text-primary h-7 px-2">
              Today
            </Button>
            {/* Status Badge */}
            <Badge variant="outline" className={cn(
              "text-[10px] uppercase font-semibold tracking-wider px-2 py-0.5 rounded-full border whitespace-nowrap shrink-0",
              weekStatus === "published" ? "border-green-500/40 text-green-500 bg-green-500/10" :
              weekStatus === "draft" ? "border-yellow-500/40 text-yellow-500 bg-yellow-500/10" :
              weekStatus === "mixed" ? "border-primary/40 text-primary bg-primary/10" :
              "border-border text-muted-foreground bg-muted/50"
            )}>
              {weekStatus === "empty" ? "No shifts" : weekStatus}
            </Badge>
          </div>

          {/* Department Filter */}
          <div className="flex items-center gap-2">
            {departments.length > 0 && (
              <Select
                value={lockedDepartment || departmentFilter}
                onValueChange={setDepartmentFilter}
                disabled={!!lockedDepartment}
              >
                <SelectTrigger className="h-8 w-[170px] rounded-lg text-xs border-border/60">
                  <SelectValue placeholder="All Departments" />
                </SelectTrigger>
                <SelectContent>
                  {!lockedDepartment && <SelectItem value="all">All Departments</SelectItem>}
                  {(lockedDepartment ? rosterDepts : departments).map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* Row 2: Actions — only for non-viewers */}
        {!isViewer && (
          <div className="flex items-center gap-2 flex-wrap px-4 py-2.5 border-t border-border/40 bg-muted/20">
            {/* Clipboard indicator */}
            {copiedShift && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-primary/30 bg-primary/10 text-[11px] text-primary animate-in fade-in duration-200">
                <Clipboard className="h-3 w-3" />
                <span className="font-semibold">{formatTime12(copiedShift.start_time)} – {formatTime12(copiedShift.end_time)}</span>
                <button onClick={() => setCopiedShift(null)} className="ml-1 hover:text-destructive transition-colors rounded-full p-0.5 hover:bg-destructive/10">
                  <X className="h-2.5 w-2.5" />
                </button>
              </div>
            )}

            {/* AI Tools group */}
            {isSuperAdminOf(currentBusinessId) && (
              <div className="flex items-center gap-1.5">
                <RosterVoiceCommand
                  employees={filteredEmployees}
                  weekDates={FULL_DAYS.map((dayName, i) => ({ dayName, date: fmtDate(weekDates[i]) }))}
                  weekStartDate={fmtDate(weekStart)}
                  onInsertShift={async (action) => {
                    const actionDate = new Date(action.date + "T00:00:00");
                    const dayIdx = (actionDate.getDay() + 6) % 7;
                    const actionWeekStart = new Date(actionDate);
                    actionWeekStart.setDate(actionDate.getDate() - dayIdx);
                    const payload = {
                      employee_id: action.employee_id!,
                      date: action.date,
                      day_of_week: action.day_of_week,
                      start_time: action.start_time,
                      end_time: action.end_time,
                      break_minutes: action.break_minutes ?? 30,
                      notes: action.notes || null,
                      week_start_date: fmtDate(actionWeekStart),
                      status: "draft" as const,
                    };
                    const { error } = await supabase.from("shifts").insert(payload);
                    if (error) throw error;
                    await logAudit("shift_add_voice", payload);
                    fetchData();
                  }}
                />
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 rounded-lg border-cyan-500/30 text-cyan-400 hover:bg-cyan-500/10 hover:border-cyan-500/50 text-xs"
                  onClick={handleAiForecast}
                  disabled={forecasting || loading}
                >
                  <BrainCircuit className="mr-1.5 h-3.5 w-3.5" />
                  {forecasting ? "Forecasting..." : "AI Forecast"}
                </Button>
                {hasAiShifts && (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 rounded-lg text-red-400 hover:bg-red-500/10 text-xs"
                    onClick={handleClearAiForecast}
                  >
                    <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Clear AI
                  </Button>
                )}
              </div>
            )}

            {/* Separator */}
            {isSuperAdminOf(currentBusinessId) && (
              <div className="h-5 w-px bg-border/60 mx-1 hidden sm:block" />
            )}

            {/* Roster actions */}
            <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" onClick={handleCopyPrevWeek} disabled={loading}>
              <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy Last Week
            </Button>

            <div className="h-5 w-px bg-border/60 mx-1 hidden sm:block" />

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8 rounded-lg text-xs" disabled={shifts.length === 0}>
                  <FileDown className="mr-1.5 h-3.5 w-3.5" /> Export
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={handleDownloadPDF}>
                  <Download className="mr-2 h-4 w-4" /> Download PDF
                </DropdownMenuItem>
                <DropdownMenuItem onClick={openEmailDialog}>
                  <Mail className="mr-2 h-4 w-4" /> Email PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>

            {/* Publish — placed last to prevent accidental touch on mobile */}
            <Button size="sm" className="h-8 rounded-lg text-xs font-semibold" onClick={() => setShowPublishConfirm(true)} disabled={publishing || weekStatus === "published" || weekStatus === "empty"}>
              <Send className="mr-1.5 h-3.5 w-3.5" /> {publishing ? "Publishing..." : "Publish Week"}
            </Button>
          </div>
        )}

        {/* Color Legend — inline within the header */}
        {hasAiShifts && (
          <div className="flex items-center gap-5 text-[10px] px-4 py-2 border-t border-border/30 bg-muted/10">
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm border border-cyan-500/40 bg-cyan-500/20" />
              <span className="text-cyan-400 font-medium flex items-center gap-1"><Sparkles className="h-2.5 w-2.5" /> AI Forecast</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm border border-border/60 bg-muted/80 border-dashed" />
              <span className="text-muted-foreground font-medium">Manual Draft</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="inline-block h-2 w-2 rounded-sm border border-primary/25 bg-primary/15" />
              <span className="text-primary font-medium">Published</span>
            </div>
          </div>
        )}
      </div>

      {/* Day Events Panel - PRP only */}
      {business?.business_code === "PRP" && (
        <Card className="overflow-hidden border-border/60 shadow-sm">
          <CardContent className="p-0">
            <Collapsible defaultOpen={false}>
              <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2.5 hover:bg-muted/50 transition-colors cursor-pointer">
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Daily Event Setup</span>
                <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
              </CollapsibleTrigger>
              <CollapsibleContent className="px-3 pb-3">
                <RosterDayEvents weekDates={weekDates} fmtDate={fmtDate} />
              </CollapsibleContent>
            </Collapsible>
          </CardContent>
        </Card>
      )}

      {/* Grid */}
      <Card className="overflow-hidden border-border/60 shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto scrollbar-hide">
            <table className="w-full text-sm" style={{ minWidth: '1070px' }}>
              <thead className="sticky top-0 z-10">
                <tr className="border-b-2 border-border/80 bg-card">
                  <th className="text-left px-3 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wider w-[160px] min-w-[160px] sticky left-0 bg-card z-20 border-r border-border/60">Employee</th>
                  {weekDates.map((d, i) => {
                    const isToday = fmtDate(d) === fmtDate(new Date());
                    return (
                      <th key={i} className={`text-center px-2 py-3 min-w-[120px] ${isToday ? "bg-primary/5" : ""}`}>
                        <div className={`text-xs font-semibold uppercase tracking-wide ${isToday ? "text-primary" : "text-muted-foreground"}`}>{DAYS[i]}</div>
                        <div className={`text-[11px] mt-0.5 ${isToday ? "text-primary font-medium" : "text-muted-foreground/60"}`}>
                          {toAusFormatted(d, { day: "numeric", month: "short" })}
                        </div>
                      </th>
                    );
                  })}
                  <th className="text-center px-3 py-3 text-muted-foreground font-semibold text-xs uppercase tracking-wider w-[70px]">Total</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <Clock className="h-5 w-5 animate-spin mx-auto mb-2" />
                      Loading roster...
                    </td>
                  </tr>
                ) : filteredEmployees.length === 0 ? (
                  <tr>
                    <td colSpan={9} className="text-center py-12 text-muted-foreground">
                      <AlertCircle className="h-5 w-5 mx-auto mb-2" />
                      {employees.length === 0 ? "No active employees. Add employees first." : "No employees in this department."}
                    </td>
                  </tr>
                ) : (
                  filteredEmployees.map(emp => (
                    <tr key={emp.id} className="border-b border-border/50 hover:bg-secondary/20 transition-colors group/row">
                      <td className="px-3 py-2.5 sticky left-0 bg-card z-20 border-r border-border/60">
                        <div className="font-medium text-foreground truncate text-[13px]">{emp.name}</div>
                        <div className="text-[11px] text-muted-foreground/70">{emp.job_title || emp.department || emp.employee_code}</div>
                      </td>
                      {weekDates.map((wd, dayIdx) => {
                        const dayShifts = shiftMap[emp.id]?.[dayIdx] || [];
                        const isToday = fmtDate(wd) === fmtDate(new Date());
                        const dayStr = fmtDate(wd);
                        const dayName = FULL_DAYS[dayIdx];
                        const dayRequests = approvedRequests.filter(r => {
                          if (r.employee_id !== emp.id) return false;
                          if (r.is_recurring) {
                            if (!(r.recurring_days || []).includes(dayName)) return false;
                            if (r.recurring_start_date && dayStr < r.recurring_start_date) return false;
                            if (r.recurring_end_date && dayStr > r.recurring_end_date) return false;
                            return true;
                          }
                          if (r.start_date && r.end_date) return dayStr >= r.start_date && dayStr <= r.end_date;
                          if (r.start_date) return dayStr === r.start_date;
                          return false;
                        });
                        return (
                          <td key={dayIdx} className={`px-1.5 py-1.5 align-top ${isToday ? "bg-primary/[0.03]" : ""}`}>
                            <div className="space-y-1.5 min-h-[52px]">
                              {dayRequests.map(req => (
                                <div key={req.id} className={`w-full rounded-lg px-2 py-1.5 text-[10px] border ${req.request_type === "leave" ? "bg-destructive/10 text-destructive border-destructive/20" : "bg-warning/10 text-warning border-warning/20"}`}>
                                  <CalendarOff className="h-2.5 w-2.5 inline mr-0.5" />
                                  {req.request_type === "leave" ? "Leave" : "Unavailable"}
                                  {req.start_time && req.end_time && (
                                    <div className="text-[9px] opacity-80 mt-0.5">{formatTime12(req.start_time)} – {formatTime12(req.end_time)}</div>
                                  )}
                                </div>
                              ))}
                              {dayShifts.map(shift => (
                                <div key={shift.id} className="relative group">
                                  <button
                                    onClick={() => !isViewer && openEditShift(shift)}
                                    disabled={isViewer}
                                    className={`w-full rounded-lg px-2 py-2 text-left text-xs transition-all ${
                                      isViewer ? "cursor-default" : "cursor-pointer"
                                    } ${
                                      shift.status === "published"
                                        ? "bg-primary/15 text-primary hover:bg-primary/25 border border-primary/25 shadow-sm shadow-primary/5"
                                        : (shift as any).source === "ai_forecast"
                                        ? "bg-cyan-500/15 text-cyan-400 hover:bg-cyan-500/25 border border-cyan-500/30 border-dashed"
                                        : "bg-muted/80 text-muted-foreground hover:bg-muted border border-border/60 border-dashed"
                                    }`}
                                  >
                                    <div className="flex items-center gap-1">
                                      {(shift as any).source === "ai_forecast" && <Sparkles className="h-2.5 w-2.5 text-cyan-400 flex-shrink-0" />}
                                      <span className="font-semibold text-[11px] leading-tight">{formatTime12(shift.start_time)} – {formatTime12(shift.end_time)}</span>
                                    </div>
                                    <div className="text-[10px] opacity-60 mt-0.5">
                                      {(shift.hours_worked ?? calcNetHours(shift.start_time, shift.end_time, shift.break_minutes)).toFixed(2)}h
                                      {shift.break_minutes > 0 && ` · ${shift.break_minutes}m brk`}
                                    </div>
                                  </button>
                                  {!isViewer && (
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          onClick={(e) => { e.stopPropagation(); handleCopyShift(shift); }}
                                          className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-card border border-border/80 shadow-md flex items-center justify-center opacity-0 group-hover:opacity-100 transition-all hover:bg-primary hover:text-primary-foreground hover:border-primary hover:scale-110"
                                        >
                                          <Clipboard className="h-2.5 w-2.5" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent side="top" className="text-xs">Copy shift</TooltipContent>
                                    </Tooltip>
                                  )}
                                </div>
                              ))}
                              {(() => {
                                if (isViewer) return null;
                                const hasAllDayBlock = dayRequests.some(r => isAllDayUnavailability(r));
                                const hasPartialUnavailability = dayRequests.some(r => !isAllDayUnavailability(r));
                                if (hasAllDayBlock) return null;
                                if (dayShifts.length > 0 && !hasPartialUnavailability && !copiedShift) return null;
                                return (
                                  <div className="flex gap-1">
                                    <button
                                      onClick={() => openAddShift(emp.id, dayIdx)}
                                      className="flex-1 rounded-lg border border-dashed border-border/50 hover:border-primary/50 hover:bg-primary/5 text-muted-foreground/50 hover:text-primary text-xs py-2 transition-all flex items-center justify-center gap-1"
                                    >
                                      <Plus className="h-3 w-3" />
                                    </button>
                                    {copiedShift && (dayShifts.length === 0 || hasPartialUnavailability) && (
                                      <Tooltip>
                                        <TooltipTrigger asChild>
                                          <button
                                            onClick={() => handlePasteShift(emp.id, dayIdx)}
                                            className="rounded-lg border border-dashed border-primary/40 bg-primary/5 hover:bg-primary/15 text-primary text-xs py-2 px-2.5 transition-all flex items-center justify-center gap-1 hover:scale-105"
                                          >
                                            <ClipboardPaste className="h-3 w-3" />
                                          </button>
                                        </TooltipTrigger>
                                        <TooltipContent side="top" className="text-xs">
                                          Paste {formatTime12(copiedShift.start_time)} – {formatTime12(copiedShift.end_time)}
                                        </TooltipContent>
                                      </Tooltip>
                                    )}
                                  </div>
                                );
                              })()}
                            </div>
                          </td>
                        );
                      })}
                      <td className="px-3 py-2.5 text-center">
                        <span className="font-mono font-bold text-foreground text-[13px]">
                          {(weeklyTotals[emp.id] || 0).toFixed(2)}
                        </span>
                        <span className="text-[11px] text-muted-foreground/60 ml-0.5">h</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Shift Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg">{editingShift ? "Edit Shift" : "Add Shift"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            {/* Employee (read-only in context) */}
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Employee</Label>
              <p className="font-medium text-foreground">{employees.find(e => e.id === form.employee_id)?.name || "—"}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Day</Label>
              <p className="font-medium text-foreground">
                {form.day_of_week} — {new Date(form.date + "T00:00:00").toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
              </p>
            </div>

            {/* Unavailability warning for this day */}
            {(() => {
              const dayReqs = approvedRequests.filter(r => {
                if (r.employee_id !== form.employee_id) return false;
                if (r.is_recurring) {
                  if (!(r.recurring_days || []).includes(form.day_of_week)) return false;
                  if (r.recurring_start_date && form.date < r.recurring_start_date) return false;
                  if (r.recurring_end_date && form.date > r.recurring_end_date) return false;
                  return true;
                }
                if (r.start_date && r.end_date) return form.date >= r.start_date && form.date <= r.end_date;
                if (r.start_date) return form.date === r.start_date;
                return false;
              });
              if (dayReqs.length === 0) return null;
              return dayReqs.map(r => (
                <div key={r.id} className="flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-warning">
                  <AlertCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                  <div>
                    <span className="font-medium">
                      {r.request_type === "leave" ? "Leave" : "Unavailable"}
                      {r.start_time && r.end_time
                        ? `: ${formatTime12(r.start_time)} – ${formatTime12(r.end_time)}`
                        : " (all day)"}
                    </span>
                    <div className="text-[10px] opacity-80 mt-0.5">
                      {r.start_time && r.end_time
                        ? "Schedule outside these hours only."
                        : "Cannot roster on this day."}
                    </div>
                  </div>
                </div>
              ));
            })()}

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Time</Label>
                <TimeDropdownPicker value={form.start_time} onChange={v => setForm({ ...form, start_time: v })} />
              </div>
              <div className="space-y-2">
                <Label>End Time</Label>
                <TimeDropdownPicker value={form.end_time} onChange={v => setForm({ ...form, end_time: v })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Break (minutes)</Label>
              <Select value={form.break_minutes} onValueChange={v => setForm({ ...form, break_minutes: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["0", "15", "30", "45", "60"].map(m => (
                    <SelectItem key={m} value={m}>{m} min</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Notes</Label>
              <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Optional notes..." maxLength={200} />
            </div>

            {/* Net hours preview */}
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Net hours:</span>
              <span className="font-mono font-semibold text-foreground">{netHours.toFixed(2)}h</span>
            </div>

            <div className="flex justify-between pt-2">
              {editingShift ? (
                <Button variant="destructive" size="sm" onClick={() => handleDeleteShift(editingShift.id)}>
                  <Trash2 className="mr-1.5 h-3.5 w-3.5" /> Delete
                </Button>
              ) : <div />}
              <Button onClick={handleSaveShift} disabled={saving}>
                {saving ? "Saving..." : editingShift ? "Update Shift" : "Add Shift"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Email Roster Dialog */}
      <Dialog open={emailDialogOpen} onOpenChange={setEmailDialogOpen}>
        <DialogContent className="sm:max-w-md rounded-xl">
          <DialogHeader>
            <DialogTitle className="text-lg flex items-center gap-2">
              <Mail className="h-5 w-5 text-primary" /> Email Roster as PDF
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">Week</Label>
              <p className="font-medium text-foreground text-sm">{weekLabel}</p>
            </div>
            <div className="space-y-1">
              <Label className="text-xs text-muted-foreground">
                {departmentFilter !== "all" ? `Showing: ${departmentFilter} department` : "All departments"}
              </Label>
              <p className="text-xs text-muted-foreground">{filteredEmployees.length} employee(s) · {shifts.length} shift(s)</p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-medium">Select Recipients</Label>
              {adminUsers.length === 0 ? (
                <p className="text-xs text-muted-foreground">No admin users found for this business.</p>
              ) : (
                <div className="space-y-2 max-h-[200px] overflow-y-auto rounded-lg border border-border/60 p-2">
                  {adminUsers.map(admin => (
                    <label key={admin.id} className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-secondary/50 cursor-pointer transition-colors">
                      <Checkbox
                        checked={selectedAdminIds.includes(admin.id)}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            setSelectedAdminIds(prev => [...prev, admin.id]);
                          } else {
                            setSelectedAdminIds(prev => prev.filter(id => id !== admin.id));
                          }
                        }}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-foreground truncate">{admin.full_name || admin.email}</p>
                        <p className="text-[11px] text-muted-foreground truncate">{admin.email}</p>
                      </div>
                      <Badge variant="outline" className="text-[10px] capitalize shrink-0">
                        {admin.role.replace("_", " ")}
                      </Badge>
                    </label>
                  ))}
                </div>
              )}
              {adminUsers.length > 0 && (
                <div className="flex gap-2 text-[10px]">
                  <button
                    className="text-primary hover:underline"
                    onClick={() => setSelectedAdminIds(adminUsers.map(a => a.id))}
                  >
                    Select All
                  </button>
                  <span className="text-muted-foreground">·</span>
                  <button
                    className="text-muted-foreground hover:underline"
                    onClick={() => setSelectedAdminIds([])}
                  >
                    Clear
                  </button>
                </div>
              )}
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleSendRosterEmail} disabled={sendingEmail || selectedAdminIds.length === 0}>
              <Mail className="mr-1.5 h-3.5 w-3.5" />
              {sendingEmail ? "Sending..." : `Send to ${selectedAdminIds.length} admin(s)`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      {/* Publish Confirmation */}
      <AlertDialog open={showPublishConfirm} onOpenChange={setShowPublishConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Publish this week's roster?</AlertDialogTitle>
            <AlertDialogDescription>
              This will notify all employees of their published shifts. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setShowPublishConfirm(false); handlePublishWeek(); }}>
              Publish
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
