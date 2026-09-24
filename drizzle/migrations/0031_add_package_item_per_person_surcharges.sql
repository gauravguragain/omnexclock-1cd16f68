ALTER TABLE public.crm_package_course_items
  ADD COLUMN IF NOT EXISTS extra_price_per_head numeric(10,2) NOT NULL DEFAULT 0;

ALTER TABLE public.crm_package_course_items
  ADD CONSTRAINT crm_package_course_items_extra_price_nonnegative
  CHECK (extra_price_per_head >= 0);

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
          'dishes', coalesce((SELECT jsonb_agg(jsonb_build_object(
              'id', d.id,
              'name', d.name,
              'diet', d.diet,
              'photo_path', d.photo_path,
              'extra_price_per_head', ci.extra_price_per_head
            ) ORDER BY d.name)
            FROM crm_package_course_items ci
            JOIN crm_dishes d ON d.id = ci.dish_id
            WHERE ci.course_id = c.id AND d.active IS NOT FALSE), '[]'::jsonb))
        ORDER BY c.sort_order) FROM crm_package_courses c WHERE c.package_id = p.id), '[]'::jsonb))
      FROM crm_packages p WHERE p.id = l.package_id)
  ) INTO r;
  RETURN r;
END $$;

CREATE OR REPLACE FUNCTION public.submit_guest_menu(_token uuid, _picks jsonb, _dietary text, _allergies text)
RETURNS boolean LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; p record; sel_id uuid; c record; pick text; n int; veg_n int; non_veg_n int; dish_diet text; has_diet_limits boolean;
BEGIN
  SELECT * INTO l FROM crm_guest_menu_links WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Link not found'; END IF;
  IF l.status = 'submitted' THEN RAISE EXCEPTION 'This menu has already been submitted'; END IF;
  SELECT * INTO p FROM crm_packages WHERE id = l.package_id;
  FOR c IN SELECT * FROM crm_package_courses WHERE package_id = l.package_id LOOP
    n := 0; veg_n := 0; non_veg_n := 0;
    has_diet_limits := c.veg_picks IS NOT NULL OR c.non_veg_picks IS NOT NULL;
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
    IF has_diet_limits AND veg_n > coalesce(c.veg_picks, 0) THEN RAISE EXCEPTION 'Too many vegetarian dishes chosen for %', c.name; END IF;
    IF has_diet_limits AND non_veg_n > coalesce(c.non_veg_picks, 0) THEN RAISE EXCEPTION 'Too many non-vegetarian dishes chosen for %', c.name; END IF;
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
  INSERT INTO crm_menu_selection_items (business_id, selection_id, item_name, price_per_head, course)
  SELECT l.business_id, sel_id, d.name, ci.extra_price_per_head, c2.name
  FROM crm_package_courses c2
  CROSS JOIN LATERAL jsonb_array_elements_text(coalesce(_picks -> (c2.id::text), '[]'::jsonb)) x(did)
  JOIN crm_package_course_items ci ON ci.course_id = c2.id AND ci.dish_id::text = x.did
  JOIN crm_dishes d ON d.id = ci.dish_id
  WHERE c2.package_id = l.package_id AND c2.name !~* 'kid';

  UPDATE crm_menu_selections s
  SET total_estimate = totals.amount, updated_at = now()
  FROM (
    SELECT coalesce(sum(
      coalesce(i.flat_price, 0) + coalesce(i.price_per_head, 0) *
      CASE WHEN i.course = 'kids_package' THEN coalesce(i.quantity, 0) ELSE greatest(coalesce(ms.guest_count, ld.estimated_guest_count, 1), 1) END
    ), 0) AS amount
    FROM crm_menu_selection_items i
    JOIN crm_menu_selections ms ON ms.id = i.selection_id
    JOIN crm_leads ld ON ld.id = ms.lead_id
    WHERE i.selection_id = sel_id
  ) totals
  WHERE s.id = sel_id;

  UPDATE crm_guest_menu_links SET status = 'submitted', submitted_at = now(), submission = jsonb_build_object('picks', _picks, 'dietary', _dietary, 'allergies', _allergies) WHERE id = l.id;
  UPDATE crm_leads SET status = 'menu_selected' WHERE id = l.lead_id;
  RETURN true;
END $$;

GRANT EXECUTE ON FUNCTION public.get_guest_menu(uuid) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_guest_menu(uuid, jsonb, text, text) TO anon, authenticated;