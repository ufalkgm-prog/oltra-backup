import { identifyItinerary } from "@/lib/flights/flightIdentity";
import type { Itinerary } from "@/lib/flights/itinerary";
import styles from "./TripComMatchNote.module.css";

/* WHAT TO SELECT ONCE THE MEMBER IS ON TRIP.COM.
 *
 * The handoff opens a filtered search, not the flight we recommended — that is
 * a hard limit of Trip.com's URLs, not a gap in our research (spec §4). The
 * member therefore lands on a list and has to recognise the itinerary. This
 * block is what makes that possible: carrier, flight numbers, date and
 * departure time per leg, plus our own price as a cross-check.
 *
 * It renders from the itinerary. The concierge is not asked to mention any of
 * it and cannot leave it out — see the header of lib/flights/flightIdentity.ts
 * for why that is the whole point.
 *
 * `price` arrives preformatted rather than being computed here, because the two
 * hosts format differently — the Flights page converts into the member's
 * selected currency, the landing and concierge cards print the fare as quoted.
 * A figure here that disagreed with the one directly above it would undo the
 * cross-check this block exists to provide. */
export default function TripComMatchNote({
  itinerary,
  price,
}: {
  itinerary: Itinerary;
  /** Already formatted for display, exactly as the card above shows it. */
  price: string;
}) {
  const legs = identifyItinerary(itinerary);
  if (!legs.length) return null;

  return (
    <div className={styles.note}>
      <span className={styles.head}>Find this flight on Trip.com</span>
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
        {/* The price sits in the list as one more way to recognise the
            itinerary, not as a second warning — the figure above the button
            already carries the "indicative" label, and repeating the number in
            a sentence directly beneath it read as a correction. */}
        <li className={styles.leg}>
          <span className={styles.route}>Around</span>
          <span className={styles.flights}>{price}</span>
        </li>
      </ul>
      <p className={styles.foot}>
        {/* Never "book this flight": the link cannot do that, and saying so
            would set the member up to think something had gone wrong when they
            arrive at a list. */}
        BOOK opens the matching search on Trip.com, where you select this
        flight. Their price is the one you pay.
      </p>
    </div>
  );
}
