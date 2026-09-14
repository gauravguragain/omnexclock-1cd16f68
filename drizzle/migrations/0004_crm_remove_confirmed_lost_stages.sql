CREATE OR REPLACE FUNCTION public.crm_seed_business_defaults()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.crm_settings (business_id) VALUES (NEW.id) ON CONFLICT DO NOTHING;
  INSERT INTO public.crm_options (business_id,option_type,label,value,sort_order) VALUES
  (NEW.id,'lead_source','Phone call','phone_call',10),(NEW.id,'lead_source','Website form','website_form',20),(NEW.id,'lead_source','Referral','referral',30),(NEW.id,'lead_source','Walk-in','walk_in',40),(NEW.id,'lead_source','Social media','social_media',50),(NEW.id,'lead_source','Calendly','calendly',60),(NEW.id,'lead_source','Other','other',70),
  (NEW.id,'event_type','Wedding','wedding',10),(NEW.id,'event_type','Corporate Event','corporate_event',20),(NEW.id,'event_type','Parties & Celebrations','parties_celebrations',30),(NEW.id,'event_type','School Formal / University Event','school_university_event',40),(NEW.id,'event_type','Birthday','birthday',50),(NEW.id,'event_type','Engagement','engagement',60),(NEW.id,'event_type','Christening / Naming Ceremony','christening_naming',70),(NEW.id,'event_type','Other','other',80),
  (NEW.id,'lead_stage','New','new',10),(NEW.id,'lead_stage','Contacted','contacted',20),(NEW.id,'lead_stage','Inspection Booked','inspection_booked',30),(NEW.id,'lead_stage','Inspected','inspected',40),(NEW.id,'lead_stage','Menu Selected','menu_selected',50),(NEW.id,'lead_stage','Invoice Sent','invoice_sent',60),(NEW.id,'lead_stage','Deposit Received','deposit_received',70),(NEW.id,'lead_stage','Runsheet Sent','runsheet_sent',80),(NEW.id,'lead_stage','Full Payment Received','full_payment_received',90),
  (NEW.id,'lost_reason','Price','price',10),(NEW.id,'lost_reason','Date unavailable','date_unavailable',20),(NEW.id,'lost_reason','Chose competitor','chose_competitor',30),(NEW.id,'lost_reason','No response','no_response',40),(NEW.id,'lost_reason','Other','other',50),
  (NEW.id,'venue_space','Royal Splendor Hall','royal_splendor_hall',10),(NEW.id,'venue_space','Luxury Manor Hall','luxury_manor_hall',20),(NEW.id,'venue_space','Regal Outdoors','regal_outdoors',30),(NEW.id,'venue_space','Sunset Court','sunset_court',40),
  (NEW.id,'live_stall','Pani Puri','pani_puri',10),(NEW.id,'live_stall','Momo','momo',20),(NEW.id,'live_stall','Sekuwa','sekuwa',30),
  (NEW.id,'beverage_package','Non-alcoholic package','non_alcoholic',10),(NEW.id,'beverage_package','Standard beverage package','standard',20),(NEW.id,'beverage_package','Premium beverage package','premium',30)
  ON CONFLICT DO NOTHING;
  RETURN NEW;
END $function$;