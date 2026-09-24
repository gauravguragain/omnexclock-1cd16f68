ALTER TABLE public.crm_package_courses
  ADD COLUMN IF NOT EXISTS veg_picks integer,
  ADD COLUMN IF NOT EXISTS non_veg_picks integer;

ALTER TABLE public.crm_package_courses
  ADD CONSTRAINT crm_package_courses_veg_picks_check CHECK (veg_picks IS NULL OR veg_picks >= 0),
  ADD CONSTRAINT crm_package_courses_non_veg_picks_check CHECK (non_veg_picks IS NULL OR non_veg_picks >= 0);

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
      'courses', coalesce((SELECT jsonb_agg(jsonb_build_object(
          'id', c.id,
          'name', c.name,
          'picks', c.picks,
          'veg_picks', c.veg_picks,
          'non_veg_picks', c.non_veg_picks,
          'dishes', coalesce((SELECT jsonb_agg(jsonb_build_object('id', d.id, 'name', d.name, 'diet', d.diet, 'photo_path', d.photo_path) ORDER BY d.name)
            FROM crm_package_course_items ci JOIN crm_dishes d ON d.id = ci.dish_id WHERE ci.course_id = c.id AND d.active IS NOT FALSE), '[]'::jsonb))
        ORDER BY c.sort_order) FROM crm_package_courses c WHERE c.package_id = p.id), '[]'::jsonb))
      FROM crm_packages p WHERE p.id = l.package_id)
  ) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.submit_guest_menu(_token uuid, _picks jsonb, _dietary text, _allergies text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; p record; sel_id uuid; c record; pick text; n int; veg_n int; non_veg_n int; dish_diet text;
BEGIN
  SELECT * INTO l FROM crm_guest_menu_links WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found'; END IF;
  IF l.status = 'submitted' THEN RAISE EXCEPTION 'This menu has already been submitted'; END IF;
  SELECT * INTO p FROM crm_packages WHERE id = l.package_id;
  FOR c IN SELECT * FROM crm_package_courses WHERE package_id = l.package_id LOOP
    n := 0; veg_n := 0; non_veg_n := 0;
    FOR pick IN SELECT jsonb_array_elements_text(coalesce(_picks -> (c.id::text), '[]'::jsonb)) LOOP
      SELECT d.diet INTO dish_diet
      FROM crm_package_course_items ci
      JOIN crm_dishes d ON d.id = ci.dish_id
      WHERE ci.course_id = c.id AND ci.dish_id::text = pick;
      IF NOT FOUND THEN RAISE EXCEPTION 'Invalid dish selection'; END IF;
      n := n + 1;
      IF dish_diet = 'veg' THEN veg_n := veg_n + 1; ELSE non_veg_n := non_veg_n + 1; END IF;
    END LOOP;
    IF c.picks IS NOT NULL AND n > c.picks THEN RAISE EXCEPTION 'Too many dishes chosen for %', c.name; END IF;
    IF c.veg_picks IS NOT NULL AND veg_n > c.veg_picks THEN RAISE EXCEPTION 'Too many vegetarian dishes chosen for %', c.name; END IF;
    IF c.non_veg_picks IS NOT NULL AND non_veg_n > c.non_veg_picks THEN RAISE EXCEPTION 'Too many non-vegetarian dishes chosen for %', c.name; END IF;
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