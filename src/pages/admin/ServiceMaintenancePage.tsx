import { useState, useEffect } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { format, addDays, differenceInDays, parseISO } from "date-fns";
import {
  Wrench, Plus, Trash2, Edit2, CalendarCheck, CalendarClock, Mail, AlertTriangle, CheckCircle2, Clock
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogClose
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";

interface ServiceTask {
  id: string;
  business_id: string;
  name: string;
  description: string | null;
  frequency_days: number;
  last_service_date: string | null;
  next_service_date: string | null;
  reminder_email: string | null;
  reminder_sent: boolean;
  active: boolean;
  created_at: string;
  updated_at: string;
}

const EMPTY_FORM = {
  name: "",
  description: "",
  frequency_days: 30,
  last_service_date: "",
  next_service_date: "",
  reminder_email: "",
  active: true,
};

export default function ServiceMaintenancePage() {
  const { business } = useBusiness();
  const { user, isAdminOf, isSuperAdminOf } = useAuth();
  const [tasks, setTasks] = useState<ServiceTask[]>([]);
  const [loading, setLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  const businessId = business?.id || "";
  const isAdmin = isAdminOf(businessId) || isSuperAdminOf(businessId);

  const fetchTasks = async () => {
    if (!businessId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("service_maintenance_tasks")
      .select("*")
      .eq("business_id", businessId)
      .order("next_service_date", { ascending: true, nullsFirst: false });
    if (error) {
      console.error("Failed to fetch service tasks:", error);
    } else {
      setTasks((data as ServiceTask[]) || []);
    }
    setLoading(false);
  };

  useEffect(() => { fetchTasks(); }, [businessId]);

  const openAdd = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (task: ServiceTask) => {
    setEditingId(task.id);
    setForm({
      name: task.name,
      description: task.description || "",
      frequency_days: task.frequency_days,
      last_service_date: task.last_service_date || "",
      next_service_date: task.next_service_date || "",
      reminder_email: task.reminder_email || "",
      active: task.active,
    });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast({ title: "Task name is required", variant: "destructive" });
      return;
    }
    setSaving(true);

    // Auto-calculate next_service_date if last_service_date is set and next isn't
    let nextDate = form.next_service_date;
    if (form.last_service_date && !nextDate) {
      nextDate = format(addDays(parseISO(form.last_service_date), form.frequency_days), "yyyy-MM-dd");
    }

    const payload = {
      business_id: businessId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      frequency_days: form.frequency_days,
      last_service_date: form.last_service_date || null,
      next_service_date: nextDate || null,
      reminder_email: form.reminder_email.trim() || null,
      active: form.active,
      reminder_sent: false, // Reset reminder when dates change
    };

    if (editingId) {
      const { error } = await supabase
        .from("service_maintenance_tasks")
        .update(payload)
        .eq("id", editingId);
      if (error) {
        toast({ title: "Failed to update task", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Task updated" });
        logAudit("service_task_update", { task_name: form.name });
      }
    } else {
      const { error } = await supabase
        .from("service_maintenance_tasks")
        .insert(payload);
      if (error) {
        toast({ title: "Failed to create task", description: error.message, variant: "destructive" });
      } else {
        toast({ title: "Task created" });
        logAudit("service_task_create", { task_name: form.name });
      }
    }

    setSaving(false);
    setDialogOpen(false);
    fetchTasks();
  };

  const handleDelete = async (task: ServiceTask) => {
    const { error } = await supabase
      .from("service_maintenance_tasks")
      .delete()
      .eq("id", task.id);
    if (error) {
      toast({ title: "Failed to delete", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Task deleted" });
      logAudit("service_task_delete", { task_name: task.name });
      fetchTasks();
    }
  };

  const markCompleted = async (task: ServiceTask) => {
    const today = format(new Date(), "yyyy-MM-dd");
    const nextDate = format(addDays(new Date(), task.frequency_days), "yyyy-MM-dd");
    const { error } = await supabase
      .from("service_maintenance_tasks")
      .update({
        last_service_date: today,
        next_service_date: nextDate,
        reminder_sent: false,
      })
      .eq("id", task.id);
    if (error) {
      toast({ title: "Failed to update", description: error.message, variant: "destructive" });
    } else {
      toast({ title: `${task.name} marked as completed today` });
      logAudit("service_task_completed", { task_name: task.name, completed_date: today, next_due: nextDate });
      fetchTasks();
    }
  };

  const getStatusBadge = (task: ServiceTask) => {
    if (!task.next_service_date) return <Badge variant="outline" className="text-muted-foreground text-[10px]">Not Scheduled</Badge>;
    const daysUntil = differenceInDays(parseISO(task.next_service_date), new Date());
    if (daysUntil < 0) return <Badge variant="destructive" className="text-[10px]">Overdue ({Math.abs(daysUntil)}d)</Badge>;
    if (daysUntil <= 7) return <Badge className="bg-warning text-warning-foreground text-[10px]">Due Soon ({daysUntil}d)</Badge>;
    return <Badge variant="outline" className="text-primary border-primary/30 text-[10px]">{daysUntil}d away</Badge>;
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Wrench className="h-5 w-5 text-primary" /> Service & Maintenance
        </h2>
        {isAdmin && (
          <Button size="sm" className="gap-1.5" onClick={openAdd}>
            <Plus className="h-3.5 w-3.5" /> Add Task
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Clock className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <Card className="p-8 text-center">
          <Wrench className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground text-sm">No service tasks set up yet.</p>
          {isAdmin && <p className="text-muted-foreground/60 text-xs mt-1">Click "Add Task" to create your first maintenance item.</p>}
        </Card>
      ) : (
        <div className="grid gap-3">
          {tasks.map((task) => (
            <Card key={task.id} className={`p-4 ${!task.active ? "opacity-50" : ""}`}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-semibold text-sm text-foreground">{task.name}</h3>
                    {getStatusBadge(task)}
                    {!task.active && <Badge variant="outline" className="text-[10px] text-muted-foreground">Inactive</Badge>}
                  </div>
                  {task.description && (
                    <p className="text-xs text-muted-foreground mt-1">{task.description}</p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <CalendarCheck className="h-3 w-3" />
                      Last: {task.last_service_date ? format(parseISO(task.last_service_date), "dd MMM yyyy") : "Never"}
                    </span>
                    <span className="flex items-center gap-1">
                      <CalendarClock className="h-3 w-3" />
                      Next: {task.next_service_date ? format(parseISO(task.next_service_date), "dd MMM yyyy") : "—"}
                    </span>
                    <span>Every {task.frequency_days} days</span>
                    {task.reminder_email && (
                      <span className="flex items-center gap-1">
                        <Mail className="h-3 w-3" />
                        {task.reminder_email}
                      </span>
                    )}
                  </div>
                </div>

                {isAdmin && (
                  <div className="flex items-center gap-1 shrink-0">
                    <Button variant="outline" size="sm" className="h-7 text-[11px] gap-1" onClick={() => markCompleted(task)}>
                      <CheckCircle2 className="h-3 w-3" /> Done
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(task)}>
                      <Edit2 className="h-3.5 w-3.5" />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive">
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Delete "{task.name}"?</AlertDialogTitle>
                          <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction onClick={() => handleDelete(task)}>Delete</AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                )}
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Task" : "Add Service Task"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Task Name *</Label>
              <Input
                placeholder="e.g. Beer Tap Cleaning"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </div>
            <div>
              <Label className="text-xs">Description</Label>
              <Textarea
                placeholder="Additional details..."
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Frequency (days)</Label>
                <Input
                  type="number"
                  min={1}
                  value={form.frequency_days}
                  onChange={(e) => setForm({ ...form, frequency_days: parseInt(e.target.value) || 30 })}
                />
              </div>
              <div>
                <Label className="text-xs">Last Service Date</Label>
                <Input
                  type="date"
                  value={form.last_service_date}
                  onChange={(e) => setForm({ ...form, last_service_date: e.target.value })}
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">Next Service Date</Label>
              <Input
                type="date"
                value={form.next_service_date}
                onChange={(e) => setForm({ ...form, next_service_date: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Auto-calculated from last service + frequency if left empty.</p>
            </div>
            <div>
              <Label className="text-xs">Reminder Email</Label>
              <Input
                type="email"
                placeholder="admin@example.com"
                value={form.reminder_email}
                onChange={(e) => setForm({ ...form, reminder_email: e.target.value })}
              />
              <p className="text-[10px] text-muted-foreground mt-1">Receives an email reminder 7 days before next service.</p>
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={form.active} onCheckedChange={(v) => setForm({ ...form, active: v })} />
              <Label className="text-xs">Active</Label>
            </div>
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" size="sm">Cancel</Button>
            </DialogClose>
            <Button size="sm" onClick={handleSave} disabled={saving}>
              {saving ? "Saving..." : editingId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
