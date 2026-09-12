/* Does the gateway ranking actually choose what we say it chooses?
 *
 * Run from hotels-beta/ with:   npx tsx scripts/airports/verify-gateway-ranking.mts
 *
 * tsx is NOT a dependency of this project and must not become one (§14, no new
 * libraries) - `npx` fetches it for the run and leaves nothing behind. There is
 * no test framework here, so this is a script with assertions rather than a
 * suite, in the same spirit as the audits.
 *
 * WHY IT EXISTS RATHER THAN A LIVE CHECK. The ranking cannot be verified against
 * Duffel in this environment: the test token fabricates a nonstop on every route
 * (CPH-Anguilla comes back as 10h31 direct), so every airport looks equally
 * reachable and the shortest drive wins - the exact fault the ranking removes.
 * See `flightDataIsSynthetic` in duffelClient.ts. So the flight times here are
 * written by hand, and everything else - the transfer times, the curated order,
 * the whole decision - is the real thing.
 *
 * EVERY CASE SAYS WHETHER IT IS A REAL TIMETABLE OR A CONSTRUCTED ONE, and that
 * labelling is not decoration. An earlier version had Toulon as the airport with
 * the direct flight from Copenhagen and Nice as the one needing a connection,
 * which is backwards - Nice is the one with the directs - and a reader checking
 * the logic against what they know of the route was left doubting the logic. A
 * boundary probe has to be shaped by the rule it is probing; it must not also
 * pretend to be a fact about a route.
 *
 * It has caught four real defects so far: the promotion order that made the
 * direct-flight preference dead code on all 59 hand-ordered destinations, a
 * nonstop airport being TIMED on a connecting itinerary, and curation
 * overreaching at two different penalties.
 */

import {
  factsFromDurations,
  formatJourneyMinutes,
  rankGateways,
  SHORT_HAUL_FLIGHT_MINUTES,
  SHORT_HAUL_STOP_MUST_SAVE_SHARE,
  STOP_MUST_SAVE_SHARE,
  type GatewayFlightFacts,
} from "../../src/lib/flights/gatewayRanking";

/** Itineraries per airport, as [elapsed minutes, stops]. More than one entry is
 * how a real search comes back, and the point of one case below. */
type Itineraries = Record<string, Array<[minutes: number, stops: number]>>;

type Case = {
  /** REAL: the flight times are roughly what the route really offers, so the
   * answer should match what someone familiar with it would say.
   * CONSTRUCTED: shaped to sit on one side of a threshold. Not a timetable, and
   * not to be read as one. */
  kind: "REAL" | "CONSTRUCTED";
  name: string;
  destination: string;
  itineraries: Itineraries;
  expect: string;
  because: string;
};

