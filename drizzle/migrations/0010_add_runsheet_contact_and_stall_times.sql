ALTER TABLE public.crm_runsheets
  ADD COLUMN sales_person_phone text,
  ADD COLUMN event_coordinator_phone text;

ALTER TABLE public.crm_menu_selection_items
  ADD COLUMN service_start_time time without time zone,
  ADD COLUMN service_end_time time without time zone;