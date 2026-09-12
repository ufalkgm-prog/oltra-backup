/* How you actually reach a destination, where the arrival airport is not the
 * end of the journey.
 *
 * WHY THIS EXISTS. `cityAirports.ts` answers "which airport serves this
 * destination" and nothing more. For a city hotel that is the whole answer —
 * land, take a taxi. For a reserve or an island it is barely half of one, and
 * the concierge was filling the gap from its own world knowledge: asked how to
 * reach the Masai Mara it named Nairobi and stopped, with no mention of the
 * transfer to Wilson or the light aircraft, which is the part a guest has to
 * book.
 *
 * THE TWO SOURCES DISAGREE ON PURPOSE, and that is the thing to understand
 * before editing either. `cityAirports.ts` deliberately EXCLUDES the Mara
 * lodge airstrip (`MRE`) and North Caicos (`NCA`), because an airport there
 * has to be one an international itinerary can be priced to. This file is the
 * opposite: the airstrip is the destination of the final leg. Neither is wrong;
 * they answer different questions, so do not try to reconcile them.
 *
 * WHY CODE AND NOT A DIRECTUS FIELD. This is per DESTINATION, not per hotel —
 * thirteen hotels share four of the routes below — so a per-hotel field would
 * store the same answer many times and let copies drift apart. It is also
 * small, and a diff is a better review surface for it than a CMS form. If it
 * ever grows to need editors rather than a commit, that is the point to move
 * it.
 *
 * THE GUARANTEE IS STRUCTURAL. `nearestAirport` returns `transfer: null` when
 * a destination is not in this table, and the system prompt forbids inventing
 * one. §50's record is unambiguous that a prompt-only rule of this shape gets
 * skipped, so the model is given nothing to read out rather than being asked
 * not to guess. An invented boat is worse than an admitted gap: a guest can
 * act on it.
 *
 * KEYS match `CITY_AIRPORTS` exactly — the hotel's `city`, or its traveller
 * area for the eight wilderness lodges that have no city (§3).
 *
 * INVARIANT, and the first draft broke it on four entries: `arriveAt` is
 * always an airport `CITY_AIRPORTS` lists for the same key, because that is
 * the airport a flight card prices to. Sabi Sand was written `arriveAt: "JNB"`
 * with a domestic hop to Skukuza — so the concierge would have said "fly into
 * Johannesburg" while the card beside it priced Skukuza. Connecting through a
 * hub is ordinary routing the flight search already shows; it belongs in
 * `note`, not in `legs`. `legs` is strictly what happens AFTER you land at the
 * airport on the ticket.
 */

/** Closed set, for the §50 reason: a described string got invented values
 * until the taxonomy became an enum. */
export type TransferMode =
  | "road"
  | "light aircraft"
  | "domestic flight"
  | "seaplane"
  | "boat"
  | "ferry"
  | "helicopter";

export type TransferLeg = {
  mode: TransferMode;
  /** Where this leg ends, in words a guest would recognise. */
  to: string;
  /** Set only when the leg ends at an airport with a code. */
  toIata?: string;
  /** True when the hotel arranges and usually includes it — for this clientele
   * that changes the answer, not just the detail. */
  arrangedByHotel?: boolean;
};

export type TransferRoute = {
  /** The airport an international itinerary should be priced to. Always a
   * gateway you can actually buy a ticket to, so it agrees with
   * `cityAirports.ts` even where the final leg does not. */
  arriveAt: string;
  arriveAtLabel: string;
  /** In order, from `arriveAt` to the hotel door. */
  legs: TransferLeg[];
  note?: string;
};

/* Populated only where the route is not in reasonable doubt. The candidate
 * list is far longer — 10 destinations where we name a distant gateway and
 * nothing else, and ~93 where no jet-capable airport is listed at all — and
 * the rest are deliberately absent rather than guessed. An absent entry makes
 * the concierge decline; a wrong one makes it confidently misdirect someone. */

