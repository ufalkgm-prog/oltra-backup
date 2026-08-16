/** Maximum saved trips per member. Enforced in two places on purpose:
 *  - createTripBrowser() throws TripLimitError, which is the actual guard;
 *  - the trip pickers disable their "create" control and show the message on
 *    hover, so the limit is visible before the user commits to typing a name.
 * The UI check alone is not enough (several entry points, and trips can be
 * created from more than one tab), and the throw alone reads as a failure
 * rather than a rule. */
export const MAX_TRIPS_PER_MEMBER = 8;

export const TRIP_LIMIT_MESSAGE = `Max limit of ${MAX_TRIPS_PER_MEMBER} trips reached, please go to members section and delete old trips`;

export class TripLimitError extends Error {
  constructor() {
    super(TRIP_LIMIT_MESSAGE);
    this.name = "TripLimitError";
  }
}

export function isTripLimitError(error: unknown): boolean {
  return error instanceof TripLimitError || (error as Error)?.name === "TripLimitError";
}
