"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";

/* Whether the visitor is signed in as a member: `true`, `false`, or `null`
 * while the session has not been read yet.
 *
 * Signed in is the test, because it is exactly what the concierge's chat route
 * requires (a session, else 401) — a control that says "members only" must not
 * be stricter or looser than the thing it opens. Read from
 * onAuthStateChange, like SiteHeader, which fires once with the stored session
 * and again on every sign-in or sign-out. */
export function useIsMember(): boolean | null {
  const [isMember, setIsMember] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = createClient();
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setIsMember(Boolean(session?.user));
    });
    return () => data.subscription.unsubscribe();
  }, []);

  return isMember;
}