/* The Maldives are one shape repeated twenty times, so they get a helper rather
 * than twenty near-identical literals — a reviewer checks the shape once and
 * then only the airport codes.
 *
 * Every arrival is Male. `cityAirports.ts` maps these resorts to their REGIONAL
 * DOMESTIC airport (Dharavandhoo, Maafaru, Villa Maamigili), which is what a
 * ticket prices to and therefore what `arriveAt` must be; the connection at
 * Male is ordinary routing the flight search already shows.
 *
 * What is deliberately NOT claimed per resort: whether the last leg is a
 * seaplane from Male or a domestic flight plus speedboat. It varies by resort
 * and by season, and guessing it per property is exactly the invention this
 * file exists to stop. The note says both and leaves the resort to confirm,
 * which is what a concierge would actually say. */
const MALDIVES_NOTE =
  "Everything routes through Male. From there it is either a seaplane straight " +
  "to the resort or a short domestic flight and a speedboat - the resort " +
  "arranges whichever applies and meets you on arrival.";

function maldives(iata: string, label: string): TransferRoute {
  return {
    arriveAt: iata,
    arriveAtLabel: label,
    legs: [{ mode: "boat", to: "the resort", arrangedByHotel: true }],
    note: MALDIVES_NOTE,
  };
}

export const TRANSFER_ROUTES: Record<string, TransferRoute> = {
  // ---- East Africa: the case that prompted this ----
  "Masai Mara": {
    arriveAt: "NBO",
    arriveAtLabel: "Nairobi Jomo Kenyatta",
    legs: [
      { mode: "road", to: "Wilson Airport, on the other side of Nairobi", toIata: "WIL" },
      { mode: "light aircraft", to: "an airstrip in the reserve" },
      { mode: "road", to: "the camp", arrangedByHotel: true },
    ],
    note:
      "Scheduled light-aircraft flights to the Mara leave from Wilson, not from " +
      "Jomo Kenyatta — the two are different airports and the transfer between " +
      "them is by road.",
  },
  /* THE SERENGETI, four keys for one park (see GATEWAY_OVERRIDE in
   * build-city-airports.mjs for why `city` holds four different values).
   *
   * NOTE HOW THIS DIFFERS FROM THE MARA ABOVE, because the difference is the
   * whole point of writing them separately. The Mara has a hard road leg to
   * Wilson: every scheduled Mara flight leaves from there, so naming it is a
   * fact. The Serengeti does NOT work that way — light aircraft run from
   * Kilimanjaro itself AND from Arusha, depending on the operator and the
   * day. Copying the Mara's shape here would have invented a mandatory
   * hour-long transfer that many guests never make. So the flight is the
   * first leg and Arusha is described in the note as a possibility, which is
   * the honest shape and the reason this is not a copy-paste of the entry
   * above it.
   *
   * The airstrip is deliberately unnamed in the legs. The park has several
   * — Seronera, Sasakwa, Kogatende, Grumeti — and which one a given lodge
   * uses is not in our data for any of the six. Naming one would be a guess a
   * guest could act on, and §51's rule is that a wrong route is worse than a
   * vague one. */
  "Grumeti Game Reserve": {
    arriveAt: "JRO",
    arriveAtLabel: "Kilimanjaro",
    legs: [
      { mode: "light aircraft", to: "an airstrip in the park" },
      { mode: "road", to: "the lodge", arrangedByHotel: true },
    ],
    note:
      "Light aircraft into the Serengeti leave from Kilimanjaro and from " +
      "Arusha, an hour west by road, depending on the operator and the day — " +
      "the lodge arranges that leg with the stay. Mwanza, on Lake Victoria, " +
      "is closer to the western corridor than Kilimanjaro and worth a look " +
      "if it suits your routing.",
  },
  Kirawira: {
    arriveAt: "JRO",
    arriveAtLabel: "Kilimanjaro",
    legs: [
      { mode: "light aircraft", to: "an airstrip in the park" },
      { mode: "road", to: "the lodge", arrangedByHotel: true },
    ],
    note:
      "Light aircraft into the Serengeti leave from Kilimanjaro and from " +
      "Arusha, an hour west by road, depending on the operator and the day — " +
      "the lodge arranges that leg with the stay. Mwanza, on Lake Victoria, " +
      "is closer to the western corridor than Kilimanjaro and worth a look " +
      "if it suits your routing.",
  },
  Serengeti: {
    arriveAt: "JRO",
    arriveAtLabel: "Kilimanjaro",
    legs: [
      { mode: "light aircraft", to: "an airstrip in the park" },
      { mode: "road", to: "the camp", arrangedByHotel: true },
    ],
    note:
      "Light aircraft into the Serengeti leave from Kilimanjaro and from " +
      "Arusha, an hour west by road, depending on the operator and the day — " +
      "the camp arranges that leg with the stay.",
  },
  "Namiri Plains": {
    arriveAt: "JRO",
    arriveAtLabel: "Kilimanjaro",
    legs: [
      { mode: "light aircraft", to: "an airstrip in the park" },
      { mode: "road", to: "the camp", arrangedByHotel: true },
    ],
    note:
      "Light aircraft into the Serengeti leave from Kilimanjaro and from " +
      "Arusha, an hour west by road, depending on the operator and the day — " +
      "the camp arranges that leg with the stay. Namiri Plains sits in the " +
      "eastern plains, a long game drive from the central airstrips.",
  },
  "Amboseli National Park": {
    arriveAt: "NBO",
    arriveAtLabel: "Nairobi Jomo Kenyatta",
    legs: [
      { mode: "road", to: "Wilson Airport, on the other side of Nairobi", toIata: "WIL" },
      { mode: "light aircraft", to: "Amboseli airstrip", toIata: "ASV" },
      { mode: "road", to: "the camp", arrangedByHotel: true },
    ],
  },

  // ---- Rwanda: the negative case, and it matters as much as the others.
  // There is no second airport and no onward flight. Without an entry the
  // model is free to invent one, and a guest waiting for a plane that does
  // not exist is the failure this table is for. ----
  "Volcanoes National Park": {
    arriveAt: "KGL",
    arriveAtLabel: "Kigali",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note: "By road from Kigali — there is no onward flight.",
  },
  Kinigi: {
    arriveAt: "KGL",
    arriveAtLabel: "Kigali",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note: "By road from Kigali — there is no onward flight.",
  },
  Ruhengeri: {
    arriveAt: "KGL",
    arriveAtLabel: "Kigali",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note: "By road from Kigali — there is no onward flight.",
  },

  /* Namibia, and it is the Nairobi shape exactly: Windhoek has two airports and
   * the onward flight leaves from the other one. Adding the WDH gateway
   * override without this would have left the concierge saying "fly to
   * Windhoek" and stopping, 300km short of the lodge - the same gap that
   * started this file. */
  Sesriem: {
    arriveAt: "WDH",
    arriveAtLabel: "Windhoek Hosea Kutako",
    legs: [
      { mode: "road", to: "Eros, Windhoek's second airport", toIata: "ERS" },
      { mode: "light aircraft", to: "the lodge's own airstrip" },
      { mode: "road", to: "the lodge", arrangedByHotel: true },
    ],
    note:
      "Light aircraft to Sossusvlei leave from Eros, a short drive from the " +
      "international terminal. Driving the whole way instead takes about five " +
      "hours.",
  },

  /* Sonop, 360km south of Windhoek and the WEAKEST ENTRY IN THIS FILE — the
   * one to check first if any of these are wrong.
   *
   * Neither this lodge's description nor Sossusvlei's says a word about
   * arriving, so unlike almost every other route here there is no in-data
   * evidence at all. What it rests on instead: Eros is Namibia's light-aircraft
   * hub, which is the same mechanism already encoded for Sesriem in the same
   * country and the same region (both are Hardap), and the lodge sits on a
   * 13,800-acre private reserve with no scheduled service anywhere near it.
   *
   * The road figure is deliberately loose. It is 360km against Sesriem's 302km,
   * much of it gravel, so "the better part of a day" is the honest form of a
   * number I do not have. Worth confirming with Zannier before anyone leans on
   * it. */
  "Sonop Farm": {
    arriveAt: "WDH",
    arriveAtLabel: "Windhoek Hosea Kutako",
    legs: [
      { mode: "road", to: "Eros, Windhoek's second airport", toIata: "ERS" },
      { mode: "light aircraft", to: "the lodge's airstrip" },
      { mode: "road", to: "the camp", arrangedByHotel: true },
    ],
    note:
      "Light aircraft into the southern Namib leave from Eros, a short drive " +
      "from the international terminal. Driving the whole way instead is a long " +
      "haul south - allow the better part of a day.",
  },

  /* Val d'Isere - a NEGATIVE route, and the useful kind. There is no second
   * airport and no onward flight: you land at Geneva and drive. Recorded
   * precisely so the concierge stops hedging about "the transfer" on a leg
   * that is simply a car up a valley.
   *
   * It is also the other half of the Turin fix. The gateway override moved the
   * arrival airport; without this the answer still ended at "fly to Geneva,
   * I'll confirm the transfer", when the drive is the least mysterious part of
   * the journey.
   *
   * `arrangedByHotel` is deliberately unset. Unlike the safari camps, a
   * Tarentaise transfer is as often a shared shuttle or a car the guest books
   * as something the hotel handles, so claiming the hotel arranges it would be
   * wrong for half the properties.
   *
   * The figures are Ulrik's, from checking the route himself: about 175km and
   * three hours. Chambery and Lyon stay in the airport list rather than here —
   * this file answers "how do I get there from the airport", not "which
   * airport", and duplicating that choice in two places is how the two drift
   * apart. */
  "Val d'Isere": {
    arriveAt: "GVA",
    arriveAtLabel: "Geneva",
    legs: [{ mode: "road", to: "the resort" }],
    note:
      "About three hours up the Tarentaise valley, roughly 175km. Shuttle " +
      "buses and private transfers both run through the ski season. There is " +
      "no onward flight - the drive is the whole of it.",
  },

  /* The rest of the Tarentaise, same shape as Val d'Isere above: Geneva, then
   * road, no onward flight.
   *
   * HOW THE DURATIONS WERE ARRIVED AT, because they are weaker than Val
   * d'Isere's and should be treated that way. Val d'Isere's 175km / three
   * hours was checked by Ulrik. These are scaled from it by straight-line
   * distance to Geneva - Val d'Isere 111km, Courchevel 101km, Les Belleville
   * 102km - which lands both at roughly two and a half hours. Consistent
   * arithmetic, not an independently verified figure, so "about" is doing real
   * work in the notes.
   *
   * Les Belleville is a commune spanning three villages at very different
   * heights, and the drive differs by a good half hour between them. It is
   * resolved here rather than left vague because the hotel's own description
   * places it: La Bouitte is "in the hamlet of Saint-Marcel above
   * Saint-Martin-de-Belleville" - the LOWEST of the three, so a shorter climb
   * than Val Thorens. Had we held a Val Thorens property this would need to be
   * two entries, not one.
   *
   * NOT CLAIMED: the train. Moutiers is the railhead for all of these and the
   * ski TGV genuinely serves it, but adding a rail leg here and not to Val
   * d'Isere would make the set inconsistent, and asserting seasonal service is
   * the kind of guess this file exists to avoid. Worth adding to all four
   * together if anyone confirms the timetable. */
  /* Only the 1850 key: Courchevel is filed by altitude level and all ten of
   * our properties are at 1850. A plain "Courchevel" route existed briefly and
   * was removed when the last row without a level was corrected — a fallback
   * key would quietly answer for Moriond or Le Praz, whose drives differ. */
  "Courchevel 1850": {
    arriveAt: "GVA",
    arriveAtLabel: "Geneva",
    legs: [{ mode: "road", to: "the resort" }],
    note:
      "About two and a half hours, roughly 150km - up the Tarentaise and then " +
      "the climb from Moutiers to the 1850 level. Shuttle buses and private " +
      "transfers both run through the ski season, and there is no onward flight.",
  },
  "Les Belleville": {
    arriveAt: "GVA",
    arriveAtLabel: "Geneva",
    legs: [{ mode: "road", to: "the hotel" }],
    note:
      "About two and a half hours, roughly 145km, the last stretch climbing " +
      "from Moutiers to Saint-Martin-de-Belleville. No onward flight.",
  },

  // ---- Botswana ----
  "Okavango Delta": {
    arriveAt: "MUB",
    arriveAtLabel: "Maun",
    legs: [
      { mode: "light aircraft", to: "the camp's own airstrip" },
      { mode: "road", to: "camp", arrangedByHotel: true },
    ],
    note:
      "Maun is the gateway into the Delta and is itself reached by connecting " +
      "flight, most often through Johannesburg. Camps in the Delta have no road " +
      "access.",
  },

  // ---- South Africa ----
  "Sabi Sand Reserve": {
    arriveAt: "SZK",
    arriveAtLabel: "Skukuza",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note: "Skukuza is reached on a connecting flight, most often through Johannesburg.",
  },
  "Kruger National Park": {
    arriveAt: "SZK",
    arriveAtLabel: "Skukuza",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note: "Skukuza is reached on a connecting flight, most often through Johannesburg.",
  },

  // ---- Indian Ocean and Pacific island hops. In each of these the listed
  // airport is a domestic one and the international gateway is a different
  // island; you cannot fly in directly. ----
  "Desroches Island": {
    arriveAt: "SEZ",
    arriveAtLabel: "Seychelles International, Mahé",
    legs: [
      { mode: "domestic flight", to: "Desroches" },
      { mode: "road", to: "the hotel", arrangedByHotel: true },
    ],
  },
  "Bora Bora": {
    arriveAt: "BOB",
    arriveAtLabel: "Bora Bora",
    legs: [{ mode: "boat", to: "the resort", arrangedByHotel: true }],
    note:
      "Bora Bora has no international service — the flight connects through " +
      "Papeete — and the resorts are reached from the airport motu by boat.",
  },
  "Lanai City": {
    arriveAt: "LNY",
    arriveAtLabel: "Lanai",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note: "Lanai is reached on a connecting flight, normally through Honolulu.",
  },
  // ---- Maldives: 20 destinations, one shape. See `maldives()` above. ----
  "Fasmendhoo Island": maldives("DRV", "Dharavandhoo"),
  Kihavah: maldives("DRV", "Dharavandhoo"),
  "Kunfunadhoo Island": maldives("DRV", "Dharavandhoo"),
  "Landaa Giraavaru": maldives("DRV", "Dharavandhoo"),
  Muravandhoo: maldives("DRV", "Dharavandhoo"),
  "Thiladhoo Island": maldives("DRV", "Dharavandhoo"),
  Voavah: maldives("DRV", "Dharavandhoo"),
  Laamu: maldives("KDO", "Kadhdhoo"),
  "Meradhoo Island": maldives("KDM", "Kaadedhdhoo"),
  "Maagau Island": maldives("VAM", "Villa Maamigili"),
  "Rangali Island": maldives("VAM", "Villa Maamigili"),
  "Vommuli Island": maldives("VAM", "Villa Maamigili"),
  Maalifushi: maldives("TMF", "Thimarafushi"),
  Olhuveli: maldives("TMF", "Thimarafushi"),
  "Hurawalhi Island": maldives("NMF", "Maafaru"),
  "Kudadoo Island": maldives("NMF", "Maafaru"),
  "Lhaviyani Atoll": maldives("NMF", "Maafaru"),
  "Medhufaru Island": maldives("NMF", "Maafaru"),
  Randheli: maldives("NMF", "Maafaru"),
  Velaa: maldives("NMF", "Maafaru"),

  // ---- St Barthelemy. All three keys share one answer, and the runway is the
  // reason: at 646m St Jean takes light aircraft only, so nobody flies in
  // directly however long-haul their ticket. ----
  Gustavia: {
    arriveAt: "SBH",
    arriveAtLabel: "St Jean, St Barthelemy",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note:
      "St Jean's runway takes light aircraft only - the last hop is a short " +
      "flight from St Maarten, or the ferry across.",
  },
  "Grand Cul-de-sac": {
    arriveAt: "SBH",
    arriveAtLabel: "St Jean, St Barthelemy",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note:
      "St Jean's runway takes light aircraft only - the last hop is a short " +
      "flight from St Maarten, or the ferry across.",
  },
  "St. Barthelemy": {
    arriveAt: "SBH",
    arriveAtLabel: "St Jean, St Barthelemy",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note:
      "St Jean's runway takes light aircraft only - the last hop is a short " +
      "flight from St Maarten, or the ferry across.",
  },

  // ---- Seychelles. Three different answers off one archipelago, which is why
  // they are separate entries: Anse Kerlan is ON Praslin, Felicite is a further
  // island, and North Island is reached from Mahe. ----
  "Anse Kerlan": {
    arriveAt: "PRI",
    arriveAtLabel: "Praslin",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note: "Praslin is a fifteen-minute domestic flight from Mahe, or about an hour by ferry.",
  },
  "Felicite Island": {
    arriveAt: "PRI",
    arriveAtLabel: "Praslin",
    legs: [{ mode: "boat", to: "Felicite", arrangedByHotel: true }],
    note:
      "Praslin is a fifteen-minute domestic flight from Mahe; the resort boat " +
      "covers the last stretch across to Felicite.",
  },
  "North Island": {
    arriveAt: "SEZ",
    arriveAtLabel: "Seychelles International, Mahe",
    legs: [{ mode: "helicopter", to: "the island", arrangedByHotel: true }],
    note: "A short helicopter flight from Mahe, arranged by the island.",
  },

  // ---- The Grenadines ----
  "Canouan Island": {
    arriveAt: "CIW",
    arriveAtLabel: "Canouan",
    legs: [{ mode: "road", to: "the resort", arrangedByHotel: true }],
    note: "Canouan takes regional flights, most often connecting through Barbados or St Vincent.",
  },
  "Carenage Bay": {
    arriveAt: "CIW",
    arriveAtLabel: "Canouan",
    legs: [{ mode: "road", to: "the resort", arrangedByHotel: true }],
    note: "Canouan takes regional flights, most often connecting through Barbados or St Vincent.",
  },

  /* ---- Marmaris. The gateway was in the wrong country until 2026-09-12. ----
   *
   * Detail from Ulrik, who knows the coast. Two things about it are worth
   * keeping beyond the route itself.
   *
   * THE PROPERTY IS NOT IN THE TOWN. Our one Marmaris hotel is D Maris Bay, out
   * on the Hisaronu bay some 30 minutes west of Marmaris itself - so the
   * measured road time is 1h58 from Dalaman where the town is 1h28. Both are
   * right; they are different places, and the stored figure is to the hotel,
   * which is what a guest is actually asking about.
   *
   * NO FARES HERE, and that is structural rather than an oversight. This note
   * is handed to the model by `nearestAirport`, and §50's guarantee is that the
   * concierge is never given a figure it could quote. Ulrik's transfer price
   * was a useful number and it is deliberately left out; "booked in advance" is
   * the part the guest needs.
   *
   * The Rhodes catamaran is in the note rather than the legs because it is not
   * what happens after you land on the ticket - it is a different way of
   * arriving altogether, and a real one for someone already in the Dodecanese.
   * Bodrum stays out of the note for the standing reason: this file answers how
   * you get there from the airport, not which airport, and holding that choice
   * in two places is how the two drift apart. */
  Marmaris: {
    arriveAt: "DLM",
    arriveAtLabel: "Dalaman",
    legs: [{ mode: "road", to: "the hotel" }],
    note:
      "Dalaman is the gateway - about an hour and a half to Marmaris town and " +
      "closer to two hours on to the bay, where the hotel is. A private " +
      "transfer booked in advance is the straightforward option; the airport " +
      "shuttle buses meet flights but only run as far as the Marmaris bus " +
      "station, which leaves you a taxi short of the door. A car is worth it if " +
      "the plan includes Datca, Bozburun or the Loryma peninsula. Bodrum is a " +
      "second airport and about half an hour further by road, so it is worth it " +
      "only when the flights are much better. If the trip starts in the " +
      "Dodecanese, the catamaran from Rhodes takes about fifty minutes and runs " +
      "most days in season.",
  },

  /* ---- Zermatt. A car-free village is not an unreachable one. ---- 
   *
   * Corrected twice by Ulrik, and both corrections are in the entry. The
   * transfer drives the whole way to Zermatt's own transfer station - Tasch is
   * where you change if you are arriving by TRAIN, not where the road ends -
   * and the last ten minutes are an electric taxi, which is the only kind of
   * vehicle the village allows. The rail alternative exists and is deliberately
   * described as the second-best option rather than omitted: it means handling
   * luggage through a change at Tasch, which is not what this clientele wants
   * after a flight.
   *
   * Geneva is `arriveAt` because it is Zermatt's hand-ordered first airport
   * (§37), and the invariant requires an airport CITY_AIRPORTS lists for the
   * same key. Measured road times, including the allowance past Tasch: Geneva
   * 3h10, Malpensa 3h09, Zurich 4h00 - so the ranking has real numbers here now
   * and no longer treats the village as unreachable by road. */
  Zermatt: {
    arriveAt: "GVA",
    arriveAtLabel: "Geneva",
    legs: [
      { mode: "road", to: "Zermatt's transfer station, at the edge of the village" },
      { mode: "road", to: "the hotel by electric taxi, about ten minutes", arrangedByHotel: true },
    ],
    note:
      "Zermatt allows no petrol cars, so the transfer hands you over to an " +
      "electric taxi at the village transfer station and the hotel takes it " +
      "from there. About three hours up the Rhone valley from Geneva. The train " +
      "via Tasch is the alternative, but it means a change with all your " +
      "luggage and is not usually worth it.",
  },

  // ---- British Virgin Islands. Spanish Town is on Virgin Gorda itself; the
  // other two are private islands off it, so the final leg is by water. ----
  "Spanish Town": {
    arriveAt: "VIJ",
    arriveAtLabel: "Virgin Gorda",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note: "Virgin Gorda is reached on a light-aircraft hop, usually via Tortola or St Thomas.",
  },
  "Necker Island": {
    arriveAt: "VIJ",
    arriveAtLabel: "Virgin Gorda",
    legs: [{ mode: "boat", to: "the island", arrangedByHotel: true }],
    note:
      "Virgin Gorda is reached on a light-aircraft hop via Tortola or St Thomas; " +
      "the island boat meets you there.",
  },
  "Moskito Island": {
    arriveAt: "VIJ",
    arriveAtLabel: "Virgin Gorda",
    legs: [{ mode: "boat", to: "the island", arrangedByHotel: true }],
    note:
      "Virgin Gorda is reached on a light-aircraft hop via Tortola or St Thomas; " +
      "the island boat meets you there.",
  },

  // ---- Elsewhere ----
  "Phinda Private Game Reserve": {
    arriveAt: "MZQ",
    arriveAtLabel: "Mkuze",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note:
      "Mkuze is a light-aircraft transfer from Johannesburg; some guests drive " +
      "up from Durban instead.",
  },
  Gisakura: {
    arriveAt: "KME",
    arriveAtLabel: "Kamembe",
    legs: [{ mode: "road", to: "the lodge", arrangedByHotel: true }],
    note:
      "Kamembe is a short domestic flight from Kigali. Driving from Kigali " +
      "instead takes most of a day.",
  },
  "Con Dao Town": {
    arriveAt: "VCS",
    arriveAtLabel: "Con Dao",
    legs: [{ mode: "road", to: "the resort", arrangedByHotel: true }],
    note: "Con Dao is a short domestic flight, normally from Ho Chi Minh City.",
  },
  "Nihiwatu Beach": {
    arriveAt: "TMC",
    arriveAtLabel: "Tambolaka, Sumba",
    legs: [{ mode: "road", to: "the resort", arrangedByHotel: true }],
    note: "Tambolaka is a short flight from Bali, then about an hour and a half by road.",
  },
  "Karoso Beach": {
    arriveAt: "TMC",
    arriveAtLabel: "Tambolaka, Sumba",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note: "Tambolaka is a short flight from Bali, then about an hour by road.",
  },
  /* Arenal moved from FON to SJO when the airport queue was worked: La Fortuna
   * is an 800m strip, and the route had to move with it or `arriveAt` would no
   * longer be an airport this destination lists — the invariant this file broke
   * once already, on Sabi Sand. The drive is now the whole of the answer. */
  Arenal: {
    arriveAt: "SJO",
    arriveAtLabel: "San Jose Juan Santamaria",
    legs: [{ mode: "road", to: "the hotel" }],
    note:
      "About two and a half hours north-west by road. A short domestic hop to " +
      "La Fortuna is possible instead, and Liberia is the other international " +
      "gateway if it suits your routing better.",
  },
};

function normalizeKey(name: string): string {
  return name.trim().toLowerCase();
}

const LOOKUP: Record<string, TransferRoute> = Object.fromEntries(
  Object.entries(TRANSFER_ROUTES).map(([k, v]) => [normalizeKey(k), v])
);

/** The arrival-to-door route for a destination, or `null` when we do not hold
 * one. `null` is a real answer and must be surfaced as "I don't have it"
 * rather than filled in — see the header. */
export function getTransferRoute(destination: string): TransferRoute | null {
  if (!destination) return null;
  return LOOKUP[normalizeKey(destination)] ?? null;
}

/** True when the onward leg departs from a DIFFERENT airport than the one an
 * international ticket is priced to — the Nairobi/Wilson shape, and the thing
 * the concierge was getting wrong. */
export function hasAirportChange(route: TransferRoute): boolean {
  return route.legs.some((l) => l.toIata !== undefined && l.toIata !== route.arriveAt);
}
