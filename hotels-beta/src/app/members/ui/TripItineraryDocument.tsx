"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildTripItinerary,
  itineraryToPlainText,
  type ItineraryEntry,
} from "@/lib/members/buildItinerary";
import { buildTripWarnings } from "@/lib/members/tripWarnings";
import type { SavedTrip } from "@/lib/members/types";

const KIND_LABEL: Record<ItineraryEntry["kind"], string> = {
  flight: "Flight",
  "hotel-check-in": "Hotel",
  "hotel-check-out": "Hotel",
  "hotel-stay": "Hotel",
  restaurant: "Restaurant",
};

function EntryBlock({ entry }: { entry: ItineraryEntry }) {
  return (
    <article className="itinerary-entry">
      <div className="itinerary-entry__rail">
        <div className="itinerary-entry__time">{entry.time || "—"}</div>
        <div className="itinerary-entry__kind">{KIND_LABEL[entry.kind]}</div>
      </div>
      <div className="itinerary-entry__body">
        <h4 className="itinerary-entry__title">{entry.title}</h4>
        {entry.subtitle ? (
          <div className="itinerary-entry__subtitle">{entry.subtitle}</div>
        ) : null}
        <dl className="itinerary-entry__facts">
          {entry.facts.map((fact) => (
            <div className="itinerary-fact" key={fact.label}>
              <dt>{fact.label}</dt>
              <dd>{fact.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </article>
  );
}

export default function TripItineraryDocument({
  trip,
  notes,
  onClose,
}: {
  trip: SavedTrip;
  /** The trip's own notes, carried through to the printed/emailed document. */
  notes?: string;
  onClose: () => void;
}) {
  const itinerary = useMemo(() => buildTripItinerary(trip), [trip]);
  const warnings = useMemo(() => buildTripWarnings(trip), [trip]);

  const isEmpty = itinerary.days.length === 0 && itinerary.unscheduled.length === 0;
  const trimmedNotes = (notes ?? "").trim();

  // Rendered through a portal to document.body. Inside the page tree it sat in
  // .oltra-page__content, which is position:relative + z-index:1 and therefore
  // its own stacking context - so the overlay's z-index:700 could not lift it
  // above the fixed site header (z-index 30 in a sibling context). This modal
  // is top-aligned, unlike the centred confirm dialogs that share the overlay
  // class, so its toolbar landed under the header band and Close was
  // unclickable. Same createPortal pattern the Hotels lightbox already uses.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // Escape closes it too - a document this tall can be scrolled well past the
  // Close button.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  // Print is also how a PDF gets made: every browser's print dialog offers
  // "Save as PDF", so this needs no PDF library (and CLAUDE.md §2 rules out
  // adding one). The @media print block in members.css hides everything except
  // .itinerary-document.
  function handlePrint() {
    window.print();
  }

  // Server-side mail is still deferred (§16), so "Send" hands the itinerary to
  // whatever mail client the member already has, as plain text. A long trip can
  // exceed some clients' mailto length limits - that's the trade-off for not
  // needing a backend, and it goes away when real mail sending lands.
  function handleSend() {
    const subject = `Itinerary — ${itinerary.tripName}`;
    const sections = [itineraryToPlainText(itinerary)];
    if (warnings.length) {
      sections.push(
        warnings.map((w) => `Important note: ${w.message}`).join("\n")
      );
    }
    if (trimmedNotes) sections.push(`Trip notes\n${trimmedNotes}`);
    const body = sections.join("\n\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  if (!mounted) return null;

  return createPortal(
    <div className="members-leave-overlay itinerary-overlay">
      <div className="oltra-panel itinerary-modal">
        <div className="itinerary-modal__toolbar">
          <div className="oltra-label">Itinerary</div>
          <div className="itinerary-modal__toolbar-actions">
            <button
              type="button"
              className="oltra-button-primary members-action-button"
              onClick={handlePrint}
            >
              Print / Save as PDF
            </button>
            <button
              type="button"
              className="oltra-button-secondary members-action-button"
              onClick={handleSend}
            >
              Send
            </button>
            <button
              type="button"
              className="oltra-button-secondary members-action-button"
              onClick={onClose}
            >
              Close
            </button>
          </div>
        </div>

        <div className="itinerary-document">
          <header className="itinerary-document__header">
            <h2 className="itinerary-document__title">{itinerary.tripName}</h2>
            <dl className="itinerary-summary">
              {itinerary.summaryFacts.map((fact) => (
                <div className="itinerary-fact" key={fact.label}>
                  <dt>{fact.label}</dt>
                  <dd>{fact.value}</dd>
                </div>
              ))}
            </dl>
          </header>

          {warnings.length ? (
            <section className="itinerary-warnings">
              {warnings.map((warning) => (
                <p className="itinerary-warning" key={warning.id}>
                  <span className="itinerary-warning__label">
                    Important note:
                  </span>{" "}
                  {warning.message}
                </p>
              ))}
            </section>
          ) : null}

          {isEmpty ? (
            <div className="members-empty">
              Nothing saved to this trip yet.
            </div>
          ) : null}

          {itinerary.days.map((day) => (
            <section className="itinerary-day" key={day.date}>
              <h3 className="itinerary-day__heading">{day.heading}</h3>
              {day.entries.map((entry) => (
                <EntryBlock entry={entry} key={entry.id} />
              ))}
            </section>
          ))}

          {itinerary.unscheduled.length ? (
            <section className="itinerary-day">
              <h3 className="itinerary-day__heading">Not yet scheduled</h3>
              {itinerary.unscheduled.map((entry) => (
                <EntryBlock entry={entry} key={entry.id} />
              ))}
            </section>
          ) : null}

          {trimmedNotes ? (
            <section className="itinerary-day itinerary-notes">
              <h3 className="itinerary-day__heading">Trip notes</h3>
              <p className="itinerary-notes__body">{trimmedNotes}</p>
            </section>
          ) : null}

          <footer className="itinerary-document__footer">
            Booking references, flight numbers, terminals and baggage
            allowances appear here once each item is booked.
          </footer>
        </div>
      </div>
    </div>,
    document.body
  );
}
