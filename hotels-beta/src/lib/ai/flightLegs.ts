import type { AiFlightLeg } from "./types";

/* A there-and-back is one round trip, however the model phrased it.
 *
 * The prompt already asks for it — "a genuine there-and-back stays ONE entry
 * with a returnDate: splitting that loses them the cheaper round-trip fares" —
 * but a prompt is guidance and this is the display. Split into two one-way
 * legs, the same journey rendered as two separate panels, each priced as a
 * one-way, and the frame read as an itinerary with two flights in it rather
 * than one return.
 *
 * Same house habit as stripLeadingName in AiConversation: say it in the
 * prompt, then make the display incapable of getting it wrong.
 *
 * Only an exact mirror collapses — B leaves from where A landed, and on or
 * after the day A departed. An open jaw (CPH to NCE out, MRS to CPH home) is
 * not a mirror and survives as two legs, which is the whole reason legs are a
 * list. Dates are ISO, so the string compare is the date compare. */
export function collapseReturnLegs(legs: AiFlightLeg[]): AiFlightLeg[] {
  const collapsed: AiFlightLeg[] = [];
  const paired = new Set<number>();

  for (let i = 0; i < legs.length; i += 1) {
    if (paired.has(i)) continue;
    const leg = legs[i];

    // Already a return, or nothing left that could mirror it.
    if (leg.returnDate) {
      collapsed.push(leg);
      continue;
    }

    let mirror = -1;
    for (let j = i + 1; j < legs.length; j += 1) {
      const other = legs[j];
      if (paired.has(j) || other.returnDate) continue;
      if (other.origin !== leg.destination) continue;
      if (other.destination !== leg.origin) continue;
      if (other.departureDate < leg.departureDate) continue;
      mirror = j;
      break;
    }

    if (mirror === -1) {
      collapsed.push(leg);
      continue;
    }

    paired.add(mirror);
    collapsed.push({
      ...leg,
      returnDate: legs[mirror].departureDate,
      cabin: leg.cabin || legs[mirror].cabin,
    });
  }

  return collapsed;
}
