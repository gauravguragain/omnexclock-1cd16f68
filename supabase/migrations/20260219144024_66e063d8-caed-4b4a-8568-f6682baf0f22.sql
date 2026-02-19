
-- Bar Inventory Items
CREATE TABLE public.bar_inventory_items (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'General',
  current_count INTEGER NOT NULL DEFAULT 0,
  min_count INTEGER NOT NULL DEFAULT 0,
  unit TEXT DEFAULT 'pcs',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own business bar inventory"
ON public.bar_inventory_items FOR ALL
USING (is_admin_of_business(business_id))
WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Super admins can manage own business bar inventory"
ON public.bar_inventory_items FOR ALL
USING (is_super_admin_of_business(business_id))
WITH CHECK (is_super_admin_of_business(business_id));

CREATE POLICY "Roster admins can view own business bar inventory"
ON public.bar_inventory_items FOR SELECT
USING (is_roster_admin_of_business(business_id));

CREATE POLICY "Roster admins can update bar inventory counts"
ON public.bar_inventory_items FOR UPDATE
USING (is_roster_admin_of_business(business_id));

-- Bar Inventory Orders
CREATE TABLE public.bar_inventory_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  item_id UUID NOT NULL REFERENCES public.bar_inventory_items(id) ON DELETE CASCADE,
  quantity INTEGER NOT NULL DEFAULT 1,
  status TEXT NOT NULL DEFAULT 'pending',
  requested_by UUID NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.bar_inventory_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own business bar orders"
ON public.bar_inventory_orders FOR ALL
USING (is_admin_of_business(business_id))
WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Super admins can manage own business bar orders"
ON public.bar_inventory_orders FOR ALL
USING (is_super_admin_of_business(business_id))
WITH CHECK (is_super_admin_of_business(business_id));

CREATE POLICY "Roster admins can view own business bar orders"
ON public.bar_inventory_orders FOR SELECT
USING (is_roster_admin_of_business(business_id));

CREATE POLICY "Roster admins can submit bar order requests"
ON public.bar_inventory_orders FOR INSERT
WITH CHECK (is_roster_admin_of_business(business_id));
