
-- Forum posts (admin creates)
CREATE TABLE public.forum_posts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  author_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forum_posts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage forum posts" ON public.forum_posts FOR ALL USING (is_admin());
CREATE POLICY "Anon can read forum posts" ON public.forum_posts FOR SELECT USING (true);

-- Forum comments (employees comment)
CREATE TABLE public.forum_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.forum_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage forum comments" ON public.forum_comments FOR ALL USING (is_admin());
CREATE POLICY "Service role can insert forum comments" ON public.forum_comments FOR INSERT WITH CHECK (true);
CREATE POLICY "Anon can read forum comments" ON public.forum_comments FOR SELECT USING (true);

-- Forum reactions
CREATE TABLE public.forum_reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID NOT NULL REFERENCES public.forum_posts(id) ON DELETE CASCADE,
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  reaction TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(post_id, employee_id, reaction)
);

ALTER TABLE public.forum_reactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage forum reactions" ON public.forum_reactions FOR ALL USING (is_admin());
CREATE POLICY "Service role can insert forum reactions" ON public.forum_reactions FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can delete forum reactions" ON public.forum_reactions FOR DELETE USING (true);
CREATE POLICY "Anon can read forum reactions" ON public.forum_reactions FOR SELECT USING (true);

-- Employee requests (leave and unavailability)
CREATE TABLE public.employee_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES public.employees(id) ON DELETE CASCADE,
  request_type TEXT NOT NULL DEFAULT 'leave',
  status TEXT NOT NULL DEFAULT 'pending',
  start_date DATE,
  end_date DATE,
  is_recurring BOOLEAN NOT NULL DEFAULT false,
  recurring_days TEXT[],
  recurring_start_date DATE,
  recurring_end_date DATE,
  reason TEXT,
  admin_note TEXT,
  approved_by UUID,
  approved_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.employee_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage employee requests" ON public.employee_requests FOR ALL USING (is_admin());
CREATE POLICY "Anon can read approved requests" ON public.employee_requests FOR SELECT USING (true);
CREATE POLICY "Service role can insert requests" ON public.employee_requests FOR INSERT WITH CHECK (true);

-- Trigger for updated_at
CREATE TRIGGER update_forum_posts_updated_at BEFORE UPDATE ON public.forum_posts FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_employee_requests_updated_at BEFORE UPDATE ON public.employee_requests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RPCs for employee portal access

-- Get forum posts with counts
CREATE OR REPLACE FUNCTION public.get_forum_posts(_employee_code TEXT)
RETURNS TABLE(
  id UUID,
  title TEXT,
  content TEXT,
  created_at TIMESTAMPTZ,
  comment_count BIGINT,
  reaction_counts JSONB
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT
    fp.id,
    fp.title,
    fp.content,
    fp.created_at,
    (SELECT COUNT(*) FROM forum_comments fc WHERE fc.post_id = fp.id) AS comment_count,
    COALESCE((SELECT jsonb_object_agg(r.reaction, r.cnt) FROM (SELECT fr.reaction, COUNT(*) AS cnt FROM forum_reactions fr WHERE fr.post_id = fp.id GROUP BY fr.reaction) r), '{}'::jsonb) AS reaction_counts
  FROM forum_posts fp
  ORDER BY fp.created_at DESC;
END;
$$;

-- Get post comments
CREATE OR REPLACE FUNCTION public.get_forum_comments(_employee_code TEXT, _post_id UUID)
RETURNS TABLE(
  id UUID,
  employee_name TEXT,
  content TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT fc.id, e2.name AS employee_name, fc.content, fc.created_at
  FROM forum_comments fc
  JOIN employees e2 ON e2.id = fc.employee_id
  WHERE fc.post_id = _post_id
  ORDER BY fc.created_at ASC;
END;
$$;

-- Add comment
CREATE OR REPLACE FUNCTION public.add_forum_comment(_employee_code TEXT, _post_id UUID, _content TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO forum_comments (post_id, employee_id, content) VALUES (_post_id, emp_id, _content);
  RETURN true;
END;
$$;

-- Toggle reaction
CREATE OR REPLACE FUNCTION public.toggle_forum_reaction(_employee_code TEXT, _post_id UUID, _reaction TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
  existing_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN false; END IF;

  SELECT fr.id INTO existing_id FROM forum_reactions fr WHERE fr.post_id = _post_id AND fr.employee_id = emp_id AND fr.reaction = _reaction;
  IF FOUND THEN
    DELETE FROM forum_reactions WHERE id = existing_id;
  ELSE
    INSERT INTO forum_reactions (post_id, employee_id, reaction) VALUES (_post_id, emp_id, _reaction);
  END IF;
  RETURN true;
END;
$$;

-- Get employee's own reactions for a post
CREATE OR REPLACE FUNCTION public.get_my_reactions(_employee_code TEXT, _post_id UUID)
RETURNS TABLE(reaction TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT fr.reaction FROM forum_reactions fr WHERE fr.post_id = _post_id AND fr.employee_id = emp_id;
END;
$$;

-- Submit leave/unavailability request
CREATE OR REPLACE FUNCTION public.submit_employee_request(
  _employee_code TEXT,
  _request_type TEXT,
  _start_date DATE DEFAULT NULL,
  _end_date DATE DEFAULT NULL,
  _is_recurring BOOLEAN DEFAULT false,
  _recurring_days TEXT[] DEFAULT NULL,
  _recurring_start_date DATE DEFAULT NULL,
  _recurring_end_date DATE DEFAULT NULL,
  _reason TEXT DEFAULT NULL
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN false; END IF;

  INSERT INTO employee_requests (employee_id, request_type, start_date, end_date, is_recurring, recurring_days, recurring_start_date, recurring_end_date, reason)
  VALUES (emp_id, _request_type, _start_date, _end_date, _is_recurring, _recurring_days, _recurring_start_date, _recurring_end_date, _reason);
  RETURN true;
END;
$$;

-- Get employee's own requests
CREATE OR REPLACE FUNCTION public.get_employee_requests(_employee_code TEXT)
RETURNS TABLE(
  id UUID,
  request_type TEXT,
  status TEXT,
  start_date DATE,
  end_date DATE,
  is_recurring BOOLEAN,
  recurring_days TEXT[],
  recurring_start_date DATE,
  recurring_end_date DATE,
  reason TEXT,
  admin_note TEXT,
  created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public'
AS $$
DECLARE
  emp_id UUID;
BEGIN
  SELECT e.id INTO emp_id FROM employees e WHERE e.employee_code = _employee_code AND e.active = true;
  IF NOT FOUND THEN RETURN; END IF;

  RETURN QUERY
  SELECT er.id, er.request_type, er.status, er.start_date, er.end_date, er.is_recurring, er.recurring_days, er.recurring_start_date, er.recurring_end_date, er.reason, er.admin_note, er.created_at
  FROM employee_requests er
  WHERE er.employee_id = emp_id
  ORDER BY er.created_at DESC;
END;
$$;
