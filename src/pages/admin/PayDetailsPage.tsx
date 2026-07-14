import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useActionLock } from "@/contexts/ActionLockContext";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { Search, Pencil, CreditCard } from "lucide-react";
import { logAudit } from "@/lib/auditLog";

interface PayDetailEmployee {
  id: string;
  name: string;
  employee_code: string;
  department: string | null;
  pay_id: string | null;
  abn: string | null;
  account_name: string | null;
  bsb: string | null;
  account_number: string | null;
}

const fmtABN = (v: string) => {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11) return d;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5, 8)} ${d.slice(8, 11)}`;
};

export default function PayDetailsPage() {
  const { business } = useBusiness();
  const { isSuperAdminOf } = useAuth();
  const { runAction } = useActionLock();
  const { toast } = useToast();
  const [employees, setEmployees] = useState<PayDetailEmployee[]>([]);
  const [search, setSearch] = useState("");
  const [editTarget, setEditTarget] = useState<PayDetailEmployee | null>(null);
  const [form, setForm] = useState({ pay_id: "", abn: "", account_name: "", bsb: "", account_number: "" });
  const [saving, setSaving] = useState(false);

  const isSuperAdmin = business ? isSuperAdminOf(business.id) : false;

  const fetchEmployees = async () => {
    if (!business) return;
    const { data } = await supabase
      .from("employees")
      .select("id, name, employee_code, department, pay_id, abn, account_name, bsb, account_number")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name");
    setEmployees((data as any[]) || []);
  };


  useEffect(() => { fetchEmployees(); }, [business]);

  const openEdit = (emp: PayDetailEmployee) => {
    setEditTarget(emp);
    setForm({
      pay_id: emp.pay_id || "",
      abn: emp.abn ? fmtABN(emp.abn) : "",
      account_name: emp.account_name || "",
      bsb: emp.bsb || "",
      account_number: emp.account_number || "",
    });
  };

  const handleSave = async () => {
    if (!editTarget || saving) return;
    const abnDigits = form.abn.replace(/\D/g, "");
    if (abnDigits && abnDigits.length !== 11) {
      toast({ title: "Validation Error", description: "ABN must be exactly 11 digits.", variant: "destructive" });
      return;
    }
    if (form.bsb && !/^\d{3}-?\d{3}$/.test(form.bsb.trim())) {
      toast({ title: "Validation Error", description: "BSB must be 6 digits (e.g. 123-456).", variant: "destructive" });
      return;
    }
    if (form.account_number && !/^\d{4,10}$/.test(form.account_number.trim())) {
      toast({ title: "Validation Error", description: "Account number must be 4-10 digits.", variant: "destructive" });
      return;
    }
    await runAction(async () => {
      setSaving(true);
      try {
        const payload = {
          pay_id: form.pay_id.trim() || null,
          abn: abnDigits || null,
          account_name: form.account_name.trim() || null,
          bsb: form.bsb.trim() || null,
          account_number: form.account_number.trim() || null,
        };
        const { error } = await supabase.from("employees").update(payload).eq("id", editTarget.id);
        if (error) throw error;
        await logAudit("pay_details_update", { employee_id: editTarget.id, employee_name: editTarget.name });
        toast({ title: "Pay details updated" });
        setEditTarget(null);
        fetchEmployees();
      } catch (err: any) {
        toast({ title: "Error", description: err.message, variant: "destructive" });
      } finally {
        setSaving(false);
      }
    });
  };


  const filtered = employees.filter(e =>
    e.name.toLowerCase().includes(search.toLowerCase()) ||
    e.employee_code.includes(search) ||
    (e.department || "").toLowerCase().includes(search.toLowerCase())
  );

  const hasDetails = (e: PayDetailEmployee) => e.pay_id || e.account_name || e.bsb || e.account_number;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row gap-3 justify-between">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input placeholder="Search by name, code, or department..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>
        <span className="text-xs text-muted-foreground self-center">{filtered.length} employee{filtered.length !== 1 ? "s" : ""}</span>
      </div>

      <Card className="border-border/40 overflow-hidden">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border/30 hover:bg-transparent">
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium min-w-[140px]">Employee</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Code</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Pay ID</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Account Name</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">BSB</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Account No.</TableHead>
                  <TableHead className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Status</TableHead>
                  <TableHead className="text-right text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map(emp => (
                  <TableRow key={emp.id} className="border-border/20 hover:bg-secondary/30 transition-colors">
                    <TableCell className="font-medium">
                      <div>
                        {emp.name}
                        {emp.department && <p className="text-[11px] text-muted-foreground mt-0.5">{emp.department}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-sm">{emp.employee_code}</TableCell>
                    <TableCell className="text-sm">{emp.pay_id || "—"}</TableCell>
                    <TableCell className="text-sm">{emp.account_name || "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{emp.bsb || "—"}</TableCell>
                    <TableCell className="text-sm font-mono">{emp.account_number ? `••••${emp.account_number.slice(-4)}` : "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2.5 py-1 rounded-full text-[11px] font-medium ${hasDetails(emp) ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                        {hasDetails(emp) ? "Complete" : "Missing"}
                      </span>
                    </TableCell>
                    <TableCell className="text-right">
                      {isSuperAdmin ? (
                        <Button variant="ghost" size="icon" onClick={() => openEdit(emp)} className="h-8 w-8" title="Edit pay details">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      ) : (
                        <span className="text-xs text-muted-foreground">View only</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
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

      <Dialog open={!!editTarget} onOpenChange={(open) => { if (!open) setEditTarget(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CreditCard className="h-4 w-4 text-primary" />
              Pay Details — {editTarget?.name}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Pay ID</Label>
              <Input value={form.pay_id} onChange={(e) => setForm({ ...form, pay_id: e.target.value })} placeholder="email@example.com or phone" maxLength={100} />
            </div>
            <div className="space-y-2">
              <Label>Account Name</Label>
              <Input value={form.account_name} onChange={(e) => setForm({ ...form, account_name: e.target.value })} placeholder="John Doe" maxLength={100} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>BSB</Label>
                <Input value={form.bsb} onChange={(e) => setForm({ ...form, bsb: e.target.value.replace(/[^0-9-]/g, "").slice(0, 7) })} placeholder="123-456" maxLength={7} />
              </div>
              <div className="space-y-2">
                <Label>Account Number</Label>
                <Input value={form.account_number} onChange={(e) => setForm({ ...form, account_number: e.target.value.replace(/[^0-9]/g, "").slice(0, 10) })} placeholder="12345678" maxLength={10} />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setEditTarget(null)}>Cancel</Button>
              <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
