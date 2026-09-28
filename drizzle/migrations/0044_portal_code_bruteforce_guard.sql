CREATE TABLE IF NOT EXISTS public.portal_code_attempts (
  ip text NOT NULL,
  business_code text NOT NULL,
  code_hash text NOT NULL,
  window_start timestamptz NOT NULL,
  PRIMARY KEY (ip, business_code, code_hash, window_start)
);
GRANT ALL ON public.portal_code_attempts TO service_role;
ALTER TABLE public.portal_code_attempts ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.portal_rate_guard(_business_code text, _code text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _ip text; _win timestamptz; _n int;
BEGIN
  IF auth.uid() IS NOT NULL THEN RETURN; END IF;
  _ip := coalesce(split_part(current_setting('request.headers', true)::json->>'x-forwarded-for', ',', 1), 'unknown');
  _win := date_trunc('hour', now()) + floor(extract(minute from now())/15) * interval '15 minutes';
  INSERT INTO public.portal_code_attempts VALUES (_ip, coalesce(_business_code,''), md5(coalesce(_code,'')), _win)
  ON CONFLICT DO NOTHING;
  SELECT count(*) INTO _n FROM public.portal_code_attempts WHERE ip = _ip AND window_start = _win;
  IF _n > 40 THEN
    RAISE EXCEPTION 'Too many attempts. Please wait 15 minutes and try again.' USING ERRCODE = 'P0001';
  END IF;
  DELETE FROM public.portal_code_attempts WHERE window_start < now() - interval '1 day';
END $$;
REVOKE ALL ON FUNCTION public.portal_rate_guard(text, text) FROM public, anon, authenticated;

DO $do$
DECLARE f record; def text; codearg text; newdef text;
BEGIN
  FOR f IN
    SELECT p.oid, p.proargnames FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace JOIN pg_language l ON l.oid = p.prolang
    WHERE n.nspname = 'public' AND l.lanname = 'plpgsql' AND p.prosecdef
      AND '_business_code' = ANY(p.proargnames)
      AND ('_employee_code' = ANY(p.proargnames) OR '_code' = ANY(p.proargnames))
  LOOP
    codearg := CASE WHEN '_employee_code' = ANY(f.proargnames) THEN '_employee_code' ELSE '_code' END;
    def := pg_get_functiondef(f.oid);
    IF position('portal_rate_guard' in def) > 0 THEN CONTINUE; END IF;
    newdef := regexp_replace(def, '(\mBEGIN\M)', E'\\1\n  PERFORM public.portal_rate_guard(_business_code, ' || codearg || ');', 'i');
    EXECUTE newdef;
  END LOOP;
END $do$;

-- Trigger functions never need to be called directly
DO $do$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.prorettype = 'trigger'::regtype
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM public, anon, authenticated', f.sig);
  END LOOP;
END $do$;