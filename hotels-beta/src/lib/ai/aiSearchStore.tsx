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
import { isConciergeStay, rememberConciergeParty } from "./conciergeStays";
import {
  clearHotelFlightDatesIf,
  clearHotelFlightPartyIf,
  clearHotelFlightDestination,
  clearHotelFlightDestinationIf,
  kidAgeFields,
  mergeHotelFlightSearch,
  readHotelFlightSearch,
} from "@/lib/searchSession";
import { expandCityAliases, hotelCityFor } from "@/lib/locationAliases";
import {
  EMPTY_QUERY_STATE,
  EMPTY_RESULT_SET,
  type AiPageContext,
  type AiQueryState,
  type AiResultSet,
} from "./types";

/* The single source of truth for the concierge.
 *
 * The classic controls and the conversation are two ways of writing the same
 * object, so opening or closing the concierge never recomputes anything —
 * results change only on a real new entry (a hand-edited field plus search, or
 * a new chat turn).
 *
 * It is mounted in the ROOT LAYOUT and backed by sessionStorage, so one
 * conversation spans the whole site: open the concierge on /restaurants and it
 * resumes the exchange started on the landing page rather than beginning a
 * fresh thread. Before this it lived inside the landing page and was destroyed
 * by the first navigation. Closing the tab clears it, which is the intended
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
  /* The one short question that follows the answer. It arrives inside
   * presentResults rather than as a message of its own: that message cost a
   * whole extra model round trip. */
  followUp: string;
  messages: UIMessage[];
  /* When the concierge last presented results, and when the visitor last ran a
   * a classic search. The landing page shows whichever happened more recently.
   *
   * Needed because the two live in different places: the classic search is in
   * the URL, the concierge's answer is in here, and neither can see the other
   * change. Without this, running a classic search after an AI answer left the
   * AI frames on screen and the new search apparently ignored.
   *
   * Recency rather than clearing one when the other runs: nothing is thrown
   * away, so both views stay reachable — the concierge's answer is still there
   * when the modal is reopened, and the classic results come back with the
   * next search. */
  presentedAt: number;
  searchedAt: number;
  /* When a stay's dates were last changed by hand (setStopDates). Newer than
   * presentedAt means the answer's own words describe dates that have since
   * moved, and the panel says so (2026-09-28). */
  datesChangedAt: number;
};

const EMPTY: Persisted = {
  query: EMPTY_QUERY_STATE,
  results: EMPTY_RESULT_SET,
  framing: "",
  followUp: "",
  messages: [],
  presentedAt: 0,
  searchedAt: 0,
  datesChangedAt: 0,
};

/* The results half of the store. Deliberately does NOT carry `messages`:
 * the conversation writes that on every streamed token, and anything reading
 * this context would re-render at the same rate. The frames on the landing
 * page are the ones that would have paid for it. See useAiConversation. */
type AiSearchContextValue = Omit<Persisted, "messages"> & {
  ready: boolean;
  /** Whether the concierge modal is on screen. Not persisted: a reload should
   * land on the page itself, with the transcript still there behind the
   * button. */
  conciergeOpen: boolean;
  setConciergeOpen: (open: boolean) => void;
  /** Where the visitor is standing. Written by each page, read by the
   * conversation when it builds a request. Deliberately outside `Persisted` —
   * it describes now, not the conversation. */
  pageContext: AiPageContext | null;
  setPageContext: (context: AiPageContext | null) => void;
  setQuery: (patch: Partial<AiQueryState>) => void;
  /** `results` is a patch, not a replacement — see setPresentation below. */
  setPresentation: (
    framing: string,
    followUp: string,
    results: Partial<AiResultSet>,
    query: Partial<AiQueryState>
  ) => void;
  /** Called when the visitor runs a classic search, so the landing page knows
   * that is the more recent of the two. */
  markClassicSearch: () => void;
  /** New dates for one stay of the answer — 0 is the first place (the query's
   * stay), 1.. the later stops — keeping its hotels. See setStopDates. */
  setStopDates: (stop: number, from: string, to: string) => void;
  clear: () => void;
  /** Whether there is a transcript at all. A boolean rather than the message
   * list itself, deliberately: the modal header needs to know whether to offer
   * Clear, and reading the transcript for that would re-render the header — and
   * the conversation inside it — on every streamed token. This changes at most
   * twice a conversation. */
  hasConversation: boolean;
  /** Bumped by the header's Clear. The conversation owns the actual reset —
   * the transcript it has to throw away lives inside useChat, not in here — so
   * this is the signal that reaches it. */
  clearSignal: number;
  requestClear: () => void;
};

