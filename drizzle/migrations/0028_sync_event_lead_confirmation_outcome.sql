CREATE OR REPLACE FUNCTION public.crm_sync_event_lead_outcome()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.lead_kind, 'event') = 'event' AND COALESCE(NEW.event_type, '') <> 'catering' THEN
    IF NEW.status IN ('deposit_received', 'menu_selected', 'invoice_sent', 'runsheet_sent', 'full_payment_received') THEN
      NEW.lead_outcome := 'confirmed';
    ELSIF NEW.status = 'cold' THEN
      NEW.lead_outcome := 'declined';
    ELSIF OLD IS NULL OR OLD.status IS DISTINCT FROM NEW.status THEN
      NEW.lead_outcome := 'new';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_leads_sync_event_outcome ON public.crm_leads;
CREATE TRIGGER crm_leads_sync_event_outcome
BEFORE INSERT OR UPDATE OF status, lead_kind, event_type ON public.crm_leads
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_event_lead_outcome();