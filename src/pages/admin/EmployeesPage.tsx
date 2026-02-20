import { useEffect, useState, useMemo } from "react";
import { useActionLock } from "@/contexts/ActionLockContext";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useBusiness } from "@/contexts/BusinessContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, UserX, UserCheck, Search, ChevronRight, ChevronLeft, Check, Trash2, ListFilter } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { logAudit } from "@/lib/auditLog";

type Employee = Tables<"employees">;

interface EmployeeForm {
  name: string;
  email: string;
  phone: string;
  job_title: string;
  department: string;
  pay_rate: string;
  admin_hourly_rate: string;
  employee_code: string;
}

const EMPTY_FORM: EmployeeForm = {
  name: "", email: "", phone: "", job_title: "", department: "",
  pay_rate: "", admin_hourly_rate: "", employee_code: "",
};

const STEPS = ["Personal Details", "Payroll Setup", "System Access"];

function generateEmployeeCode(existing: string[]): string {
  for (let i = 1; i <= 9999; i++) {
    const code = String(i).padStart(4, "0");
    if (!existing.includes(code)) return code;
  }
  return String(Date.now()).slice(-4);
}

export default function EmployeesPage() {
  const { runAction } = useActionLock();
  const { isViewer, isSuperAdminOf, isAdminOf } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState<string>("all");
  const [jobTitleFilter, setJobTitleFilter] = useState<string>("all");
  const [groupBy, setGroupBy] = useState<"none" | "department" | "job_title">("none");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [deleteTarget, setDeleteTarget] = useState<Employee | null>(null);
  const [deleting, setDeleting] = useState(false);
  

  const isSuperAdmin = business ? isSuperAdminOf(business.id) : false;
  const isAdminOnly = business ? isAdminOf(business.id) && !isSuperAdmin : false;
  const canEditEmployees = isSuperAdmin; // Only super admin can add/edit/toggle employees

  const fetchEmployees = async () => {
    if (!business) return;
    const { data } = await supabase.from("employees").select("*").eq("business_id", business.id).order("name");
    setEmployees(data || []);
  };

  useEffect(() => { fetchEmployees(); }, [business]);

  const validateStep = (s: number): boolean => {
    if (s === 0) {
      const trimmedName = form.name.trim();
      if (!trimmedName || trimmedName.length > 100) {
        toast({ title: "Validation Error", description: "Name must be 1-100 characters.", variant: "destructive" });
        return false;
      }
      if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) {
        toast({ title: "Validation Error", description: "Please enter a valid email address.", variant: "destructive" });
        return false;
      }
      if (form.phone && !/^[0-9+\-() ]{0,20}$/.test(form.phone.trim())) {
        toast({ title: "Validation Error", description: "Phone number is invalid.", variant: "destructive" });
        return false;
      }
    }
    if (s === 1) {
      const payRate = parseFloat(form.pay_rate) || 0;
      const adminRate = parseFloat(form.admin_hourly_rate) || 0;
      if (payRate < 0 || payRate > 10000) {
        toast({ title: "Validation Error", description: "Employee pay rate must be $0–$10,000/hr.", variant: "destructive" });
        return false;
      }
      if (adminRate < 0 || adminRate > 10000) {
        toast({ title: "Validation Error", description: "Admin hourly rate must be $0–$10,000/hr.", variant: "destructive" });
        return false;
      }
    }
    if (s === 2) {
      const trimmedCode = form.employee_code.trim();
      if (!/^\d{4}$/.test(trimmedCode)) {
        toast({ title: "Validation Error", description: "Employee code must be exactly 4 digits.", variant: "destructive" });
        return false;
      }
      const duplicate = employees.find(
        e => e.employee_code === trimmedCode && e.id !== editing?.id
      );
      if (duplicate) {
        toast({ title: "Validation Error", description: "This employee code is already in use.", variant: "destructive" });
        return false;
      }
    }
    return true;
  };

  const handleNext = () => {
    if (validateStep(step)) setStep(s => s + 1);
  };

  const handleSave = async () => {
    if (saving || !validateStep(2)) return;
    await runAction(async () => {
      setSaving(true);
      try {
        const payload = {
          name: form.name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          job_title: form.job_title.trim() || null,
          department: form.department.trim() || null,
          pay_rate: parseFloat(form.pay_rate) || 0,
          admin_hourly_rate: parseFloat(form.admin_hourly_rate) || 0,
          employee_code: form.employee_code.trim(),
          business_id: business?.id || null,
        };

        if (editing) {
          const { error } = await supabase.from("employees").update(payload).eq("id", editing.id);
          if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
          await logAudit("employee_edit", { employee_id: editing.id, ...payload });
          toast({ title: "Employee updated" });
        } else {
          const { data, error } = await supabase.from("employees").insert(payload).select("id").single();
          if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
          await logAudit("employee_add", { employee_id: data?.id, ...payload });
          toast({ title: "Employee added", description: `Code: ${payload.employee_code}` });

          // Auto-send induction email if employee has email
          if (payload.email && business) {
            supabase.functions.invoke("send-email", {
              body: {
                type: "employee_induction",
                to: payload.email,
                employeeName: payload.name,
                employeeCode: payload.employee_code,
                jobTitle: payload.job_title || "Team Member",
                department: payload.department || "General",
                businessName: business.name,
                businessCode: business.business_code,
                portalUrl: "https://omnexclock.lovable.app/portal",
              },
            }).then(async () => {
              await logAudit("induction_email_sent", { employee_id: data?.id, employee_name: payload.name, email: payload.email });
              toast({ title: "Induction email sent", description: `Welcome packet sent to ${payload.email}` });
            }).catch(() => {});
          }
        }
        setDialogOpen(false);
        setEditing(null);
        setForm(EMPTY_FORM);
        setStep(0);
        fetchEmployees();
      } finally {
        setSaving(false);
      }
    });
  };

  const toggleActive = async (emp: Employee) => {
    if (togglingIds.has(emp.id)) return;
    await runAction(async () => {
      setTogglingIds(prev => new Set(prev).add(emp.id));
      try {
        const newActive = !emp.active;
        await supabase.from("employees").update({ active: newActive }).eq("id", emp.id);
        await logAudit(newActive ? "employee_activate" : "employee_deactivate", { employee_id: emp.id, name: emp.name });
        fetchEmployees();
      } finally {
        setTogglingIds(prev => { const s = new Set(prev); s.delete(emp.id); return s; });
      }
    });
  };

  const handleDeleteEmployee = async () => {
    if (!deleteTarget || deleting) return;
    await runAction(async () => {
      setDeleting(true);
      try {
        // Use server-side RPC for atomic employee deletion with cascade
        const { data, error } = await supabase.rpc("delete_employee", {
          _employee_id: deleteTarget.id,
        });
        if (error) throw error;
        if (!data) throw new Error("Failed to delete employee - permission denied or not found");

        toast({ title: "Employee deleted", description: `${deleteTarget.name} has been permanently removed.` });
        setDeleteTarget(null);
        fetchEmployees();
      } catch (err: any) {
        toast({ title: "Error deleting employee", description: err.message, variant: "destructive" });
      } finally {
        setDeleting(false);
      }
    });
  };


  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({
      name: emp.name,
      email: emp.email || "",
      phone: emp.phone || "",
      job_title: emp.job_title || "",
      department: emp.department || "",
      pay_rate: emp.pay_rate.toString(),
      admin_hourly_rate: emp.admin_hourly_rate.toString(),
      employee_code: emp.employee_code,
    });
    setStep(0);
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    const existingCodes = employees.map(e => e.employee_code);
    setForm({ ...EMPTY_FORM, employee_code: generateEmployeeCode(existingCodes) });
    setStep(0);
    setDialogOpen(true);
  };

  const departments = useMemo(() => 
    [...new Set(employees.map(e => e.department).filter(Boolean))].sort() as string[], [employees]);
  const jobTitles = useMemo(() => 
    [...new Set(employees.map(e => e.job_title).filter(Boolean))].sort() as string[], [employees]);

  const filtered = employees.filter((e) => {
    const matchesSearch = e.name.toLowerCase().includes(search.toLowerCase()) ||
      e.employee_code.toLowerCase().includes(search.toLowerCase()) ||
      (e.department || "").toLowerCase().includes(search.toLowerCase()) ||
      (e.job_title || "").toLowerCase().includes(search.toLowerCase());
    const matchesDept = departmentFilter === "all" || e.department === departmentFilter;
    const matchesTitle = jobTitleFilter === "all" || e.job_title === jobTitleFilter;
    return matchesSearch && matchesDept && matchesTitle;
  });

  const groupedEmployees = useMemo(() => {
    if (groupBy === "none") return null;
    const groups: Record<string, Employee[]> = {};
    for (const emp of filtered) {
      const key = (groupBy === "department" ? emp.department : emp.job_title) || "Unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(emp);
    }
    return Object.entries(groups).sort(([a], [b]) => a.localeCompare(b));
  }, [filtered, groupBy]);

  const renderEmployeeRow = (emp: Employee) => (
    <TableRow key={emp.id} className="border-border/20 hover:bg-secondary/30 transition-colors">
      <TableCell className="font-medium sticky left-0 bg-card z-20 border-r border-border/60">
        <div>
          {emp.name}
          {emp.email && <p className="text-[11px] text-muted-foreground mt-0.5">{emp.email}</p>}
        </div>
      </TableCell>
      <TableCell className="font-mono text-sm">{emp.employee_code}</TableCell>
      <TableCell className="text-sm">{emp.department || "—"}</TableCell>
      <TableCell className="text-sm">{emp.job_title || "—"}</TableCell>
      <TableCell className="text-sm tabular-nums">${emp.pay_rate}/hr</TableCell>
      <TableCell className="text-sm tabular-nums">${emp.admin_hourly_rate}/hr</TableCell>
      <TableCell>
        <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${emp.active ? "bg-success/15 text-success" : "bg-destructive/15 text-destructive"}`}>
          {emp.active ? "Active" : "Inactive"}
        </span>
      </TableCell>
      <TableCell className="text-right space-x-1">
        {!canEditEmployees ? (
          <span className="text-xs text-muted-foreground">View only</span>
        ) : (
          <div className="flex items-center justify-end gap-0.5">
            <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} disabled={saving} title="Edit" className="h-8 w-8">
              <Pencil className="h-3.5 w-3.5" />
            </Button>
            <Button variant="ghost" size="icon" onClick={() => toggleActive(emp)} disabled={togglingIds.has(emp.id)} title={emp.active ? "Deactivate" : "Activate"} className="h-8 w-8">
              {emp.active ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}
            </Button>
            {isSuperAdmin && (
              <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(emp)} className="text-destructive hover:text-destructive hover:bg-destructive/10 h-8 w-8" title="Delete permanently">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            )}
          </div>
        )}
      </TableCell>
    </TableRow>
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row gap-3 justify-between">
          <div className="relative flex-1 max-w-sm input-glow rounded-lg">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Search by name, code, department, or title..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
          <Button onClick={openAdd} disabled={!canEditEmployees} className="btn-press"><Plus className="mr-2 h-4 w-4" /> Add Employee</Button>
        </div>
        {/* Filters row */}
        <div className="flex flex-wrap items-center gap-2">
          {departments.length > 0 && (
            <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
              <SelectTrigger className="h-8 w-[160px] rounded-lg text-xs border-border/60">
                <SelectValue placeholder="All Departments" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Departments</SelectItem>
                {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          {jobTitles.length > 0 && (
            <Select value={jobTitleFilter} onValueChange={setJobTitleFilter}>
              <SelectTrigger className="h-8 w-[160px] rounded-lg text-xs border-border/60">
                <SelectValue placeholder="All Job Titles" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Job Titles</SelectItem>
                {jobTitles.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as any)}>
            <SelectTrigger className="h-8 w-[150px] rounded-lg text-xs border-border/60">
              <ListFilter className="h-3 w-3 mr-1.5" />
              <SelectValue placeholder="Group by..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">No Grouping</SelectItem>
              <SelectItem value="department">Group by Department</SelectItem>
              <SelectItem value="job_title">Group by Job Title</SelectItem>
            </SelectContent>
          </Select>
          {(departmentFilter !== "all" || jobTitleFilter !== "all") && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-muted-foreground" onClick={() => { setDepartmentFilter("all"); setJobTitleFilter("all"); }}>
              Clear filters
            </Button>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</span>
        </div>
      </div>

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setStep(0); setEditing(null); } }}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Edit Employee" : "Onboard New Employee"}</DialogTitle>
          </DialogHeader>

          {/* Step Indicators */}
          <div className="flex items-center gap-2 mb-2">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center gap-2 flex-1">
                <button
                  onClick={() => { if (i < step) setStep(i); }}
                  className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold border-2 transition-colors ${
                    i < step
                      ? "bg-primary text-primary-foreground border-primary cursor-pointer"
                      : i === step
                      ? "border-primary text-primary bg-transparent"
                      : "border-muted text-muted-foreground bg-transparent"
                  }`}
                >
                  {i < step ? <Check className="h-3.5 w-3.5" /> : i + 1}
                </button>
                <span className={`text-xs hidden sm:inline ${i === step ? "text-foreground font-medium" : "text-muted-foreground"}`}>{label}</span>
                {i < STEPS.length - 1 && <div className="flex-1 h-px bg-border" />}
              </div>
            ))}
          </div>

          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Full Name *</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" maxLength={100} />
              </div>
              <div className="space-y-2">
                <Label>Email Address</Label>
                <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="john@example.com" />
              </div>
              <div className="space-y-2">
                <Label>Phone Number</Label>
                <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/[^0-9+\-() ]/g, "").slice(0, 20) })} placeholder="+61 400 000 000" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-2">
                  <Label>Job Title</Label>
                  <Input value={form.job_title} onChange={(e) => setForm({ ...form, job_title: e.target.value })} placeholder="Barista" maxLength={50} />
                </div>
                <div className="space-y-2">
                  <Label>Department</Label>
                  <Input value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} placeholder="Kitchen" maxLength={50} />
                </div>
              </div>
              <div className="flex justify-end">
                <Button onClick={handleNext}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Employee Hourly Rate ($/hr)</Label>
                <p className="text-xs text-muted-foreground">Flat rate paid directly to the employee — no GST.</p>
                <Input type="number" step="0.01" min="0" max="10000" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} placeholder="25.00" />
              </div>
              <div className="space-y-2">
                <Label>Admin Hourly Rate ($/hr)</Label>
                <p className="text-xs text-muted-foreground">Internal rate for admin payroll — GST inclusive.</p>
                <Input type="number" step="0.01" min="0" max="10000" value={form.admin_hourly_rate} onChange={(e) => setForm({ ...form, admin_hourly_rate: e.target.value })} placeholder="35.00" />
              </div>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(0)}><ChevronLeft className="mr-1 h-4 w-4" /> Back</Button>
                <Button onClick={handleNext}>Next <ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Employee Code *</Label>
                <p className="text-xs text-muted-foreground">4-digit code used for kiosk access and employee portal.</p>
                <div className="flex gap-2">
                  <Input
                    value={form.employee_code}
                    onChange={(e) => setForm({ ...form, employee_code: e.target.value.replace(/[^0-9]/g, "").slice(0, 4) })}
                    placeholder="0001"
                    maxLength={4}
                    className="font-mono text-lg tracking-wider"
                  />
                  {!editing && (
                    <Button
                      variant="outline"
                      type="button"
                      onClick={() => {
                        const existingCodes = employees.map(e => e.employee_code);
                        setForm({ ...form, employee_code: generateEmployeeCode(existingCodes) });
                      }}
                    >
                      Regenerate
                    </Button>
                  )}
                </div>
              </div>
              <Card className="bg-muted/50">
                <CardContent className="p-4 space-y-1 text-sm">
                  <p className="font-medium text-foreground">Summary</p>
                  <p><span className="text-muted-foreground">Name:</span> {form.name || "—"}</p>
                  {form.email && <p><span className="text-muted-foreground">Email:</span> {form.email}</p>}
                  {form.job_title && <p><span className="text-muted-foreground">Role:</span> {form.job_title}</p>}
                  {form.department && <p><span className="text-muted-foreground">Dept:</span> {form.department}</p>}
                  <p><span className="text-muted-foreground">Emp Rate:</span> ${parseFloat(form.pay_rate || "0").toFixed(2)}/hr</p>
                  <p><span className="text-muted-foreground">Admin Rate:</span> ${parseFloat(form.admin_hourly_rate || "0").toFixed(2)}/hr</p>
                  <p><span className="text-muted-foreground">Code:</span> <span className="font-mono font-bold">{form.employee_code}</span></p>
                </CardContent>
              </Card>
              <div className="flex justify-between">
                <Button variant="outline" onClick={() => setStep(1)}><ChevronLeft className="mr-1 h-4 w-4" /> Back</Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving ? "Saving..." : editing ? "Update Employee" : "Add Employee"}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {groupedEmployees ? (
        <div className="border border-border/40 rounded-lg overflow-hidden">
          {groupedEmployees.map(([groupName, groupEmps]) => (
            <div key={`group-${groupName}`}>
              <div className="px-4 py-2 bg-muted/40 border-b border-border/30">
                <span className="text-xs font-semibold uppercase tracking-wider text-primary">{groupName}</span>
                <span className="text-xs text-muted-foreground ml-2">({groupEmps.length})</span>
              </div>
              <div className="overflow-x-auto">
                <Table>
                  <TableBody>
                    {groupEmps.map((emp) => renderEmployeeRow(emp))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <Card className="border-border/40 overflow-hidden">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-border/30 hover:bg-transparent">
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium sticky left-0 bg-card z-20 border-r border-border/60 min-w-[160px]">Name</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Code</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Department</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Job Title</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Emp Rate</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Admin Rate</TableHead>
                    <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                    <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((emp) => renderEmployeeRow(emp))}
                  {filtered.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center text-muted-foreground py-12">No employees found</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Delete Confirmation Dialog - Super Admin Only */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => { if (!open) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Permanently Delete Employee?</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove <strong>{deleteTarget?.name}</strong> (Code: {deleteTarget?.employee_code}) and all their associated data including clock events, shifts, timesheets, requests, and payroll entries. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDeleteEmployee} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting ? "Deleting..." : "Delete Permanently"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
