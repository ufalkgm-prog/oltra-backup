/* WHO FLIES AS WHAT, FROM THE CHILDREN'S AGES (Ulrik, 2026-09-24).
 *
 * Every page asks each child's age (0-17) in the same guest selector, and the
 * hotel side has always used it. The flight side threw the ages away: Duffel
 * was sent every child as a 10-year-old, and Trip.com every child as a child
 * with babyqty 0 - so a baby was priced as a child with its own seat (about
 * three quarters of a fare) instead of a lap infant (about a tenth), and the
 * Trip.com search opened on the wrong passenger mix.
 *
 * An under-2 is a lap infant by default (Ulrik) - what airlines and Trip.com
 * assume. Airlines allow one lap infant per adult, so an under-2 beyond the
 * number of adults takes a seat as a child. A child whose age is not known
 * yet flies as a child. Pure, and shared by every caller. */

export type FlightPassengers = {
  adults: number
  children: number
  infants: number
  /** The seated children's ages, where known, in the order given - so a
   * supplier can price a 4-year-old as a 4-year-old. May be shorter than
   * `children` when some ages are missing. */
  childAges: number[]
}

/** The age below which a child can fly on a parent's lap. */
export const LAP_INFANT_MAX_AGE = 1

export function flightPassengers(
  adults: number,
  kids: number,
  ages: readonly (string | number | null | undefined)[] = []
): FlightPassengers {
  const adultCount = Math.max(1, Math.floor(adults) || 1)
  const kidCount = Math.max(0, Math.floor(kids) || 0)
  const known = ages
    .slice(0, kidCount)
    .map(age => (age === '' || age === null || age === undefined ? NaN : Number(age)))
    .filter(age => Number.isInteger(age) && age >= 0 && age <= 17)

  let lapSeats = adultCount
  let infants = 0
  const childAges: number[] = []
  for (const age of known) {
    if (age <= LAP_INFANT_MAX_AGE && lapSeats > 0) {
      infants += 1
      lapSeats -= 1
    } else {
      childAges.push(age)
    }
  }
  return { adults: adultCount, children: kidCount - infants, infants, childAges }
}
