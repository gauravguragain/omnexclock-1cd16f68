CREATE OR REPLACE FUNCTION public.crm_find_venue_clash(_business uuid, _id uuid, _ref text, _date date, _venue text, _start time, _end time, _dur int)
RETURNS TABLE(clash_id uuid, clash_venue text, clash_start time, clash_end time, clash_label text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_start time; v_end time; v_venues text[];
BEGIN
  IF _date IS NULL OR NULLIF(btrim(COALESCE(_venue,'')),'') IS NULL THEN RETURN; END IF;
  v_venues := ARRAY(SELECT lower(regexp_replace(btrim(x),'[_\s]+',' ','g')) FROM unnest(string_to_array(_venue, ',')) x
                    WHERE btrim(x) <> '' AND lower(btrim(x)) NOT IN ('tbc','off-site catering'));
  IF array_length(v_venues,1) IS NULL THEN RETURN; END IF;
  v_start := COALESCE(_start,'00:00');
  v_end := COALESCE(_end, CASE WHEN _start IS NOT NULL AND _dur IS NOT NULL THEN _start + make_interval(mins => _dur) END, '23:59:59');
  IF v_end <= v_start THEN v_end := '23:59:59'; END IF;
  RETURN QUERY
  SELECT b.id, b.venue_space, b.start_time, b.end_time, COALESCE(b.event_name, b.event_type, 'another event')::text
  FROM crm_bookings b
  WHERE b.business_id = _business AND b.id <> _id
    AND (_ref IS NULL OR b.external_ref IS DISTINCT FROM _ref)
    AND b.event_date = _date
    AND COALESCE(b.booking_kind,'event') <> 'catering'
    AND b.status IN ('pending_confirmation','confirmed')
    AND EXISTS (SELECT 1 FROM unnest(string_to_array(b.venue_space, ',')) y
                WHERE lower(regexp_replace(btrim(y),'[_\s]+',' ','g')) = ANY (v_venues))
    AND v_start < (CASE WHEN COALESCE(b.end_time, CASE WHEN b.start_time IS NOT NULL AND b.duration_minutes IS NOT NULL THEN b.start_time + make_interval(mins => b.duration_minutes) END, '23:59:59') <= COALESCE(b.start_time,'00:00')
                        THEN '23:59:59'::time
                        ELSE COALESCE(b.end_time, CASE WHEN b.start_time IS NOT NULL AND b.duration_minutes IS NOT NULL THEN b.start_time + make_interval(mins => b.duration_minutes) END, '23:59:59') END)
    AND COALESCE(b.start_time,'00:00') < v_end
  LIMIT 1;
END $$;

REVOKE ALL ON FUNCTION public.crm_find_venue_clash(uuid,uuid,text,date,text,time,time,int) FROM PUBLIC, anon;

CREATE OR REPLACE FUNCTION public.crm_prevent_venue_double_booking()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_clash record; v_msg text;
BEGIN
  -- Imported bookings: drop any old warning; it is re-added only if a real clash exists now.
  IF NEW.external_ref IS NOT NULL AND COALESCE(NEW.notes,'') LIKE '%⚠ Venue clash%' THEN
    NEW.notes := NULLIF(regexp_replace(NEW.notes, '⚠ Venue clash:[^\n]*\n?', '', 'g'), '');
  END IF;
  IF COALESCE(NEW.booking_kind,'event') = 'catering' OR NEW.status NOT IN ('pending_confirmation','confirmed') OR NEW.event_date IS NULL THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.external_ref IS NULL
     AND NEW.event_date IS NOT DISTINCT FROM OLD.event_date AND NEW.start_time IS NOT DISTINCT FROM OLD.start_time
     AND NEW.end_time IS NOT DISTINCT FROM OLD.end_time AND NEW.duration_minutes IS NOT DISTINCT FROM OLD.duration_minutes
     AND NEW.venue_space IS NOT DISTINCT FROM OLD.venue_space AND NEW.status IS NOT DISTINCT FROM OLD.status
     AND NEW.booking_kind IS NOT DISTINCT FROM OLD.booking_kind THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext(NEW.business_id::text || NEW.event_date::text));
  SELECT * INTO v_clash FROM public.crm_find_venue_clash(NEW.business_id, NEW.id, NEW.external_ref, NEW.event_date, NEW.venue_space, NEW.start_time, NEW.end_time, NEW.duration_minutes);
  IF FOUND THEN
    v_msg := format('Venue clash: %s is already booked on %s (%s–%s) by "%s".',
      v_clash.clash_venue, to_char(NEW.event_date,'DD Mon YYYY'),
      COALESCE(to_char(v_clash.clash_start,'HH12:MI AM'),'all day'), COALESCE(to_char(v_clash.clash_end,'HH12:MI AM'),''), v_clash.clash_label);
    IF NEW.external_ref IS NOT NULL THEN
      NEW.notes := '⚠ ' || v_msg || E'\n' || COALESCE(NEW.notes,'');
      RETURN NEW;
    END IF;
    RAISE EXCEPTION '% Choose another venue, date or time.', v_msg USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $function$;

-- Re-check every imported booking (the trigger strips stale warnings and re-adds genuine ones).
UPDATE public.crm_bookings SET notes = notes WHERE notes LIKE '%⚠ Venue clash%';

-- Lead tags follow the bookings.
UPDATE public.crm_leads l SET tags = array_remove(l.tags, 'venue clash')
WHERE 'venue clash' = ANY(COALESCE(l.tags,'{}'))
  AND NOT EXISTS (SELECT 1 FROM public.crm_bookings b WHERE b.lead_id = l.id AND b.notes LIKE '%⚠ Venue clash%');