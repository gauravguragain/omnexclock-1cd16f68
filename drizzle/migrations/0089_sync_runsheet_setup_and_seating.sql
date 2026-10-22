ALTER TABLE public.roster_day_events ADD COLUMN ops_notes text, ADD COLUMN foh_notes text, ADD COLUMN seating_auto boolean NOT NULL DEFAULT true;
UPDATE public.roster_day_events SET seating_auto=false WHERE num_tables>0;
COMMENT ON COLUMN public.roster_day_events.seating_auto IS 'Automatic guest-based table estimate; false preserves a manually entered table count.';
CREATE OR REPLACE FUNCTION public.crm_sync_runsheet_roster(_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE sheet public.crm_runsheets; setup text; catering boolean;
BEGIN
 INSERT INTO public.roster_day_events (crm_runsheet_id,business_id,date,event_space,event_type,event_time,adult_guests,kids_guests,host_name,host_contact_number,bev_package,banquet_tier,notes)
 SELECT * FROM public.crm_roster_runsheet_values(_id)
 ON CONFLICT (crm_runsheet_id) WHERE crm_runsheet_id IS NOT NULL DO UPDATE SET business_id=EXCLUDED.business_id,date=EXCLUDED.date,event_space=EXCLUDED.event_space,event_type=EXCLUDED.event_type,event_time=EXCLUDED.event_time,adult_guests=EXCLUDED.adult_guests,kids_guests=EXCLUDED.kids_guests,host_name=EXCLUDED.host_name,host_contact_number=EXCLUDED.host_contact_number,bev_package=EXCLUDED.bev_package,banquet_tier=EXCLUDED.banquet_tier,notes=EXCLUDED.notes,updated_at=now();
 DELETE FROM public.roster_day_events WHERE crm_runsheet_id=_id AND NOT EXISTS (SELECT 1 FROM public.crm_roster_runsheet_values(_id));
 SELECT * INTO sheet FROM public.crm_runsheets WHERE id=_id;
 setup:=lower(COALESCE(array_to_string(sheet.setup_items,' | '),''));
 SELECT b.booking_kind='catering' INTO catering FROM public.crm_bookings b WHERE b.business_id=sheet.business_id AND (b.id=sheet.booking_id OR (sheet.booking_id IS NULL AND b.lead_id=sheet.lead_id)) ORDER BY b.updated_at DESC,b.id LIMIT 1;
 UPDATE public.roster_day_events SET ops_notes=NULLIF(sheet.ops_notes,''),foh_notes=NULLIF(sheet.foh_notes,''),
 red_carpet=setup LIKE '%red carpet%',smoke_machine=setup LIKE '%smoke machine%',dry_ice=setup LIKE '%dry ice%',cold_sparkles=(setup LIKE '%cold spark%' OR setup LIKE '%cold sparkle%'),decor_access=(setup LIKE '%decor access%' OR setup LIKE '%décor access%'),
 tablecloth_color=CASE WHEN setup ~ 'white table\s*cloth' THEN 'white' WHEN setup ~ 'black table\s*cloth' THEN 'black' ELSE NULL END,
 live_stall=EXISTS(SELECT 1 FROM public.crm_menu_selection_items i JOIN public.crm_menu_selections s ON s.id=i.selection_id AND s.business_id=i.business_id WHERE s.business_id=sheet.business_id AND s.id=(SELECT id FROM public.crm_menu_selections WHERE business_id=sheet.business_id AND lead_id=sheet.lead_id ORDER BY updated_at DESC,id LIMIT 1) AND i.course='live_stall'),
 chairs_per_table=CASE WHEN NOT COALESCE(catering,false) AND seating_auto THEN COALESCE(NULLIF(chairs_per_table,0),8) ELSE chairs_per_table END,
 num_tables=CASE WHEN NOT COALESCE(catering,false) AND seating_auto THEN ceil((adult_guests+kids_guests)::numeric/COALESCE(NULLIF(chairs_per_table,0),8))::integer ELSE num_tables END
 WHERE crm_runsheet_id=_id;
END $$;
REVOKE ALL ON FUNCTION public.crm_sync_runsheet_roster(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.crm_sync_runsheet_roster(uuid) TO service_role;
CREATE FUNCTION public.crm_roster_recalculate_seating() RETURNS trigger LANGUAGE plpgsql SET search_path=public AS $$
BEGIN
 IF NEW.crm_runsheet_id IS NOT NULL AND NEW.seating_auto AND NEW.chairs_per_table IS DISTINCT FROM OLD.chairs_per_table THEN
 NEW.num_tables:=ceil((NEW.adult_guests+NEW.kids_guests)::numeric/GREATEST(NEW.chairs_per_table,1))::integer;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER roster_recalculate_seating BEFORE UPDATE ON public.roster_day_events FOR EACH ROW EXECUTE FUNCTION public.crm_roster_recalculate_seating();