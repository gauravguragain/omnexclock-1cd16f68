
-- Step 1: Add roster_admin to the app_role enum and add departments column
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'roster_admin';
ALTER TABLE public.user_roles ADD COLUMN IF NOT EXISTS departments text[] DEFAULT NULL;
