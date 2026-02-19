import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Package, ShoppingCart, Trash2, AlertTriangle, CheckCircle2, Clock, XCircle, Download, ClipboardCheck, TrendingUp, TrendingDown } from "lucide-react";

export interface InventoryItem {
  id: string;
  name: string;
  category: string;
  current_count: number;
  min_count: number;
  unit: string;
  notes: string | null;
}

export interface InventoryOrder {
  id: string;
  item_id: string;
  quantity: number;
  status: string;
  requested_by: string;
  notes: string | null;
  created_at: string;
  item_name?: string;
}

interface StocktakeReport {
  date: string;
  entries: { id: string; name: string; unit: string; previousCount: number; newCount: number; parLevel: number }[];
  autoCompletedOrders: number;
}

// CSV helper
function downloadCSV(filename: string, headers: string[], rows: string[][]) {
  const csvContent = [headers.join(","), ...rows.map(r => r.map(c => `"${(c ?? "").replace(/"/g, '""')}"`).join(","))].join("\n");
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface InventorySectionProps {
  businessId: string;
  userId: string;
  isAdmin: boolean;
  canAdjustAndRequest: boolean;
  canManageItems: boolean;
  itemsTable: "inventory_items" | "bar_inventory_items";
  ordersTable: "inventory_orders" | "bar_inventory_orders";
  categories: string[];
  sectionLabel: string;
}

export default function InventorySection({
  businessId,
  userId,
  isAdmin,
  canAdjustAndRequest,
  canManageItems,
  itemsTable,
  ordersTable,
  categories,
  sectionLabel,
}: InventorySectionProps) {
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<InventoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Add item form
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState(categories[categories.length - 1] || "General");
  const [newCount, setNewCount] = useState("0");
  const [newMinCount, setNewMinCount] = useState("0");
  const [newUnit, setNewUnit] = useState("pcs");
  const [addOpen, setAddOpen] = useState(false);

  // Order form
  const [orderItemId, setOrderItemId] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);

  // Stocktake
  const [stocktakeOpen, setStocktakeOpen] = useState(false);
  const [stocktakeCounts, setStocktakeCounts] = useState<Record<string, string>>({});
  const [stocktakeReport, setStocktakeReport] = useState<StocktakeReport | null>(null);

  const fetchData = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    const [itemsRes, ordersRes] = await Promise.all([
      supabase.from(itemsTable).select("*").eq("business_id", businessId).order("category").order("name"),
      supabase.from(ordersTable).select("*").eq("business_id", businessId).order("created_at", { ascending: false }).limit(100),
    ]);
    const fetchedItems = (itemsRes.data as InventoryItem[]) || [];
    setItems(fetchedItems);

    const rawOrders = (ordersRes.data || []) as InventoryOrder[];
    const itemMap = new Map(fetchedItems.map((i) => [i.id, i.name]));
    setOrders(rawOrders.map(o => ({ ...o, item_name: itemMap.get(o.item_id) || "Unknown" })));
    setLoading(false);
  }, [businessId, itemsTable, ordersTable]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddItem = async () => {
    if (!businessId || !newName.trim()) return;
    const { error } = await supabase.from(itemsTable).insert({
      business_id: businessId,
      name: newName.trim(),
      category: newCategory,
      current_count: parseInt(newCount) || 0,
      min_count: parseInt(newMinCount) || 0,
      unit: newUnit,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item added" });
      setNewName(""); setNewCount("0"); setNewMinCount("0"); setNewUnit("pcs"); setNewCategory(categories[categories.length - 1] || "General");
      setAddOpen(false);
      fetchData();
    }
  };


  const deleteItem = async (id: string) => {
    const { error } = await supabase.from(itemsTable).delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item deleted" });
      fetchData();
    }
  };

  const handleOrderRequest = async () => {
    if (!businessId || !userId || !orderItemId) return;
    const { error } = await supabase.from(ordersTable).insert({
      business_id: businessId,
      item_id: orderItemId,
      quantity: parseInt(orderQty) || 1,
      notes: orderNotes || null,
      requested_by: userId,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Order request submitted" });
      setOrderItemId(""); setOrderQty("1"); setOrderNotes("");
      setOrderOpen(false);
      fetchData();
    }
  };

  const updateOrderStatus = async (id: string, status: string) => {
    const { error } = await supabase.from(ordersTable).update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      toast({ title: `Order ${status}` });
    }
  };

  const openStocktake = () => {
    const counts: Record<string, string> = {};
    items.forEach(i => { counts[i.id] = String(i.current_count); });
    setStocktakeCounts(counts);
    setStocktakeOpen(true);
  };

  const handleStocktakeSave = async () => {
    const updates = Object.entries(stocktakeCounts).map(([id, val]) => ({
      id,
      current_count: Math.max(0, parseInt(val) || 0),
    }));

    const reportEntries = updates.map(u => {
      const item = items.find(i => i.id === u.id);
      return {
        id: u.id,
        name: item?.name || "Unknown",
        unit: item?.unit || "pcs",
        previousCount: item?.current_count ?? 0,
        newCount: u.current_count,
        parLevel: item?.min_count ?? 0,
      };
    });

    let errorCount = 0;
    for (const u of updates) {
      const { error } = await supabase.from(itemsTable).update({ current_count: u.current_count }).eq("id", u.id);
      if (error) errorCount++;
    }

    // Auto-complete "ordered" orders for items at or above par level
    const itemsAtOrAbovePar = updates.filter(u => {
      const item = items.find(i => i.id === u.id);
      return item && u.current_count >= item.min_count;
    });

    let autoCompletedCount = 0;
    if (itemsAtOrAbovePar.length > 0) {
      const parMetItemIds = itemsAtOrAbovePar.map(u => u.id);
      const orderedOrdersToComplete = orders.filter(
        o => o.status === "ordered" && parMetItemIds.includes(o.item_id)
      );
      for (const o of orderedOrdersToComplete) {
        const { error } = await supabase.from(ordersTable).update({ status: "received" }).eq("id", o.id);
        if (!error) autoCompletedCount++;
      }
    }

    if (errorCount > 0) {
      toast({ title: "Some updates failed", variant: "destructive" });
    } else {
      const msg = autoCompletedCount > 0
        ? `Stocktake saved. ${autoCompletedCount} order(s) auto-completed (par level reached).`
        : "Stocktake saved successfully.";
      toast({ title: "Stocktake Complete", description: msg });
    }

    setStocktakeReport({
      date: new Date().toLocaleDateString("en-AU", { weekday: "short", day: "numeric", month: "short", year: "numeric" }),
      entries: reportEntries,
      autoCompletedOrders: autoCompletedCount,
    });

    setStocktakeOpen(false);
    fetchData();
  };

  // CSV exports
  const exportInventoryCSV = () => {
    const headers = ["Name", "Category", "Current Count", "Par Level", "Unit", "Status"];
    const rows = items.map(i => [
      i.name, i.category, String(i.current_count), String(i.min_count), i.unit,
      i.current_count < i.min_count ? "Low Stock" : "OK",
    ]);
    downloadCSV(`${sectionLabel.toLowerCase().replace(/\s/g, "-")}-inventory-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const exportOrdersCSV = () => {
    const headers = ["Item", "Quantity", "Status", "Notes", "Date"];
    const rows = orders.map(o => [
      o.item_name || "Unknown", String(o.quantity), o.status, o.notes || "",
      new Date(o.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" }),
    ]);
    downloadCSV(`${sectionLabel.toLowerCase().replace(/\s/g, "-")}-orders-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const exportStocktakeCSV = () => {
    if (!stocktakeReport) return;
    const headers = ["Item", "Previous Count", "New Count", "Difference", "Par Level", "Unit", "Status"];
    const rows = stocktakeReport.entries.map(e => [
      e.name, String(e.previousCount), String(e.newCount), String(e.newCount - e.previousCount),
      String(e.parLevel), e.unit, e.newCount >= e.parLevel ? "OK" : "Low Stock",
    ]);
    downloadCSV(`${sectionLabel.toLowerCase().replace(/\s/g, "-")}-stocktake-${new Date().toISOString().slice(0, 10)}.csv`, headers, rows);
  };

  const requestLowStockOrders = () => {
    const lowItems = items.filter(i => i.current_count < i.min_count);
    if (lowItems.length === 0) {
      toast({ title: "No low stock items" });
      return;
    }
    setOrderItemId(lowItems[0].id);
    setOrderQty(String(Math.max(1, lowItems[0].min_count - lowItems[0].current_count)));
    setOrderOpen(true);
  };

  const lowStockItems = items.filter(i => i.current_count < i.min_count);
  const activeOrders = orders.filter(o => ["pending", "approved", "ordered"].includes(o.status));
  const completedOrders = orders.filter(o => ["received", "rejected"].includes(o.status));

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5 text-warning" />;
      case "approved": return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case "rejected": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "ordered": return <ShoppingCart className="h-3.5 w-3.5 text-primary" />;
      case "received": return <CheckCircle2 className="h-3.5 w-3.5 text-muted-foreground" />;
      default: return null;
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Clock className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-xs text-muted-foreground">{items.length} items · {lowStockItems.length} low stock · {activeOrders.length} active orders</p>
        <div className="flex gap-2 flex-wrap">
          {canAdjustAndRequest && (
            <Button variant="outline" size="sm" className="gap-1.5" onClick={openStocktake} disabled={items.length === 0}>
              <ClipboardCheck className="h-3.5 w-3.5" /> Stocktake
            </Button>
          )}
          {canAdjustAndRequest && (
            <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
              <DialogTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5" disabled={items.length === 0}>
                  <ShoppingCart className="h-3.5 w-3.5" /> Order Request
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>New {sectionLabel} Order Request</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Item</Label>
                    <Select value={orderItemId} onValueChange={setOrderItemId}>
                      <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                      <SelectContent>
                        {items.map(i => (
                          <SelectItem key={i.id} value={i.id}>
                            {i.name} ({i.current_count}/{i.min_count} {i.unit})
                            {i.current_count < i.min_count ? " ⚠️" : ""}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Quantity</Label>
                    <Input type="number" min={1} value={orderQty} onChange={e => setOrderQty(e.target.value)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Notes</Label>
                    <Input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Optional notes..." />
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleOrderRequest} disabled={!orderItemId}>Submit Request</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
          {canManageItems && (
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="gap-1.5">
                  <Plus className="h-3.5 w-3.5" /> Add Item
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add {sectionLabel} Item</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Name</Label>
                    <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="e.g. Wine Glasses" autoFocus />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Category</Label>
                      <Select value={newCategory} onValueChange={setNewCategory}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Unit</Label>
                      <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="pcs, bottles, etc." />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <Label className="text-xs">Current Count</Label>
                      <Input type="number" min={0} value={newCount} onChange={e => setNewCount(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs">Par Level</Label>
                      <Input type="number" min={0} value={newMinCount} onChange={e => setNewMinCount(e.target.value)} />
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                  <Button onClick={handleAddItem} disabled={!newName.trim()}>Add Item</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-3">
            <div className="flex items-center justify-between mb-1">
              <div className="flex items-center gap-2 text-warning text-xs font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> Low Stock Alert ({lowStockItems.length} items)
              </div>
              {canAdjustAndRequest && (
                <Button variant="outline" size="sm" className="h-6 text-[10px] text-warning border-warning/30" onClick={requestLowStockOrders}>
                  <ShoppingCart className="h-3 w-3 mr-1" /> Request Order
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lowStockItems.map(i => (
                <Badge key={i.id} variant="outline" className="text-[10px] border-warning/30 text-warning">
                  {i.name}: {i.current_count}/{i.min_count} {i.unit}
                </Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="items">
        <TabsList>
          <TabsTrigger value="items" className="text-xs">Inventory Items</TabsTrigger>
          <TabsTrigger value="orders" className="text-xs">
            Active Orders
            {activeOrders.filter(o => o.status === "pending").length > 0 && (
              <Badge className="ml-1.5 bg-warning text-warning-foreground text-[10px] px-1 py-0 min-w-[16px] justify-center">
                {activeOrders.filter(o => o.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
          {stocktakeReport && (
            <TabsTrigger value="stocktake" className="text-xs">
              <ClipboardCheck className="h-3 w-3 mr-1" /> Stocktake Report
            </TabsTrigger>
          )}
          {completedOrders.length > 0 && (
            <TabsTrigger value="history" className="text-xs">History</TabsTrigger>
          )}
        </TabsList>

        {/* Inventory Items Tab */}
        <TabsContent value="items" className="mt-3">
          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={exportInventoryCSV} disabled={items.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          {items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No {sectionLabel.toLowerCase()} items yet. Add your first item to get started.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs">Category</TableHead>
                    <TableHead className="text-xs text-center">Count</TableHead>
                    <TableHead className="text-xs text-center">Par Level</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                    <TableHead className="text-xs text-center">On Order</TableHead>
                    
                    {canManageItems && <TableHead className="text-xs w-10"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => {
                    const isLow = item.current_count < item.min_count;
                    const itemActiveOrders = activeOrders.filter(o => o.item_id === item.id);
                    return (
                      <TableRow key={item.id} className={isLow ? "bg-warning/5" : ""}>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-1.5">
                            {isLow && <AlertTriangle className="h-3 w-3 text-warning flex-shrink-0" />}
                            {item.name}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[10px]">{item.category}</Badge>
                        </TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          {item.current_count} <span className="text-muted-foreground">{item.unit}</span>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{item.min_count}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={isLow ? "destructive" : "outline"} className="text-[10px]">
                            {isLow ? "Low" : "OK"}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-center">
                          {itemActiveOrders.length > 0 ? (
                            <Badge variant="outline" className="text-[10px] gap-1">
                              {statusIcon(itemActiveOrders[0].status)}
                              {itemActiveOrders[0].status === "ordered" ? "Ordered" : itemActiveOrders[0].status === "approved" ? "Approved" : "Pending"}
                            </Badge>
                          ) : (
                            <span className="text-[10px] text-muted-foreground">—</span>
                          )}
                        </TableCell>
                        {canManageItems && (
                          <TableCell>
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive hover:text-destructive">
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Delete {item.name}?</AlertDialogTitle>
                                  <AlertDialogDescription>This will permanently remove this item and all associated order requests.</AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                                  <AlertDialogAction onClick={() => deleteItem(item.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Delete</AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </TableCell>
                        )}
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        {/* Active Orders Tab */}
        <TabsContent value="orders" className="mt-3">
          <div className="flex justify-end mb-2">
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={exportOrdersCSV} disabled={orders.length === 0}>
              <Download className="h-3.5 w-3.5" /> Export CSV
            </Button>
          </div>
          {activeOrders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No active order requests.</p>
              </CardContent>
            </Card>
          ) : (
            <div className="rounded-lg border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-center">Qty</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                    {isAdmin && <TableHead className="text-xs text-right">Actions</TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {activeOrders.map(order => (
                    <TableRow key={order.id}>
                      <TableCell className="text-xs font-medium">{order.item_name}</TableCell>
                      <TableCell className="text-center text-xs font-mono">{order.quantity}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{order.notes || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] gap-1 capitalize">
                          {statusIcon(order.status)} {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="text-right">
                          {order.status === "pending" && (
                            <div className="flex gap-1 justify-end">
                              <Button variant="outline" size="sm" className="h-6 text-[10px] text-success border-success/30" onClick={() => updateOrderStatus(order.id, "approved")}>
                                Approve
                              </Button>
                              <Button variant="outline" size="sm" className="h-6 text-[10px] text-destructive border-destructive/30" onClick={() => updateOrderStatus(order.id, "rejected")}>
                                Reject
                              </Button>
                            </div>
                          )}
                          {order.status === "approved" && (
                            <Button variant="outline" size="sm" className="h-6 text-[10px] text-primary border-primary/30" onClick={() => updateOrderStatus(order.id, "ordered")}>
                              Mark Ordered
                            </Button>
                          )}
                          {order.status === "ordered" && (
                            <span className="text-[10px] text-muted-foreground italic">Auto-completes on stocktake</span>
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
          <p className="text-[10px] text-muted-foreground mt-2">
            💡 Orders marked as <span className="font-medium">"Ordered"</span> will automatically be completed when the next stocktake shows the item has reached its par level.
          </p>
        </TabsContent>

        {/* Stocktake Report Tab */}
        {stocktakeReport && (
          <TabsContent value="stocktake" className="mt-3">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-xs font-medium text-foreground">Stocktake Report — {stocktakeReport.date}</p>
                {stocktakeReport.autoCompletedOrders > 0 && (
                  <p className="text-[10px] text-success">
                    ✓ {stocktakeReport.autoCompletedOrders} order(s) auto-completed (par level reached)
                  </p>
                )}
              </div>
              <Button variant="ghost" size="sm" className="gap-1.5 text-xs" onClick={exportStocktakeCSV}>
                <Download className="h-3.5 w-3.5" /> Export CSV
              </Button>
            </div>
            <div className="rounded-lg border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-center">Previous</TableHead>
                    <TableHead className="text-xs text-center">New Count</TableHead>
                    <TableHead className="text-xs text-center">Diff</TableHead>
                    <TableHead className="text-xs text-center">Par Level</TableHead>
                    <TableHead className="text-xs text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {stocktakeReport.entries.map(entry => {
                    const diff = entry.newCount - entry.previousCount;
                    const isLow = entry.newCount < entry.parLevel;
                    return (
                      <TableRow key={entry.id} className={isLow ? "bg-warning/5" : ""}>
                        <TableCell className="text-xs font-medium">{entry.name}</TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground font-mono">{entry.previousCount}</TableCell>
                        <TableCell className="text-center text-xs font-mono font-medium">{entry.newCount} <span className="text-muted-foreground">{entry.unit}</span></TableCell>
                        <TableCell className="text-center text-xs font-mono">
                          <span className={`flex items-center justify-center gap-0.5 ${diff > 0 ? "text-success" : diff < 0 ? "text-destructive" : "text-muted-foreground"}`}>
                            {diff > 0 ? <TrendingUp className="h-3 w-3" /> : diff < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                            {diff > 0 ? `+${diff}` : diff}
                          </span>
                        </TableCell>
                        <TableCell className="text-center text-xs text-muted-foreground">{entry.parLevel}</TableCell>
                        <TableCell className="text-center">
                          <Badge variant={isLow ? "destructive" : "outline"} className="text-[10px]">
                            {isLow ? "Below Par" : "OK"}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}

        {/* Order History Tab */}
        {completedOrders.length > 0 && (
          <TabsContent value="history" className="mt-3">
            <div className="rounded-lg border border-border/60 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs">Item</TableHead>
                    <TableHead className="text-xs text-center">Qty</TableHead>
                    <TableHead className="text-xs">Notes</TableHead>
                    <TableHead className="text-xs">Status</TableHead>
                    <TableHead className="text-xs">Date</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {completedOrders.map(order => (
                    <TableRow key={order.id} className="opacity-60">
                      <TableCell className="text-xs font-medium">{order.item_name}</TableCell>
                      <TableCell className="text-center text-xs font-mono">{order.quantity}</TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[150px] truncate">{order.notes || "—"}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] gap-1 capitalize">
                          {statusIcon(order.status)} {order.status}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {new Date(order.created_at).toLocaleDateString("en-AU", { day: "numeric", month: "short" })}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
        )}
      </Tabs>

      {/* Stocktake Dialog */}
      <Dialog open={stocktakeOpen} onOpenChange={setStocktakeOpen}>
        <DialogContent className="max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ClipboardCheck className="h-5 w-5 text-primary" /> {sectionLabel} Stocktake
            </DialogTitle>
          </DialogHeader>
          <p className="text-xs text-muted-foreground">
            Enter the actual count for each item. Items with <span className="font-medium">"Ordered"</span> status will auto-complete if par level is reached.
          </p>
          <div className="space-y-2 mt-2">
            {items.map(item => {
              const hasOrderedOrder = orders.some(o => o.item_id === item.id && o.status === "ordered");
              const newVal = parseInt(stocktakeCounts[item.id] ?? "0") || 0;
              const willAutoComplete = hasOrderedOrder && newVal >= item.min_count;
              return (
                <div key={item.id} className={`flex items-center gap-3 py-1.5 border-b border-border/40 last:border-0 ${willAutoComplete ? "bg-success/5" : ""}`}>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium truncate flex items-center gap-1.5">
                      {item.name}
                      {hasOrderedOrder && (
                        <Badge variant="outline" className="text-[9px] gap-0.5">
                          <ShoppingCart className="h-2.5 w-2.5" /> On Order
                        </Badge>
                      )}
                    </p>
                    <p className="text-[10px] text-muted-foreground">
                      Par: {item.min_count} {item.unit}
                      {willAutoComplete && <span className="text-success ml-1">· ✓ Order will auto-complete</span>}
                    </p>
                  </div>
                  <Input
                    type="number"
                    min={0}
                    className="w-20 h-8 text-xs text-center"
                    value={stocktakeCounts[item.id] ?? ""}
                    onChange={e => setStocktakeCounts(prev => ({ ...prev, [item.id]: e.target.value }))}
                  />
                </div>
              );
            })}
          </div>
          <DialogFooter>
            <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
            <Button onClick={handleStocktakeSave}>Submit Stocktake</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
