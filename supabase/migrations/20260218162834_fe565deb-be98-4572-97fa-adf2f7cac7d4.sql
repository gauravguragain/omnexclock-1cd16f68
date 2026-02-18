
-- Create businesses table
CREATE TABLE public.businesses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  business_code TEXT UNIQUE NOT NULL,
  owner_id UUID NOT NULL,
  logo_url TEXT,
  phone TEXT,
  email TEXT,
  address TEXT,
  industry TEXT,
  description TEXT,
  theme JSONB DEFAULT '{"primary": "43 72% 52%", "background": "0 0% 0%", "foreground": "0 0% 96%", "card": "0 0% 4%", "accent": "43 72% 52%", "muted": "0 0% 10%", "border": "0 0% 16%"}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.businesses ENABLE ROW LEVEL SECURITY;

-- Add business_id columns FIRST before any policies reference them
ALTER TABLE public.employees ADD COLUMN business_id UUID REFERENCES public.businesses(id);
ALTER TABLE public.forum_posts ADD COLUMN business_id UUID REFERENCES public.businesses(id);
ALTER TABLE public.audit_logs ADD COLUMN business_id UUID REFERENCES public.businesses(id);
ALTER TABLE public.user_roles ADD COLUMN business_id UUID REFERENCES public.businesses(id);

-- Now create policies
CREATE POLICY "Users can view their business" ON public.businesses
FOR SELECT USING (
  owner_id = auth.uid() OR
  EXISTS (SELECT 1 FROM public.user_roles ur WHERE ur.user_id = auth.uid() AND ur.business_id = id)
);

CREATE POLICY "Public can read business by code" ON public.businesses
FOR SELECT USING (true);

CREATE POLICY "Owner can update business" ON public.businesses
FOR UPDATE USING (owner_id = auth.uid());

CREATE POLICY "Authenticated can create business" ON public.businesses
FOR INSERT WITH CHECK (auth.uid() = owner_id);

-- Storage bucket for business logos
INSERT INTO storage.buckets (id, name, public) VALUES ('business-logos', 'business-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Users can upload business logos" ON storage.objects
FOR INSERT WITH CHECK (bucket_id = 'business-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Users can update business logos" ON storage.objects
FOR UPDATE USING (bucket_id = 'business-logos' AND auth.uid() IS NOT NULL);

CREATE POLICY "Public can view business logos" ON storage.objects
FOR SELECT USING (bucket_id = 'business-logos');

-- Trigger for updated_at
CREATE TRIGGER update_businesses_updated_at
BEFORE UPDATE ON public.businesses
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Register business function with auto-admin
CREATE OR REPLACE FUNCTION public.register_business(
  _business_name TEXT,
  _business_code TEXT
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  new_business_id UUID;
  calling_user_id UUID;
BEGIN
  calling_user_id := auth.uid();
  IF calling_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  INSERT INTO businesses (name, business_code, owner_id, email)
  VALUES (_business_name, _business_code, calling_user_id, 
    (SELECT email FROM auth.users WHERE id = calling_user_id))
  RETURNING id INTO new_business_id;

  INSERT INTO user_roles (user_id, role, business_id)
  VALUES (calling_user_id, 'admin', new_business_id);

  UPDATE profiles SET approved = true WHERE id = calling_user_id;

  RETURN new_business_id;
END;
$$;
