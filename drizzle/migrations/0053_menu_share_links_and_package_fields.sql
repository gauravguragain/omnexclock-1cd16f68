ALTER TABLE public.crm_packages
  ADD COLUMN IF NOT EXISTS menu_title text,
  ADD COLUMN IF NOT EXISTS style_label text,
  ADD COLUMN IF NOT EXISTS subtitle text,
  ADD COLUMN IF NOT EXISTS price_label text;
ALTER TABLE public.crm_package_courses
  ADD COLUMN IF NOT EXISTS seafood_picks integer CHECK (seafood_picks IS NULL OR seafood_picks >= 0),
  ADD COLUMN IF NOT EXISTS notes text;

CREATE TABLE public.crm_menu_share_links (
  token uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  menu_send_id uuid REFERENCES public.crm_menu_sends(id) ON DELETE SET NULL,
  package_ids uuid[],
  all_active boolean NOT NULL DEFAULT true,
  include_drinks boolean NOT NULL DEFAULT false,
  recipient_name text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '15 days')
);
GRANT SELECT, INSERT ON public.crm_menu_share_links TO authenticated;
GRANT ALL ON public.crm_menu_share_links TO service_role;
ALTER TABLE public.crm_menu_share_links ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM staff read menu share links" ON public.crm_menu_share_links FOR SELECT TO authenticated USING (public.can_access_crm(business_id) OR public.is_owner_of_business(business_id));
CREATE POLICY "CRM staff create menu share links" ON public.crm_menu_share_links FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));

CREATE OR REPLACE FUNCTION public.get_menu_share(_token uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE l record; pk uuid[]; r jsonb;
BEGIN
  SELECT * INTO l FROM public.crm_menu_share_links WHERE token = _token;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;
  IF l.expires_at < now() THEN RETURN jsonb_build_object('error','expired'); END IF;
  SELECT coalesce(array_agg(p.id), '{}') INTO pk FROM public.crm_packages p
    JOIN public.crm_menu_books b ON b.id = p.book_id
    WHERE p.business_id = l.business_id AND p.active AND b.active
      AND (l.all_active OR p.id = ANY(coalesce(l.package_ids,'{}')));
  SELECT jsonb_build_object(
    'business_name', (SELECT name FROM public.businesses WHERE id = l.business_id),
    'recipient_name', l.recipient_name,
    'expires_at', l.expires_at,
    'books', coalesce((SELECT jsonb_agg(jsonb_build_object('id',b.id,'name',b.name,'description',b.description,'sort_order',b.sort_order) ORDER BY b.sort_order, b.name)
       FROM public.crm_menu_books b WHERE b.business_id = l.business_id AND b.active AND EXISTS (SELECT 1 FROM public.crm_packages p WHERE p.book_id = b.id AND p.id = ANY(pk))), '[]'),
    'packages', coalesce((SELECT jsonb_agg(to_jsonb(p) - 'business_id' ORDER BY p.name) FROM public.crm_packages p WHERE p.id = ANY(pk)), '[]'),
    'courses', coalesce((SELECT jsonb_agg(to_jsonb(c) - 'business_id' ORDER BY c.sort_order) FROM public.crm_package_courses c WHERE c.package_id = ANY(pk)), '[]'),
    'items', coalesce((SELECT jsonb_agg(jsonb_build_object('course_id',ci.course_id,'dish_id',ci.dish_id,'drink_id',ci.drink_id,'protein_options',ci.protein_options,'extra_price_per_head',ci.extra_price_per_head,'name',coalesce(d.name,dr.name),'diet',d.diet,'kind',dr.kind) ORDER BY ci.created_at)
       FROM public.crm_package_course_items ci JOIN public.crm_package_courses c ON c.id = ci.course_id
       LEFT JOIN public.crm_dishes d ON d.id = ci.dish_id LEFT JOIN public.crm_drinks dr ON dr.id = ci.drink_id
       WHERE c.package_id = ANY(pk)), '[]'),
    'drinks', CASE WHEN l.include_drinks THEN coalesce((SELECT jsonb_agg(jsonb_build_object('name',name,'kind',kind,'price',price) ORDER BY name) FROM public.crm_drinks WHERE business_id = l.business_id AND active), '[]') ELSE '[]'::jsonb END
  ) INTO r;
  RETURN r;
END $$;
REVOKE ALL ON FUNCTION public.get_menu_share(uuid) FROM public;
GRANT EXECUTE ON FUNCTION public.get_menu_share(uuid) TO anon, authenticated;