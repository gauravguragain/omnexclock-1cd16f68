ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'sales_marketing_manager';

CREATE OR REPLACE FUNCTION public.is_sales_marketing_manager_of_business(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = auth.uid() AND business_id = _business_id AND role::text = 'sales_marketing_manager') $$;

CREATE OR REPLACE FUNCTION public.can_access_crm(_business_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT public.is_admin_of_business(_business_id) OR public.is_sales_marketing_manager_of_business(_business_id) $$;

GRANT EXECUTE ON FUNCTION public.is_sales_marketing_manager_of_business(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.can_access_crm(uuid) TO authenticated;

CREATE TABLE public.crm_settings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL UNIQUE REFERENCES public.businesses(id) ON DELETE CASCADE,
 stale_days integer NOT NULL DEFAULT 5 CHECK (stale_days BETWEEN 1 AND 90), assignment_mode text NOT NULL DEFAULT 'fixed' CHECK (assignment_mode IN ('fixed','round_robin')),
 fixed_assignee_id uuid, inspection_day_start time NOT NULL DEFAULT '09:00', inspection_day_end time NOT NULL DEFAULT '18:00',
 reminder_hours integer[] NOT NULL DEFAULT ARRAY[24,2], confirmation_terms text, calendly_enabled boolean NOT NULL DEFAULT false,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_settings TO authenticated; GRANT ALL ON public.crm_settings TO service_role;
ALTER TABLE public.crm_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view settings" ON public.crm_settings FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM admins create settings" ON public.crm_settings FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins update settings" ON public.crm_settings FOR UPDATE TO authenticated USING (public.is_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins delete settings" ON public.crm_settings FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));

CREATE TABLE public.crm_options (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 option_type text NOT NULL CHECK (option_type IN ('lead_source','event_type','lost_reason','lead_stage','venue_space','beverage_package','live_stall','dietary_tag','tag')),
 label text NOT NULL, value text NOT NULL, description text, image_url text, sort_order integer NOT NULL DEFAULT 0, active boolean NOT NULL DEFAULT true,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE (business_id, option_type, value)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_options TO authenticated; GRANT ALL ON public.crm_options TO service_role;
ALTER TABLE public.crm_options ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view options" ON public.crm_options FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM admins create options" ON public.crm_options FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins update options" ON public.crm_options FOR UPDATE TO authenticated USING (public.is_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins delete options" ON public.crm_options FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));

CREATE TABLE public.crm_leads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 full_name text NOT NULL, phone text, normalized_phone text, email text, normalized_email text, company text, source text NOT NULL,
 event_type text NOT NULL, preferred_dates date[] NOT NULL DEFAULT '{}', flexible_date boolean NOT NULL DEFAULT false,
 estimated_guest_count integer CHECK (estimated_guest_count IS NULL OR estimated_guest_count > 0), budget_min numeric(12,2), budget_max numeric(12,2),
 status text NOT NULL DEFAULT 'new', lost_reason text, assigned_to uuid, tags text[] NOT NULL DEFAULT '{}', venue_space text,
 estimated_value numeric(12,2) NOT NULL DEFAULT 0, last_contact_at timestamptz, calendly_source boolean NOT NULL DEFAULT false,
 created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (budget_min IS NULL OR budget_min >= 0), CHECK (budget_max IS NULL OR budget_max >= 0)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_leads TO authenticated; GRANT ALL ON public.crm_leads TO service_role;
ALTER TABLE public.crm_leads ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view leads" ON public.crm_leads FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create leads" ON public.crm_leads FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update leads" ON public.crm_leads FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users delete leads" ON public.crm_leads FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));
CREATE INDEX crm_leads_business_status_idx ON public.crm_leads(business_id,status,updated_at DESC);
CREATE INDEX crm_leads_email_idx ON public.crm_leads(business_id,normalized_email) WHERE normalized_email IS NOT NULL;
CREATE INDEX crm_leads_phone_idx ON public.crm_leads(business_id,normalized_phone) WHERE normalized_phone IS NOT NULL;

