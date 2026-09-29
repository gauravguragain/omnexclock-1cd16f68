CREATE OR REPLACE FUNCTION public.crm_sync_lead_event_type_to_bookings()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.event_type IS DISTINCT FROM OLD.event_type AND NEW.event_type IS NOT NULL THEN
    UPDATE public.crm_bookings SET event_type = NEW.event_type, updated_at = now()
    WHERE lead_id = NEW.id AND event_type IS DISTINCT FROM NEW.event_type;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_sync_lead_event_type_to_bookings ON public.crm_leads;
CREATE TRIGGER crm_sync_lead_event_type_to_bookings AFTER UPDATE OF event_type ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_lead_event_type_to_bookings();
UPDATE public.crm_bookings b SET event_type = l.event_type FROM public.crm_leads l
WHERE b.lead_id = l.id AND l.event_type IS NOT NULL AND b.event_type IS DISTINCT FROM l.event_type;