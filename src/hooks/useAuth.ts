import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    const { data: sub } = supabase.auth.onAuthStateChange((event, nextSession) => {
      if (!active || event === "INITIAL_SESSION") return;
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      setLoading(false);
    });

    void (async () => {
      const { data: userData, error } = await supabase.auth.getUser();
      if (!active) return;

      if (error || !userData.user) {
        await supabase.auth.signOut({ scope: "local" });
        if (!active) return;
        setSession(null);
        setUser(null);
        setLoading(false);
        return;
      }

      const { data: sessionData } = await supabase.auth.getSession();
      if (!active) return;
      setSession(sessionData.session);
      setUser(userData.user);
      setLoading(false);
    })();

    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return { session, user, loading, signOut: () => supabase.auth.signOut() };
}
