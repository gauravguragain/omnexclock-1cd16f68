
-- Notifications table for both admin users and employees
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID REFERENCES public.businesses(id) ON DELETE CASCADE NOT NULL,
  -- For admin notifications (user_id set, employee_id null)
  -- For employee notifications (employee_id set, user_id null)
  user_id UUID DEFAULT NULL,
  employee_id UUID REFERENCES public.employees(id) ON DELETE CASCADE DEFAULT NULL,
  type TEXT NOT NULL, -- 'shift_change', 'request_update', 'forum_activity', 'general'
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  read BOOLEAN NOT NULL DEFAULT false,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Admins can view notifications for their business
CREATE POLICY "Admins can view own business notifications"
ON public.notifications FOR SELECT
USING (is_admin_of_business(business_id) AND user_id = auth.uid());

-- Admins can update (mark read) their own notifications
CREATE POLICY "Admins can update own notifications"
ON public.notifications FOR UPDATE
USING (is_admin_of_business(business_id) AND user_id = auth.uid());

-- Admins can delete their own notifications
CREATE POLICY "Admins can delete own notifications"
ON public.notifications FOR DELETE
USING (is_admin_of_business(business_id) AND user_id = auth.uid());

-- Anon/employee can read notifications by employee_id (accessed via RPC)
CREATE POLICY "Anyone can read employee notifications"
ON public.notifications FOR SELECT
USING (employee_id IS NOT NULL);

-- Service role / admin can insert notifications
CREATE POLICY "Admins can insert notifications for own business"
ON public.notifications FOR INSERT
WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Service role can insert notifications"
ON public.notifications FOR INSERT
WITH CHECK (true);

-- Index for fast lookups
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id, read, created_at DESC);
CREATE INDEX idx_notifications_employee_id ON public.notifications(employee_id, read, created_at DESC);
CREATE INDEX idx_notifications_business_id ON public.notifications(business_id, created_at DESC);

-- RPC for employees to fetch their notifications by code
CREATE OR REPLACE FUNCTION public.get_employee_notifications(_employee_code TEXT, _business_code TEXT DEFAULT NULL)
RETURNS TABLE(id UUID, type TEXT, title TEXT, message TEXT, read BOOLEAN, metadata JSONB, created_at TIMESTAMPTZ)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT n.id, n.type, n.title, n.message, n.read, n.metadata, n.created_at
  FROM notifications n
  WHERE n.employee_id = emp_id
  ORDER BY n.created_at DESC
  LIMIT 50;
END;
$$;

-- RPC for employees to mark notification as read
CREATE OR REPLACE FUNCTION public.mark_employee_notification_read(_employee_code TEXT, _notification_id UUID, _business_code TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE notifications SET read = true WHERE id = _notification_id AND employee_id = emp_id;
  RETURN FOUND;
END;
$$;

-- RPC for employees to mark all notifications as read
CREATE OR REPLACE FUNCTION public.mark_all_employee_notifications_read(_employee_code TEXT, _business_code TEXT DEFAULT NULL)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  emp_id UUID;
  biz_id UUID;
BEGIN
  IF _business_code IS NOT NULL THEN
    SELECT b.id INTO biz_id FROM businesses b WHERE b.business_code = _business_code;
    IF NOT FOUND THEN RETURN false; END IF;
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true AND e.business_id = biz_id;
  ELSE
    SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  END IF;
  IF NOT FOUND THEN RETURN false; END IF;

  UPDATE notifications SET read = true WHERE employee_id = emp_id AND read = false;
  RETURN true;
END;
$$;
