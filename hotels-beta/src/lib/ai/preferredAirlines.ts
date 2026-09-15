/* THE MEMBER'S PREFERRED AIRLINES LEAD (Ulrik, 2026-09-15), whenever the
 * connection on them is a sensible one. Members pick these by name in Personal
 * Information (a fixed list, PREFERRED_AIRLINE_OPTIONS), and Duffel reports
 * carriers by IATA code, so the names map to codes here; a name not in the map
 * still matches on the carrier's own name. */
const AIRLINE_CODES: Record<string, string> = {
  "air france": "AF",
  "air new zealand": "NZ",
  ana: "NH",
  "american airlines": "AA",
  "austrian airlines": "OS",
  "british airways": "BA",
  "cathay pacific": "CX",
  "delta air lines": "DL",
  emirates: "EK",
  "etihad airways": "EY",
  finnair: "AY",
  iberia: "IB",
  "japan airlines": "JL",
  klm: "KL",
  "korean air": "KE",
  lufthansa: "LH",
  qantas: "QF",
  "qatar airways": "QR",
  sas: "SK",
  "singapore airlines": "SQ",
  swiss: "LX",
  "turkish airlines": "TK",
  "united airlines": "UA",
  "virgin atlantic": "VS",
};

export type PreferredAirline = { name: string; code: string };

export function toPreferredAirlines(names: string[]): PreferredAirline[] {
  return names
    .map((name) => name.trim())
    .filter(Boolean)
    .map((name) => ({ name, code: AIRLINE_CODES[name.toLowerCase()] ?? "" }));
}
