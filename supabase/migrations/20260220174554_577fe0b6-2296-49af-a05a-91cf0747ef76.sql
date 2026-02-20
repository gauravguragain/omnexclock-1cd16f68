
-- Add source column to shifts table to distinguish AI-generated from manual drafts
ALTER TABLE public.shifts ADD COLUMN source text NOT NULL DEFAULT 'manual';

-- Add index for quick filtering
CREATE INDEX idx_shifts_source ON public.shifts(source);
