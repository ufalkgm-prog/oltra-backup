"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createTripBrowser, fetchTripChoicesBrowser } from "@/lib/members/db";
import { getMemberActionLoginMessage } from "@/lib/members/memberActionUi";
import {
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
  /** Confirm the save on the trigger itself ("Saved", italic, for a few
   * seconds) instead of printing a line of text under it. For surfaces where a
   * text confirmation would reflow the layout - the flights price cards sit in
   * a fixed-height grid. Errors still print, since they need to be read. */
  confirmInTrigger?: boolean;
};

const SAVED_FLASH_MS = 2500;

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
}: Props) {
  const [open, setOpen] = useState(false);
  const [justSaved, setJustSaved] = useState(false);
  const [trips, setTrips] = useState<Array<{ id: string; name: string; label: string }>>([]);
  const [tripsLoaded, setTripsLoaded] = useState(false);
  const [newTripName, setNewTripName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const containerRef = useRef<HTMLDivElement | null>(null);

  const dismissProps = useDropdownDismiss({
    open,
    onClose: () => setOpen(false),
    refs: containerRef,
  });

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
    if (confirmInTrigger) setJustSaved(true);
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
      className={`relative ${compact ? "" : "w-full"}`}
      data-oltra-control="true"
      {...dismissProps}
    >
      {open ? (
        <div
          className={[
            "oltra-popup-panel oltra-popup-panel--bounded absolute z-50",
            dropUp ? "bottom-full mb-2" : "top-full mt-2",
            align === "right" ? "right-0" : "left-0",
            compact ? "w-[260px]" : "left-0 right-0",
          ].join(" ")}
          onClick={(e) => e.stopPropagation()}
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
                  className="oltra-input"
                  disabled={limitReached || busy}
                />

                {/* Deliberately not `disabled`: a disabled button fires no
                    click, so it can never say why. Reads as inactive, and
                    explains itself when pressed. */}
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
                  className={`oltra-dropdown-item${
                    createBlockedReason ? " oltra-dropdown-item--inactive" : ""
                  }`}
                  title={createBlockedReason ?? undefined}
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
        </div>
      ) : null}

      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleToggle();
        }}
        disabled={disabled || busy}
        className={className}
        style={justSaved ? { fontStyle: "italic" } : undefined}
      >
        {justSaved ? "Saved" : busy ? "SAVING..." : label}
      </button>

      {error || (message && !confirmInTrigger) ? (
        <div className="mt-1 text-[11px] leading-snug text-[color:var(--oltra-text-muted)]">
          {error || message}
        </div>
      ) : null}
    </div>
  );
}
