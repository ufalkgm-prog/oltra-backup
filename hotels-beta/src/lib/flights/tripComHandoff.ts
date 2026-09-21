import { selectedItineraryFrom, toCabin, type Itinerary, type PassengerCounts } from './itinerary'
import type { TripComPlacement } from './partners'
import { buildTripComUrl } from './tripCom'

/* FROM A FLIGHT CARD TO A TRIP.COM LINK, without a component knowing either shape.
 *
 * `buildTripComUrl` throws on an itinerary it cannot express, which is right
 * for a builder and wrong for a render: a thrown error inside a card takes the
 * page down with it. So this wrapper returns null instead, and a card with no
 * link draws no BOOK button. A BOOK that opens a search for somewhere the
 * member is not going is worse than a card without one.
 *
 * It cannot happen with real data - the airport codes and dates come from the
 * supplier's own response - so a null here means something upstream is broken
 * and the console says which itinerary. */
export function tripComHref(
  itinerary: Itinerary,
  options: {
    cabin: string
    passengers: PassengerCounts
    placement: TripComPlacement
    /** The member's display currency. Unrecognised values fall back to EUR. */
    currency?: string
  }
): string | null {
  try {
    return buildTripComUrl(
      selectedItineraryFrom(itinerary, toCabin(options.cabin), options.passengers),
      {
        placement: options.placement,
        currency: options.currency,
      }
    )
  } catch (err) {
    console.error('[trip.com handoff]', itinerary.offerId, err)
    return null
  }
}

/* WHY THE LINK IS AN ANCHOR AND NOT window.open.
 *
 * A BOOK button that hands the member to another company is a link, so it is
 * drawn as one: `<a href target="_blank" rel="noopener">`, the same pattern the
 * hotel cards already use for a property's own website. The member can see
 * where it goes before clicking, middle-click it, and copy it.
 *
 * `rel="noopener"` and deliberately NOT `noreferrer`. noopener is the security
 * part - it stops the opened page reaching back into ours through
 * window.opener. noreferrer additionally strips the Referer header, and the
 * referrer is one of the things an affiliate network can attribute a click by.
 * Our tracking travels in the query string, so stripping it would probably be
 * harmless, but "probably harmless" is not a good trade against the one failure
 * mode here that nobody would notice: a link that works and earns nothing. */
export const TRIP_COM_LINK_REL = 'noopener'
