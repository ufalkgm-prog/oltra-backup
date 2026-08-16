"use client";

import { useMemo } from "react";
import {
  buildTripItinerary,
  itineraryToPlainText,
  type ItineraryEntry,
} from "@/lib/members/buildItinerary";
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
  onClose,
}: {
  trip: SavedTrip;
  onClose: () => void;
}) {
  const itinerary = useMemo(() => buildTripItinerary(trip), [trip]);

  const isEmpty = itinerary.days.length === 0 && itinerary.unscheduled.length === 0;

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
    const body = itineraryToPlainText(itinerary);
    window.location.href = `mailto:?subject=${encodeURIComponent(
      subject
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <div className="members-leave-overlay itinerary-overlay">
      <div className="oltra-glass oltra-panel itinerary-modal">
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

          <footer className="itinerary-document__footer">
            Booking references, flight numbers, terminals and baggage
            allowances appear here once each item is booked.
          </footer>
        </div>
      </div>
    </div>
  );
}
