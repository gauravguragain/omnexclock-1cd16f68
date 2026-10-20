ALTER TABLE public.roster_day_events ADD COLUMN crm_runsheet_id uuid REFERENCES public.crm_runsheets(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX roster_day_events_crm_runsheet_unique ON public.roster_day_events(crm_runsheet_id) WHERE crm_runsheet_id IS NOT NULL;
COMMENT ON COLUMN public.roster_day_events.crm_runsheet_id IS 'Canonical emailed CRM run sheet; source-owned summary fields are synchronized, roster-specific equipment and seating remain editable.';

CREATE FUNCTION public.crm_roster_runsheet_values(_id uuid)
RETURNS TABLE(crm_runsheet_id uuid, business_id uuid, date date, event_space text, event_type text, event_time text, adult_guests integer, kids_guests integer, host_name text, host_contact_number text, bev_package text, banquet_tier text, notes text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT rs.id, rs.business_id, b.event_date,
 CASE WHEN b.booking_kind = 'catering' THEN CASE WHEN b.fulfilment_method = 'pickup' THEN 'Pickup' ELSE COALESCE(b.service_location, l.service_location, 'Delivery') END ELSE COALESCE(NULLIF(b.venue_space,''), l.venue_space) END,
 CASE WHEN b.booking_kind = 'catering' THEN 'Catering' ELSE initcap(replace(COALESCE(NULLIF(l.event_type,''),NULLIF(b.event_type,''),'Event'),'_',' ')) END,
 to_char(b.start_time,'FMHH12:MI AM') || ' – ' || to_char(b.start_time + make_interval(mins => b.duration_minutes),'FMHH12:MI AM'),
 COALESCE(rs.adult_guests,b.adults,0), COALESCE(rs.kids_guests,b.kids,0), l.full_name, l.phone,
 sel.beverage_package, sel.package_name,
 NULLIF(concat_ws(E'\n', NULLIF(array_to_string(rs.setup_items,E'\n'),''), NULLIF(rs.setup_notes,''), NULLIF(rs.special_requests,'')), '')
 FROM public.crm_runsheets rs
 JOIN LATERAL (SELECT x.* FROM public.crm_bookings x WHERE x.business_id=rs.business_id AND (x.id=rs.booking_id OR (rs.booking_id IS NULL AND x.lead_id=rs.lead_id)) ORDER BY x.updated_at DESC, x.id LIMIT 1) b ON true
 LEFT JOIN public.crm_leads l ON l.id=rs.lead_id AND l.business_id=rs.business_id
 LEFT JOIN LATERAL (SELECT s.* FROM public.crm_menu_selections s WHERE s.lead_id=rs.lead_id AND s.business_id=rs.business_id ORDER BY s.updated_at DESC,s.id LIMIT 1) sel ON true
 WHERE rs.id=_id AND (rs.emailed_at IS NOT NULL OR cardinality(rs.emailed_to)>0) AND b.status NOT IN ('cancelled','declined')
$$;
REVOKE ALL ON FUNCTION public.crm_roster_runsheet_values(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_roster_runsheet_values(uuid) TO service_role;

CREATE FUNCTION public.crm_sync_runsheet_roster(_id uuid) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.roster_day_events (crm_runsheet_id,business_id,date,event_space,event_type,event_time,adult_guests,kids_guests,host_name,host_contact_number,bev_package,banquet_tier,notes)
 SELECT * FROM public.crm_roster_runsheet_values(_id)
 ON CONFLICT (crm_runsheet_id) WHERE crm_runsheet_id IS NOT NULL DO UPDATE SET
 business_id=EXCLUDED.business_id,date=EXCLUDED.date,event_space=EXCLUDED.event_space,event_type=EXCLUDED.event_type,event_time=EXCLUDED.event_time,adult_guests=EXCLUDED.adult_guests,kids_guests=EXCLUDED.kids_guests,host_name=EXCLUDED.host_name,host_contact_number=EXCLUDED.host_contact_number,bev_package=EXCLUDED.bev_package,banquet_tier=EXCLUDED.banquet_tier,notes=EXCLUDED.notes,updated_at=now();
 DELETE FROM public.roster_day_events WHERE crm_runsheet_id=_id AND NOT EXISTS (SELECT 1 FROM public.crm_roster_runsheet_values(_id));
END;
$$;
REVOKE ALL ON FUNCTION public.crm_sync_runsheet_roster(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.crm_sync_runsheet_roster(uuid) TO service_role;

CREATE FUNCTION public.crm_roster_source_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE r record;
BEGIN
 IF TG_TABLE_NAME='crm_runsheets' THEN
  PERFORM public.crm_sync_runsheet_roster(NEW.id);
 ELSE
  FOR r IN SELECT rs.id FROM public.crm_runsheets rs WHERE rs.business_id=NEW.business_id AND
   ((TG_TABLE_NAME='crm_bookings' AND (rs.booking_id=NEW.id OR (rs.booking_id IS NULL AND rs.lead_id=NEW.lead_id))) OR
    (TG_TABLE_NAME='crm_leads' AND rs.lead_id=NEW.id) OR
    (TG_TABLE_NAME='crm_menu_selections' AND rs.lead_id=NEW.lead_id))
  LOOP PERFORM public.crm_sync_runsheet_roster(r.id); END LOOP;
 END IF;
 RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.crm_roster_source_changed() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER crm_runsheet_roster_sync AFTER INSERT OR UPDATE ON public.crm_runsheets FOR EACH ROW EXECUTE FUNCTION public.crm_roster_source_changed();
CREATE TRIGGER crm_booking_roster_sync AFTER INSERT OR UPDATE ON public.crm_bookings FOR EACH ROW EXECUTE FUNCTION public.crm_roster_source_changed();
CREATE TRIGGER crm_lead_roster_sync AFTER UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_roster_source_changed();
CREATE TRIGGER crm_menu_roster_sync AFTER INSERT OR UPDATE ON public.crm_menu_selections FOR EACH ROW EXECUTE FUNCTION public.crm_roster_source_changed();

INSERT INTO public.roster_day_events (crm_runsheet_id,business_id,date,event_space,event_type,event_time,adult_guests,kids_guests,host_name,host_contact_number,bev_package,banquet_tier,notes)
SELECT v.* FROM public.crm_runsheets rs CROSS JOIN LATERAL public.crm_roster_runsheet_values(rs.id) v
ON CONFLICT (crm_runsheet_id) WHERE crm_runsheet_id IS NOT NULL DO NOTHING;

CREATE FUNCTION public.get_roster_runsheet(_event_id uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE rs public.crm_runsheets; b public.crm_bookings; l public.crm_leads; sel public.crm_menu_selections; biz public.businesses; result jsonb;
BEGIN
 SELECT s.* INTO rs FROM public.roster_day_events e JOIN public.crm_runsheets s ON s.id=e.crm_runsheet_id AND s.business_id=e.business_id WHERE e.id=_event_id AND public.has_business_access(e.business_id);
 IF NOT FOUND OR NOT (rs.emailed_at IS NOT NULL OR cardinality(rs.emailed_to)>0) THEN RAISE EXCEPTION 'Run sheet unavailable or access denied' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO b FROM public.crm_bookings x WHERE x.business_id=rs.business_id AND (x.id=rs.booking_id OR (rs.booking_id IS NULL AND x.lead_id=rs.lead_id)) ORDER BY x.updated_at DESC,x.id LIMIT 1;
 SELECT x.* INTO l FROM public.crm_leads x WHERE x.id=rs.lead_id AND x.business_id=rs.business_id;
 SELECT x.* INTO sel FROM public.crm_menu_selections x WHERE x.lead_id=rs.lead_id AND x.business_id=rs.business_id ORDER BY x.updated_at DESC,x.id LIMIT 1;
 SELECT x.* INTO biz FROM public.businesses x WHERE x.id=rs.business_id;
 result := jsonb_build_object(
 'rs', jsonb_build_object('id',rs.id,'lead_id',rs.lead_id,'event_order_number',rs.event_order_number,'booking_reference',rs.booking_reference,'revision',rs.revision,'sales_person',rs.sales_person,'sales_person_phone',rs.sales_person_phone,'event_coordinator',rs.event_coordinator,'event_coordinator_phone',rs.event_coordinator_phone,'onsite_contact_name',rs.onsite_contact_name,'onsite_contact_phone',rs.onsite_contact_phone,'adult_guests',rs.adult_guests,'kids_guests',rs.kids_guests,'setup_items',rs.setup_items,'setup_notes',rs.setup_notes,'service_schedule',rs.service_schedule,'service_schedule_foh',rs.service_schedule_foh,'special_requests',rs.special_requests,'client_notes',rs.client_notes,'ops_notes',rs.ops_notes,'foh_notes',rs.foh_notes,'staff_sign_name',rs.staff_sign_name,'staff_sign_date',rs.staff_sign_date,'staff_signature',rs.staff_signature),
 'b',jsonb_build_object('event_date',b.event_date,'start_time',b.start_time,'duration_minutes',b.duration_minutes,'booking_kind',b.booking_kind,'event_name',b.event_name,'event_type',b.event_type,'venue_space',b.venue_space,'service_location',b.service_location,'fulfilment_method',b.fulfilment_method,'adults',b.adults,'kids',b.kids,'kids_5_to_10',b.kids_5_to_10,'kids_under_5',b.kids_under_5,'chafing_dishes',b.chafing_dishes),
 'lead',jsonb_build_object('full_name',l.full_name,'phone',l.phone,'event_type',l.event_type,'venue_space',l.venue_space,'service_location',l.service_location),
 'selection',jsonb_build_object('beverage_package',sel.beverage_package,'corkage_enabled',sel.corkage_enabled,'corkage_note',sel.corkage_note,'dietary_requirements',sel.dietary_requirements,'allergies',sel.allergies),
 'items',COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'course',i.course,'item_name',i.item_name,'notes',i.notes,'quantity',i.quantity,'service_start_time',i.service_start_time,'service_end_time',i.service_end_time) ORDER BY i.created_at,i.id) FROM public.crm_menu_selection_items i WHERE i.selection_id=sel.id AND i.business_id=rs.business_id),'[]'::jsonb),
 'businessName',biz.name,'businessPhone',biz.phone,'businessEmail',biz.email);
 RETURN result;
END;
$$;
REVOKE ALL ON FUNCTION public.get_roster_runsheet(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_roster_runsheet(uuid) TO authenticated, service_role;
ALTER TABLE public.roster_day_events REPLICA IDENTITY FULL;
DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename='roster_day_events') THEN ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_day_events; END IF; END $$;