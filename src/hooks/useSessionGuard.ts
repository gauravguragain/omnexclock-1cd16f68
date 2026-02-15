import { useEffect, useRef, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

const WARN_BEFORE_MS = 5 * 60 * 1000; // warn 5 min before expiry
const CHECK_INTERVAL_MS = 60 * 1000; // check every minute

export function useSessionGuard() {
  const { toast } = useToast();
  const warned = useRef(false);

  const checkSession = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return;

    const expiresAt = session.expires_at; // unix seconds
    if (!expiresAt) return;

    const msUntilExpiry = expiresAt * 1000 - Date.now();

    if (msUntilExpiry < WARN_BEFORE_MS && !warned.current) {
      warned.current = true;
      toast({
        title: "Session expiring soon",
        description: "Your session will expire in a few minutes. Save any unsaved work. We'll try to refresh automatically.",
        duration: 10000,
      });
      // proactively refresh
      const { error } = await supabase.auth.refreshSession();
      if (!error) {
        warned.current = false;
        toast({
          title: "Session refreshed",
          description: "Your session has been extended successfully.",
        });
      }
    }

    if (msUntilExpiry > WARN_BEFORE_MS) {
      warned.current = false;
    }
  }, [toast]);

  useEffect(() => {
    checkSession();
    const interval = setInterval(checkSession, CHECK_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [checkSession]);
}
