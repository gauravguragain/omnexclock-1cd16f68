import { useEffect, useState, useMemo } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { supabase } from "@/integrations/supabase/client";
import { format, startOfWeek, endOfWeek, addWeeks, subWeeks } from "date-fns";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Plus, Truck, CalendarIcon, Trash2, ChevronLeft, ChevronRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { logAudit } from "@/lib/auditLog";
import { ausNow } from "@/lib/dateUtils";

interface Delivery {
  id: string;
  delivery_date: string;
  cost_incl_gst: number;
  cost_excl_gst: number;
}

export default function CateringDeliveryPage() {
  const { business } = useBusiness();
  const { toast } = useToast();
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loading, setLoading] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [formDate, setFormDate] = useState<Date>(new Date());

  const [weekStart, setWeekStart] = useState<Date>(() => startOfWeek(ausNow(), { weekStartsOn: 1 }));
  const weekEnd = endOfWeek(weekStart, { weekStartsOn: 1 });

  useEffect(() => {
    if (business) fetchDeliveries();
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
      .select("id, delivery_date, cost_incl_gst, cost_excl_gst")
      .eq("business_id", business.id)
      .gte("delivery_date", from)
      .lte("delivery_date", to)
      .order("delivery_date", { ascending: true });
    setDeliveries((data as any[]) || []);
    setLoading(false);
  };

  const goToPrevWeek = () => setWeekStart(startOfWeek(subWeeks(weekStart, 1), { weekStartsOn: 1 }));
  const goToNextWeek = () => setWeekStart(startOfWeek(addWeeks(weekStart, 1), { weekStartsOn: 1 }));
  const goToThisWeek = () => setWeekStart(startOfWeek(ausNow(), { weekStartsOn: 1 }));

  const handleAdd = async () => {
    if (!business) return;
    const payload = {
      business_id: business.id,
      delivery_date: format(formDate, "yyyy-MM-dd"),
      driver_id: null as string | null,
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
    const { error } = await supabase.from("catering_deliveries").insert(payload);
    if (error) { toast({ title: "Error", description: error.message, variant: "destructive" }); return; }
    await logAudit("delivery_create", { delivery_date: payload.delivery_date });
    toast({ title: "Delivery added" });
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

  const totalWeekDeliveries = deliveries.length;
  const totalCostExclGst = deliveries.reduce((s, d) => s + d.cost_excl_gst, 0);
  const totalCostInclGst = deliveries.reduce((s, d) => s + d.cost_incl_gst, 0);
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
        <Button size="sm" onClick={() => { setFormDate(new Date()); setDialogOpen(true); }} className="gap-1.5">
          <Plus className="h-3.5 w-3.5" /> Add Delivery
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-primary">{totalWeekDeliveries}</p>
          <p className="text-xs text-muted-foreground">Deliveries</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-green-400">${totalCostExclGst.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Cost (excl GST)</p>
        </CardContent></Card>
        <Card><CardContent className="p-4 text-center">
          <p className="text-2xl font-bold text-blue-400">${totalCostInclGst.toFixed(2)}</p>
          <p className="text-xs text-muted-foreground">Cost (incl GST)</p>
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
                <TableHead className="text-xs">Cost (excl GST)</TableHead>
                <TableHead className="text-xs">Cost (incl GST)</TableHead>
                <TableHead className="text-xs w-[60px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {deliveries.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    <Truck className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    No deliveries this week
                  </TableCell>
                </TableRow>
              ) : deliveries.map(d => (
                <TableRow key={d.id}>
                  <TableCell className="text-xs whitespace-nowrap">{format(new Date(d.delivery_date + "T00:00:00"), "dd MMM yyyy")}</TableCell>
                  <TableCell className="text-xs">{format(new Date(d.delivery_date + "T00:00:00"), "EEEE")}</TableCell>
                  <TableCell className="text-xs">${d.cost_excl_gst.toFixed(2)}</TableCell>
                  <TableCell className="text-xs">${d.cost_incl_gst.toFixed(2)}</TableCell>
                  <TableCell>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(d.id)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>

      {/* Add Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Delivery</DialogTitle>
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
            <div className="rounded-md bg-muted/50 p-3 text-xs space-y-1">
              <div className="flex justify-between"><span className="text-muted-foreground">Cost (excl GST)</span><span className="font-medium">$36.36</span></div>
              <div className="flex justify-between"><span className="text-muted-foreground">Cost (incl GST)</span><span className="font-medium">$40.00</span></div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleAdd}>Add</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
