CREATE OR REPLACE FUNCTION public.crm_apply_menu_estimate_to_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.crm_bookings b
  SET total_amount = NEW.total_estimate
  WHERE b.lead_id = NEW.lead_id
    AND b.business_id = NEW.business_id
    AND b.booking_kind IS DISTINCT FROM 'catering'
    AND b.total_amount IS DISTINCT FROM NEW.total_estimate;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_menu_estimate_to_booking
AFTER INSERT OR UPDATE OF total_estimate ON public.crm_menu_selections
FOR EACH ROW EXECUTE FUNCTION public.crm_apply_menu_estimate_to_booking();

CREATE OR REPLACE FUNCTION public.crm_booking_financial_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _estimate numeric;
BEGIN
  IF NEW.booking_kind IS DISTINCT FROM 'catering' THEN
    SELECT s.total_estimate INTO _estimate FROM public.crm_menu_selections s
      WHERE s.lead_id = NEW.lead_id AND s.business_id = NEW.business_id;
    IF FOUND THEN NEW.total_amount := _estimate; END IF;
  END IF;
  IF TG_OP = 'INSERT' OR NEW.total_amount IS DISTINCT FROM OLD.total_amount
    OR NEW.deposit_amount IS DISTINCT FROM OLD.deposit_amount THEN
    IF EXISTS (SELECT 1 FROM public.crm_payments p WHERE p.booking_id = NEW.id) THEN
      NEW.deposit_paid := (SELECT COALESCE(sum(p.amount), 0) > 0
        AND COALESCE(sum(p.amount), 0) >= COALESCE(NEW.deposit_amount, 0)
        FROM public.crm_payments p WHERE p.booking_id = NEW.id);
    END IF;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER crm_booking_financial_defaults_trigger
BEFORE INSERT OR UPDATE OF total_amount, deposit_amount, lead_id, booking_kind ON public.crm_bookings
FOR EACH ROW EXECUTE FUNCTION public.crm_booking_financial_defaults();