const CASES: Case[] = [
  {
    kind: "REAL",
    name: "the reported fault: a shorter drive that costs a change of planes",
    destination: "Courchevel 1850",
    // Copenhagen in December. Geneva and Lyon are nonstop, Chambery is not.
    itineraries: { GVA: [[125, 0]], CMF: [[300, 1]], LYS: [[132, 0]] },
    expect: "GVA",
    because:
      "Chambery is the shortest drive (1h42 against Geneva's 2h49) and the " +
      "longest journey. Reading the transfer alone picks it; reading the whole " +
      "journey does not.",
  },
  {
    kind: "REAL",
    name: "the same fault on the coast: a direct to the FURTHER airport wins",
    destination: "Saint-Tropez",
    /* Copenhagen. Nice has the directs; Toulon is the better airport for the
     * Gulf - 1h00 by road against Nice's 1h35 - but reaching it means a
     * connection. This is the shape Ulrik reported, with the airports the right
     * way round. */
    itineraries: { NCE: [[145, 0]], TLN: [[300, 1]] },
    expect: "NCE",
    because:
      "Nice direct totals 4h00, Toulon with a stop 6h00. Toulon's 35 minutes " +
      "less driving is real and irrelevant here - it is bought with a change of " +
      "planes and two extra hours. Toulon becomes the answer the moment it has " +
      "a direct flight, which is what makes this a ranking rather than a " +
      "standing preference for Nice.",
  },
  {
    kind: "CONSTRUCTED",
    name: "SHORT FLIGHT, a stop saving 32% still loses — short flights need 40%",
    destination: "Saint-Tropez",
    /* Shaped: a 2h direct to Nice against a 1h25 connection to Toulon. The only
     * point is which side of the short-haul bar 32% falls on. */
    itineraries: { NCE: [[120, 0]], TLN: [[85, 1]] },
    expect: "NCE",
    because:
      "Direct 3h35 door to door, stop 2h25 - 32% saved, and it still loses. " +
      "Under four hours in the air a stop has to cut two fifths off the " +
      "journey, because nobody breaks up a short flight to save half an hour. " +
      "THIS IS THE CASE THAT FAILS if the short-haul tier is removed: under the " +
      "flat quarter that preceded it, Toulon won here.",
  },
  {
    kind: "CONSTRUCTED",
    name: "SHORT FLIGHT, a stop saving 64% wins — a high bar, not a ban",
    destination: "Saint-Tropez",
    itineraries: { NCE: [[200, 0]], TLN: [[60, 1]] },
    expect: "TLN",
    because:
      "Direct 4h55, stop 2h00 - 59% saved. A saving that large is worth a " +
      "change of planes even on a short hop, and the concierge is told to say " +
      "it involves one. The direct is 3h20 here, NOT 4h00: at exactly four " +
      "hours the test is `< 240` and this case would quietly measure the " +
      "loose tier while claiming to measure the strict one.",
  },
  {
    kind: "CONSTRUCTED",
    name: "LONG FLIGHT, a stop saving 10% loses",
    destination: "London",
    itineraries: { LGW: [[780, 0]], LHR: [[734, 1]] },
    expect: "LGW",
    because: "Direct 14h25, stop 12h58. A tenth is not worth it at any journey length.",
  },
  {
    kind: "CONSTRUCTED",
    name: "LONG FLIGHT, a stop saving 39% wins on the looser quarter",
    destination: "London",
    itineraries: { LGW: [[780, 0]], LHR: [[480, 1]] },
    expect: "LHR",
    because:
      "Direct 14h25, stop 8h44 - five and three quarter hours off a long day. " +
      "Past a quarter, so it is offered. A rule that always preferred the " +
      "direct would send them the long way round.",
  },
  {
    kind: "CONSTRUCTED",
    name: "a direct airport is TIMED on its direct flight, not on a quicker connection",
    destination: "Saint-Tropez",
    itineraries: { NCE: [[200, 0], [150, 1]], TLN: [[195, 0]] },
    expect: "NCE",
    because:
      "Nice is given a 3h20 direct and a 2h30 connection. The total must be " +
      "built from the 3h20 - that is the flight we would book - giving 4h55 " +
      "against Toulon's 4h15, which curation then settles for Nice, 40 minutes " +
      "being inside its grace. Timing it on the connection would have called " +
      "Nice direct at 4h05 and been wrong about both.",
  },
  {
    kind: "CONSTRUCTED",
    name: "a curated first choice is protected, but not absolutely",
    destination: "Courchevel 1850",
    itineraries: { GVA: [[125, 0]], CMF: [[130, 0]], LYS: [[132, 0]] },
    expect: "CMF",
    because:
      "All three direct, so curation is entitled to settle it - but Chambery's " +
      "3h52 against Geneva's 4h54 is an hour, past the 45-minute grace, so the " +
      "hand-ordered first choice gives way. Nineteen minutes would not have " +
      "moved it. Chambery having a direct from Copenhagen is the constructed " +
      "part: it is largely winter charter, which is why case one answers Geneva.",
  },
  {
    kind: "REAL",
    name: "a car-free village is not an unreachable one",
    destination: "Zermatt",
    itineraries: { GVA: [[125, 0]], ZRH: [[105, 0]], MXP: [[126, 0]] },
    expect: "GVA",
    because:
      "Zermatt allows no cars, which is NOT the same as having no road: the " +
      "transfer drives to the village transfer station and an electric taxi " +
      "covers the last ten minutes. Measured (with that allowance) Geneva is " +
      "3h10, Malpensa 3h09, Zurich 4h00, so door-to-door totals are 5h15, 5h15 " +
      "and 5h45 - Geneva and Malpensa tie and the hand-ordered first choice " +
      "takes it. Zurich is 20 minutes quicker in the air and loses on the road. " +
      "This case read `comparable: false` until Ulrik pointed out that " +
      "ZERO_RESULTS from a routing engine is not a fact about the place.",
  },
  {
    kind: "REAL",
    name: "genuinely no road: nothing is totalled and no figure is claimed",
    destination: "Koh Yao Yai",
    itineraries: { HKT: [[660, 1]], KBV: [[690, 1]] },
    expect: "HKT",
    because:
      "An island in Phang Nga Bay with no causeway from either airport, so " +
      "there is no door-to-door total to rank on and `comparable` must be " +
      "false. The order falls back to flying time. An answer here says the " +
      "transfer will be confirmed rather than describing a boat nobody checked.",
  },
];

let failed = 0;
const fail = (line: string) => {
  console.log(`      ! ${line}`);
  failed += 1;
};

console.log(
  `\na stop must cut ${Math.round(STOP_MUST_SAVE_SHARE * 100)}% off the whole journey to be offered` +
    ` — ${Math.round(SHORT_HAUL_STOP_MUST_SAVE_SHARE * 100)}% when the best direct flight is under ` +
    `${SHORT_HAUL_FLIGHT_MINUTES / 60} hours`
);

