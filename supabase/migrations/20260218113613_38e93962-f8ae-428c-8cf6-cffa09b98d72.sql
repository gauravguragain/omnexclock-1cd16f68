
-- =============================================
-- PHASE 1: Schema changes for WorkSync features
-- =============================================

-- 1. Add new columns to employees table
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS email text,
  ADD COLUMN IF NOT EXISTS phone text,
  ADD COLUMN IF NOT EXISTS job_title text,
  ADD COLUMN IF NOT EXISTS department text,
  ADD COLUMN IF NOT EXISTS admin_hourly_rate numeric NOT NULL DEFAULT 0;

-- 2. Create shifts table for roster/scheduling
CREATE TABLE public.shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  date date NOT NULL,
  day_of_week text NOT NULL,
  start_time time NOT NULL,
  end_time time NOT NULL,
  break_minutes integer NOT NULL DEFAULT 0,
  hours_worked numeric GENERATED ALWAYS AS (
    EXTRACT(EPOCH FROM (end_time - start_time)) / 3600.0 - break_minutes / 60.0
  ) STORED,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
  notes text,
  week_start_date date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.shifts ENABLE ROW LEVEL SECURITY;

-- Admin full access
CREATE POLICY "Admins can manage shifts"
  ON public.shifts FOR ALL
  USING (public.is_admin());

-- Employees can view their own published shifts (for employee portal later)
CREATE POLICY "Employees can view own published shifts"
  ON public.shifts FOR SELECT
  USING (status = 'published');

-- Trigger for updated_at
CREATE TRIGGER update_shifts_updated_at
  BEFORE UPDATE ON public.shifts
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Create payroll_entries table
CREATE TABLE public.payroll_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  timesheet_approval_id uuid REFERENCES public.timesheet_approvals(id) ON DELETE SET NULL,
  period text NOT NULL,
  employee_hours numeric NOT NULL DEFAULT 0,
  employee_pay numeric NOT NULL DEFAULT 0,
  admin_pay numeric NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'unpaid' CHECK (status IN ('paid', 'unpaid')),
  paid_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.payroll_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage payroll entries"
  ON public.payroll_entries FOR ALL
  USING (public.is_admin());

CREATE TRIGGER update_payroll_entries_updated_at
  BEFORE UPDATE ON public.payroll_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Enable realtime for shifts (for live roster updates)
ALTER PUBLICATION supabase_realtime ADD TABLE public.shifts;
