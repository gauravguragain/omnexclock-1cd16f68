CREATE OR REPLACE FUNCTION public.crm_prevent_venue_double_booking()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  v_start time; v_end time; v_clash record; v_venues text[]; v_msg text;
BEGIN
  IF COALESCE(NEW.booking_kind,'event') = 'catering'
     OR NEW.status NOT IN ('pending_confirmation','confirmed')
     OR NEW.event_date IS NULL
     OR NULLIF(btrim(COALESCE(NEW.venue_space,'')),'') IS NULL THEN
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

  v_venues := ARRAY(SELECT lower(regexp_replace(btrim(x),'[_\s]+',' ','g'))
                    FROM unnest(string_to_array(NEW.venue_space, ',')) x
                    WHERE btrim(x) <> '' AND lower(btrim(x)) NOT IN ('tbc','off-site catering'));
  IF array_length(v_venues,1) IS NULL THEN RETURN NEW; END IF;

  v_start := COALESCE(NEW.start_time, '00:00');
  v_end := COALESCE(NEW.end_time,
    CASE WHEN NEW.start_time IS NOT NULL AND NEW.duration_minutes IS NOT NULL
         THEN NEW.start_time + make_interval(mins => NEW.duration_minutes) END,
    '23:59:59');
  IF v_end <= v_start THEN v_end := '23:59:59'; END IF;

  SELECT b.id, b.venue_space, b.start_time, b.end_time,
         COALESCE(b.event_name, b.event_type, 'another event') AS label
    INTO v_clash
  FROM crm_bookings b
  WHERE b.business_id = NEW.business_id
    AND b.id <> NEW.id
    AND b.event_date = NEW.event_date
    AND COALESCE(b.booking_kind,'event') <> 'catering'
    AND b.status IN ('pending_confirmation','confirmed')
    AND EXISTS (
      SELECT 1 FROM unnest(string_to_array(b.venue_space, ',')) y
      WHERE lower(regexp_replace(btrim(y),'[_\s]+',' ','g')) = ANY (v_venues))
    AND v_start < (CASE WHEN COALESCE(b.end_time,
                     CASE WHEN b.start_time IS NOT NULL AND b.duration_minutes IS NOT NULL
                          THEN b.start_time + make_interval(mins => b.duration_minutes) END,
                     '23:59:59') <= COALESCE(b.start_time,'00:00') THEN '23:59:59'::time
                   ELSE COALESCE(b.end_time,
                     CASE WHEN b.start_time IS NOT NULL AND b.duration_minutes IS NOT NULL
                          THEN b.start_time + make_interval(mins => b.duration_minutes) END,
                     '23:59:59') END)
    AND COALESCE(b.start_time,'00:00') < v_end
  LIMIT 1;

  IF FOUND THEN
    v_msg := format('Venue clash: %s is already booked on %s (%s–%s) by "%s".',
      v_clash.venue_space, to_char(NEW.event_date,'DD Mon YYYY'),
      COALESCE(to_char(v_clash.start_time,'HH12:MI AM'),'all day'),
      COALESCE(to_char(v_clash.end_time,'HH12:MI AM'),''), v_clash.label);
    IF NEW.external_ref IS NOT NULL THEN
      IF COALESCE(NEW.notes,'') NOT LIKE '%⚠ Venue clash%' THEN
        NEW.notes := '⚠ ' || v_msg || E'\n' || COALESCE(NEW.notes,'');
      END IF;
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '% Choose another venue, date or time.', v_msg USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;