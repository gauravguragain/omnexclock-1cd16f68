import { useEffect, useState, useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Plus, Truck, CalendarIcon, Search, MapPin, Phone, Users, Clock, Edit, Trash2, Eye } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { notifyEmployees } from "@/lib/notifications";

interface Delivery {
  id: string;
  business_id: string;
  delivery_date: string;
  delivery_time: string | null;
  delivery_address: string;
  contact_person: string;
  contact_number: string | null;
  number_of_guests: number;
  driver_id: string | null;
  status: string;
  notes: string | null;
  cost_incl_gst: number;
  cost_excl_gst: number;
  created_at: string;
  updated_at: string;
}

interface StatusLog {
  id: string;
  status: string;
  updated_by: string | null;
  notes: string | null;
  created_at: string;
}

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "bg-muted text-muted-foreground" },
  { value: "picked_up", label: "Picked Up", color: "bg-blue-500/20 text-blue-400" },
  { value: "on_the_way", label: "On the Way", color: "bg-amber-500/20 text-amber-400" },
  { value: "delivered", label: "Delivered", color: "bg-green-500/20 text-green-400" },
];

function getStatusBadge(status: string) {
  const opt = STATUS_OPTIONS.find(s => s.value === status);
  return <Badge className={cn("text-xs", opt?.color || "bg-muted")}>{opt?.label || status}</Badge>;
}

