"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { identifyItinerary } from "@/lib/flights/flightIdentity";
import type { Itinerary, PassengerCounts } from "@/lib/flights/itinerary";
import type { TripComPlacement } from "@/lib/flights/partners";
import { tripComHref, TRIP_COM_LINK_REL } from "@/lib/flights/tripComHandoff";
import flightsStyles from "@/app/flights/ui/FlightsView.module.css";
import styles from "./TripComBookButton.module.css";

/* BOOK, AND THE STEP BEFORE LEAVING.
 *
 * myOLTRA does not sell flights: the member is handed to Trip.com, who are
 * merchant of record, and we take no payment and do no servicing.
 *
 * The link opens a filtered SEARCH on their site, not the flight we
 * recommended — their post-selection URL carries session state that expires
 * and cannot be constructed (spec §4). So the member arrives at a list and has
 * to recognise the itinerary, which takes the carrier, the flight numbers and
 * the departure times.
 *
 * THAT USED TO BE A PANEL UNDER EVERY CARD and it was far too much furniture
 * for something only read at the moment of leaving (Ulrik, 2026-09-21). It is
 * now this dialog: BOOK opens it, PROCEED goes to Trip.com, CANCEL closes it.
 * The facts are identical — what changed is that they are asked for.
 *
 * The details are rendered from the itinerary, not written by the concierge.
 * The spec's own remedy is that the concierge's message should name the
 * carrier and flight numbers, but that is a prompt-only rule and §50's record
 * is that prompt-only rules of this shape get skipped. */

export type FlightHandoff = {
  cabin: string;
  passengers: PassengerCounts;
  placement: TripComPlacement;
};

export default function TripComBookButton({
  itinerary,
  price,
  handoff,
  currency,
  className,
}: {
  itinerary: Itinerary;
  /** Already formatted for display, exactly as the card shows it. */
  price: string;
  handoff: FlightHandoff;
  /** The member's display currency, for the Trip.com link's `curr`. */
  currency?: string;
  className: string;
}) {
  const [open, setOpen] = useState(false);
  const href = tripComHref(itinerary, { ...handoff, currency });

  /* No link, no button. tripComHref returns null only when the itinerary
   * cannot be expressed as a search — impossible with real supplier data, and
   * it logs which itinerary when it happens. A BOOK that opened a search for
   * somewhere the member is not going would be worse than no BOOK. */
  if (!href) return null;

  return (
    <>
      <button
        type="button"
        className={className}
        onClick={(event) => {
          // The flight cards around this are click-to-select.
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      >
        BOOK
      </button>
      {open ? (
        <TripComHandoffDialog
          itinerary={itinerary}
          price={price}
          href={href}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </>
  );
}

function TripComHandoffDialog({
  itinerary,
  price,
  href,
  onClose,
}: {
  itinerary: Itinerary;
  price: string;
  href: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onEsc = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onEsc);
    return () => document.removeEventListener("keydown", onEsc);
  }, [onClose]);

  if (typeof document === "undefined") return null;

  const legs = identifyItinerary(itinerary);

  /* Portalled: these buttons sit inside glass panels whose backdrop-filter
     makes them the containing block for fixed positioning, so the dialog's
     full-screen backdrop would otherwise be clipped to the card. Same reason
     FlightResultRow portals the flight-details popup. */
  return createPortal(
    <div
      className={flightsStyles.modalBackdrop}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={flightsStyles.modal}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Continue to Trip.com"
      >
        <div className={flightsStyles.modalHead}>
          <div>
            <div className={flightsStyles.modalTitle}>Find this flight on Trip.com</div>
            <div className={flightsStyles.modalSubtitle}>
              {/* Never "book this flight": the link cannot do that, and saying
                  so would set the member up to think something had gone wrong
                  when they arrive at a list. */}
              We open the matching search — you select this flight there, and
              Trip.com takes the booking.
            </div>
          </div>
          <button
            type="button"
            className={flightsStyles.modalClose}
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>

        <ul className={styles.legs}>
          {legs.map((leg, index) => (
            <li className={styles.leg} key={`${leg.route}-${index}`}>
              <span className={styles.route}>{leg.route}</span>
              <span className={styles.when}>
                {leg.date}
                {leg.date && leg.departTime ? " · " : ""}
                {leg.departTime}
              </span>
              <span className={styles.flights}>{leg.flights}</span>
            </li>
          ))}
          <li className={styles.leg}>
            <span className={styles.route}>Our price</span>
            <span className={styles.flights}>{price}</span>
          </li>
        </ul>

        <p className={styles.foot}>
          Our price comes from a different source and will differ — Trip.com&apos;s
          is the one you pay.
        </p>

        <div className={`oltra-btn-pair ${styles.actions}`}>
          <button type="button" className="oltra-btn" onClick={onClose}>
            Cancel
          </button>
          {/* A real anchor, so the member can see where it goes before pressing
              it. tripComHandoff.ts explains why the rel is noopener and not
              noopener noreferrer. */}
          <a
            href={href}
            target="_blank"
            rel={TRIP_COM_LINK_REL}
            className="oltra-btn"
            onClick={onClose}
          >
            Proceed
          </a>
        </div>
      </div>
    </div>,
    document.body
  );
}