CREATE TABLE public.crm_interactions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE, interaction_type text NOT NULL CHECK (interaction_type IN ('phone_call','email','in_person','message')),
 occurred_at timestamptz NOT NULL DEFAULT now(), duration_minutes integer CHECK (duration_minutes IS NULL OR duration_minutes >= 0), notes text NOT NULL,
 follow_up_required boolean NOT NULL DEFAULT false, follow_up_at timestamptz, shareable_feedback boolean NOT NULL DEFAULT false,
 ai_summary jsonb, logged_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_interactions TO authenticated; GRANT ALL ON public.crm_interactions TO service_role;
ALTER TABLE public.crm_interactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view interactions" ON public.crm_interactions FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create interactions" ON public.crm_interactions FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update interactions" ON public.crm_interactions FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM admins delete interactions" ON public.crm_interactions FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));
CREATE INDEX crm_interactions_lead_idx ON public.crm_interactions(lead_id,occurred_at DESC);

CREATE TABLE public.crm_inspections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE, proposed_at timestamptz, starts_at timestamptz, ends_at timestamptz,
 status text NOT NULL DEFAULT 'proposed' CHECK (status IN ('proposed','confirmed','completed','no_show','rescheduled','cancelled')),
 assigned_to uuid, venue_space text NOT NULL, pre_notes text, post_notes text, reminder_hours integer[] NOT NULL DEFAULT ARRAY[24,2],
 calendly_event_uri text, calendly_invitee_uri text, calendly_source boolean NOT NULL DEFAULT false, superseded_by uuid REFERENCES public.crm_inspections(id),
 created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (ends_at IS NULL OR starts_at IS NULL OR ends_at > starts_at)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_inspections TO authenticated; GRANT ALL ON public.crm_inspections TO service_role;
ALTER TABLE public.crm_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view inspections" ON public.crm_inspections FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create inspections" ON public.crm_inspections FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update inspections" ON public.crm_inspections FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM admins delete inspections" ON public.crm_inspections FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));
CREATE INDEX crm_inspections_calendar_idx ON public.crm_inspections(business_id,starts_at,status);
CREATE UNIQUE INDEX crm_inspections_calendly_invitee_idx ON public.crm_inspections(calendly_invitee_uri) WHERE calendly_invitee_uri IS NOT NULL;

CREATE TABLE public.crm_menu_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 category text NOT NULL CHECK (category IN ('nepali_express','nepali_catering','indian_catering','addon','beverage','live_stall')),
 name text NOT NULL, description text, price_per_head numeric(12,2), flat_price numeric(12,2), dietary_tags text[] NOT NULL DEFAULT '{}', active boolean NOT NULL DEFAULT true,
 sort_order integer NOT NULL DEFAULT 0, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK (price_per_head IS NULL OR price_per_head >= 0), CHECK (flat_price IS NULL OR flat_price >= 0), UNIQUE (business_id,category,name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_menu_items TO authenticated; GRANT ALL ON public.crm_menu_items TO service_role;
ALTER TABLE public.crm_menu_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view menu" ON public.crm_menu_items FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM admins create menu" ON public.crm_menu_items FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins update menu" ON public.crm_menu_items FOR UPDATE TO authenticated USING (public.is_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins delete menu" ON public.crm_menu_items FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));

CREATE TABLE public.crm_menu_selections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL UNIQUE REFERENCES public.crm_leads(id) ON DELETE CASCADE, guest_count integer NOT NULL DEFAULT 1 CHECK (guest_count > 0),
 dietary_requirements text, allergies text, beverage_package text, total_estimate numeric(12,2) NOT NULL DEFAULT 0,
 created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_menu_selections TO authenticated; GRANT ALL ON public.crm_menu_selections TO service_role;
