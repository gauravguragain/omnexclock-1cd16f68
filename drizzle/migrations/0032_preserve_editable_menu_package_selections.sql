ALTER TABLE public.crm_menu_selection_items
  ADD COLUMN IF NOT EXISTS source_package_id uuid REFERENCES public.crm_packages(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_course_id uuid REFERENCES public.crm_package_courses(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS source_dish_id uuid REFERENCES public.crm_dishes(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_protein text,
  ADD COLUMN IF NOT EXISTS package_group_key text;

CREATE INDEX IF NOT EXISTS crm_menu_selection_items_source_package_idx
  ON public.crm_menu_selection_items(source_package_id);
CREATE INDEX IF NOT EXISTS crm_menu_selection_items_source_course_idx
  ON public.crm_menu_selection_items(source_course_id);