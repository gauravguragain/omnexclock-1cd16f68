CREATE TABLE public.crm_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  booking_id uuid NOT NULL REFERENCES public.crm_bookings(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL CHECK (amount <> 0),
  paid_on date NOT NULL DEFAULT (now() AT TIME ZONE 'Australia/Sydney')::date,
  payment_type text NOT NULL DEFAULT 'deposit' CHECK (payment_type IN ('deposit','instalment','balance','extra','refund')),
  method text NOT NULL DEFAULT 'bank_transfer',
  reference text,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX crm_payments_booking_idx ON public.crm_payments(booking_id);
CREATE INDEX crm_payments_business_idx ON public.crm_payments(business_id, paid_on);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_payments TO authenticated;
GRANT ALL ON public.crm_payments TO service_role;
ALTER TABLE public.crm_payments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view payments" ON public.crm_payments FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users add payments" ON public.crm_payments FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update payments" ON public.crm_payments FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users delete payments" ON public.crm_payments FOR DELETE TO authenticated USING (public.can_access_crm(business_id));

CREATE OR REPLACE FUNCTION public.crm_sync_booking_payments()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _bid uuid := COALESCE(NEW.booking_id, OLD.booking_id);
  _paid numeric; _b record; _dep_ok boolean;
BEGIN
  SELECT COALESCE(sum(amount),0) INTO _paid FROM crm_payments WHERE booking_id = _bid;
  SELECT * INTO _b FROM crm_bookings WHERE id = _bid;
  IF NOT FOUND THEN RETURN NULL; END IF;
  _dep_ok := _paid > 0 AND _paid >= COALESCE(_b.deposit_amount,0);
  UPDATE crm_bookings SET deposit_paid = _dep_ok WHERE id = _bid AND deposit_paid IS DISTINCT FROM _dep_ok;
  IF _b.lead_id IS NOT NULL THEN
    IF COALESCE(_b.total_amount,0) > 0 AND _paid >= _b.total_amount THEN
      UPDATE crm_leads SET status = 'full_payment_received' WHERE id = _b.lead_id AND status <> 'full_payment_received';
    ELSIF _dep_ok THEN
      UPDATE crm_leads SET status = 'deposit_received'
        WHERE id = _b.lead_id AND status IN ('new','contacted','inspection_booked','inspected','cold');
    END IF;
  END IF;
  RETURN NULL;
END $$;

CREATE TRIGGER crm_payments_sync AFTER INSERT OR UPDATE OR DELETE ON public.crm_payments
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_booking_payments();