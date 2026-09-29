CREATE OR REPLACE FUNCTION public.crm_merge_leads(_keep_id uuid, _merge_ids uuid[])
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE biz uuid; d record; n integer := 0; keep_date date; dup_booking record;
BEGIN
  SELECT business_id INTO biz FROM crm_leads WHERE id = _keep_id;
  IF biz IS NULL OR NOT public.can_access_crm(biz) THEN RAISE EXCEPTION 'Not allowed'; END IF;
  SELECT event_date INTO keep_date FROM crm_bookings WHERE lead_id = _keep_id ORDER BY created_at LIMIT 1;
  FOR d IN SELECT * FROM crm_leads WHERE id = ANY(_merge_ids) AND id <> _keep_id AND business_id = biz LOOP
    IF EXISTS (SELECT 1 FROM crm_bookings WHERE lead_id = d.id) AND keep_date IS NOT NULL THEN
      -- Both leads have their own event: only allowed when the events fall on the same day.
      -- The duplicate booking is folded into the kept one (payments move across, duplicate is removed).
      FOR dup_booking IN SELECT * FROM crm_bookings WHERE lead_id = d.id LOOP
        IF dup_booking.event_date IS DISTINCT FROM keep_date THEN
          RAISE EXCEPTION 'Leads for % have events on different dates, so they are separate events and cannot be merged. Merge the customers instead.', d.full_name;
        END IF;
      END LOOP;
      UPDATE crm_payments SET booking_id = (SELECT id FROM crm_bookings WHERE lead_id = _keep_id ORDER BY created_at LIMIT 1) WHERE booking_id IN (SELECT id FROM crm_bookings WHERE lead_id = d.id);
      DELETE FROM crm_bookings WHERE lead_id = d.id;
    END IF;
    IF EXISTS (SELECT 1 FROM crm_menu_selections WHERE lead_id = d.id) AND EXISTS (SELECT 1 FROM crm_menu_selections WHERE lead_id = _keep_id) THEN
      RAISE EXCEPTION 'Leads for % both have a saved menu, so they cannot be merged.', d.full_name;
    END IF;
    IF EXISTS (SELECT 1 FROM crm_runsheets WHERE lead_id = d.id) AND EXISTS (SELECT 1 FROM crm_runsheets WHERE lead_id = _keep_id) THEN
      RAISE EXCEPTION 'Leads for % both have a run sheet, so they cannot be merged.', d.full_name;
    END IF;
    UPDATE crm_leads k SET
      phone = COALESCE(NULLIF(k.phone,''), d.phone),
      email = COALESCE(NULLIF(k.email,''), d.email),
      company = COALESCE(NULLIF(k.company,''), d.company),
      customer_id = COALESCE(k.customer_id, d.customer_id),
      estimated_guest_count = COALESCE(k.estimated_guest_count, d.estimated_guest_count),
      venue_space = COALESCE(NULLIF(k.venue_space,''), d.venue_space),
      preferred_dates = CASE WHEN COALESCE(array_length(k.preferred_dates,1),0) = 0 THEN d.preferred_dates ELSE k.preferred_dates END,
      tags = ARRAY(SELECT DISTINCT unnest(COALESCE(k.tags,'{}') || COALESCE(d.tags,'{}'))),
      updated_at = now()
    WHERE k.id = _keep_id;
    UPDATE crm_bookings SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_menu_selections SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_runsheets SET lead_id = _keep_id WHERE lead_id = d.id;
    DELETE FROM crm_lead_stakeholders s WHERE s.lead_id = d.id AND EXISTS (SELECT 1 FROM crm_lead_stakeholders k WHERE k.lead_id = _keep_id AND k.stakeholder_id = s.stakeholder_id);
    UPDATE crm_lead_stakeholders SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_tasks SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_interactions SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_inspections SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_timeline_events SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_guest_menu_links SET lead_id = _keep_id WHERE lead_id = d.id;
    UPDATE crm_menu_sends SET lead_id = _keep_id WHERE lead_id = d.id;
    DELETE FROM crm_leads WHERE id = d.id;
    n := n + 1;
  END LOOP;
  RETURN n;
END $function$;