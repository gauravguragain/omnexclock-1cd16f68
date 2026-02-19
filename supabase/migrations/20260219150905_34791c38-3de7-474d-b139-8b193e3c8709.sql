
-- Create service maintenance tasks table
CREATE TABLE public.service_maintenance_tasks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  business_id UUID NOT NULL REFERENCES public.businesses(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  frequency_days INTEGER NOT NULL DEFAULT 30,
  last_service_date DATE,
  next_service_date DATE,
  reminder_email TEXT,
  reminder_sent BOOLEAN NOT NULL DEFAULT false,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.service_maintenance_tasks ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can manage own business service tasks"
ON public.service_maintenance_tasks FOR ALL
USING (is_admin_of_business(business_id))
WITH CHECK (is_admin_of_business(business_id));

CREATE POLICY "Super admins can manage own business service tasks"
ON public.service_maintenance_tasks FOR ALL
USING (is_super_admin_of_business(business_id))
WITH CHECK (is_super_admin_of_business(business_id));

CREATE POLICY "Viewers can view own business service tasks"
ON public.service_maintenance_tasks FOR SELECT
USING (has_business_access(business_id));

CREATE POLICY "Roster admins can view own business service tasks"
ON public.service_maintenance_tasks FOR SELECT
USING (is_roster_admin_of_business(business_id));

-- Trigger for updated_at
CREATE TRIGGER update_service_maintenance_tasks_updated_at
BEFORE UPDATE ON public.service_maintenance_tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
