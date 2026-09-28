CREATE OR REPLACE FUNCTION public.crm_find_venue_clash(_business uuid, _id uuid, _ref text, _date date, _venue text, _start time, _end time, _dur int)
RETURNS TABLE(clash_id uuid, clash_venue text, clash_start time, clash_end time, clash_label text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH requested AS (
    SELECT
      _date + COALESCE(_start, '00:00'::time) AS starts_at,
      CASE
        WHEN COALESCE(_end, _start + make_interval(mins => _dur), '23:59:59'::time) <= COALESCE(_start, '00:00'::time)
          THEN (_date + 1) + COALESCE(_end, _start + make_interval(mins => _dur), '23:59:59'::time)
        ELSE _date + COALESCE(_end, _start + make_interval(mins => _dur), '23:59:59'::time)
      END AS ends_at,
      ARRAY(
        SELECT lower(regexp_replace(btrim(part), '[_\s]+', ' ', 'g'))
        FROM unnest(string_to_array(COALESCE(_venue, ''), ',')) part
        WHERE btrim(part) <> '' AND lower(btrim(part)) NOT IN ('tbc', 'off-site catering')
      ) AS venues
  )
  SELECT b.id, b.venue_space, b.start_time, b.end_time,
         COALESCE(b.event_name, b.event_type, 'another event')::text
  FROM requested r
  JOIN public.crm_bookings b ON b.business_id = _business
  WHERE _date IS NOT NULL
    AND cardinality(r.venues) > 0
    AND b.id <> _id
    AND (_ref IS NULL OR b.external_ref IS DISTINCT FROM _ref)
    AND b.event_date = _date
    AND COALESCE(b.booking_kind, 'event') <> 'catering'
    AND b.status IN ('pending_confirmation', 'confirmed')
    AND EXISTS (
      SELECT 1 FROM unnest(string_to_array(COALESCE(b.venue_space, ''), ',')) part
      WHERE lower(regexp_replace(btrim(part), '[_\s]+', ' ', 'g')) = ANY(r.venues)
    )
    AND r.starts_at < CASE
      WHEN COALESCE(b.end_time, b.start_time + make_interval(mins => b.duration_minutes), '23:59:59'::time) <= COALESCE(b.start_time, '00:00'::time)
        THEN (b.event_date + 1) + COALESCE(b.end_time, b.start_time + make_interval(mins => b.duration_minutes), '23:59:59'::time)
      ELSE b.event_date + COALESCE(b.end_time, b.start_time + make_interval(mins => b.duration_minutes), '23:59:59'::time)
    END
    AND b.event_date + COALESCE(b.start_time, '00:00'::time) < r.ends_at
  ORDER BY b.start_time, b.id
  LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.crm_find_venue_clash(uuid,uuid,text,date,text,time,time,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.crm_find_venue_clash(uuid,uuid,text,date,text,time,time,int) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.crm_prevent_venue_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_clash record; v_msg text;
BEGIN
  IF COALESCE(NEW.booking_kind, 'event') = 'catering'
     OR NEW.status NOT IN ('pending_confirmation', 'confirmed')
     OR NEW.event_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.event_date IS NOT DISTINCT FROM OLD.event_date
     AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time
     AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes
     AND NEW.venue_space IS NOT DISTINCT FROM OLD.venue_space
     AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.booking_kind IS NOT DISTINCT FROM OLD.booking_kind THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text || NEW.event_date::text));
  SELECT * INTO v_clash
  FROM public.crm_find_venue_clash(NEW.business_id, NEW.id, NEW.external_ref, NEW.event_date, NEW.venue_space, NEW.start_time, NEW.end_time, NEW.duration_minutes);
  IF FOUND AND NEW.external_ref IS NULL THEN
    v_msg := format('Venue clash: %s is already booked on %s (%s–%s) by "%s".',
      v_clash.clash_venue, to_char(NEW.event_date, 'DD Mon YYYY'),
      COALESCE(to_char(v_clash.clash_start, 'HH12:MI AM'), 'all day'),
      COALESCE(to_char(v_clash.clash_end, 'HH12:MI AM'), ''), v_clash.clash_label);
    RAISE EXCEPTION '% Choose another venue, date or time.', v_msg USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE VIEW public.crm_booking_venue_clashes
WITH (security_invoker = true) AS
SELECT
  b.id AS booking_id,
  b.business_id,
  b.lead_id,
  clash.clash_id,
  clash.clash_venue,
  clash.clash_start,
  clash.clash_end,
  clash.clash_label
FROM public.crm_bookings b
CROSS JOIN LATERAL public.crm_find_venue_clash(
  b.business_id, b.id, b.external_ref, b.event_date, b.venue_space,
  b.start_time, b.end_time, b.duration_minutes
) clash
WHERE COALESCE(b.booking_kind, 'event') <> 'catering'
  AND b.status IN ('pending_confirmation', 'confirmed');

GRANT SELECT ON public.crm_booking_venue_clashes TO authenticated;
GRANT SELECT ON public.crm_booking_venue_clashes TO service_role;
COMMENT ON VIEW public.crm_booking_venue_clashes IS 'Live venue clashes for active non-catering bookings; replaces deprecated warning text and lead tags.';