import { useEffect, useState, useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks, eachDayOfInterval } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Plus, Truck, CalendarIcon, Edit, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { ausNow } from "@/lib/dateUtils";

interface Delivery {
  id: string;
  business_id: string;
  delivery_date: string;
  driver_id: string | null;
  cost_incl_gst: number;
  cost_excl_gst: number;
  status: string;
  delivery_address: string;
  contact_person: string;
  contact_number: string | null;
  delivery_time: string | null;
  number_of_guests: number;
  notes: string | null;
  created_at: string;
}

export default function CateringDeliveryPage() {
  const { business } = useBusiness();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingDelivery, setEditingDelivery] = useState<Delivery | null>(null);

  // Week navigation
  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(ausNow(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  // Form state - simplified: just date + driver
  const [formDate, setFormDate] = useState<Date>(new Date());
  const [formDriverId, setFormDriverId] = useState("");

  useEffect(() => {
    if (business) {
      fetchDeliveries();
      fetchEmployees();
    }
  }, [business, weekStart]);

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
    const from = format(weekStart, "yyyy-MM-dd");
    const to = format(weekEnd, "yyyy-MM-dd");
    const { data } = await supabase
      .from("catering_deliveries")
      .select("*")
      .eq("business_id", business.id)
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .order("delivery_date", { ascending: true });
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

  const goToPrevWeek = () => setWeekStart(startOfWeek(subWeeks(weekStart, 1), { weekStartsOn: 1 }));
  const goToNextWeek = () => setWeekStart(startOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 1 }));
  const goToThisWeek = () => setWeekStart(startOfWeek(ausNow(), { weekStartsOn: 1 }));

  const openCreate = () => {
    setEditingDelivery(null);
    setFormDate(new Date());
    setFormDriverId("");
    setDialogOpen(true);
  };

  const openEdit = (d: Delivery) => {
    setEditingDelivery(d);
    setFormDate(new Date(d.delivery_date + "T00:00:00"));
    setFormDriverId(d.driver_id || "");
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!business) return;
    if (!formDriverId) {
      toast({ title: "Missing driver", description: "Please select an allocated driver.", variant: "destructive" });
      return;
    }

    const payload = {
      business_id: business.id,
      delivery_date: format(formDate, "yyyy-MM-dd"),
      driver_id: formDriverId || null,
      delivery_address: "N/A",
      contact_person: "N/A",
      contact_number: null as string | null,
      delivery_time: null as string | null,
      number_of_guests: 0,
      notes: null as string | null,
      status: "delivered",
      cost_incl_gst: 40,
      cost_excl_gst: 36.36,
    };

    if (editingDelivery) {
      const { error } = await supabase
        .from("catering_deliveries")
        .update({ delivery_date: payload.delivery_date, driver_id: payload.driver_id })
        .eq("id", editingDelivery.id);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logAudit("delivery_update", { delivery_id: editingDelivery.id, delivery_date: payload.delivery_date });
      toast({ title: "Delivery updated" });
    } else {
      const { error } = await supabase.from("catering_deliveries").insert(payload);
      if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
      await logAudit("delivery_create", { delivery_date: payload.delivery_date, driver: formDriverId });
      toast({ title: "Delivery added" });
    }

    setDialogOpen(false);
    fetchDeliveries();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this delivery?")) return;
    await supabase.from("catering_deliveries").delete().eq("id", id);
    await logAudit("delivery_delete", { delivery_id: id });
    toast({ title: "Delivery deleted" });
    fetchDeliveries();
  };

  const driverName = (id: string | null) => {
    if (!id) return "—";
    return employees.find(e => e.id === id)?.name || "Unknown";
  };

  // Group deliveries by date for the week view
  const weekDays = eachDayOfInterval({ start: weekStart, end: weekEnd });
  const deliveriesByDate = useMemo(() => {
    const map: Record<string, Delivery[]> = {};
    for (const d of deliveries) {
      const key = d.delivery_date;
      if (!map[key]) map[key] = [];
      map[key].push(d);
    }
    return map;
  }, [deliveries]);

  const totalWeekDeliveries = deliveries.length;
  const totalWeekRevenueInclGst = deliveries.reduce((s, d) => s + d.cost_incl_gst, 0);
  const totalWeekCostExclGst = deliveries.reduce((s, d) => s + d.cost_excl_gst, 0);
  const totalMargin = totalWeekRevenueInclGst - totalWeekCostExclGst;

  return (
    <div className="space-y-4">
      {/* Week Navigation */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="icon" onClick={goToPrevWeek} className="h-8 w-8">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" className="h-8 px-3 text-xs font-medium gap-1.5">
            <CalendarIcon className="h-3.5 w-3.5 text-primary" />
            {format(weekStart, "dd MMM")} — {format(weekEnd, "dd MMM yyyy")}
          </Button>
          <Button variant="outline" size="icon" onClick={goToNextWeek} className="h-8 w-8">
            <ChevronRight className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={goToThisWeek} className="text-primary text-xs h-8">
            This Week
          </Button>
        </div>
        <Button size="sm" onClick={openCreate} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Delivery
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{totalWeekDeliveries}</p>
          <p className="text-xs text-muted-foreground">Deliveries This Week</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-400">${totalWeekRevenueInclGst.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Revenue (incl GST)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">${totalWeekCostExclGst.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Driver Cost (excl GST)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-amber-400">${totalMargin.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Margin</p>
        </CardContent></Card>
      </div>

      {/* Weekly Table */}
      <Card>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Day</TableHead>
                <TableHead className="text-xs">Driver</TableHead>
                <TableHead className="text-xs">Cost (excl GST)</TableHead>
                <TableHead className="text-xs">Cost (incl GST)</TableHead>
                <TableHead className="text-xs w-[80px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                    <Truck className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    No deliveries this week
                  </TableCell>
                </TableRow>
              ) : deliveries.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(d.delivery_date + "T00:00:00"), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-xs">{format(new Date(d.delivery_date + "T00:00:00"), "EEEE")}</TableCell>
                  <TableCell className="text-xs font-medium">{driverName(d.driver_id)}</TableCell>
                  <TableCell className="text-xs">${d.cost_excl_gst.toFixed(2)}</TableCell>
                  <TableCell className="text-xs">${d.cost_incl_gst.toFixed(2)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
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

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{editingDelivery ? "Edit Delivery" : "Add Delivery"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label className="text-xs">Date</Label>
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
              <Label className="text-xs">Allocated Driver</Label>
              <Select value={formDriverId} onValueChange={setFormDriverId}>
                <SelectTrigger className="h-9 text-xs"><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Driver Pay (excl GST)</span><span className="font-medium">$36.36</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Admin Cost (incl GST)</span><span className="font-medium">$40.00</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Margin</span><span className="font-medium text-primary">$3.64</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSave}>{editingDelivery ? "Update" : "Add"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
