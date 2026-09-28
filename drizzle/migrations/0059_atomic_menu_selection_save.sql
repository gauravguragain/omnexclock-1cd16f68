CREATE OR REPLACE FUNCTION public.save_menu_selection(_selection jsonb, _items jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  sid uuid; upd timestamptz; n int;
BEGIN
  INSERT INTO public.crm_menu_selections AS s (business_id, lead_id, guest_count, dietary_requirements, allergies, beverage_package, package_name, package_price_per_head, corkage_enabled, corkage_per_head, corkage_flat, total_estimate, created_by, updated_by)
  VALUES ((_selection->>'business_id')::uuid, (_selection->>'lead_id')::uuid, GREATEST(COALESCE((_selection->>'guest_count')::int,1),1), _selection->>'dietary_requirements', _selection->>'allergies', _selection->>'beverage_package', _selection->>'package_name', (_selection->>'package_price_per_head')::numeric, COALESCE((_selection->>'corkage_enabled')::boolean,false), (_selection->>'corkage_per_head')::numeric, (_selection->>'corkage_flat')::numeric, COALESCE((_selection->>'total_estimate')::numeric,0), auth.uid(), auth.uid())
  ON CONFLICT (lead_id) DO UPDATE SET guest_count=EXCLUDED.guest_count, dietary_requirements=EXCLUDED.dietary_requirements, allergies=EXCLUDED.allergies, beverage_package=EXCLUDED.beverage_package, package_name=EXCLUDED.package_name, package_price_per_head=EXCLUDED.package_price_per_head, corkage_enabled=EXCLUDED.corkage_enabled, corkage_per_head=EXCLUDED.corkage_per_head, corkage_flat=EXCLUDED.corkage_flat, total_estimate=EXCLUDED.total_estimate, updated_by=auth.uid(), updated_at=now()
  RETURNING s.id, s.updated_at INTO sid, upd;
  IF sid IS NULL THEN RAISE EXCEPTION 'Menu selection could not be saved (no access)'; END IF;

  DELETE FROM public.crm_menu_selection_items WHERE selection_id = sid;

  INSERT INTO public.crm_menu_selection_items (business_id, selection_id, menu_item_id, item_name, quantity, price_per_head, flat_price, notes, course, service_start_time, service_end_time, source_package_id, source_course_id, source_dish_id, selected_protein, package_group_key, one_off_diet)
  SELECT (_selection->>'business_id')::uuid, sid, r.menu_item_id, r.item_name, COALESCE(r.quantity,1), r.price_per_head, r.flat_price, r.notes, r.course, r.service_start_time, r.service_end_time, r.source_package_id, r.source_course_id, r.source_dish_id, r.selected_protein, r.package_group_key, r.one_off_diet
  FROM jsonb_populate_recordset(NULL::public.crm_menu_selection_items, COALESCE(_items,'[]'::jsonb)) r;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> jsonb_array_length(COALESCE(_items,'[]'::jsonb)) THEN RAISE EXCEPTION 'Not every menu item was saved'; END IF;

  RETURN jsonb_build_object('id', sid, 'updated_at', upd, 'items', n);
END;
$$;
GRANT EXECUTE ON FUNCTION public.save_menu_selection(jsonb, jsonb) TO authenticated;