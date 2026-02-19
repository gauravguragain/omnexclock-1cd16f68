
-- Trigger to notify admins when a new employee request is submitted
CREATE OR REPLACE FUNCTION public.notify_admins_on_new_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_name TEXT;
  biz_id UUID;
  admin_row RECORD;
BEGIN
  -- Only on new pending requests
  IF NEW.status != 'pending' THEN RETURN NEW; END IF;

  SELECT e.name, e.business_id INTO emp_name, biz_id
  FROM employees e WHERE e.id = NEW.employee_id;

  IF biz_id IS NULL THEN RETURN NEW; END IF;

  -- Insert notification for each admin of the business
  INSERT INTO notifications (business_id, user_id, type, title, message, metadata)
  SELECT biz_id, ur.user_id, 'request_update',
    'New ' || NEW.request_type || ' Request',
    emp_name || ' has submitted a ' || NEW.request_type || ' request.',
    jsonb_build_object('request_id', NEW.id, 'employee_name', emp_name)
  FROM user_roles ur
  WHERE ur.business_id = biz_id AND ur.role = 'admin';

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_admins_new_request
AFTER INSERT ON public.employee_requests
FOR EACH ROW
EXECUTE FUNCTION public.notify_admins_on_new_request();

-- Trigger to notify admins on new forum posts
CREATE OR REPLACE FUNCTION public.notify_on_forum_comment()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  emp_name TEXT;
  biz_id UUID;
  post_title TEXT;
BEGIN
  SELECT e.name, e.business_id INTO emp_name, biz_id
  FROM employees e WHERE e.id = NEW.employee_id;

  SELECT fp.title INTO post_title FROM forum_posts fp WHERE fp.id = NEW.post_id;

  IF biz_id IS NULL THEN RETURN NEW; END IF;

  -- Notify admins
  INSERT INTO notifications (business_id, user_id, type, title, message, metadata)
  SELECT biz_id, ur.user_id, 'forum_activity',
    'New Comment on "' || COALESCE(post_title, 'Forum Post') || '"',
    emp_name || ' commented on a forum post.',
    jsonb_build_object('post_id', NEW.post_id)
  FROM user_roles ur
  WHERE ur.business_id = biz_id AND ur.role = 'admin';

  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_notify_on_forum_comment
AFTER INSERT ON public.forum_comments
FOR EACH ROW
EXECUTE FUNCTION public.notify_on_forum_comment();
