import { useEffect, useState } from "react";
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
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, UserX, UserCheck, Search, ChevronRight, ChevronLeft, Check } from "lucide-react";
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
  const { isViewer } = useAuth();
  const { business } = useBusiness();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState<EmployeeForm>(EMPTY_FORM);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());

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

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_code.toLowerCase().includes(search.toLowerCase()) ||
    (e.department || "").toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, code, or department..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={(open) => { setDialogOpen(open); if (!open) { setStep(0); setEditing(null); } }}>
          <DialogTrigger asChild>
            <Button onClick={openAdd} disabled={isViewer}><Plus className="mr-2 h-4 w-4" /> Add Employee</Button>
          </DialogTrigger>
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

            {/* Step 1: Personal Details */}
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

            {/* Step 2: Payroll Setup */}
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

            {/* Step 3: System Access */}
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

                {/* Summary preview */}
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
      </div>

      <Card>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Code</TableHead>
                  <TableHead>Department</TableHead>
                  <TableHead>Job Title</TableHead>
                  <TableHead>Emp Rate</TableHead>
                  <TableHead>Admin Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">
                      <div>
                        {emp.name}
                        {emp.email && <p className="text-xs text-muted-foreground">{emp.email}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono">{emp.employee_code}</TableCell>
                    <TableCell>{emp.department || "—"}</TableCell>
                    <TableCell>{emp.job_title || "—"}</TableCell>
                    <TableCell>${emp.pay_rate}/hr</TableCell>
                    <TableCell>${emp.admin_hourly_rate}/hr</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.active ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                        {emp.active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      {isViewer ? (
                        <span className="text-xs text-muted-foreground">View only</span>
                      ) : (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} disabled={saving}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => toggleActive(emp)} disabled={togglingIds.has(emp.id)}>
                            {emp.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                          </Button>
                        </>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-muted-foreground py-8">No employees found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
