
-- Add status column to businesses
ALTER TABLE public.businesses ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

-- Create business_notes table for internal master admin notes
CREATE TABLE public.business_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  author_id uuid NOT NULL,
  content text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.business_notes ENABLE ROW LEVEL SECURITY;

-- Only master admins can manage business notes
CREATE POLICY "Master can view business notes"
  ON public.business_notes FOR SELECT
  USING (is_master());

CREATE POLICY "Master can insert business notes"
  ON public.business_notes FOR INSERT
  WITH CHECK (is_master());

CREATE POLICY "Master can delete business notes"
  ON public.business_notes FOR DELETE
  USING (is_master());

-- Allow master to update business status
CREATE POLICY "Master can update businesses"
  ON public.businesses FOR UPDATE
  USING (is_master());
