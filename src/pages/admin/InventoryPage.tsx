import { useState } from "react";
import { useBusiness } from "@/contexts/BusinessContext";
import { useAuth } from "@/contexts/AuthContext";
import { Package, Wine, BookOpen } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import InventorySection from "@/components/InventorySection";

const FOH_CATEGORIES = ["Glassware", "Cutlery", "Linen", "Consumables", "Equipment", "Cleaning", "General"];
const BAR_CATEGORIES = ["Spirits", "Wine", "Beer", "Mixers", "Garnishes", "Bar Equipment", "Glassware", "General"];

export default function InventoryPage() {
  const { business } = useBusiness();
  const { user, isAdminOf, isSuperAdminOf, isRosterAdminOf } = useAuth();
  const [activeSection, setActiveSection] = useState("foh");

  const { getRosterAdminDepartments } = useAuth();
  const currentBusinessId = business?.id || "";
  const isAdmin = isAdminOf(currentBusinessId) || isSuperAdminOf(currentBusinessId);
  const isRosterAdmin = isRosterAdminOf(currentBusinessId);
  const rosterDepts = getRosterAdminDepartments(currentBusinessId);
  const isRosterAdminFOH = isRosterAdmin && !isAdmin && rosterDepts.some(d => d.toUpperCase() === "FOH");
  const canManageItems = isAdmin || isRosterAdminFOH;
  const canAdjustAndRequest = isAdmin || isRosterAdmin;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-foreground flex items-center gap-2">
          <Package className="h-5 w-5 text-primary" /> Inventory
        </h2>
        <Button
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => window.open("/induction-guide-inventory.html", "_blank")}
        >
          <BookOpen className="h-3.5 w-3.5" /> Manual
        </Button>
      </div>

      <Tabs value={activeSection} onValueChange={setActiveSection}>
        <TabsList>
          <TabsTrigger value="foh" className="text-xs gap-1.5">
            <Package className="h-3.5 w-3.5" /> FOH
          </TabsTrigger>
          <TabsTrigger value="bar" className="text-xs gap-1.5">
            <Wine className="h-3.5 w-3.5" /> Bar
          </TabsTrigger>
        </TabsList>

        <TabsContent value="foh" className="mt-3">
          <InventorySection
            businessId={currentBusinessId}
            userId={user?.id || ""}
            isAdmin={isAdmin}
            canAdjustAndRequest={canAdjustAndRequest}
            canManageItems={canManageItems}
            itemsTable="inventory_items"
            ordersTable="inventory_orders"
            categories={FOH_CATEGORIES}
            sectionLabel="FOH"
          />
        </TabsContent>

        <TabsContent value="bar" className="mt-3">
          <InventorySection
            businessId={currentBusinessId}
            userId={user?.id || ""}
            isAdmin={isAdmin}
            canAdjustAndRequest={canAdjustAndRequest}
            canManageItems={canManageItems}
            itemsTable="bar_inventory_items"
            ordersTable="bar_inventory_orders"
            categories={BAR_CATEGORIES}
            sectionLabel="Bar"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
