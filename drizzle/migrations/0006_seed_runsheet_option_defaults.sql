CREATE OR REPLACE FUNCTION public.crm_seed_runsheet_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.crm_options (business_id,option_type,label,value,sort_order) VALUES
  (NEW.id,'setup_item','Black tablecloths','black_tablecloths',10),
  (NEW.id,'setup_item','White tablecloths','white_tablecloths',20),
  (NEW.id,'setup_item','Red carpet','red_carpet',30),
  (NEW.id,'setup_item','Smoke machine','smoke_machine',40),
  (NEW.id,'setup_item','Cold sparkles','cold_sparkles',50),
  (NEW.id,'setup_item','Dry ice','dry_ice',60),
  (NEW.id,'setup_item','LED screen','led_screen',70),
  (NEW.id,'setup_item','Digital welcome signage','digital_welcome_signage',80),
  (NEW.id,'setup_item','Cake stand','cake_stand',90),
  (NEW.id,'setup_item','Gift table on stage','gift_table_on_stage',100),
  (NEW.id,'setup_item','Stage setup','stage_setup',110),
  (NEW.id,'setup_item','Dance floor','dance_floor',120),
  (NEW.id,'setup_item','Microphone and PA','microphone_pa',130),
  (NEW.id,'setup_item','High chairs','high_chairs',140),
  (NEW.id,'service_course','Live stall','live_stall',10),
  (NEW.id,'service_course','Entrees','entrees',20),
  (NEW.id,'service_course','Kids menu','kids_menu',30),
  (NEW.id,'service_course','Mains','mains',40),
  (NEW.id,'service_course','Dessert','dessert',50),
  (NEW.id,'service_course','Tea and coffee','tea_coffee',60),
  (NEW.id,'service_course','Cake cutting','cake_cutting',70),
  (NEW.id,'service_course','Speeches','speeches',80)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS crm_seed_runsheet_options ON public.businesses;
CREATE TRIGGER crm_seed_runsheet_options AFTER INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.crm_seed_runsheet_defaults();