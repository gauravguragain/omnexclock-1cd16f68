
-- Enable RLS on password_reset_otps (it may already be enabled but with no policies)
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- No SELECT/INSERT/UPDATE/DELETE policies for anon or authenticated roles.
-- All access is via the edge function using the service role key, which bypasses RLS.
-- This effectively blocks all direct client access.
