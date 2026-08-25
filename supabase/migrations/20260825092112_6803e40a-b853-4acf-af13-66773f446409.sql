DO $do$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prokind = 'f' AND p.prosecdef
      AND p.proname IN (
        'accept_invitation','accept_pending_invitations_for_user','admin_set_document_status',
        'delete_employee','get_employee_business_id','get_roster_admin_departments',
        'has_business_access','has_role','is_admin','is_admin_of_business','is_approved',
        'is_master','is_roster_admin_of_business','is_super_admin_of_business','is_viewer_of_business',
        'log_audit_entry','next_employee_invoice_number','register_business'
      )
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', r.sig);
  END LOOP;

  -- Trigger-only functions need no direct API access at all
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.prosecdef
      AND p.proname IN ('handle_new_user','notify_admins_on_new_request','notify_on_forum_comment','update_updated_at_column')
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated', r.sig);
  END LOOP;
END
$do$;