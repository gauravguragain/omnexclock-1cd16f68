import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Plus, Pencil, UserX, UserCheck, Search } from "lucide-react";
import type { Tables } from "@/integrations/supabase/types";
import { logAudit } from "@/lib/auditLog";

type Employee = Tables<"employees">;

export default function EmployeesPage() {
  const { toast } = useToast();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [search, setSearch] = useState("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Employee | null>(null);
  const [form, setForm] = useState({ name: "", employee_code: "", pay_rate: "" });

  const fetchEmployees = async () => {
    const { data } = await supabase.from("employees").select("*").order("name");
    setEmployees(data || []);
  };

  useEffect(() => { fetchEmployees(); }, []);

  const handleSave = async () => {
    const payload = {
      name: form.name,
      employee_code: form.employee_code,
      pay_rate: parseFloat(form.pay_rate) || 0,
    };

    if (editing) {
      const { error } = await supabase.from("employees").update(payload).eq("id", editing.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logAudit("employee_edit", { employee_id: editing.id, name: form.name, employee_code: form.employee_code, pay_rate: form.pay_rate });
      toast({ title: "Employee updated" });
    } else {
      const { data, error } = await supabase.from("employees").insert(payload).select("id").single();
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logAudit("employee_add", { employee_id: data?.id, name: form.name, employee_code: form.employee_code, pay_rate: form.pay_rate });
      toast({ title: "Employee added" });
    }
    setDialogOpen(false);
    setEditing(null);
    setForm({ name: "", employee_code: "", pay_rate: "" });
    fetchEmployees();
  };

  const toggleActive = async (emp: Employee) => {
    const newActive = !emp.active;
    await supabase.from("employees").update({ active: newActive }).eq("id", emp.id);
    await logAudit(newActive ? "employee_activate" : "employee_deactivate", { employee_id: emp.id, name: emp.name });
    fetchEmployees();
  };

  const openEdit = (emp: Employee) => {
    setEditing(emp);
    setForm({ name: emp.name, employee_code: emp.employee_code, pay_rate: emp.pay_rate.toString() });
    setDialogOpen(true);
  };

  const openAdd = () => {
    setEditing(null);
    setForm({ name: "", employee_code: "", pay_rate: "" });
    setDialogOpen(true);
  };

  const filtered = employees.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) || e.employee_code.includes(search)
  );

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search employees..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={openAdd}><Plus className="mr-2 h-4 w-4" /> Add Employee</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editing ? "Edit Employee" : "Add Employee"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Name</Label>
                <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="John Doe" />
              </div>
              <div className="space-y-2">
                <Label>Employee Code</Label>
                <Input value={form.employee_code} onChange={(e) => setForm({ ...form, employee_code: e.target.value })} placeholder="1234" />
              </div>
              <div className="space-y-2">
                <Label>Pay Rate ($/hr)</Label>
                <Input type="number" step="0.01" value={form.pay_rate} onChange={(e) => setForm({ ...form, pay_rate: e.target.value })} placeholder="25.00" />
              </div>
              <Button className="w-full" onClick={handleSave}>{editing ? "Update" : "Add"} Employee</Button>
            </div>
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
                  <TableHead>Pay Rate</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((emp) => (
                  <TableRow key={emp.id}>
                    <TableCell className="font-medium">{emp.name}</TableCell>
                    <TableCell className="font-mono">{emp.employee_code}</TableCell>
                    <TableCell>${emp.pay_rate}/hr</TableCell>
                    <TableCell>
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${emp.active ? "bg-success/20 text-success" : "bg-destructive/20 text-destructive"}`}>
                        {emp.active ? "Active" : "Inactive"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="icon" onClick={() => openEdit(emp)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" onClick={() => toggleActive(emp)}>
                        {emp.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center text-muted-foreground py-8">No employees found</TableCell>
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
