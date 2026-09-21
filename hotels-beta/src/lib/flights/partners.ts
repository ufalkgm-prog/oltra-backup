/* WHERE A FLIGHT BOOKING ACTUALLY HAPPENS, and the one place its identifiers live.
 *
 * myOLTRA does not sell flights. The concierge presents options, the member
 * clicks through to Trip.com, and Trip.com is merchant of record: we take no
 * payment and do no servicing. That is a liability decision, not a stage on the
 * way to booking ourselves, so nothing here creates an order and nothing here
 * talks to Trip.com at all. A link is built from parameters and handed to the
 * browser. Trip.com is never scraped and never called.
 *
 * WHY ONE FILE. `trip_sub1` varies per placement - it is how the affiliate
 * reporting tells a click from the concierge apart from a click on the Flights
 * page - so the tracking block is genuinely used from more than one place. Two
 * copies of an affiliate id is two chances for a placement to report against
 * the wrong account, and the failure is silent: the link works, the revenue
 * lands somewhere else. So every value lives here and the builder reads them.
 *
 * These are not secrets. They travel in the query string of a URL the member
 * can read, so they are constants rather than environment variables - a
 * NEXT_PUBLIC_ env var would give the same visibility with more machinery and
 * an extra way for production to differ from a local run.
 *
 * Every value below is from `docs/trip-com-handoff-spec.md`, captured from live
 * Trip.com URLs. */

/** The search-results endpoint. Deep links land on a filtered SEARCH, never on
 * a named flight: Trip.com's post-selection URL carries server-generated
 * session state (an opaque token, a fare-policy id with the search timestamp
 * embedded, a transaction id) that expires and cannot be reconstructed. Spec
 * §4. Anything promising "book this flight" is promising something this link
 * cannot do. */
export const TRIP_COM_SEARCH_URL = 'https://www.trip.com/flights/showfarefirst'

/** myOLTRA's affiliate identifiers. Constant on every generated link.
 *
 * `trip_sub3` was produced by Trip.com's own link builder and its purpose is
 * undocumented; it is sent as-is until Trip.com confirms whether it is required
 * on links we construct ourselves (spec §6, still unanswered). */
export const TRIP_COM_TRACKING = {
  Allianceid: '10501597',
  SID: '330783916',
  trip_sub3: 'D19756963',
} as const

/** Free-text reporting label, sent as `trip_sub1`.
 *
 * A closed vocabulary rather than a string, because its whole value is that two
 * placements are distinguishable in a report months later, and free text drifts
 * into `concierge`, `Concierge` and `concierge_chat` meaning the same thing. */
export type TripComPlacement =
  | 'concierge-chat'
  | 'flight-results'
  | 'trip-summary'
  | 'email-followup'

/** Language of the landing page. The single switch if Danish-language landing
 * pages are ever wanted. */
export const TRIP_COM_LOCALE = 'en-XX'

/** Currencies we will put in `curr`.
 *
 * The five the site's own switcher offers, plus DKK from the original capture.
 * Ulrik verified AED, CHF and EUR by hand on 2026-09-21 and confirmed all five
 * site currencies pass through as they are.
 *
 * This list is a safety net, not a feature: we never see Trip.com's response to
 * a link, so there is nothing to detect a rejected currency from. The check has
 * to happen when the URL is built or not at all, and anything not on this list
 * falls back to EUR rather than travelling as an unsupported value. */
export const TRIP_COM_CURRENCIES = ['EUR', 'USD', 'GBP', 'CHF', 'AED', 'DKK'] as const

/** What an unrecognised currency becomes. The site's own default. */
export const TRIP_COM_FALLBACK_CURRENCY = 'EUR'

/** Cabin to Trip.com's `class` code.
 *
 * A fifth code, `ys`, means economy and premium economy together. It is
 * deliberately unused: it exists for deliberately showing a price-conscious
 * comparison across two cabins, which is not something the concierge does, and
 * an unused branch in a link builder is an untested one. */
export const TRIP_COM_CABIN_CODE = {
  economy: 'y',
  premium_economy: 's',
  business: 'c',
  first: 'f',
} as const

/** Cosmetic parameters Trip.com's own search box emits. Safe to include, and
 * included so a generated link is byte-comparable with a hand-made one when
 * something needs debugging. */
export const TRIP_COM_SEARCH_FORM_MARKERS = {
  lowpricesource: 'searchform',
  searchboxarg: 't',
} as const
