
-- Drop the overly permissive SELECT policy that exposes tokens publicly
DROP POLICY "Service role can read invitations" ON public.admin_invitations;

-- Add a permissive SELECT policy so the restrictive admin policy can work
CREATE POLICY "Authenticated admins can read invitations"
ON public.admin_invitations
FOR SELECT
TO authenticated
USING (is_admin_of_business(business_id) OR is_super_admin_of_business(business_id));
