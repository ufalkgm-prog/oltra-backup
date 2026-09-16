import "server-only";
import {
  RatehawkHttpError,
  RATEHAWK_PREBOOK_TIMEOUT_MS,
  ratehawkPost,
  toGroupedRoom,
  type RawRate,
} from "./availability";
import type { RatehawkGroupedRoom } from "./types";

/* ETG "Prebook rate from hotelpage step" — POST /api/b2b/v3/hotel/prebook/.
 *
 * THIS IS PART OF THE SEARCH STEP, NOT A BOOKING. It checks that the rate the
 * guest chose can still be had and returns the hash the White Label checkout
 * handoff will carry. It creates no order, takes no guest or card data, and
 * nothing in this file may call an /order/* endpoint (those are BLOCKED, §32,
 * and absent from the proxy allowlist, §47). ETG grade the separation
 * directly.
 *
 * The hash chain, kept explicit in the types below:
 *
 *   /search/hp/ rate.book_hash   h-…  (HotelpageHash, valid 24h)
 *        │
 *        ▼  prebookRate({ hotelpageHash })
 *   /hotel/prebook/ rate.book_hash  p-…  (PrebookHash, valid 6h)
 *        │
 *        ▼  [White Label redirect — format not yet specified by ETG]
 *
 * Never cached: ETG prohibit caching Retrieve hotelpage and Prebook responses
 * (§32). The request is `cache: "no-store"` in ratehawkPost and the route sets
 * `Cache-Control: no-store`.
 *
 * Prebook takes no `timeout` parameter. ETG recommend a 60s client timeout
 * (30s minimum); the proxy allows 60s and this side 65s, so the proxy fails
 * first with a real status. Our key's limit is 5 requests / 60s (measured
 * 2026-09-16), so it is called only from the guest's explicit Continue.
 */

export type HotelpageHash = `h-${string}`;
export type PrebookHash = `p-${string}`;

/* How far above the hotelpage price ETG may go when the original rate is gone
 * and it looks for an alternative of the same room and meal type.
 *
 * 10%, and the guest is shown EVERY change before continuing — up or down,
 * price or terms — so the tolerance never decides what the guest accepts.
 * A lower value would not protect them (they see the change either way); it
 * would only turn more small movements into `no_available_rates` dead ends that
 * force a new search. The alternative can also swap refundable for
 * non-refundable, which is why the comparison covers terms, not just price. */
export const PREBOOK_PRICE_INCREASE_PERCENT = 10;

export type PrebookFailureReason =
  | "expired" // rate_not_found: the h- hash is too old or invalid — search again
  | "unavailable" // no_available_rates: nothing within the tolerance
  | "busy" // endpoint_exceeded_limit: our per-minute request limit
  | "disabled" // the proxy is not admitting prebook (kill switch, §47)
  | "failed"; // anything else, including ETG's own internal timeout

export class RatehawkPrebookError extends Error {
  constructor(
    readonly reason: PrebookFailureReason,
    readonly etgError: string | null
  ) {
    super(`Prebook failed: ${reason}${etgError ? ` (${etgError})` : ""}`);
  }
}

export type PrebookResult = {
  prebookHash: PrebookHash;
  rate: RatehawkGroupedRoom;
  // ETG's own flag. The client also compares price and terms itself, because
  // a changed cancellation policy at the same price does not set this.
  priceChanged: boolean;
};

export function isHotelpageHash(value: unknown): value is HotelpageHash {
  return typeof value === "string" && /^h-[A-Za-z0-9-]{1,254}$/.test(value);
}

function isPrebookHash(value: unknown): value is PrebookHash {
  return typeof value === "string" && /^p-[A-Za-z0-9-]{1,254}$/.test(value);
}

type PrebookResponse = {
  status?: string;
  error?: string | null;
  data?: {
    hotels?: { hid?: number; rates?: RawRate[] }[];
    changes?: { price_changed?: boolean };
  } | null;
};

function reasonFor(etgError: string | null | undefined): PrebookFailureReason {
  switch (etgError) {
    case "rate_not_found":
      return "expired";
    case "no_available_rates":
      return "unavailable";
    case "endpoint_exceeded_limit":
      return "busy";
    default:
      return "failed";
  }
}

export async function prebookRate(input: {
  hotelpageHash: HotelpageHash;
  priceIncreasePercent?: number;
}): Promise<PrebookResult> {
  let json: PrebookResponse;
  try {
    json = await ratehawkPost<PrebookResponse>(
      "/api/b2b/v3/hotel/prebook/",
      {
        hash: input.hotelpageHash,
        price_increase_percent: input.priceIncreasePercent ?? PREBOOK_PRICE_INCREASE_PERCENT,
      },
      { timeoutMs: RATEHAWK_PREBOOK_TIMEOUT_MS }
    );
  } catch (error) {
    if (error instanceof RatehawkHttpError) {
      // The proxy answers a path it does not admit with its own 404 body.
      if (error.status === 404 && error.body.includes("Not a proxied ETG endpoint")) {
        throw new RatehawkPrebookError("disabled", null);
      }
      let etgError: string | null = null;
      try {
        etgError = (JSON.parse(error.body) as PrebookResponse).error ?? null;
      } catch {
        // Not JSON (a proxy 502/504, say) — no ETG code to read.
      }
      throw new RatehawkPrebookError(reasonFor(etgError), etgError);
    }
    throw new RatehawkPrebookError("failed", null);
  }

  if (json.status !== "ok" || json.error) {
    throw new RatehawkPrebookError(reasonFor(json.error), json.error ?? null);
  }

  const raw = json.data?.hotels?.[0]?.rates?.[0];
  if (!raw || !isPrebookHash(raw.book_hash)) {
    throw new RatehawkPrebookError("failed", "no p- hash in response");
  }

  // Room images are not needed to compare or confirm a rate, so no room groups
  // are loaded here.
  const rate = toGroupedRoom(raw, []);
  if (!rate) {
    throw new RatehawkPrebookError("failed", "prebooked rate has no price");
  }

  return {
    prebookHash: raw.book_hash,
    rate,
    priceChanged: Boolean(json.data?.changes?.price_changed),
  };
}
