"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAiActions } from "@/lib/ai/aiSearchStore";
import { isAiConciergePath } from "@/lib/ai/routes";
import AiConciergeModal from "./AiConciergeModal";

/* The concierge's one mount point, in the root layout.
 *
 * The provider wraps the whole app so the conversation survives navigation
 * (that is item 5 — open it on /restaurants and it resumes the exchange you
 * started on the landing page). The UI is narrower than the provider: it
 * appears on five pages and nowhere else, and members pages are excluded
 * outright.
 *
 * The gate is an ALLOW-LIST, not a deny-list. A deny-list silently admits
 * every route added later, which for a members area is exactly the wrong
 * default. */
export default function AiConciergeRoot() {
  const pathname = usePathname();
  const { setConciergeOpen } = useAiActions();

  const allowed = isAiConciergePath(pathname);

  // Landing somewhere the concierge does not exist closes it for real, rather
  // than just hiding it. Otherwise `conciergeOpen` stays true behind the
  // members area and the modal reappears unbidden on the way back — the
  // transcript survives either way, which is the part that should.
  useEffect(() => {
    if (!allowed) setConciergeOpen(false);
  }, [allowed, setConciergeOpen]);

  if (process.env.NEXT_PUBLIC_AI_CHAT_ENABLED !== "1") return null;
  if (!allowed) return null;

  return <AiConciergeModal />;
}