ALTER TABLE public.crm_menu_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view selections" ON public.crm_menu_selections FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create selections" ON public.crm_menu_selections FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update selections" ON public.crm_menu_selections FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM admins delete selections" ON public.crm_menu_selections FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));

CREATE TABLE public.crm_menu_selection_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 selection_id uuid NOT NULL REFERENCES public.crm_menu_selections(id) ON DELETE CASCADE, menu_item_id uuid REFERENCES public.crm_menu_items(id) ON DELETE SET NULL,
 item_name text NOT NULL, quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0), price_per_head numeric(12,2), flat_price numeric(12,2), notes text,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_menu_selection_items TO authenticated; GRANT ALL ON public.crm_menu_selection_items TO service_role;
ALTER TABLE public.crm_menu_selection_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view selection items" ON public.crm_menu_selection_items FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create selection items" ON public.crm_menu_selection_items FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update selection items" ON public.crm_menu_selection_items FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users delete selection items" ON public.crm_menu_selection_items FOR DELETE TO authenticated USING (public.can_access_crm(business_id));

CREATE TABLE public.crm_bookings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL UNIQUE REFERENCES public.crm_leads(id) ON DELETE RESTRICT, event_date date NOT NULL, start_time time NOT NULL, duration_minutes integer NOT NULL CHECK (duration_minutes > 0),
 guest_count integer NOT NULL CHECK (guest_count > 0), venue_space text NOT NULL, menu_selection_id uuid REFERENCES public.crm_menu_selections(id),
 total_amount numeric(12,2) NOT NULL DEFAULT 0, deposit_amount numeric(12,2) NOT NULL DEFAULT 0, deposit_due_date date, deposit_paid boolean NOT NULL DEFAULT false,
 balance_due_date date, status text NOT NULL DEFAULT 'pending_confirmation' CHECK (status IN ('pending_confirmation','confirmed','declined','cancelled')),
 confirmation_sent_at timestamptz, confirmed_at timestamptz, roster_event_id uuid REFERENCES public.roster_day_events(id) ON DELETE SET NULL,
 created_by uuid, updated_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_bookings TO authenticated; GRANT ALL ON public.crm_bookings TO service_role;
ALTER TABLE public.crm_bookings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view bookings" ON public.crm_bookings FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create bookings" ON public.crm_bookings FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update bookings" ON public.crm_bookings FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM admins delete bookings" ON public.crm_bookings FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));
CREATE INDEX crm_bookings_event_idx ON public.crm_bookings(business_id,event_date,status);

CREATE TABLE public.crm_tasks (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 lead_id uuid REFERENCES public.crm_leads(id) ON DELETE CASCADE, booking_id uuid REFERENCES public.crm_bookings(id) ON DELETE CASCADE,
 title text NOT NULL, description text, task_type text NOT NULL DEFAULT 'follow_up', assigned_to uuid, due_at timestamptz NOT NULL,
 priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high','urgent')), status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','completed','dismissed')),
 automated boolean NOT NULL DEFAULT false, completed_at timestamptz, created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_tasks TO authenticated; GRANT ALL ON public.crm_tasks TO service_role;
ALTER TABLE public.crm_tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view tasks" ON public.crm_tasks FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM users create tasks" ON public.crm_tasks FOR INSERT TO authenticated WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users update tasks" ON public.crm_tasks FOR UPDATE TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id));
CREATE POLICY "CRM users delete tasks" ON public.crm_tasks FOR DELETE TO authenticated USING (public.can_access_crm(business_id));
CREATE INDEX crm_tasks_due_idx ON public.crm_tasks(business_id,status,due_at);

CREATE TABLE public.crm_templates (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 template_type text NOT NULL CHECK (template_type IN ('inspection_confirmation','follow_up','menu_reminder','booking_confirmation','thank_you')),
 channel text NOT NULL DEFAULT 'email' CHECK (channel IN ('email','sms')), name text NOT NULL, subject text, body text NOT NULL, active boolean NOT NULL DEFAULT true,
 created_by uuid, created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,template_type,channel,name)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_templates TO authenticated; GRANT ALL ON public.crm_templates TO service_role;
