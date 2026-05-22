
CREATE OR REPLACE FUNCTION public.accept_pending_invitations_for_user()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  calling_user_id UUID;
  calling_email TEXT;
  inv RECORD;
  accepted_count INTEGER := 0;
BEGIN
  calling_user_id := auth.uid();
  IF calling_user_id IS NULL THEN RETURN 0; END IF;

  SELECT email INTO calling_email FROM auth.users WHERE id = calling_user_id;
  IF calling_email IS NULL THEN RETURN 0; END IF;

  FOR inv IN
    SELECT * FROM admin_invitations
    WHERE status = 'pending'
      AND expires_at > now()
      AND LOWER(email) = LOWER(calling_email)
  LOOP
    INSERT INTO user_roles (user_id, role, business_id, departments)
    VALUES (calling_user_id, inv.role, inv.business_id, inv.departments)
    ON CONFLICT DO NOTHING;

    UPDATE admin_invitations SET status = 'accepted' WHERE id = inv.id;
    accepted_count := accepted_count + 1;
  END LOOP;

  IF accepted_count > 0 THEN
    UPDATE profiles SET approved = true WHERE id = calling_user_id;
  END IF;

  RETURN accepted_count;
END;
$$;
