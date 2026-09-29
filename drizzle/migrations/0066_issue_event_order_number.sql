CREATE OR REPLACE FUNCTION public.crm_issue_event_order(_runsheet_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r record; base int; nxt text;
BEGIN
  SELECT id, business_id, booking_id, event_order_number, coalesce(revision,1) AS rev INTO r FROM crm_runsheets WHERE id=_runsheet_id;
  IF r.id IS NULL OR NOT public.can_access_crm(r.business_id) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  IF r.event_order_number ~ '^\d+(-\d+)?$' AND split_part(r.event_order_number,'-',1)::int >= 717 THEN
    base := split_part(r.event_order_number,'-',1)::int;
  ELSE
    PERFORM pg_advisory_xact_lock(hashtext('event_order:' || r.business_id::text));
    SELECT greatest(716, coalesce(max(n),0)) + 1 INTO base FROM (
      SELECT split_part(event_order_number,'-',1)::int n FROM crm_runsheets WHERE business_id=r.business_id AND id<>r.id AND event_order_number ~ '^\d+(-\d+)?$'
      UNION ALL
      SELECT split_part(event_order_number,'-',1)::int FROM crm_bookings WHERE business_id=r.business_id AND event_order_number ~ '^\d+(-\d+)?$' AND (r.booking_id IS NULL OR id<>r.booking_id)
    ) s WHERE n >= 717 AND n < 100000;
  END IF;
  nxt := base::text || '-' || r.rev::text;
  UPDATE crm_runsheets SET event_order_number=nxt WHERE id=r.id;
  IF r.booking_id IS NOT NULL THEN UPDATE crm_bookings SET event_order_number=nxt WHERE id=r.booking_id; END IF;
  RETURN nxt;
END $$;
REVOKE ALL ON FUNCTION public.crm_issue_event_order(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_issue_event_order(uuid) TO authenticated;