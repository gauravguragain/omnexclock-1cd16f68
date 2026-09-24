
CREATE TABLE public.crm_venue_spaces(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, name text not null, capacity integer, layouts text[] not null default '{}', description text, active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_customers(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, full_name text not null, phone text, email text, address text, company text, source text not null default 'direct', notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_stakeholders(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, full_name text not null, position text, stakeholder_type text not null default 'vendor', phone text, email text, notes text, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_menu_books(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, name text not null, description text, active boolean not null default true, sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_dishes(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, name text not null, diet text not null default 'veg', active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_drinks(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, name text not null, kind text not null default 'soft', active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_packages(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, book_id uuid references public.crm_menu_books(id) on delete set null, name text not null, package_type text not null default 'food', description text, price_per_head numeric not null default 0, min_guests integer not null default 1, active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
CREATE TABLE public.crm_package_courses(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, package_id uuid not null references public.crm_packages(id) on delete cascade, name text not null, picks integer, sort_order integer not null default 0, created_at timestamptz not null default now());
CREATE TABLE public.crm_package_course_items(id uuid primary key default gen_random_uuid(), business_id uuid not null references public.businesses(id) on delete cascade, course_id uuid not null references public.crm_package_courses(id) on delete cascade, dish_id uuid references public.crm_dishes(id) on delete cascade, drink_id uuid references public.crm_drinks(id) on delete cascade, created_at timestamptz not null default now());

DO $$ DECLARE t text; BEGIN
FOREACH t IN ARRAY ARRAY['crm_venue_spaces','crm_customers','crm_stakeholders','crm_menu_books','crm_dishes','crm_drinks','crm_packages','crm_package_courses','crm_package_course_items'] LOOP
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO authenticated', t);
  EXECUTE format('GRANT ALL ON public.%I TO service_role', t);
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
  EXECUTE format('CREATE POLICY "CRM staff manage %s" ON public.%I FOR ALL TO authenticated USING (public.can_access_crm(business_id)) WITH CHECK (public.can_access_crm(business_id))', t, t);
  EXECUTE format('CREATE INDEX ON public.%I(business_id)', t);
END LOOP; END $$;

ALTER TABLE public.crm_leads ADD COLUMN lead_kind text not null default 'event', ADD COLUMN service_location text, ADD COLUMN customer_id uuid references public.crm_customers(id) on delete set null, ADD COLUMN decline_reason text, ADD COLUMN lead_outcome text not null default 'new';
ALTER TABLE public.crm_bookings ADD COLUMN venue_space_id uuid references public.crm_venue_spaces(id) on delete set null, ADD COLUMN booking_kind text not null default 'event', ADD COLUMN end_time time, ADD COLUMN adults integer, ADD COLUMN kids integer, ADD COLUMN event_order_number text, ADD COLUMN customer_id uuid references public.crm_customers(id) on delete set null, ADD COLUMN service_location text, ADD COLUMN event_name text, ADD COLUMN event_type text, ADD COLUMN notes text;
ALTER TABLE public.crm_bookings ALTER COLUMN lead_id DROP NOT NULL;
ALTER TABLE public.crm_menu_selections ADD COLUMN package_id uuid references public.crm_packages(id) on delete set null;

-- backfills
INSERT INTO public.crm_venue_spaces(business_id,name,sort_order) SELECT business_id,label,sort_order FROM public.crm_options WHERE option_type='venue_space' AND active;
INSERT INTO public.crm_dishes(business_id,name,diet) SELECT DISTINCT ON (business_id,lower(name)) business_id,name,CASE WHEN category IN ('entrees_nonveg','nonveg_mains') THEN 'nonveg' ELSE 'veg' END FROM public.crm_menu_items WHERE category IN ('entrees_veg','entrees_nonveg','veg_mains','nonveg_mains','sides','dessert','kids_menu');
INSERT INTO public.crm_customers(business_id,full_name,phone,email,company,source) SELECT business_id,full_name,phone,email,company,'lead' FROM public.crm_leads;
UPDATE public.crm_leads l SET customer_id=c.id FROM public.crm_customers c WHERE c.business_id=l.business_id AND c.full_name=l.full_name AND coalesce(c.email,'')=coalesce(l.email,'') AND coalesce(c.phone,'')=coalesce(l.phone,'');
UPDATE public.crm_leads SET lead_outcome='confirmed' WHERE status IN ('invoice_sent','deposit_received','runsheet_sent','full_payment_received');
UPDATE public.crm_bookings b SET customer_id=l.customer_id, event_type=l.event_type, event_name=l.full_name FROM public.crm_leads l WHERE l.id=b.lead_id;

CREATE OR REPLACE FUNCTION public.crm_next_event_order(_business_id uuid) RETURNS text LANGUAGE sql SECURITY DEFINER SET search_path=public AS $$
  SELECT (300 + count(*) + 1)::text || '-1' FROM public.crm_bookings WHERE business_id=_business_id AND public.can_access_crm(_business_id)
$$;
GRANT EXECUTE ON FUNCTION public.crm_next_event_order(uuid) TO authenticated;
