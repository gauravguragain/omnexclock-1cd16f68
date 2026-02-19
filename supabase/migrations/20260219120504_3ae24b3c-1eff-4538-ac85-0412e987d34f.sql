
-- Fix hours_worked generated column to handle overnight shifts
ALTER TABLE public.shifts DROP COLUMN hours_worked;

ALTER TABLE public.shifts ADD COLUMN hours_worked numeric GENERATED ALWAYS AS (
  CASE
    WHEN end_time >= start_time THEN
      (EXTRACT(epoch FROM (end_time - start_time)) / 3600.0) - (break_minutes::numeric / 60.0)
    ELSE
      ((EXTRACT(epoch FROM (end_time - start_time)) / 3600.0) + 24.0) - (break_minutes::numeric / 60.0)
  END
) STORED;
