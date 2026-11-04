CREATE OR REPLACE FUNCTION public.has_business_access(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = auth.uid() AND business_id = _business_id
      AND role::text IN ('admin','super_admin','viewer','roster_admin','sales_marketing_manager')
  )
$$;
GRANT EXECUTE ON FUNCTION public.has_business_access(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.crm_seed_business_defaults()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.crm_settings (business_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.crm_options (business_id,option_type,label,value,sort_order) VALUES
  (NEW.id,'lead_source','Phone call','phone_call',10),(NEW.id,'lead_source','Website form','website_form',20),(NEW.id,'lead_source','Referral','referral',30),(NEW.id,'lead_source','Walk-in','walk_in',40),(NEW.id,'lead_source','Social media','social_media',50),(NEW.id,'lead_source','Calendly','calendly',60),(NEW.id,'lead_source','Other','other',70),
  (NEW.id,'event_type','Wedding','wedding',10),(NEW.id,'event_type','Corporate Event','corporate_event',20),(NEW.id,'event_type','Parties & Celebrations','parties_celebrations',30),(NEW.id,'event_type','School Formal / University Event','school_university_event',40),(NEW.id,'event_type','Birthday','birthday',50),(NEW.id,'event_type','Engagement','engagement',60),(NEW.id,'event_type','Christening / Naming Ceremony','christening_naming',70),(NEW.id,'event_type','Other','other',80),
  (NEW.id,'lead_stage','New','new',10),(NEW.id,'lead_stage','Contacted','contacted',20),(NEW.id,'lead_stage','Inspection Booked','inspection_booked',30),(NEW.id,'lead_stage','Inspected','inspected',40),(NEW.id,'lead_stage','Menu Selected','menu_selected',50),(NEW.id,'lead_stage','Quoted','quoted',60),(NEW.id,'lead_stage','Confirmed','confirmed',70),(NEW.id,'lead_stage','Lost','lost',80),
  (NEW.id,'lost_reason','Price','price',10),(NEW.id,'lost_reason','Date unavailable','date_unavailable',20),(NEW.id,'lost_reason','Chose competitor','chose_competitor',30),(NEW.id,'lost_reason','No response','no_response',40),(NEW.id,'lost_reason','Other','other',50),
  (NEW.id,'venue_space','Royal Splendor Hall','royal_splendor_hall',10),(NEW.id,'venue_space','Luxury Manor Hall','luxury_manor_hall',20),(NEW.id,'venue_space','Regal Outdoors','regal_outdoors',30),(NEW.id,'venue_space','Sunset Court','sunset_court',40),
  (NEW.id,'live_stall','Pani Puri','pani_puri',10),(NEW.id,'live_stall','Momo','momo',20),(NEW.id,'live_stall','Sekuwa','sekuwa',30),
  (NEW.id,'beverage_package','Non-alcoholic package','non_alcoholic',10),(NEW.id,'beverage_package','Standard beverage package','standard',20),(NEW.id,'beverage_package','Premium beverage package','premium',30)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $$;
CREATE TRIGGER crm_seed_new_business AFTER INSERT ON public.businesses FOR EACH ROW EXECUTE FUNCTION public.crm_seed_business_defaults();