for (const testCase of CASES) {
  const facts: Record<string, GatewayFlightFacts> = Object.fromEntries(
    Object.entries(testCase.itineraries).map(([iata, list]) => [
      iata,
      factsFromDurations(list.map(([minutes, stops]) => ({ minutes, stops }))),
    ])
  );
  const result = rankGateways(testCase.destination, facts);
  const winner = result.best?.iata ?? "(none)";
  const ok = winner === testCase.expect;
  if (!ok) failed += 1;

  console.log(
    `\n${ok ? "PASS" : "FAIL"}  [${testCase.kind}] ${testCase.destination} — ${testCase.name}`
  );
  console.log(
    `      expected ${testCase.expect}, got ${winner}` +
      `    whole journey? ${result.comparable}` +
      `    a stop needed ${Math.round(result.stopMustSave * 100)}%${
        result.shortHaulFlights ? " (short flight)" : ""
      }`
  );

  for (const g of result.ranked) {
    console.log(
      `      ${g.rank}. ${g.iata} ${g.recommended ? "<=" : "  "} ` +
        `air ${formatJourneyMinutes(g.flightMinutes) || "-"}` +
        ` ${!g.flies ? "no service" : g.nonstop ? "direct" : `${g.minStops} stop`}` +
        ` + ${
          g.transferMinutes === null
            ? `no drive time (${g.transferBasis})`
            : formatJourneyMinutes(g.transferMinutes) + " road"
        }` +
        ` = ${formatJourneyMinutes(g.totalMinutes) || "unknown"}` +
        `${
          g.effectiveMinutes !== null && !g.nonstop
            ? ` (scored as ${formatJourneyMinutes(g.effectiveMinutes)})`
            : ""
        }`
    );
  }
  console.log(`      ${testCase.because}`);
}

/* Properties the chosen airport cannot demonstrate on its own, so they are
 * asserted directly. Each is a mistake already made once, or a rule whose
 * failure would be invisible in a winner. */

// 1. A candidate with a direct flight must never be timed on a faster connection.
{
  const r = rankGateways("Saint-Tropez", {
    NCE: factsFromDurations([
      { minutes: 200, stops: 0 },
      { minutes: 150, stops: 1 },
    ]),
  });
  const nce = r.ranked[0];
  if (nce.flightMinutes !== 200) {
    fail(
      `Nice timed at ${nce.flightMinutes} minutes; its direct is 200 and that is the flight we would book`
    );
  }
  if (nce.fastestFlightMinutes !== 150) {
    fail("the quickest itinerary of any kind should still be reported as 150");
  }
}

// 2. Curation must not demote a direct flight, however close the margin. Nice is
//    Saint-Tropez's curated first choice and lands inside the grace here.
{
  const r = rankGateways("Saint-Tropez", {
    NCE: factsFromDurations([{ minutes: 240, stops: 1 }]),
    TLN: factsFromDurations([{ minutes: 300, stops: 0 }]),
  });
  if (!r.best?.nonstop) {
    fail(`curation promoted ${r.best?.iata} with a stop over a direct flight`);
  }
}

// 3. The tier comes from the best DIRECT flight, not from the connection being
//    judged. A 2h direct against a 6h connection is a short-haul comparison;
//    reading the connection would have applied the loose rule to it.
{
  const r = rankGateways("Saint-Tropez", {
    NCE: factsFromDurations([{ minutes: 120, stops: 0 }]),
    TLN: factsFromDurations([{ minutes: 360, stops: 1 }]),
  });
  if (!r.shortHaulFlights || r.stopMustSave !== SHORT_HAUL_STOP_MUST_SAVE_SHARE) {
    fail(`tier read as ${Math.round(r.stopMustSave * 100)}%; a 2h direct makes this a short flight`);
  }
}

// 4. A destination with genuinely no road must produce no total. Checked on a
//    single airport, so the chosen winner cannot mask it.
{
  const r = rankGateways("Koh Yao Yai", {
    HKT: factsFromDurations([{ minutes: 660, stops: 1 }]),
  });
  if (r.comparable || r.ranked[0].totalMinutes !== null) {
    fail("Koh Yao Yai produced a door-to-door total, and there is no road to it");
  }
  if (r.ranked[0].transferBasis !== "no-road-route") {
    fail(`Koh Yao Yai's transfer reads as ${r.ranked[0].transferBasis}, not no-road-route`);
  }
}

// 5. With no direct anywhere the tier changes no ordering, but it must not read
//    a long connection as a short flight.
{
  const r = rankGateways("Serengeti", {
    JRO: factsFromDurations([{ minutes: 590, stops: 1 }]),
    MWZ: factsFromDurations([{ minutes: 572, stops: 2 }]),
  });
  if (r.shortHaulFlights) fail("a 9h32 connection was read as a short flight");
  if (r.best?.iata !== "JRO") {
    fail(
      `Serengeti answered ${r.best?.iata}; JRO is the route's arrival airport and both are connections`
    );
  }
}

console.log(failed ? `\n${failed} FAILED\n` : "\nAll cases pass.\n");
process.exitCode = failed ? 1 : 0;
