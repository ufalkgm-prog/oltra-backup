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
  Arenal: {
    arriveAt: "FON",
    arriveAtLabel: "La Fortuna",
    legs: [{ mode: "road", to: "the hotel", arrangedByHotel: true }],
    note:
      "La Fortuna is a short domestic hop from San Jose, or roughly two and a " +
      "half hours by road.",
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
