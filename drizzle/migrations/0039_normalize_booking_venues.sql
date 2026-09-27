CREATE OR REPLACE FUNCTION public.crm_normalize_venue_space() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.venue_space IS NOT NULL AND NEW.venue_space <> '' THEN
    SELECT string_agg(COALESCE(s.name, btrim(p.part)), ', ' ORDER BY p.ord) INTO NEW.venue_space
    FROM unnest(string_to_array(NEW.venue_space, ',')) WITH ORDINALITY AS p(part, ord)
    LEFT JOIN LATERAL (
      SELECT v.name FROM public.crm_venue_spaces v
      WHERE v.business_id = NEW.business_id
        AND lower(regexp_replace(v.name, '[^a-zA-Z0-9]+', '', 'g')) = lower(regexp_replace(p.part, '[^a-zA-Z0-9]+', '', 'g'))
      LIMIT 1) s ON true;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_bookings_normalize_venue ON public.crm_bookings;
CREATE TRIGGER crm_bookings_normalize_venue BEFORE INSERT OR UPDATE OF venue_space ON public.crm_bookings FOR EACH ROW EXECUTE FUNCTION public.crm_normalize_venue_space();
UPDATE public.crm_bookings SET venue_space = venue_space WHERE venue_space IS NOT NULL AND venue_space <> '';