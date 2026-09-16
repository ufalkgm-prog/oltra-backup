import type { RatehawkGroupedRoom } from "./types";

/* What differs between the rate the guest chose on the hotelpage and the rate
 * Prebook returned.
 *
 * Any difference is shown before the guest continues — up or down, price or
 * terms. Within the price tolerance ETG may substitute an alternative rate of
 * the same room and meal type, including one that swaps refundable for
 * non-refundable at the same price, which ETG's own `price_changed` flag does
 * not report. So the comparison covers price, meal and cancellation, and a
 * different match_hash counts as a change on its own (ETG: any change to price,
 * meal or cancellation produces a new match_hash). */

export type RateChange =
  | { kind: "price"; from: number; to: number; currency: string }
  | { kind: "currency"; from: string; to: string }
  | { kind: "meal"; from: string; to: string }
  | { kind: "cancellation"; from: string | null; to: string | null }
  | { kind: "conditions" };

function mealKey(room: RatehawkGroupedRoom): string {
  return `${room.mealValue}|${room.hasBreakfast ? 1 : 0}`;
}

export function compareRates(
  original: RatehawkGroupedRoom,
  prebooked: RatehawkGroupedRoom,
  etgPriceChanged: boolean
): RateChange[] {
  const changes: RateChange[] = [];

  if (original.currency !== prebooked.currency) {
    changes.push({ kind: "currency", from: original.currency, to: prebooked.currency });
  } else if (original.pricePerStay !== prebooked.pricePerStay) {
    changes.push({
      kind: "price",
      from: original.pricePerStay,
      to: prebooked.pricePerStay,
      currency: prebooked.currency,
    });
  }

  if (mealKey(original) !== mealKey(prebooked)) {
    changes.push({ kind: "meal", from: original.mealValue, to: prebooked.mealValue });
  }

  if (original.freeCancellationBefore !== prebooked.freeCancellationBefore) {
    changes.push({
      kind: "cancellation",
      from: original.freeCancellationBefore,
      to: prebooked.freeCancellationBefore,
    });
  }

  // ETG say the price changed, or the rate's fingerprint differs, but nothing
  // above shows it (a later penalty window, say): still a change to show.
  if (!changes.length && (etgPriceChanged || original.matchHash !== prebooked.matchHash)) {
    changes.push({ kind: "conditions" });
  }

  return changes;
}