const AiSearchContext = createContext<AiSearchContextValue | null>(null);

/** The transcript, on its own. Only the conversation panel reads it. */
type AiConversationValue = {
  messages: UIMessage[];
  setMessages: (messages: UIMessage[]) => void;
};

const AiConversationContext = createContext<AiConversationValue | null>(null);

/* A second context holding ONLY the setters a page needs, and nothing that
 * changes.
 *
 * This exists for a measured reason rather than tidiness. The provider now
 * wraps the whole app, and the conversation writes the message list to the
 * store on every streamed token. Any page component that read the full context
 * — to publish its page context, or to mark a classic search — would therefore
 * re-render several times a second while the concierge was streaming, and
 * HotelsView is 3,600 lines of component.
 *
 * Every value in here is stable for the provider's lifetime (two useState
 * setters and a useCallback with no deps), so the object never changes
 * identity and a consumer of it never re-renders because of it. */
type AiActions = {
  setConciergeOpen: (open: boolean) => void;
  setPageContext: (context: AiPageContext | null) => void;
  markClassicSearch: () => void;
};

const AiActionsContext = createContext<AiActions | null>(null);

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
      followUp: parsed.followUp ?? "",
      messages: Array.isArray(parsed.messages) ? parsed.messages : [],
      presentedAt: typeof parsed.presentedAt === "number" ? parsed.presentedAt : 0,
      searchedAt: typeof parsed.searchedAt === "number" ? parsed.searchedAt : 0,
      datesChangedAt: typeof parsed.datesChangedAt === "number" ? parsed.datesChangedAt : 0,
    };
  } catch {
    return EMPTY;
  }
}

/** The query fields that describe the stay rather than the place. */
const STAY_FIELDS = ["from", "to", "datesLabel", "adults", "kids", "childrenAges", "bedrooms"] as const;

