
-- Add approved column to profiles (existing users default to true)
ALTER TABLE public.profiles ADD COLUMN approved BOOLEAN NOT NULL DEFAULT false;

-- Approve all existing users
UPDATE public.profiles SET approved = true;

-- Create a function to check if user is approved
CREATE OR REPLACE FUNCTION public.is_approved(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = _user_id AND approved = true
  )
$$;
