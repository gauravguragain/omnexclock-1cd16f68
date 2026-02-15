
-- Create timesheet_approvals table to track approval per employee per date
CREATE TABLE public.timesheet_approvals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  approved BOOLEAN NOT NULL DEFAULT false,
  approved_by UUID REFERENCES auth.users(id),
  approved_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(employee_id, date)
);

-- Enable RLS
ALTER TABLE public.timesheet_approvals ENABLE ROW LEVEL SECURITY;

-- Admins can do everything
CREATE POLICY "Admins can manage timesheet approvals"
ON public.timesheet_approvals
FOR ALL
USING (public.is_admin());

-- Trigger for updated_at
CREATE TRIGGER update_timesheet_approvals_updated_at
BEFORE UPDATE ON public.timesheet_approvals
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
