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

export const TRIP_NAME_REQUIRED_MESSAGE = "Input a name in the name field.";
export const TRIP_NAME_DUPLICATE_MESSAGE = "That trip name already exists.";

/* Why a "create new trip" click cannot go through, or null when it can.
 *
 * Shared because the trip picker exists in three separate implementations -
 * SaveToTripControl (landing + flights), and the bespoke pickers inside
 * HotelsView and RestaurantsMapView - and the rule has to read the same in all
 * of them. The control stays clickable rather than being `disabled`: a
 * disabled button fires no click, so it can never explain itself, and an
 * empty-name click used to just close the panel with no feedback at all. */
export function getCreateTripBlockedReason(input: {
  name: string;
  existingNames: string[];
  tripCount: number;
}): string | null {
  if (input.tripCount >= MAX_TRIPS_PER_MEMBER) return TRIP_LIMIT_MESSAGE;

  const trimmed = input.name.trim();
  if (!trimmed) return TRIP_NAME_REQUIRED_MESSAGE;

  const taken = input.existingNames.some(
    (existing) => existing.trim().toLowerCase() === trimmed.toLowerCase()
  );
  return taken ? TRIP_NAME_DUPLICATE_MESSAGE : null;
}
