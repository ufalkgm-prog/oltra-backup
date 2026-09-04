"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { UIMessage } from "ai";
import { mergeHotelFlightSearch } from "@/lib/searchSession";
import {
  EMPTY_QUERY_STATE,
  EMPTY_RESULT_SET,
  type AiQueryState,
  type AiResultSet,
} from "./types";

/* The single source of truth for Ask mode.
 *
 * Search mode and Ask mode are two views onto this one object, so toggling
 * between them never recomputes anything — results change only on a real new
 * entry (a hand-edited field plus search, or a new chat turn).
 *
 * It lives above the page in the layout tree and is backed by sessionStorage,
 * so it survives client-side navigation to /hotels and back, and a reload
 * within the same tab. Closing the tab clears it, which is the intended
 * lifetime.
 *
 * Note what is NOT stored here: prices, availability, or anything the model
 * said about them. The result set is identity and ordering only; every figure
 * is fetched live by the cards. */

const STORAGE_KEY = "oltra_ai_concierge_v1";

type Persisted = {
  query: AiQueryState;
  results: AiResultSet;
  framing: string;
  messages: UIMessage[];
};

const EMPTY: Persisted = {
  query: EMPTY_QUERY_STATE,
  results: EMPTY_RESULT_SET,
  framing: "",
  messages: [],
};

type AiSearchContextValue = Persisted & {
  ready: boolean;
  /** Ask mode replaces the structured search AND its results, so the summary
   * below needs to know. Not persisted: a reload should land on Search. */
  askMode: boolean;
  setAskMode: (on: boolean) => void;
  setQuery: (patch: Partial<AiQueryState>) => void;
  setPresentation: (framing: string, results: AiResultSet, query: Partial<AiQueryState>) => void;
  setMessages: (messages: UIMessage[]) => void;
  clear: () => void;
};

const AiSearchContext = createContext<AiSearchContextValue | null>(null);

function read(): Persisted {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Persisted>;
    return {
      query: { ...EMPTY_QUERY_STATE, ...(parsed.query ?? {}) },
      results: { ...EMPTY_RESULT_SET, ...(parsed.results ?? {}) },
      framing: parsed.framing ?? "",
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
    };
  } catch {
    return EMPTY;
  }
}

export function AiSearchProvider({ children }: { children: React.ReactNode }) {
  // Starts empty on both server and first client render, then hydrates from
  // sessionStorage in an effect. Reading storage during render would produce a
  // server/client mismatch — the same trap the residency auto-detect hit.
  const [state, setState] = useState<Persisted>(EMPTY);
  const [ready, setReady] = useState(false);
  const [askMode, setAskMode] = useState(false);
  const hydrated = useRef(false);
  const mirrorPending = useRef(false);

  useEffect(() => {
    setState(read());
    setReady(true);
    hydrated.current = true;
  }, []);

  useEffect(() => {
    if (!hydrated.current) return;
    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Private browsing, or storage full. The feature degrades to
      // this-page-only rather than breaking.
    }
  }, [state]);

  const setQuery = useCallback((patch: Partial<AiQueryState>) => {
    setState((prev) => ({
      ...prev,
      query: {
        ...prev.query,
        ...patch,
        destination: { ...prev.query.destination, ...(patch.destination ?? {}) },
      },
    }));
  }, []);

  const setPresentation = useCallback(
    (framing: string, results: AiResultSet, query: Partial<AiQueryState>) => {
      // Flagged here, mirrored in the effect below. The mirror cannot live
      // inside the updater: React runs updaters during the render phase, and
      // saveHotelFlightSearch dispatches a synchronous window event that
      // SiteHeader listens to — so mirroring there called SiteHeader's
      // setState mid-render ("Cannot update a component while rendering a
      // different component"). Updaters have to stay pure; React may also run
      // them twice.
      mirrorPending.current = true;
      setState((prev) => ({
        ...prev,
        framing,
        results,
        query: {
          ...prev.query,
          ...query,
          destination: { ...prev.query.destination, ...(query.destination ?? {}) },
        },
      }));
    },
    []
  );

  // Mirror the geography and stay details into the cross-page session so the
  // Flights page keeps working exactly as it does today — it already falls
  // back to this store when the URL carries no params.
  useEffect(() => {
    if (!mirrorPending.current) return;
    mirrorPending.current = false;

    const { destination, from, to, adults, kids, bedrooms, origin } = state.query;
    mergeHotelFlightSearch({
      city: destination.city,
      state: destination.area,
      admin_region: destination.adminRegion,
      country: destination.country,
      from,
      to,
      adults: String(adults),
      kids: String(kids),
      bedrooms: String(bedrooms),
      origin,
    });
  }, [state.query]);

  const setMessages = useCallback((messages: UIMessage[]) => {
    setState((prev) => ({ ...prev, messages }));
  }, []);

  const clear = useCallback(() => {
    setState(EMPTY);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo<AiSearchContextValue>(
    () => ({ ...state, ready, askMode, setAskMode, setQuery, setPresentation, setMessages, clear }),
    [state, ready, askMode, setQuery, setPresentation, setMessages, clear]
  );

  return <AiSearchContext.Provider value={value}>{children}</AiSearchContext.Provider>;
}

export function useAiSearch(): AiSearchContextValue {
  const ctx = useContext(AiSearchContext);
  if (!ctx) throw new Error("useAiSearch must be used inside AiSearchProvider");
  return ctx;
}

/** Query-state -> Search-mode URL params, for the back-fill when AI is toggled
 * off and for the "Go to hotels" handoff. */
export function queryStateToParams(query: AiQueryState): URLSearchParams {
  const params = new URLSearchParams();
  const set = (key: string, value: string) => {
    if (value.trim()) params.set(key, value.trim());
  };

  set("city", query.destination.city);
  set("state", query.destination.area);
  set("admin_region", query.destination.adminRegion);
  set("country", query.destination.country);
  set("from", query.from);
  set("to", query.to);
  set("origin", query.origin);
  if (query.adults > 0) params.set("adults", String(query.adults));
  if (query.kids > 0) params.set("kids", String(query.kids));
  query.childrenAges.forEach((age, index) => {
    if (index < 6) params.set(`kid_age_${index + 1}`, String(age));
  });
  if (query.bedrooms > 0) params.set("bedrooms", String(query.bedrooms));

  return params;
}
