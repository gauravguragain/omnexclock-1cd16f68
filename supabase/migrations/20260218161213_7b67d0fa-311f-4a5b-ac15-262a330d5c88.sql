
-- Table to store password reset OTPs
CREATE TABLE public.password_reset_otps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamp with time zone NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.password_reset_otps ENABLE ROW LEVEL SECURITY;

-- Only service role can access this table (edge functions use service role)
-- No user-facing policies needed

-- Auto-cleanup old OTPs (optional index for performance)
CREATE INDEX idx_password_reset_otps_email ON public.password_reset_otps (email, used, expires_at);
