DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['crm_leads','crm_bookings','crm_inspections','crm_tasks','crm_interactions','crm_runsheets','crm_payments','crm_menu_items','crm_options','crm_settings','crm_venue_spaces','crm_customers','crm_stakeholders','crm_menu_books','crm_packages','crm_package_courses','crm_package_course_items','crm_dishes','crm_drinks','catering_deliveries','crm_menu_selections','crm_menu_selection_items','crm_timeline_events'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;