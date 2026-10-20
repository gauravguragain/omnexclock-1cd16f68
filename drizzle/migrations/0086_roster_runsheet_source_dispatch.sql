CREATE OR REPLACE FUNCTION public.crm_roster_source_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
 IF TG_TABLE_NAME='crm_runsheets' THEN
  PERFORM public.crm_sync_runsheet_roster(NEW.id);
 ELSIF TG_TABLE_NAME='crm_bookings' THEN
  FOR r IN SELECT rs.id FROM public.crm_runsheets rs WHERE rs.business_id=NEW.business_id AND (rs.booking_id=NEW.id OR (rs.booking_id IS NULL AND rs.lead_id=NEW.lead_id)) LOOP PERFORM public.crm_sync_runsheet_roster(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='crm_leads' THEN
  FOR r IN SELECT rs.id FROM public.crm_runsheets rs WHERE rs.business_id=NEW.business_id AND rs.lead_id=NEW.id LOOP PERFORM public.crm_sync_runsheet_roster(r.id); END LOOP;
 ELSIF TG_TABLE_NAME='crm_menu_selections' THEN
  FOR r IN SELECT rs.id FROM public.crm_runsheets rs WHERE rs.business_id=NEW.business_id AND rs.lead_id=NEW.lead_id LOOP PERFORM public.crm_sync_runsheet_roster(r.id); END LOOP;
 END IF;
 RETURN NEW;
END;
$$;