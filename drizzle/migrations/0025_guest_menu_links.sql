ALTER TABLE public.crm_dishes ADD COLUMN IF NOT EXISTS photo_path text;

CREATE TABLE public.crm_guest_menu_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.crm_packages(id) ON DELETE CASCADE,
  token uuid NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status text NOT NULL DEFAULT 'sent',
  submission jsonb,
  submitted_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_guest_menu_links TO authenticated;
GRANT ALL ON public.crm_guest_menu_links TO service_role;
ALTER TABLE public.crm_guest_menu_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users manage guest menu links" ON public.crm_guest_menu_links FOR ALL TO authenticated
  USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));

CREATE OR REPLACE FUNCTION public.get_guest_menu(_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; r jsonb;
BEGIN
  SELECT * INTO l FROM crm_guest_menu_links WHERE token = _token;
  IF NOT FOUND THEN RETURN NULL; END IF;
  SELECT jsonb_build_object(
    'status', l.status, 'submitted_at', l.submitted_at, 'submission', l.submission,
    'business', (SELECT jsonb_build_object('name', b.name) FROM businesses b WHERE b.id = l.business_id),
    'lead', (SELECT jsonb_build_object('name', ld.full_name) FROM crm_leads ld WHERE ld.id = l.lead_id),
    'package', (SELECT jsonb_build_object('id', p.id, 'name', p.name, 'description', p.description,
      'courses', coalesce((SELECT jsonb_agg(jsonb_build_object('id', c.id, 'name', c.name, 'picks', c.picks,
          'dishes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'diet', d.diet, 'photo_path', d.photo_path) ORDER BY d.name)
            FROM crm_package_course_items ci JOIN crm_dishes d ON d.id = ci.dish_id WHERE ci.course_id = c.id AND d.active IS NOT FALSE), '[]'::jsonb))
        ORDER BY c.sort_order) FROM crm_package_courses c WHERE c.package_id = p.id), '[]'::jsonb))
      FROM crm_packages p WHERE p.id = l.package_id)
  ) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.submit_guest_menu(_token uuid, _picks jsonb, _dietary text, _allergies text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; p record; sel_id uuid; c record; pick text; n int;
BEGIN
  SELECT * INTO l FROM crm_guest_menu_links WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found'; END IF;
  IF l.status = 'submitted' THEN RAISE EXCEPTION 'This menu has already been submitted'; END IF;
  SELECT * INTO p FROM crm_packages WHERE id = l.package_id;
  FOR c IN SELECT * FROM crm_package_courses WHERE package_id = l.package_id LOOP
    n := 0;
    FOR pick IN SELECT jsonb_array_elements_text(coalesce(_picks -> (c.id::text), '[]'::jsonb)) LOOP
      IF NOT EXISTS (SELECT 1 FROM crm_package_course_items WHERE course_id = c.id AND dish_id::text = pick) THEN
        RAISE EXCEPTION 'Invalid dish selection';
      END IF;
      n := n + 1;
    END LOOP;
    IF c.picks IS NOT NULL AND n > c.picks THEN RAISE EXCEPTION 'Too many dishes chosen for %', c.name; END IF;
  END LOOP;

  INSERT INTO crm_menu_selections (business_id, lead_id, package_id, package_name, package_price_per_head, dietary_requirements, allergies)
  VALUES (l.business_id, l.lead_id, p.id, p.name, p.price_per_head, nullif(_dietary,''), nullif(_allergies,''))
  ON CONFLICT (lead_id) DO UPDATE SET package_id = EXCLUDED.package_id, package_name = EXCLUDED.package_name,
    package_price_per_head = coalesce(crm_menu_selections.package_price_per_head, EXCLUDED.package_price_per_head),
    dietary_requirements = coalesce(EXCLUDED.dietary_requirements, crm_menu_selections.dietary_requirements),
    allergies = coalesce(EXCLUDED.allergies, crm_menu_selections.allergies), updated_at = now()
  RETURNING id INTO sel_id;

  DELETE FROM crm_menu_selection_items WHERE selection_id = sel_id AND menu_item_id IS NULL
    AND course IS NOT NULL AND course NOT IN ('live_stall','kids_package','manual','beverage','Kids Menu');
  INSERT INTO crm_menu_selection_items (business_id, selection_id, item_name, price_per_head, course)
  VALUES (l.business_id, sel_id, p.name, p.price_per_head, 'package');
  INSERT INTO crm_menu_selection_items (business_id, selection_id, item_name, course)
  SELECT l.business_id, sel_id, d.name, c2.name
  FROM crm_package_courses c2
  CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(_picks -> (c2.id::text), '[]'::jsonb)) x(did)
  JOIN crm_dishes d ON d.id::text = x.did
  WHERE c2.package_id = l.package_id AND c2.name !~* 'kid';

  UPDATE crm_guest_menu_links SET status = 'submitted', submitted_at = now(), submission = jsonb_build_object('picks', _picks, 'dietary', _dietary, 'allergies', _allergies) WHERE id = l.id;
  UPDATE crm_leads SET status = 'menu_selected' WHERE id = l.lead_id;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.get_guest_menu(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_menu(uuid, jsonb, text, text) TO anon, authenticated;

CREATE POLICY "Anyone can view dish photos" ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'dish-photos');
CREATE POLICY "CRM users upload dish photos" ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'dish-photos' AND public.can_access_crm(((storage.foldername(name))[1])::uuid));
CREATE POLICY "CRM users update dish photos" ON storage.objects FOR UPDATE TO authenticated
  USING (bucket_id = 'dish-photos' AND public.can_access_crm(((storage.foldername(name))[1])::uuid));
CREATE POLICY "CRM users delete dish photos" ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'dish-photos' AND public.can_access_crm(((storage.foldername(name))[1])::uuid));