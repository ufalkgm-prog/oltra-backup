"use client";

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { createTripBrowser, fetchTripChoicesBrowser } from "@/lib/members/db";
import { getMemberActionLoginMessage } from "@/lib/members/memberActionUi";
import {
  MAX_TRIP_NAME_CHARS,
  MAX_TRIPS_PER_MEMBER,
  TRIP_LIMIT_MESSAGE,
  getCreateTripBlockedReason,
  isTripLimitError,
} from "@/lib/members/tripLimits";
import { useDropdownDismiss } from "@/lib/useDropdownDismiss";

/* The one "Save to trip" control, used by Hotels, Restaurants, Flights and the
 * landing summary. Before this existed, Hotels and Restaurants each carried
 * their own copy of the picker markup while Flights and the landing cards
 * silently wrote to whatever getOrCreateDefaultTripIdBrowser handed back - so
 * a member could save something and have no idea which trip it landed in.
 *
 * Callers supply only the save itself. Everything around it - loading the
 * member's trips, the picker panel, creating a new trip, the 8-trip cap, the
 * logged-out message, click-outside dismissal - lives here so all four behave
 * identically. */

export type SaveToTripResult = { message: string } | void;

type Props = {
  /** Performs the save against the chosen trip. Return a message to show. */
  onSave: (tripId: string) => Promise<SaveToTripResult>;
  /** Seeds a newly created trip; both optional. */
  newTripDefaults?: { destination?: string | null; periodLabel?: string | null };
  /** Rendered on the trigger. Kept as a prop only for casing/width per surface. */
  label?: string;
  className?: string;
  /** Small surfaces (landing cards, flight rows) need a compact trigger. */
  compact?: boolean;
  /** Anchor the panel to the trigger's right edge when it sits in a narrow column. */
  align?: "left" | "right";
  /** Open the panel upward - for controls near the bottom of a scroll pane. */
  dropUp?: boolean;
  disabled?: boolean;
  /** Confirm the save on the trigger itself ("SAVED", for a few
   * seconds) instead of printing a line of text under it. For surfaces where a
   * text confirmation would reflow the layout - the flights price cards sit in
   * a fixed-height grid. Errors still print, since they need to be read. */
  confirmInTrigger?: boolean;
  /** What this save is: the item plus the dates and guests it carries. Once
   * saved, the trigger goes passive until the key changes, and the confirmation
   * becomes its hover reason instead of a line of text. */
  savedKey?: string;
  /** Added to that reason, saying what would make a new save. */
  savedHint?: string;
};

const SAVED_FLASH_MS = 2500;

/* SAVED IS PASSIVE UNTIL SOMETHING CHANGES (Ulrik, 2026-09-24).
 *
 * A save that has been made, with the same dates and guests, has nothing
 * left to do, so its button reads passive (§35A) rather than inviting a second
 * identical save. The confirmation line under it went too: the passive state
 * is the confirmation, and its hover popup carries the words.
 *
 * Kept per page session, outside any one control, so every control showing
 * the same save agrees (a hotel on the landing summary and in the concierge
 * frame) and so a card that remounts still knows. A reload forgets it, and a
 * repeat save then answers "Already in that trip." and goes passive again. */
const savedSaves = new Map<string, string>();
const savedListeners = new Set<() => void>();
let savedVersion = 0;

function markSaved(key: string, reason: string) {
  savedSaves.set(key, reason);
  savedVersion += 1;
  savedListeners.forEach((listener) => listener());
}

function subscribeSaved(listener: () => void) {
  savedListeners.add(listener);
  return () => {
    savedListeners.delete(listener);
  };
}

const savedSnapshot = () => savedVersion;

/** A hotel save is its stay: the hotel, the dates and the party. One
 * definition, so the landing cards, the concierge frame and the Hotels page
 * recognise the same save. */
export function hotelSaveKey(stay: {
  hotelId: string | number;
  from?: string | null;
  to?: string | null;
  adults?: number | null;
  kids?: number | null;
  childrenAges?: readonly number[];
  rooms?: number | null;
}): string {
  return [
    "hotel",
    stay.hotelId,
    stay.from ?? "",
    stay.to ?? "",
    stay.adults ?? "",
    stay.kids ?? "",
    (stay.childrenAges ?? []).join(","),
    stay.rooms ?? "",
  ].join("|");
}

export const HOTEL_SAVED_HINT = "Change the dates or guests to save it again.";

/* Room kept between the panel and the window edge, and between it and the
   trigger. The panel's height never exceeds this cap, as .oltra-popup-panel--
   bounded had it. */
const PANEL_EDGE_PX = 8;
const PANEL_GAP_PX = 8;
const PANEL_MAX_HEIGHT_PX = 360;
const PANEL_MIN_HEIGHT_PX = 140;
const COMPACT_PANEL_WIDTH_PX = 260;

type PanelPlacement = { top: number; left: number; width: number; maxHeight: number };