ALTER TABLE public.crm_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view templates" ON public.crm_templates FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE POLICY "CRM admins create templates" ON public.crm_templates FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins update templates" ON public.crm_templates FOR UPDATE TO authenticated USING (public.is_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins delete templates" ON public.crm_templates FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));

CREATE TABLE public.crm_timeline_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 lead_id uuid NOT NULL REFERENCES public.crm_leads(id) ON DELETE CASCADE, event_type text NOT NULL, title text NOT NULL, details jsonb NOT NULL DEFAULT '{}', actor_id uuid,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.crm_timeline_events TO authenticated; GRANT ALL ON public.crm_timeline_events TO service_role;
ALTER TABLE public.crm_timeline_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM users view timeline" ON public.crm_timeline_events FOR SELECT TO authenticated USING (public.can_access_crm(business_id));
CREATE INDEX crm_timeline_lead_idx ON public.crm_timeline_events(lead_id,created_at DESC);

CREATE TABLE public.crm_confirmation_tokens (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 booking_id uuid NOT NULL REFERENCES public.crm_bookings(id) ON DELETE CASCADE, token_hash text NOT NULL UNIQUE, expires_at timestamptz NOT NULL, used_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.crm_confirmation_tokens TO service_role;
ALTER TABLE public.crm_confirmation_tokens ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.crm_calendly_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE, connected_by uuid NOT NULL,
 enabled boolean NOT NULL DEFAULT false, status text NOT NULL DEFAULT 'disconnected' CHECK (status IN ('disconnected','connected','paused','error')),
 calendly_user_uri text, calendly_organization_uri text, webhook_subscription_uri text, last_sync_at timestamptz, last_error text,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,connected_by)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_calendly_connections TO authenticated; GRANT ALL ON public.crm_calendly_connections TO service_role;
ALTER TABLE public.crm_calendly_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM admins view Calendly" ON public.crm_calendly_connections FOR SELECT TO authenticated USING (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins create Calendly" ON public.crm_calendly_connections FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id) AND connected_by = auth.uid());
CREATE POLICY "CRM admins update Calendly" ON public.crm_calendly_connections FOR UPDATE TO authenticated USING (public.is_admin_of_business(business_id) AND connected_by = auth.uid()) WITH CHECK (public.is_admin_of_business(business_id) AND connected_by = auth.uid());
CREATE POLICY "CRM admins delete Calendly" ON public.crm_calendly_connections FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id) AND connected_by = auth.uid());

CREATE TABLE public.crm_calendly_mappings (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
 calendly_event_type_uri text NOT NULL, calendly_event_type_name text NOT NULL, crm_event_type text, venue_space text, active boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(), UNIQUE(business_id,calendly_event_type_uri)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.crm_calendly_mappings TO authenticated; GRANT ALL ON public.crm_calendly_mappings TO service_role;
ALTER TABLE public.crm_calendly_mappings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "CRM admins manage mappings select" ON public.crm_calendly_mappings FOR SELECT TO authenticated USING (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins manage mappings insert" ON public.crm_calendly_mappings FOR INSERT TO authenticated WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins manage mappings update" ON public.crm_calendly_mappings FOR UPDATE TO authenticated USING (public.is_admin_of_business(business_id)) WITH CHECK (public.is_admin_of_business(business_id));
CREATE POLICY "CRM admins manage mappings delete" ON public.crm_calendly_mappings FOR DELETE TO authenticated USING (public.is_admin_of_business(business_id));

CREATE TABLE public.crm_webhook_receipts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), business_id uuid REFERENCES public.businesses(id) ON DELETE CASCADE, provider text NOT NULL,
 external_id text NOT NULL, event_type text NOT NULL, payload jsonb NOT NULL DEFAULT '{}', processed_at timestamptz, error text, received_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(provider,external_id,event_type)
);
GRANT ALL ON public.crm_webhook_receipts TO service_role;
ALTER TABLE public.crm_webhook_receipts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.crm_set_normalized_contact()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.normalized_email := NULLIF(lower(trim(NEW.email)), ''); NEW.normalized_phone := NULLIF(regexp_replace(COALESCE(NEW.phone,''), '[^0-9]', '', 'g'), ''); RETURN NEW; END $$;
CREATE TRIGGER crm_leads_normalize_contact BEFORE INSERT OR UPDATE OF email,phone ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_set_normalized_contact();