export default function CateringDeliveryPage() {
  const { business } = useBusiness();
  const { isSuperAdminOf } = useAuth();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);
  const [logDialogOpen, setLogDialogOpen] = useState(false);
  const [selectedDeliveryId, setSelectedDeliveryId] = useState<string | null>(null);
  const [statusLogs, setStatusLogs] = useState<StatusLog[]>([]);

  // Form state
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formTime, setFormTime] = useState("");
  const [formAddress, setFormAddress] = useState("");
  const [formContactPerson, setFormContactPerson] = useState("");
  const [formContactNumber, setFormContactNumber] = useState("");
  const [formGuests, setFormGuests] = useState("0");
  const [formDriverId, setFormDriverId] = useState("");
  const [formStatus, setFormStatus] = useState("pending");
  const [formNotes, setFormNotes] = useState("");
  const [formCostInclGst, setFormCostInclGst] = useState("40.00");
  const [formCostExclGst, setFormCostExclGst] = useState("36.36");

  const isSuperAdmin = isSuperAdminOf(business?.id || "");

  useEffect(() => {
    if (business) {
      fetchDeliveries();
      fetchEmployees();
    }
  }, [business]);

  useEffect(() => {
    if (!business) return;
    const channel = supabase
      .channel("deliveries-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "catering_deliveries" }, () => fetchDeliveries())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [business]);

  const fetchDeliveries = async () => {
    if (!business) return;
    setLoading(true);
    const { data } = await supabase
      .from("catering_deliveries")
      .select("*")
      .eq("business_id", business.id)
      .order("delivery_date", { ascending: false });
    setDeliveries((data as any[]) || []);
    setLoading(false);
  };

  const fetchEmployees = async () => {
    if (!business) return;
    const { data } = await supabase
      .from("employees")
      .select("id, name")
      .eq("business_id", business.id)
      .eq("active", true)
      .order("name");
    setEmployees(data || []);
  };

  const fetchStatusLogs = async (deliveryId: string) => {
    const { data } = await supabase
      .from("catering_delivery_status_logs")
      .select("*")
      .eq("delivery_id", deliveryId)
      .order("created_at", { ascending: true });
    setStatusLogs((data as any[]) || []);
  };

  const openCreate = () => {
    setEditingDelivery(null);
    setFormDate(new Date());
    setFormTime("");
    setFormAddress("");
    setFormContactPerson("");
    setFormContactNumber("");
    setFormGuests("0");
    setFormDriverId("");
    setFormStatus("pending");
    setFormNotes("");
    setFormCostInclGst("40.00");
    setFormCostExclGst("36.36");
    setDialogOpen(true);
  };

  const openEdit = (d: Delivery) => {
    setEditingDelivery(d);
    setFormDate(new Date(d.delivery_date + "T00:00:00"));
    setFormTime(d.delivery_time || "");
    setFormAddress(d.delivery_address);
    setFormContactPerson(d.contact_person);
    setFormContactNumber(d.contact_number || "");
    setFormGuests(String(d.number_of_guests));
    setFormDriverId(d.driver_id || "");
    setFormStatus(d.status);
    setFormNotes(d.notes || "");
    setFormCostInclGst(String(d.cost_incl_gst));
    setFormCostExclGst(String(d.cost_excl_gst));
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!business) return;
    if (!formAddress.trim() || !formContactPerson.trim()) {
      toast({ title: "Missing fields", description: "Address and contact person are required.", variant: "destructive" });
      return;
    }

    const payload = {
      business_id: business.id,
      delivery_date: format(formDate, "yyyy-MM-dd"),
      delivery_time: formTime || null,
      delivery_address: formAddress.trim(),
      contact_person: formContactPerson.trim(),
      contact_number: formContactNumber.trim() || null,
      number_of_guests: parseInt(formGuests) || 0,
      driver_id: formDriverId || null,
      status: formStatus,
      notes: formNotes.trim() || null,
      cost_incl_gst: parseFloat(formCostInclGst) || 40,
      cost_excl_gst: parseFloat(formCostExclGst) || 36.36,
    };

    if (editingDelivery) {
      const { error } = await supabase
        .from("catering_deliveries")
        .update(payload)
        .eq("id", editingDelivery.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

      // If driver changed, notify the new driver
      if (formDriverId && formDriverId !== editingDelivery.driver_id) {
        await notifyEmployees({
          businessId: business.id,
          employeeIds: [formDriverId],
          type: "general",
          title: "Delivery Assigned",
          message: `You've been assigned a delivery to ${formAddress.trim()} on ${format(formDate, "dd MMM yyyy")}.`,
        });
      }

      await logAudit("delivery_update", {
        delivery_id: editingDelivery.id,
        contact_person: formContactPerson.trim(),
        delivery_date: format(formDate, "yyyy-MM-dd"),
      });
      toast({ title: "Delivery updated" });
    } else {
      const { error } = await supabase
        .from("catering_deliveries")
        .insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }

      // Notify driver
      if (formDriverId) {
        await notifyEmployees({
          businessId: business.id,
          employeeIds: [formDriverId],
          type: "general",
          title: "New Delivery Assigned",
          message: `You've been assigned a delivery to ${formAddress.trim()} on ${format(formDate, "dd MMM yyyy")}.`,
        });
      }

      await logAudit("delivery_create", {
        contact_person: formContactPerson.trim(),
        delivery_date: format(formDate, "yyyy-MM-dd"),
      });
      toast({ title: "Delivery created" });
    }

    setDialogOpen(false);
    fetchDeliveries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this delivery?")) return;
    await supabase.from("catering_deliveries").delete().eq("id", id);
    await logAudit("delivery_delete", { delivery_id: id }, business!.id);
    toast({ title: "Delivery deleted" });
    fetchDeliveries();
  };

  const openStatusLog = async (deliveryId: string) => {
    setSelectedDeliveryId(deliveryId);
    await fetchStatusLogs(deliveryId);
    setLogDialogOpen(true);
  };

  const filtered = useMemo(() => {
    let list = deliveries;
    if (statusFilter !== "all") list = list.filter(d => d.status === statusFilter);
    if (search) {
      const s = search.toLowerCase();
      list = list.filter(d =>
        d.contact_person.toLowerCase().includes(s) ||
        d.delivery_address.toLowerCase().includes(s) ||
        (d.contact_number || "").includes(s)
      );
    }
    return list;
  }, [deliveries, statusFilter, search]);

  const driverName = (id: string | null) => {
    if (!id) return "—";
    return employees.find(e => e.id === id)?.name || "Unknown";
  };

  // Stats
  const totalDeliveries = deliveries.length;
  const pendingCount = deliveries.filter(d => d.status === "pending").length;
  const inTransitCount = deliveries.filter(d => d.status === "picked_up" || d.status === "on_the_way").length;
  const deliveredCount = deliveries.filter(d => d.status === "delivered").length;

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{totalDeliveries}</p>
          <p className="text-xs text-muted-foreground">Total Deliveries</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">{pendingCount}</p>
          <p className="text-xs text-muted-foreground">Pending</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">{inTransitCount}</p>
          <p className="text-xs text-muted-foreground">In Transit</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-400">{deliveredCount}</p>
          <p className="text-xs text-muted-foreground">Delivered</p>
        </CardContent></Card>
      </div>

      {/* Header */}
      <div className="flex flex-col sm:flex-row gap-2 items-start sm:items-center justify-between">
        <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
          <div className="relative flex-1 min-w-[140px] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="Search..." value={search} onChange={e => setSearch(e.target.value)} className="pl-8 h-8 text-xs" />
          </div>
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-[130px] h-8 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> New Delivery
        </Button>
      </div>

      {/* Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Time</TableHead>
                <TableHead className="text-xs">Address</TableHead>
                <TableHead className="text-xs">Contact</TableHead>
                <TableHead className="text-xs">Guests</TableHead>
                <TableHead className="text-xs">Driver</TableHead>
                <TableHead className="text-xs">Status</TableHead>
                <TableHead className="text-xs">Cost</TableHead>
                <TableHead className="text-xs w-[100px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.length === 0 ? (
                <TableRow><TableCell colSpan={9} className="text-center text-muted-foreground py-8">No deliveries found</TableCell></TableRow>
              ) : filtered.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(d.delivery_date + "T00:00:00"), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-xs">{d.delivery_time || "—"}</TableCell>
                  <TableCell className="text-xs max-w-[200px] truncate">{d.delivery_address}</TableCell>
                  <TableCell className="text-xs">
                    <div>{d.contact_person}</div>
                    {d.contact_number && <div className="text-muted-foreground">{d.contact_number}</div>}
                  </TableCell>
                  <TableCell className="text-xs">{d.number_of_guests}</TableCell>
                  <TableCell className="text-xs">{driverName(d.driver_id)}</TableCell>
                  <TableCell>{getStatusBadge(d.status)}</TableCell>
                  <TableCell className="text-xs">${d.cost_incl_gst}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openStatusLog(d.id)}><Eye className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(d)}><Edit className="h-3.5 w-3.5" /></Button>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}><Trash2 className="h-3.5 w-3.5" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85dvh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingDelivery ? "Edit Delivery" : "New Delivery"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Date *</Label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" className="w-full justify-start text-left font-normal h-9 text-xs">
                      <CalendarIcon className="mr-2 h-3.5 w-3.5" />
                      {format(formDate, "dd MMM yyyy")}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0"><Calendar mode="single" selected={formDate} onSelect={d => d && setFormDate(d)} /></PopoverContent>
                </Popover>
              </div>
              <div>
                <Label className="text-xs">Time</Label>
                <Input value={formTime} onChange={e => setFormTime(e.target.value)} placeholder="e.g. 2:00 PM" className="h-9 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Delivery Address *</Label>
              <Input value={formAddress} onChange={e => setFormAddress(e.target.value)} className="h-9 text-xs" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Contact Person *</Label>
                <Input value={formContactPerson} onChange={e => setFormContactPerson(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Contact Number</Label>
                <Input value={formContactNumber} onChange={e => setFormContactNumber(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Number of Guests</Label>
                <Input type="number" value={formGuests} onChange={e => setFormGuests(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Allocated Driver</Label>
                <Select value={formDriverId} onValueChange={setFormDriverId}>
                  <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select driver" /></SelectTrigger>
                  <SelectContent>
                    {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs">Status</Label>
              <Select value={formStatus} onValueChange={setFormStatus}>
                <SelectTrigger className="h-9 text-xs"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map(s => <SelectItem key={s.value} value={s.value}>{s.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Cost Incl GST ($)</Label>
                <Input type="number" step="0.01" value={formCostInclGst} onChange={e => setFormCostInclGst(e.target.value)} className="h-9 text-xs" />
              </div>
              <div>
                <Label className="text-xs">Cost Excl GST ($)</Label>
                <Input type="number" step="0.01" value={formCostExclGst} onChange={e => setFormCostExclGst(e.target.value)} className="h-9 text-xs" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Notes</Label>
              <Textarea value={formNotes} onChange={e => setFormNotes(e.target.value)} className="text-xs" rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingDelivery ? "Update" : "Create"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Status Log Dialog */}
      <Dialog open={logDialogOpen} onOpenChange={setLogDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Delivery Status Log</DialogTitle>
          </DialogHeader>
          {statusLogs.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No status updates yet.</p>
          ) : (
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {statusLogs.map(log => (
                <div key={log.id} className="flex items-start gap-3 p-2 rounded-lg bg-secondary/30 border border-border/40">
                  <div className="flex-1">
                    {getStatusBadge(log.status)}
                    {log.notes && <p className="text-xs text-muted-foreground mt-1">{log.notes}</p>}
                    <p className="text-[10px] text-muted-foreground/60 mt-0.5">
                      {format(new Date(log.created_at), "dd MMM yyyy, h:mm a")}
                      {log.updated_by && ` • ${driverName(log.updated_by)}`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