export default function SaveToTripControl({
  onSave,
  newTripDefaults,
  label = "SAVE TO TRIP",
  className,
  compact = false,
  align = "left",
  dropUp = false,
  disabled = false,
  confirmInTrigger = false,
  savedKey,
  savedHint,
}: Props) {
  useSyncExternalStore(subscribeSaved, savedSnapshot, savedSnapshot);
  const savedReason = savedKey ? savedSaves.get(savedKey) : undefined;
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [trips, setTrips] = useState<Array<{ id: string; name: string; label: string }>>([]);
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [placement, setPlacement] = useState<PanelPlacement | null>(null);

  // The panel is portalled, so it is not inside containerRef: both count as
  // "inside" for click-outside and hover-close.
  const dismissProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: [containerRef, panelRef],
  });

  /* ABOVE EVERYTHING, AND INSIDE THE WINDOW (Ulrik, 2026-09-16).
   *
   * The panel used to be absolutely positioned inside the control, so every
   * ancestor that clips cut it off: the landing hotel and restaurant lists are
   * scroll panes, and a flight row sits in a card — most pickers showed only
   * their top half. No z-index can escape an overflow clip, so the panel now
   * renders into <body> with fixed coordinates taken from the trigger. It
   * opens below, or above when below is short (above first for `dropUp`), and
   * is capped to the room on that side and slid inside the window's width, so
   * it never runs past an edge. Re-placed on scroll and resize while open. */
  const placePanel = useCallback(() => {
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return;

    const rect = trigger.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;

    const width = compact
      ? Math.min(COMPACT_PANEL_WIDTH_PX, viewportWidth - PANEL_EDGE_PX * 2)
      : containerRef.current?.getBoundingClientRect().width ?? rect.width;
    const preferredLeft = align === "right" ? rect.right - width : rect.left;
    const left = Math.max(
      PANEL_EDGE_PX,
      Math.min(preferredLeft, viewportWidth - width - PANEL_EDGE_PX)
    );

    const natural = Math.min(panel.scrollHeight, PANEL_MAX_HEIGHT_PX);
    const roomBelow = viewportHeight - rect.bottom - PANEL_GAP_PX - PANEL_EDGE_PX;
    const roomAbove = rect.top - PANEL_GAP_PX - PANEL_EDGE_PX;
    const fitsBelow = natural <= roomBelow;
    const fitsAbove = natural <= roomAbove;
    const openUp = dropUp
      ? fitsAbove || (!fitsBelow && roomAbove > roomBelow)
      : !fitsBelow && (fitsAbove || roomAbove > roomBelow);

    const maxHeight = Math.max(
      PANEL_MIN_HEIGHT_PX,
      Math.min(PANEL_MAX_HEIGHT_PX, openUp ? roomAbove : roomBelow)
    );
    const height = Math.min(natural, maxHeight);
    const top = openUp
      ? Math.max(PANEL_EDGE_PX, rect.top - PANEL_GAP_PX - height)
      : Math.min(rect.bottom + PANEL_GAP_PX, viewportHeight - PANEL_EDGE_PX - height);

    setPlacement({ top, left, width, maxHeight });
  }, [align, compact, dropUp]);

  useLayoutEffect(() => {
    if (!open) {
      setPlacement(null);
      return;
    }
    placePanel();
    window.addEventListener("resize", placePanel);
    // Capture, so a scroll inside any pane (the landing lists) moves it too.
    window.addEventListener("scroll", placePanel, true);
    return () => {
      window.removeEventListener("resize", placePanel);
      window.removeEventListener("scroll", placePanel, true);
    };
  }, [open, placePanel, trips.length, busy]);

  const limitReached = trips.length >= MAX_TRIPS_PER_MEMBER;

  const createBlockedReason = getCreateTripBlockedReason({
    name: newTripName,
    existingNames: trips.map((trip) => trip.name),
    tripCount: trips.length,
  });

  // Trips are loaded when the panel first opens rather than on mount: this
  // control renders once per card on the landing page, and fetching a trip list
  // per card on page load would be dozens of identical requests.
  const loadTrips = useCallback(async () => {
    try {
      const next = await fetchTripChoicesBrowser();
      setTrips(next);
      setTripsLoaded(true);
      return true;
    } catch {
      setError(getMemberActionLoginMessage("trip"));
      return false;
    }
  }, []);

  useEffect(() => {
    if (!message && !error) return;
    const timer = window.setTimeout(() => {
      setMessage("");
      setError("");
    }, 4000);
    return () => window.clearTimeout(timer);
  }, [message, error]);

  useEffect(() => {
    if (!justSaved) return;
    const timer = window.setTimeout(() => setJustSaved(false), SAVED_FLASH_MS);
    return () => window.clearTimeout(timer);
  }, [justSaved]);

  /** One place to land a successful save, so the two save paths can't drift. */
  function reportSaved(text: string) {
    if (savedKey) markSaved(savedKey, savedHint ? `${text} ${savedHint}` : text);
    else if (confirmInTrigger) setJustSaved(true);
    else setMessage(text);
  }

  async function handleToggle() {
    setMessage("");
    setError("");
    if (open) {
      setOpen(false);
      return;
    }
    if (!tripsLoaded) {
      const ok = await loadTrips();
      if (!ok) return;
    }
    setOpen(true);
  }

  async function saveTo(tripId: string) {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const result = await onSave(tripId);
      setOpen(false);
      reportSaved(result?.message ?? "Saved to trip.");
    } catch (err) {
      const text = err instanceof Error ? err.message.toLowerCase() : "";
      if (
        text.includes("auth") ||
        text.includes("login") ||
        text.includes("not authenticated") ||
        text.includes("unauthorized")
      ) {
        setError(getMemberActionLoginMessage("trip"));
      } else {
        setError("Could not save to trip.");
      }
    } finally {
      setBusy(false);
    }
  }

  async function handleCreateAndSave() {
    const name = newTripName.trim();
    if (!name) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const created = await createTripBrowser({
        name,
        destination: newTripDefaults?.destination ?? null,
        periodLabel: newTripDefaults?.periodLabel ?? null,
      });
      setTrips((prev) => [...prev, created]);
      setNewTripName("");
      const result = await onSave(created.id);
      setOpen(false);
      reportSaved(result?.message ?? "Saved to new trip.");
    } catch (err) {
      if (isTripLimitError(err)) {
        setError(TRIP_LIMIT_MESSAGE);
      } else {
        const text = err instanceof Error ? err.message.toLowerCase() : "";
        setError(
          text.includes("auth") || text.includes("not authenticated")
            ? getMemberActionLoginMessage("trip")
            : "Could not create trip."
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      ref={containerRef}
      /* flex-col, not a plain block: the trigger below is an inline-level
         button, so in a block box it sits on a text baseline and the box
         reserves descender space under it — measured as a 25px SAVE beside a
         22px BOOK, which left the pair looking unevenly spaced wherever they
         stack (Ulrik, 2026-09-21). As a flex item there is no baseline and no
         extra room. Every caller passes oltra-btn--block, so the default
         stretch gives the same full width it had. */
      className={`relative flex flex-col ${compact ? "" : "w-full"}`}
      data-oltra-control="true"
      {...dismissProps}
    >
      {open && typeof document !== "undefined" ? createPortal(
        <div
          ref={panelRef}
          className="oltra-popup-panel overflow-y-auto"
          style={{
            position: "fixed",
            top: placement?.top ?? 0,
            left: placement?.left ?? 0,
            width: placement?.width ?? (compact ? COMPACT_PANEL_WIDTH_PX : undefined),
            maxHeight: placement?.maxHeight ?? PANEL_MAX_HEIGHT_PX,
            // Measured before it is shown, so it never flashes at 0,0.
            visibility: placement ? "visible" : "hidden",
          }}
          onClick={(e) => e.stopPropagation()}
          {...dismissProps}
        >
          <div className="oltra-subheader">Select trip</div>

          <div className="mt-2 flex flex-col gap-2">
            {trips.length ? (
              trips.map((trip) => (
                <button
                  key={trip.id}
                  type="button"
                  disabled={busy}
                  onClick={() => void saveTo(trip.id)}
                  className="oltra-dropdown-item"
                >
                  {trip.label}
                </button>
              ))
            ) : (
              <div className="text-[12px] text-[color:var(--oltra-text-muted)]">
                No trips available.
              </div>
            )}

            <div
              className="mt-3 border-t border-[var(--oltra-field-border)] pt-3"
              title={limitReached ? TRIP_LIMIT_MESSAGE : undefined}
            >
              <div className="oltra-subheader">Create new trip</div>

              <div className="mt-2 flex flex-col gap-2">
                <input
                  type="text"
                  value={newTripName}
                  onChange={(e) => {
                    setNewTripName(e.target.value);
                    setError("");
                  }}
                  placeholder="Trip name"
                  maxLength={MAX_TRIP_NAME_CHARS}
                  className="oltra-input"
                  disabled={limitReached || busy}
                />

                {/* Deliberately not `disabled`: a disabled button fires no
                    click, so it can never say why. Reads as passive, shows the
                    reason on hover, and explains itself when pressed. */}
                <button
                  type="button"
                  onClick={() => {
                    if (createBlockedReason) {
                      setError(createBlockedReason);
                      return;
                    }
                    void handleCreateAndSave();
                  }}
                  disabled={busy}
                  aria-disabled={Boolean(createBlockedReason)}
                  data-reason={createBlockedReason ?? undefined}
                  className="oltra-btn oltra-btn--condensed oltra-btn--block"
                >
                  {busy ? "Saving..." : "Create new trip"}
                </button>

                {limitReached ? (
                  <div className="text-[12px] leading-snug text-[color:var(--oltra-text-muted)]">
                    {TRIP_LIMIT_MESSAGE}
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>,
        document.body
      ) : null}

      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          if (savedReason) return;
          void handleToggle();
        }}
        disabled={disabled || busy}
        aria-disabled={savedReason ? true : undefined}
        data-reason={savedReason}
        className={className}
      >
        {justSaved ? "SAVED" : busy ? "SAVING..." : label}
      </button>

      {error || (message && !confirmInTrigger) ? (
        <div className="mt-1 text-[11px] leading-snug text-[color:var(--oltra-text-muted)]">
          {error || message}
        </div>
      ) : null}
    </div>
  );
}
