-- Update is_admin_of_business to also include super_admin
CREATE OR REPLACE FUNCTION public.is_admin_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin') AND business_id = _business_id
  )
$$;

-- Create is_super_admin_of_business
CREATE OR REPLACE FUNCTION public.is_super_admin_of_business(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role = 'super_admin' AND business_id = _business_id
  )
$$;

-- Update has_business_access to include super_admin
CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = _business_id AND role IN ('admin', 'super_admin', 'viewer', 'roster_admin')
  )
$$;

-- Update is_admin to include super_admin
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin')
  )
$$;

-- Create admin_invitations table
CREATE TABLE public.admin_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role app_role NOT NULL,
  departments TEXT[] DEFAULT NULL,
  invited_by UUID NOT NULL,
  token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days')
);

ALTER TABLE public.admin_invitations ENABLE ROW LEVEL SECURITY;

-- Super admins and admins of the business can view invitations
CREATE POLICY "Admins can view own business invitations"
ON public.admin_invitations FOR SELECT
USING (is_admin_of_business(business_id));

-- Only super admins can create invitations
CREATE POLICY "Super admins can insert invitations"
ON public.admin_invitations FOR INSERT
WITH CHECK (is_super_admin_of_business(business_id));

-- Super admins can update invitations (e.g., cancel)
CREATE POLICY "Super admins can update invitations"
ON public.admin_invitations FOR UPDATE
USING (is_super_admin_of_business(business_id));

-- Super admins can delete invitations
CREATE POLICY "Super admins can delete invitations"
ON public.admin_invitations FOR DELETE
USING (is_super_admin_of_business(business_id));

-- Service role can update invitations (for accepting via edge function)
CREATE POLICY "Service role can update invitations"
ON public.admin_invitations FOR UPDATE
USING (true)
WITH CHECK (true);

-- Service role can read invitations (for accepting via edge function)  
CREATE POLICY "Service role can read invitations"
ON public.admin_invitations FOR SELECT
USING (true);

-- Create function to accept invitation (called after signup)
CREATE OR REPLACE FUNCTION public.accept_invitation(_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv RECORD;
  calling_user_id UUID;
  calling_email TEXT;
BEGIN
  calling_user_id := auth.uid();
  IF calling_user_id IS NULL THEN RETURN false; END IF;

  SELECT email INTO calling_email FROM auth.users WHERE id = calling_user_id;

  SELECT * INTO inv FROM admin_invitations
  WHERE token = _token AND status = 'pending' AND expires_at > now() AND LOWER(email) = LOWER(calling_email);

  IF NOT FOUND THEN RETURN false; END IF;

  -- Assign the role
  INSERT INTO user_roles (user_id, role, business_id, departments)
  VALUES (calling_user_id, inv.role, inv.business_id, inv.departments)
  ON CONFLICT DO NOTHING;

  -- Approve profile
  UPDATE profiles SET approved = true WHERE id = calling_user_id;

  -- Mark invitation as accepted
  UPDATE admin_invitations SET status = 'accepted' WHERE id = inv.id;

  RETURN true;
END;
$$;

-- Allow admins to manage user_roles (super_admin check happens in frontend)
-- The existing policy already allows is_admin_of_business which now includes super_admin