CREATE OR REPLACE FUNCTION public.crm_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END $$;
CREATE TRIGGER crm_settings_touch BEFORE UPDATE ON public.crm_settings FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_options_touch BEFORE UPDATE ON public.crm_options FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_leads_touch BEFORE UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_interactions_touch BEFORE UPDATE ON public.crm_interactions FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_inspections_touch BEFORE UPDATE ON public.crm_inspections FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_menu_items_touch BEFORE UPDATE ON public.crm_menu_items FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_menu_selections_touch BEFORE UPDATE ON public.crm_menu_selections FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_bookings_touch BEFORE UPDATE ON public.crm_bookings FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_tasks_touch BEFORE UPDATE ON public.crm_tasks FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_templates_touch BEFORE UPDATE ON public.crm_templates FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_calendly_connections_touch BEFORE UPDATE ON public.crm_calendly_connections FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();
CREATE TRIGGER crm_calendly_mappings_touch BEFORE UPDATE ON public.crm_calendly_mappings FOR EACH ROW EXECUTE FUNCTION public.crm_touch_updated_at();

CREATE OR REPLACE FUNCTION public.crm_record_lead_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF TG_OP = 'INSERT' THEN INSERT INTO public.crm_timeline_events(business_id,lead_id,event_type,title,details,actor_id) VALUES(NEW.business_id,NEW.id,'lead_created','Lead created',jsonb_build_object('status',NEW.status),NEW.created_by);
 ELSIF NEW.status IS DISTINCT FROM OLD.status THEN INSERT INTO public.crm_timeline_events(business_id,lead_id,event_type,title,details,actor_id) VALUES(NEW.business_id,NEW.id,'status_changed','Status changed',jsonb_build_object('from',OLD.status,'to',NEW.status),NEW.updated_by); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_leads_timeline AFTER INSERT OR UPDATE ON public.crm_leads FOR EACH ROW EXECUTE FUNCTION public.crm_record_lead_event();

CREATE OR REPLACE FUNCTION public.crm_record_interaction_event()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 INSERT INTO public.crm_timeline_events(business_id,lead_id,event_type,title,details,actor_id) VALUES(NEW.business_id,NEW.lead_id,'interaction','Interaction logged',jsonb_build_object('type',NEW.interaction_type,'notes',NEW.notes),NEW.logged_by);
 IF NEW.follow_up_required AND NEW.follow_up_at IS NOT NULL THEN INSERT INTO public.crm_tasks(business_id,lead_id,title,description,task_type,assigned_to,due_at,automated,created_by) SELECT NEW.business_id,NEW.lead_id,'Follow up with '||l.full_name,NEW.notes,'follow_up',l.assigned_to,NEW.follow_up_at,true,NEW.logged_by FROM public.crm_leads l WHERE l.id=NEW.lead_id; END IF;
 UPDATE public.crm_leads SET last_contact_at=NEW.occurred_at, updated_by=NEW.logged_by WHERE id=NEW.lead_id;
 RETURN NEW;
END $$;
CREATE TRIGGER crm_interactions_timeline AFTER INSERT ON public.crm_interactions FOR EACH ROW EXECUTE FUNCTION public.crm_record_interaction_event();