"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildTripItinerary,
  itineraryToPlainText,
  KIND_LABEL,
  type ItineraryDetails,
  type ItineraryEntry,
} from "@/lib/members/buildItinerary";
import { buildTripWarnings } from "@/lib/members/tripWarnings";
import type { SavedTrip } from "@/lib/members/types";

/* The left column carries the kind above the time - FLIGHT over 08:30 - and
   restaurants, listed under their own heading, carry only a time. */
function EntryBlock({ entry }: { entry: ItineraryEntry }) {
  const label = KIND_LABEL[entry.kind];
  return (
    <article className={`itinerary-entry itinerary-entry--${entry.kind}`}>
      <div className="itinerary-entry__rail">
        {label ? <div className="itinerary-entry__kind">{label}</div> : null}
        {entry.time ? <div className="itinerary-entry__time">{entry.time}</div> : null}
      </div>
      <div className="itinerary-entry__body">
        <h4 className="itinerary-entry__title">{entry.title}</h4>
        {entry.subtitle ? (
          <div className="itinerary-entry__subtitle">{entry.subtitle}</div>
        ) : null}
        {entry.facts.length ? (
          <dl className="itinerary-entry__facts">
            {entry.facts.map((fact) => (
              <div className="itinerary-fact" key={fact.label}>
                <dt>{fact.label}</dt>
                <dd>{fact.value}</dd>
              </div>
            ))}
          </dl>
        ) : null}
      </div>
    </article>
  );
}

function Section({ heading, children }: { heading: string; children: React.ReactNode }) {
  return (
    <section className="itinerary-section">
      <h3 className="itinerary-section__heading">{heading}</h3>
      {children}
    </section>
  );
}

export default function TripItineraryDocument({
  trip,
  details,
  notes,
  onClose,
}: {
  trip: SavedTrip;
  /** Address, phone, website and type, looked up live by the page. */
  details?: ItineraryDetails;
  /** The trip's own notes, carried through to the printed/emailed document. */
  notes?: string;
  onClose: () => void;
}) {
  const itinerary = useMemo(() => buildTripItinerary(trip, details), [trip, details]);
  const warnings = useMemo(() => buildTripWarnings(trip), [trip]);

  const isEmpty =
    itinerary.days.length === 0 && itinerary.undated.length === 0 && itinerary.restaurants.length === 0;
  const trimmedNotes = (notes ?? "").trim();

  // Rendered through a portal to document.body. Inside the page tree it sat in
  // .oltra-page__content, which is position:relative + z-index:1 and therefore
  // its own stacking context - so the overlay's z-index:700 could not lift it
  // above the fixed site header (z-index 30 in a sibling context). Being a
  // direct child of body is also what lets print hide everything else.
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
  // the document.
  function handlePrint() {
    window.print();
  }

  // Server-side mail is still deferred (§16), so "Send" hands the itinerary to
  // whatever mail client the member already has, as plain text. A long trip can
  // exceed some clients' mailto length limits - that's the trade-off for not
  // needing a backend, and it goes away when real mail sending lands.
  function handleSend() {
    const subject = `myOLTRA itinerary: ${itinerary.tripName}`;
    const warningText = warnings.map((w) => `Important note: ${w.message}`).join("\n");
    const body = [itineraryToPlainText(itinerary, trimmedNotes), warningText].filter(Boolean).join("\n\n");
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  }

  if (!mounted) return null;

  return createPortal(
    <div className="members-leave-overlay itinerary-overlay">
      <div className="itinerary-frame">
        {/* On a dark bar above the paper, not on it: the button standard is
            drawn for the site's dark surfaces, and the controls are not part
            of the document being printed. */}
        <div className="itinerary-modal__toolbar">
          <div className="oltra-label">Itinerary</div>
          <div className="itinerary-modal__toolbar-actions">
            <button type="button" className="oltra-btn" onClick={handlePrint}>
              Print / Save as PDF
            </button>
            <button type="button" className="oltra-btn" onClick={handleSend}>
              Send
            </button>
            <button type="button" className="oltra-btn" onClick={onClose}>
              Close
            </button>
          </div>
        </div>

        <div className="oltra-panel itinerary-modal">
          <div className="itinerary-document">
            {/* The site header's logo and route label, on paper (Ulrik,
                2026-10-06). The black wordmark: the header's is drawn for the
                dark page. */}
            <header className="itinerary-document__header">
              <div className="itinerary-brand">
                {/* eslint-disable-next-line @next/next/no-img-element -- an SVG wordmark; next/image does not optimise SVG */}
                <img
                  src="/images/logo/myOLTRA-logo-black-vf.svg"
                  alt="myOLTRA"
                  className="itinerary-brand__logo"
                />
                <div className="itinerary-brand__label">Itinerary</div>
              </div>

              <h2 className="itinerary-document__title">{itinerary.tripName}</h2>
              <div className="itinerary-document__meta">
                <span>{itinerary.destination}</span>
                {itinerary.dates ? (
                  <span className="itinerary-document__dates">{itinerary.dates}</span>
                ) : null}
              </div>
            </header>

            {warnings.length ? (
              <section className="itinerary-warnings">
                {warnings.map((warning) => (
                  <p className="itinerary-warning" key={warning.id}>
                    <span className="itinerary-warning__label">Important note:</span>{" "}
                    {warning.message}
                  </p>
                ))}
              </section>
            ) : null}

            {isEmpty ? <div className="members-empty">Nothing saved to this trip yet.</div> : null}

            {itinerary.days.map((day) => (
              <Section heading={day.heading} key={day.date}>
                {day.entries.map((entry) => (
                  <EntryBlock entry={entry} key={entry.id} />
                ))}
              </Section>
            ))}

            {itinerary.undated.length ? (
              <Section heading="Not yet dated">
                {itinerary.undated.map((entry) => (
                  <EntryBlock entry={entry} key={entry.id} />
                ))}
              </Section>
            ) : null}

            {itinerary.restaurants.length ? (
              <Section heading="Restaurants">
                {itinerary.restaurants.map((entry) => (
                  <EntryBlock entry={entry} key={entry.id} />
                ))}
              </Section>
            ) : null}

            {trimmedNotes ? (
              <Section heading="Member notes">
                <p className="itinerary-notes__body">{trimmedNotes}</p>
              </Section>
            ) : null}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
}
