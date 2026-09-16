import { NextResponse } from "next/server";
import {
  isHotelpageHash,
  prebookRate,
  RatehawkPrebookError,
} from "@/lib/ratehawk/prebook";

/* Prebook one rate the guest chose — part of the search step, never a booking
 * (see lib/ratehawk/prebook.ts). Called only from the Hotels panel's Continue
 * click, never on load. Nothing here is cached. */

// ETG recommend a 60s Prebook timeout; the library allows 65s, so the function
// needs room above that.
export const maxDuration = 75;

const NO_STORE = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  let hash: unknown;
  try {
    ({ hash } = (await request.json()) as { hash?: unknown });
  } catch {
    return NextResponse.json({ ok: false, reason: "failed" }, { status: 400, headers: NO_STORE });
  }

  if (!isHotelpageHash(hash)) {
    return NextResponse.json(
      { ok: false, reason: "failed", error: "A hotelpage rate hash (h-…) is required." },
      { status: 400, headers: NO_STORE }
    );
  }

  try {
    const result = await prebookRate({ hotelpageHash: hash });
    return NextResponse.json({ ok: true, ...result }, { headers: NO_STORE });
  } catch (error) {
    const reason = error instanceof RatehawkPrebookError ? error.reason : "failed";
    console.error("RATEHAWK PREBOOK ERROR:", error);
    // 200 with ok:false for the expected outcomes the panel explains to the
    // guest; 502 only for the unexplained ones.
    return NextResponse.json(
      { ok: false, reason },
      { status: reason === "failed" ? 502 : 200, headers: NO_STORE }
    );
  }
}