export function AiSearchProvider({ children }: { children: React.ReactNode }) {
  // Starts empty on both server and first client render, then hydrates from
  // sessionStorage in an effect. Reading storage during render would produce a
  // server/client mismatch — the same trap the residency auto-detect hit.
  const [state, setState] = useState<Persisted>(EMPTY);
  const [ready, setReady] = useState(false);
  const [conciergeOpen, setConciergeOpen] = useState(false);
  const [pageContext, setPageContext] = useState<AiPageContext | null>(null);
  const hydrated = useRef(false);
  const stateRef = useRef(state);
  stateRef.current = state;
  /* "place" mirrors the destination only: see STAY_FIELDS. */
  const mirrorPending = useRef<false | "all" | "place">(false);
  /* The hotel an answer's walking times were measured from, mirrored as the
     session's current hotel so the Restaurants page and the header link mark
     that one — not the hotel last selected on Hotels (2026-09-24). */
  const mirrorHotelId = useRef("");
  /* A place-only mirror that also replaces the dates — a move to a new place
     without a stay of its own (see setPresentation). */
  const mirrorDates = useRef(false);

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
    (
      framing: string,
      followUp: string,
      results: Partial<AiResultSet>,
      query: Partial<AiQueryState>
    ) => {
      // Flagged here, mirrored in the effect below. The mirror cannot live
      // inside the updater: React runs updaters during the render phase, and
      // saveHotelFlightSearch dispatches a synchronous window event that
      // SiteHeader listens to — so mirroring there called SiteHeader's
      // setState mid-render ("Cannot update a component while rendering a
      // different component"). Updaters have to stay pure; React may also run
      // them twice.
      /* A DINNER PARTY IS NOT THE TRAVEL PARTY (2026-09-15). "Six of us for
         dinner" came back as stay {adults: 6}, and the mirror wrote six adults
         in one bedroom into the Hotels and Flights search. An answer with no
         hotels, flights or later stops keeps the travel party and dates it
         had, and mirrors only where. */
      const aboutStay = Boolean(
        results.hotelIds?.length || results.flights?.length || results.laterStops?.length
      );
      /* Except the dates of a MOVE: a reply that names a new place and shows
         nothing sends that place's own dates, or none (2026-09-28) — the stay
         in the store belongs to the place before, and was going with Paris
         onto every page as Rome's 6-9 December. The party is still kept. */
      const movesPlace = Boolean(
        !aboutStay &&
          query.destination?.city &&
          query.destination.city !== stateRef.current.query.destination.city &&
          ("from" in query || "to" in query)
      );
      if (!aboutStay) {
        query = Object.fromEntries(
          Object.entries(query).filter(
            ([key]) =>
              !(STAY_FIELDS as readonly string[]).includes(key) ||
              (movesPlace && (key === "from" || key === "to"))
          )
        ) as Partial<AiQueryState>;
      }
      mirrorPending.current = aboutStay ? "all" : "place";
      mirrorDates.current = movesPlace;
      mirrorHotelId.current = results.nearHotelId ? String(results.nearHotelId) : "";
      setState((prev) => {
        /* A NEW CITY TAKES THE OLD ONE'S RESULTS WITH IT (2026-09-23). Facets
           an answer does not speak to are kept, which is right for a follow-up
           about the same place and wrong after a move: Rome's hotels stayed
           the curated set on the Hotels page under a conversation now about
           dinner in Paris. */
        const prevCity = prev.query.destination.city.trim();
        const nextCity = (query.destination?.city ?? "").trim();
        /* Settling on one city after an answer spread over several (no
           destination at all) is a move too: Taormina chosen from a Sicily,
           Sardinia and Amalfi shortlist kept the Olbia and Naples flights. */
        const prevWasSpread =
          prev.presentedAt > 0 && !Object.values(prev.query.destination).some((v) => v.trim());
        const moved =
          Boolean(nextCity) &&
          (prevWasSpread ||
            (Boolean(prevCity) &&
              !expandCityAliases([prevCity])
                .map((c) => c.toLowerCase())
                .includes(nextCity.toLowerCase())));
        const base = moved
          ? { ...prev.results, hotelIds: [], restaurantIds: [], flights: [], flightsForHotels: false, laterStops: [] }
          : prev.results;
        return {
          ...prev,
          framing,
          followUp,
          presentedAt: Date.now(),
          // Merged, not replaced. A turn that answers only the flights half of a
          // trip says nothing about hotels, and replacing wholesale wiped the
          // hotel cards off the page the moment the visitor answered a follow-up
          // question. A facet the model did not speak to keeps its previous
          // value; an explicitly empty one (`hotelIds: []`) still clears it.
          results: {
            hotelIds: results.hotelIds ?? base.hotelIds,
            restaurantIds: results.restaurantIds ?? base.restaurantIds,
            // Goes with the restaurants it was measured for.
            nearHotelId: results.restaurantIds ? results.nearHotelId : base.nearHotelId,
            rationales: results.rationales
              ? { ...base.rationales, ...results.rationales }
              : base.rationales,
            // Replaced, not merged, unlike the rationales it is derived from:
            // this is "who did the model name in this answer", and accumulating
            // it across turns would keep reading out last turn's shortlist.
            highlightIds: results.highlightIds ?? base.highlightIds,
            flights: results.flights ?? base.flights,
            flightsForHotels: results.flights
              ? results.flightsForHotels
              : base.flightsForHotels,
            laterStops: results.laterStops ?? base.laterStops,
            fullByStay: results.fullByStay ?? base.fullByStay,
          },
          query: {
            ...prev.query,
            ...query,
            destination: { ...prev.query.destination, ...(query.destination ?? {}) },
          },
        };
      });
    },
    []
  );

  // Mirror the geography and stay details into the cross-page session so the
  // Flights page keeps working exactly as it does today — it already falls
  // back to this store when the URL carries no params.
  useEffect(() => {
    if (!mirrorPending.current) return;
    const placeOnly = mirrorPending.current === "place";
    mirrorPending.current = false;

    const { destination, from, to, adults, kids, childrenAges, bedrooms, origin } = state.query;
    /* The answer's destination REPLACES the session's, it is not merged into
       it. The merge drops empty values, so an answer naming only a city left
       the previous answer's area in place: after a Caribbean answer and then a
       Tokyo one, the session read city Tokyo with area Caribbean, and the
       Hotels page restored exactly that as tags. Cleared on every presentation:
       the store's own destination already carries forward whatever an answer
       did not change, so the session simply copies it. */
    clearHotelFlightDestination();
    const hotelId = mirrorHotelId.current;
    mirrorHotelId.current = "";
    if (placeOnly) {
      if (mirrorDates.current) {
        mirrorDates.current = false;
        const shared = readHotelFlightSearch();
        if (shared?.from || shared?.to) clearHotelFlightDatesIf(shared.from ?? "", shared.to ?? "");
        if (from || to) mergeHotelFlightSearch({ from, to });
      }
      mergeHotelFlightSearch({
        city: hotelCityFor(destination.city),
        state: destination.area,
        admin_region: destination.adminRegion,
        country: destination.country,
        ...(hotelId ? { hotelId } : {}),
      });
      return;
    }
    mergeHotelFlightSearch({
      city: hotelCityFor(destination.city),
      state: destination.area,
      admin_region: destination.adminRegion,
      country: destination.country,
      from,
      to,
      adults: String(adults),
      kids: String(kids),
      // The ages, which the session never received: Hotels and Flights on a
      // bare visit priced "1 child" of no age (2026-09-15).
      ...kidAgeFields(childrenAges),
      bedrooms: String(bedrooms),
      origin,
      ...(hotelId ? { hotelId } : {}),
    });
    // So Clear can tell this party from one picked by hand (conciergeStays).
    rememberConciergeParty(adults, kids, childrenAges, bedrooms);
  }, [state.query]);

  const setMessages = useCallback((messages: UIMessage[]) => {
    setState((prev) => ({ ...prev, messages }));
  }, []);

  const markClassicSearch = useCallback(() => {
    setState((prev) => ({ ...prev, searchedAt: Date.now() }));
  }, []);

  /* NEW DATES FOR ONE STAY, THE HOTELS KEPT (Ulrik, 2026-09-28). Changing the
     dates of an answer does not end it: the same curated hotels are priced on
     the new stay, on every page. The first stay is the query's own dates and
     is mirrored into the shared search (so Flights and a bare Hotels visit
     follow); a later stop changes only its own entry in laterStops.

     Flight legs that were on the old dates move with them — a departure on
     the stay's old first night or last day, a return on its last day — so the
     Flights page is handed journeys that still meet the hotels. Other stays
     are left alone, even where that now leaves a gap: only the stay the
     visitor edited changes. */
  const setStopDates = useCallback((stop: number, from: string, to: string) => {
    // Read from the latest committed state, not from inside the updater: React
    // may run an updater later, so a flag set there cannot be trusted here.
    const current = stateRef.current;
    if (stop === 0 && (current.query.from !== from || current.query.to !== to)) {
      mirrorPending.current = "all";
    }
    setState((prev) => {
      const laterStops = prev.results.laterStops ?? [];
      const oldFrom = stop === 0 ? prev.query.from : laterStops[stop - 1]?.checkIn;
      const oldTo = stop === 0 ? prev.query.to : laterStops[stop - 1]?.checkOut;
      if (oldFrom === undefined || oldTo === undefined) return prev;
      if (oldFrom === from && oldTo === to) return prev;
      const flights = prev.results.flights.map((leg) => ({
        ...leg,
        departureDate:
          oldFrom && leg.departureDate === oldFrom
            ? from
            : oldTo && leg.departureDate === oldTo
              ? to
              : leg.departureDate,
        returnDate: oldTo && leg.returnDate === oldTo ? to : leg.returnDate,
      }));
      if (stop === 0) {
        return {
          ...prev,
          datesChangedAt: Date.now(),
          query: { ...prev.query, from, to },
          results: { ...prev.results, flights },
        };
      }
      return {
        ...prev,
        datesChangedAt: Date.now(),
        results: {
          ...prev.results,
          flights,
          laterStops: laterStops.map((entry, index) =>
            index === stop - 1 ? { ...entry, checkIn: from, checkOut: to } : entry
          ),
        },
      };
    });
  }, []);

  /* Outside `Persisted` on purpose: `clear()` resets that wholesale, and a
     counter that reset with it would fire the reset it had just caused. */
  const [clearSignal, setClearSignal] = useState(0);
  const requestClear = useCallback(() => setClearSignal((n) => n + 1), []);

  /* The dates this conversation put into the shared search, so Clear can take
     them back: after a cleared Maldives answer, the next question about dinner
     in Paris still had 20-30 November in the Hotels and Flights forms. */
  const latestQuery = useRef(state.query);
  useEffect(() => {
    latestQuery.current = state.query;
  }, [state.query]);

  const clear = useCallback(() => {
    const { from, to, destination, adults, kids, bedrooms } = latestQuery.current;
    /* Only dates the concierge itself presented — the test Landing and
       Hotels use (isConciergeStay). Dates changed by hand after the answer
       are the visitor's: Clear used to take them out of the shared search
       while the landing form kept them, so the two pages disagreed
       (2026-09-28). */
    if ((from || to) && isConciergeStay(from, to)) clearHotelFlightDatesIf(from, to);
    // And the party it set, the same way (2026-09-24).
    clearHotelFlightPartyIf(adults, kids, bedrooms);
    // And the city the conversation made the site's destination (the mirror
    // wrote exactly these four fields), unless something else has replaced it.
    clearHotelFlightDestinationIf({ ...destination, city: hotelCityFor(destination.city) });
    setState(EMPTY);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  // A boolean, so appending a token leaves it identical and the memo below
  // keeps its identity.
  const hasConversation = state.messages.length > 0;

  /* Memoised on the individual fields, NOT on `state`.
   *
   * That distinction is the whole point of the split: appending a streamed
   * token replaces `state` but leaves `state.query`, `state.results` and the
   * rest identical, so this value keeps its identity and nothing reading it
   * re-renders. Depending on `state` here would undo the split silently. */
  const value = useMemo<AiSearchContextValue>(
    () => ({
      query: state.query,
      results: state.results,
      framing: state.framing,
      followUp: state.followUp,
      presentedAt: state.presentedAt,
      searchedAt: state.searchedAt,
      datesChangedAt: state.datesChangedAt,
      ready,
      conciergeOpen,
      setConciergeOpen,
      pageContext,
      setPageContext,
      setQuery,
      setPresentation,
      markClassicSearch,
      setStopDates,
      clear,
      hasConversation,
      clearSignal,
      requestClear,
    }),
    [
      state.query,
      state.results,
      state.framing,
      state.followUp,
      state.presentedAt,
      state.searchedAt,
      state.datesChangedAt,
      ready,
      conciergeOpen,
      pageContext,
      setQuery,
      setPresentation,
      markClassicSearch,
      setStopDates,
      clear,
      hasConversation,
      clearSignal,
      requestClear,
    ]
  );

  const conversation = useMemo<AiConversationValue>(
    () => ({ messages: state.messages, setMessages }),
    [state.messages, setMessages]
  );

  const actions = useMemo<AiActions>(
    () => ({ setConciergeOpen, setPageContext, markClassicSearch }),
    [markClassicSearch]
  );

  return (
    <AiActionsContext.Provider value={actions}>
      <AiSearchContext.Provider value={value}>
        <AiConversationContext.Provider value={conversation}>
          {children}
        </AiConversationContext.Provider>
      </AiSearchContext.Provider>
    </AiActionsContext.Provider>
  );
}

export function useAiSearch(): AiSearchContextValue {
  const ctx = useContext(AiSearchContext);
  if (!ctx) throw new Error("useAiSearch must be used inside AiSearchProvider");
  return ctx;
}

/** The transcript. Only the conversation panel should read this — it changes
 * on every streamed token. */
export function useAiConversation(): AiConversationValue {
  const ctx = useContext(AiConversationContext);
  if (!ctx) throw new Error("useAiConversation must be used inside AiSearchProvider");
  return ctx;
}

/** Whether the concierge's answer is what the page should be showing: it has
 * results, and nothing superseded it — neither a classic search nor the
 * visitor removing the "AI curated results" token (both stamp `searchedAt`).
 * One definition for the landing frames, the destination field's curated token
 * and the Hotels page's arrival sync, so the three cannot disagree. */
export function aiResultsAreCurrent(
  results: AiResultSet,
  presentedAt: number,
  searchedAt: number
): boolean {
  const hasResults =
    results.hotelIds.length > 0 || results.flights.length > 0 || results.restaurantIds.length > 0;
  return hasResults && presentedAt >= searchedAt;
}

/** The setters only. Use this from a page component — reading the full store
 * there would re-render the whole page on every streamed token. */
export function useAiActions(): AiActions {
  const ctx = useContext(AiActionsContext);
  if (!ctx) throw new Error("useAiActions must be used inside AiSearchProvider");
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
  // Comma-joined, which is what parseList in hotelFilters expects — so the
  // Hotels page's own Settings and Activities facets come across pre-selected
  // rather than the handoff arriving as a bare geography search.
  if (query.settings.length) params.set("settings", query.settings.join(","));
  if (query.activities.length) params.set("activities", query.activities.join(","));
  if (query.adults > 0) params.set("adults", String(query.adults));
  if (query.kids > 0) params.set("kids", String(query.kids));
  query.childrenAges.forEach((age, index) => {
    if (index < 6) params.set(`kid_age_${index + 1}`, String(age));
  });
  if (query.bedrooms > 0) params.set("bedrooms", String(query.bedrooms));

  return params;
}
