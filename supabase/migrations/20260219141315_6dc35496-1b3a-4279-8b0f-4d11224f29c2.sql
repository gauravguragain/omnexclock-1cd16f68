
-- Roster admins: can SELECT and UPDATE (adjust counts) inventory items, but NOT insert/delete
CREATE POLICY "Roster admins can view own business inventory"
ON public.inventory_items
FOR SELECT
USING (is_roster_admin_of_business(business_id));

CREATE POLICY "Roster admins can update inventory counts"
ON public.inventory_items
FOR UPDATE
USING (is_roster_admin_of_business(business_id));

-- Roster admins: can SELECT and INSERT (submit requests) inventory orders, but NOT delete
CREATE POLICY "Roster admins can view own business orders"
ON public.inventory_orders
FOR SELECT
USING (is_roster_admin_of_business(business_id));

CREATE POLICY "Roster admins can submit order requests"
ON public.inventory_orders
FOR INSERT
WITH CHECK (is_roster_admin_of_business(business_id));
