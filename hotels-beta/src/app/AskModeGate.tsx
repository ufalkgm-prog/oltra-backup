"use client";

import { useAiSearch } from "@/lib/ai/aiSearchStore";

/* Hides the structured landing summary while Ask mode is on.
 *
 * LandingSummary is driven by the URL (`?submitted=1` plus a destination), and
 * knows nothing about Ask mode. Without this gate a visitor who had already run
 * a normal search and then switched to Ask saw three stacked result regions:
 * the AI panel, the AI's results, and the previous structured results still
 * sitting underneath. Clear removed the first two and left the third, which
 * reads as Clear being broken.
 *
 * Ask mode replaces the structured search, so it replaces its results too. The
 * URL is left untouched, so toggling back to Search restores them exactly. */
export default function AskModeGate({ children }: { children: React.ReactNode }) {
  const { askMode } = useAiSearch();
  if (askMode) return null;
  return <>{children}</>;
}
