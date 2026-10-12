CREATE UNIQUE INDEX IF NOT EXISTS crm_tasks_auto_booking_type_uniq ON public.crm_tasks (booking_id, task_type) WHERE automated AND booking_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.crm_sync_booking_auto_tasks()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _name text; _etype text; _label text; _base timestamptz;
BEGIN
  IF NEW.event_date IS NULL THEN RETURN NEW; END IF;
  IF NEW.status = 'cancelled' THEN
    UPDATE public.crm_tasks SET status = 'dismissed', updated_at = now()
     WHERE booking_id = NEW.id AND automated AND status = 'open'
       AND task_type IN ('event_final_check','event_ops_brief');
    RETURN NEW;
  END IF;
  IF NEW.status <> 'confirmed' OR NEW.event_date < (now() AT TIME ZONE 'Australia/Sydney')::date THEN RETURN NEW; END IF;

  SELECT full_name, event_type INTO _name, _etype FROM public.crm_leads WHERE id = NEW.lead_id;
  _name := coalesce(nullif(btrim(_name), ''), 'Client');
  _label := CASE WHEN NEW.booking_kind = 'catering' THEN 'Catering'
                 ELSE coalesce(nullif(initcap(replace(coalesce(NEW.event_type, _etype, ''), '_', ' ')), ''), 'Event') END;
  _base := (NEW.event_date::timestamp + time '09:00') AT TIME ZONE 'Australia/Sydney';

  INSERT INTO public.crm_tasks (business_id, lead_id, booking_id, title, description, task_type, priority, status, automated, due_at)
  VALUES
   (NEW.business_id, NEW.lead_id, NEW.id, 'Final numbers and payment check — ' || _name || ' (' || _label || ')',
    'Confirm final guest numbers and collect the outstanding balance.', 'event_final_check', 'high', 'open', true, _base - interval '7 days'),
   (NEW.business_id, NEW.lead_id, NEW.id, 'Operations brief — ' || _name || ' (' || _label || ')',
    'Walk the floor and kitchen through the run sheet.', 'event_ops_brief', 'high', 'open', true, _base - interval '1 day')
  ON CONFLICT (booking_id, task_type) WHERE automated AND booking_id IS NOT NULL DO NOTHING;

  -- Keep open automated tasks aligned when the event date moves.
  IF TG_OP = 'UPDATE' AND OLD.event_date IS DISTINCT FROM NEW.event_date THEN
    UPDATE public.crm_tasks SET due_at = CASE task_type WHEN 'event_final_check' THEN _base - interval '7 days' ELSE _base - interval '1 day' END, updated_at = now()
     WHERE booking_id = NEW.id AND automated AND status = 'open' AND task_type IN ('event_final_check','event_ops_brief');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS crm_bookings_auto_tasks ON public.crm_bookings;
CREATE TRIGGER crm_bookings_auto_tasks AFTER INSERT OR UPDATE OF status, event_date ON public.crm_bookings
FOR EACH ROW EXECUTE FUNCTION public.crm_sync_booking_auto_tasks();

-- Backfill tasks for confirmed upcoming bookings.
UPDATE public.crm_bookings SET status = status WHERE status = 'confirmed' AND event_date >= (now() AT TIME ZONE 'Australia/Sydney')::date;