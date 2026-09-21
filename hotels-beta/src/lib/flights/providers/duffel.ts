import 'server-only'
import type { CabinClass, CreateOfferRequestPassenger } from '@duffel/api/types'
import { getDuffel } from '../duffelClient'
import { normalizeOffers } from '../duffelNormalizer'
import { tripShapeOf, type FlightConnector, type Itinerary, type ItineraryQuery } from '../itinerary'

/* DUFFEL AS ONE SUPPLIER AMONG SEVERAL.
 *
 * This is the whole of what a supplier swap costs: a file that turns an
 * `ItineraryQuery` into that supplier's search request, and its response into
 * `Itinerary[]`. Amadeus, Kayak or Wego would be a sibling of this file, and
 * nothing that calls `search` would change.
 *
 * WHY THE CONCIERGE GOES THROUGH HERE. `lib/ai/flightSearch.ts` used to build
 * Duffel's request itself - its own cabin map, its own passenger array, its own
 * slice objects - so the concierge's supposedly supplier-neutral layer had
 * Duffel's request format written into it in three places. It now asks this for
 * itineraries and never names a supplier. That is the point of the boundary: a
 * connector change, not a rewrite.
 *
 * `server-only` because it reads DUFFEL_ACCESS_TOKEN. A connector is always a
 * server module; the browser sees itineraries, never a supplier. */

const CABIN_CLASS: Record<string, CabinClass> = {
  economy: 'economy',
  premium_economy: 'premium_economy',
  business: 'business',
  first: 'first',
}

export const duffelConnector: FlightConnector = {
  id: 'duffel',

  async search(query: ItineraryQuery): Promise<Itinerary[]> {
    const duffel = getDuffel()

    const passengers: CreateOfferRequestPassenger[] = [
      ...Array.from({ length: query.passengers.adults }, () => ({ type: 'adult' as const })),
      // Duffel takes an age rather than a category for the under-18s: 10 is a
      // child fare, 0 an infant in arms. Same values the search route sends.
      ...Array.from({ length: query.passengers.children }, () => ({ age: 10 })),
      ...Array.from({ length: query.passengers.infants }, () => ({ age: 0 })),
    ]

    const response = await duffel.offerRequests.create({
      slices: query.legs.map(leg => ({
        origin: leg.origin,
        destination: leg.destination,
        departure_date: leg.date,
        arrival_time: null,
        departure_time: null,
      })),
      passengers,
      cabin_class: CABIN_CLASS[query.cabin] ?? 'economy',
      return_offers: true,
    })

    const shape = tripShapeOf(
      query.legs.map(leg => ({ origin: leg.origin, destination: leg.destination, date: leg.date }))
    )
    return normalizeOffers(
      response.data.offers ?? [],
      shape === 'multi-city' ? 'multiple' : shape
    )
  },
}
