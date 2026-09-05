"use client";

import { useEffect } from "react";
import { useAiActions } from "./aiSearchStore";
import type { AiPageContext } from "./types";

/* Publishes the current page's context into the store, so the concierge knows
 * where it was opened from.
 *
 * Each page calls this with state it already holds — the selected hotel, the
 * active city, the flight route — and nothing else changes on that page. The
 * value is compared by its serialised form rather than by reference, because
 * every caller builds a fresh object on each render and a reference dependency
 * would write to the store on every keystroke.
 *
 * It reads useAiActions, not useAiSearch: the caller is a whole page, and
 * subscribing it to the conversation would re-render it on every streamed
 * token.
 *
 * It clears on unmount: navigating away should not leave the previous page's
 * hotel attached to the next question. */
export function useAiPageContext(context: AiPageContext) {
  const { setPageContext } = useAiActions();
  const key = JSON.stringify(context);

  useEffect(() => {
    setPageContext(JSON.parse(key) as AiPageContext);
    return () => setPageContext(null);
  }, [key, setPageContext]);
}
