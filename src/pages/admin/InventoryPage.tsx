import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogClose } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Minus, Package, ShoppingCart, Trash2, AlertTriangle, CheckCircle2, Clock, XCircle } from "lucide-react";

interface InventoryItem {
  id: string;
  name: string;
  category: string;
  current_count: number;
  min_count: number;
  unit: string;
  notes: string | null;
}

interface InventoryOrder {
  id: string;
  item_id: string;
  quantity: number;
  status: string;
  requested_by: string;
  notes: string | null;
  created_at: string;
  item_name?: string;
}

const CATEGORIES = ["Glassware", "Cutlery", "Linen", "Consumables", "Equipment", "Cleaning", "General"];

export default function InventoryPage() {
  const { business } = useBusiness();
  const { user } = useAuth();
  const { toast } = useToast();
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<InventoryOrder[]>([]);
  const [loading, setLoading] = useState(true);

  // Add item form
  const [newName, setNewName] = useState("");
  const [newCategory, setNewCategory] = useState("General");
  const [newCount, setNewCount] = useState(0);
  const [newMinCount, setNewMinCount] = useState(0);
  const [newUnit, setNewUnit] = useState("pcs");
  const [addOpen, setAddOpen] = useState(false);

  // Order form
  const [orderItemId, setOrderItemId] = useState("");
  const [orderQty, setOrderQty] = useState("1");
  const [orderNotes, setOrderNotes] = useState("");
  const [orderOpen, setOrderOpen] = useState(false);

  const fetchData = useCallback(async () => {
    if (!business) return;
    setLoading(true);
    const [itemsRes, ordersRes] = await Promise.all([
      supabase.from("inventory_items").select("*").eq("business_id", business.id).order("category").order("name"),
      supabase.from("inventory_orders").select("*").eq("business_id", business.id).order("created_at", { ascending: false }).limit(50),
    ]);
    setItems((itemsRes.data as InventoryItem[]) || []);

    const rawOrders = (ordersRes.data || []) as InventoryOrder[];
    // Attach item names
    const itemMap = new Map((itemsRes.data || []).map((i: any) => [i.id, i.name]));
    setOrders(rawOrders.map(o => ({ ...o, item_name: itemMap.get(o.item_id) || "Unknown" })));
    setLoading(false);
  }, [business]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleAddItem = async () => {
    if (!business || !newName.trim()) return;
    const { error } = await supabase.from("inventory_items").insert({
      business_id: business.id,
      name: newName.trim(),
      category: newCategory,
      current_count: newCount,
      min_count: newMinCount,
      unit: newUnit,
    });
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item added" });
      setNewName(""); setNewCount(0); setNewMinCount(0); setNewUnit("pcs"); setNewCategory("General");
      setAddOpen(false);
      fetchData();
    }
  };

  const updateCount = async (id: string, delta: number) => {
    const item = items.find(i => i.id === id);
    if (!item) return;
    const newCount = Math.max(0, item.current_count + delta);
    const { error } = await supabase.from("inventory_items").update({ current_count: newCount }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setItems(prev => prev.map(i => i.id === id ? { ...i, current_count: newCount } : i));
    }
  };

  const deleteItem = async (id: string) => {
    const { error } = await supabase.from("inventory_items").delete().eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Item deleted" });
      fetchData();
    }
  };

  const handleOrderRequest = async () => {
    if (!business || !user || !orderItemId) return;
    const { error } = await supabase.from("inventory_orders").insert({
      business_id: business.id,
      item_id: orderItemId,
      quantity: parseInt(orderQty) || 1,
      notes: orderNotes || null,
      requested_by: user.id,
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
    const { error } = await supabase.from("inventory_orders").update({ status }).eq("id", id);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setOrders(prev => prev.map(o => o.id === id ? { ...o, status } : o));
      toast({ title: `Order ${status}` });
    }
  };

  const lowStockItems = items.filter(i => i.current_count <= i.min_count);

  const statusIcon = (status: string) => {
    switch (status) {
      case "pending": return <Clock className="h-3.5 w-3.5 text-warning" />;
      case "approved": return <CheckCircle2 className="h-3.5 w-3.5 text-success" />;
      case "rejected": return <XCircle className="h-3.5 w-3.5 text-destructive" />;
      case "ordered": return <ShoppingCart className="h-3.5 w-3.5 text-primary" />;
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
        <div>
          <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
            <Package className="h-5 w-5 text-primary" /> FOH Inventory
          </h2>
          <p className="text-xs text-muted-foreground">{items.length} items · {lowStockItems.length} low stock</p>
        </div>
        <div className="flex gap-2">
          <Dialog open={orderOpen} onOpenChange={setOrderOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5" disabled={items.length === 0}>
                <ShoppingCart className="h-3.5 w-3.5" /> Order Request
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>New Order Request</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label className="text-xs">Item</Label>
                  <Select value={orderItemId} onValueChange={setOrderItemId}>
                    <SelectTrigger><SelectValue placeholder="Select item..." /></SelectTrigger>
                    <SelectContent>
                      {items.map(i => (
                        <SelectItem key={i.id} value={i.id}>{i.name} ({i.current_count} {i.unit})</SelectItem>
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

          <Dialog open={addOpen} onOpenChange={setAddOpen}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-1.5">
                <Plus className="h-3.5 w-3.5" /> Add Item
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Inventory Item</DialogTitle>
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
                        {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Unit</Label>
                    <Input value={newUnit} onChange={e => setNewUnit(e.target.value)} placeholder="pcs, boxes, etc." />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <Label className="text-xs">Current Count</Label>
                    <Input type="number" min={0} value={newCount} onChange={e => setNewCount(parseInt(e.target.value) || 0)} />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Min Stock Level</Label>
                    <Input type="number" min={0} value={newMinCount} onChange={e => setNewMinCount(parseInt(e.target.value) || 0)} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
                <Button onClick={handleAddItem} disabled={!newName.trim()}>Add Item</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Low Stock Alert */}
      {lowStockItems.length > 0 && (
        <Card className="border-warning/40 bg-warning/5">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 text-warning text-xs font-medium mb-1">
              <AlertTriangle className="h-3.5 w-3.5" /> Low Stock Alert
            </div>
            <div className="flex flex-wrap gap-1.5">
              {lowStockItems.map(i => (
                <Badge key={i.id} variant="outline" className="text-[10px] border-warning/30 text-warning">
                  {i.name}: {i.current_count} {i.unit}
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
            Order Requests
            {orders.filter(o => o.status === "pending").length > 0 && (
              <Badge className="ml-1.5 bg-warning text-warning-foreground text-[10px] px-1 py-0 min-w-[16px] justify-center">
                {orders.filter(o => o.status === "pending").length}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="items" className="mt-3">
          {items.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <Package className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No inventory items yet. Add your first item to get started.</p>
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
                    <TableHead className="text-xs text-center">Min</TableHead>
                    <TableHead className="text-xs text-center">Adjust</TableHead>
                    <TableHead className="text-xs w-10"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map(item => {
                    const isLow = item.current_count <= item.min_count;
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
                          <div className="flex items-center justify-center gap-1">
                            <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCount(item.id, -1)} disabled={item.current_count === 0}>
                              <Minus className="h-3 w-3" />
                            </Button>
                            <Button variant="outline" size="icon" className="h-6 w-6" onClick={() => updateCount(item.id, 1)}>
                              <Plus className="h-3 w-3" />
                            </Button>
                          </div>
                        </TableCell>
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
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>

        <TabsContent value="orders" className="mt-3">
          {orders.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center">
                <ShoppingCart className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No order requests yet.</p>
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
                    <TableHead className="text-xs text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {orders.map(order => (
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
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
