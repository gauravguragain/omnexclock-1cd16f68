
-- FOH Inventory Items
CREATE TABLE public.inventory_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name text NOT NULL,
  category text DEFAULT 'General',
  current_count integer NOT NULL DEFAULT 0,
  min_count integer NOT NULL DEFAULT 0,
  unit text DEFAULT 'pcs',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own business inventory"
  ON public.inventory_items FOR ALL
  USING (is_admin_of_business(business_id))
  WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Super admins can manage own business inventory"
  ON public.inventory_items FOR ALL
  USING (is_super_admin_of_business(business_id))
  WITH CHECK (is_super_admin_of_business(business_id));

-- FOH Inventory Order Requests
CREATE TABLE public.inventory_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  item_id uuid NOT NULL REFERENCES public.inventory_items(id) ON DELETE CASCADE,
  quantity integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  requested_by uuid NOT NULL,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.inventory_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage own business orders"
  ON public.inventory_orders FOR ALL
  USING (is_admin_of_business(business_id))
  WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Super admins can manage own business orders"
  ON public.inventory_orders FOR ALL
  USING (is_super_admin_of_business(business_id))
  WITH CHECK (is_super_admin_of_business(business_id));

-- Trigger for updated_at
CREATE TRIGGER update_inventory_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_inventory_orders_updated_at
  BEFORE UPDATE ON public.inventory_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
