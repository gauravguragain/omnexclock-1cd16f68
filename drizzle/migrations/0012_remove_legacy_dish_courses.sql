DELETE FROM public.crm_menu_selection_items
WHERE lower(coalesce(course,'')) IN ('entrees (veg)','entrees (non-veg)','veg mains','non-veg mains','sides','dessert','kids menu');
DELETE FROM public.crm_menu_items
WHERE category IN ('entrees_veg','entrees_nonveg','veg_mains','nonveg_mains','sides','dessert','kids_menu');