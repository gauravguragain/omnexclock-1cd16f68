-- Ensure DELETE realtime events include full row data (employee_id etc.)
ALTER TABLE public.clock_events REPLICA IDENTITY FULL;