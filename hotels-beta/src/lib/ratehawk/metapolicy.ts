/* ETG hotel policies — `metapolicy_struct` and `metapolicy_extra_info` — as
 * lines a guest can read. ETG's Static Data checklist asks for BOTH to be
 * parsed and displayed (§32); the daily sync stores them on the hotel (§48).
 *
 * Every key and value handled below was measured across all 853 synced hotels
 * on 2026-09-16, not taken from the docs. Rules:
 *
 *  - Amounts are shown exactly as ETG sent them, in their own currency — never
 *    converted, rounded, or folded into a room price.
 *  - An `unspecified` value is left out rather than guessed. A zero price with
 *    no currency states no amount, so it is shown as "charge not specified",
 *    never as "free".
 *  - extra_info is supplier prose, 118 of 761 with HTML (p, ul, li, b, br). It
 *    is reduced to plain paragraphs here, so nothing is ever rendered as HTML.
 */

type Item = Record<string, unknown>;

export type MetapolicySection = { label: string; lines: string[] };

export type HotelPolicies = {
  checkIn: string | null;
  checkOut: string | null;
  sections: MetapolicySection[];
  extraInfo: string[];
};

const UNIT_LABEL: Record<string, string> = {
  per_room_per_night: "per room per night",
  per_room_per_stay: "per room per stay",
  per_guest_per_night: "per guest per night",
  per_guest_per_stay: "per guest per stay",
  per_car_per_night: "per car per night",
  per_car_per_stay: "per car per stay",
  per_hour: "per hour",
};

function str(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

function specified(value: unknown): string {
  const s = str(value);
  return s === "unspecified" ? "" : s;
}

function humanise(value: string): string {
  // ETG's own spellings ("on_side", "off_side") are read as on site / off site.
  const fixed = value.replace(/^on_side$/, "on site").replace(/^off_side$/, "off site");
  return fixed.replace(/_/g, " ");
}

// "EUR 45 per guest per night", "Included", or "charge not specified".
function charge(item: Item): string {
  if (str(item.inclusion) === "included") return "included";
  const price = str(item.price);
  const currency = str(item.currency);
  const unit = UNIT_LABEL[str(item.price_unit)] ?? "";
  if (str(item.pricing_method) === "percent" && price) {
    return [`${price}%`, unit].filter(Boolean).join(" ");
  }
  if (!price || (!currency && Number(price) === 0)) return "charge not specified";
  return [currency, price, unit].filter(Boolean).join(" ");
}

function ageRange(item: Item): string {
  const start = str(item.age_start);
  const end = str(item.age_end);
  if (!end || end === "0") return "";
  return `ages ${start || "0"}–${end}`;
}

function list(struct: Item, key: string): Item[] {
  const value = struct[key];
  return Array.isArray(value) ? value.filter((v): v is Item => Boolean(v) && typeof v === "object") : [];
}

function capitalise(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

export function formatMetapolicyStruct(raw: unknown): MetapolicySection[] {
  if (!raw || typeof raw !== "object") return [];
  const struct = raw as Item;
  const sections: MetapolicySection[] = [];
  const add = (label: string, lines: string[]) => {
    const kept = lines.filter(Boolean);
    if (kept.length) sections.push({ label, lines: kept });
  };

  add(
    "Meals",
    [
      ...list(struct, "meal").map(
        (m) => `${capitalise(humanise(specified(m.meal_type) || "meal"))}: ${charge(m)}`
      ),
      ...list(struct, "children_meal").map((m) => {
        const ages = ageRange(m);
        return `${capitalise(humanise(specified(m.meal_type) || "meal"))} for children${ages ? ` (${ages})` : ""}: ${charge(m)}`;
      }),
    ]
  );

  add(
    "Children and extra beds",
    [
      ...list(struct, "children").map((c) => {
        const ages = ageRange(c);
        const bed = str(c.extra_bed) === "available" ? "extra bed available" : "";
        const price = str(c.price);
        const amount =
          price && str(c.currency) ? `${str(c.currency)} ${price}` : price && Number(price) > 0 ? price : "";
        return [`Children${ages ? ` ${ages}` : ""}`, bed, amount].filter(Boolean).join(": ");
      }),
      ...list(struct, "extra_bed").map((b) => `Extra bed${str(b.amount) ? ` (${str(b.amount)})` : ""}: ${charge(b)}`),
      ...list(struct, "cot").map((c) => `Cot${str(c.amount) ? ` (${str(c.amount)})` : ""}: ${charge(c)}`),
    ]
  );

  add(
    "Deposit",
    list(struct, "deposit").map((d) => {
      const type = specified(d.deposit_type);
      const paid = specified(d.payment_type);
      return `${type ? `${capitalise(humanise(type))} deposit` : "Deposit"}: ${charge(d)}${paid ? `, by ${paid}` : ""}`;
    })
  );

  add(
    "Internet",
    list(struct, "internet").map((i) => {
      const type = specified(i.internet_type);
      const where = specified(i.work_area);
      return `${capitalise(type ? `${humanise(type)} internet` : "Internet")}${where ? ` in the ${where}` : ""}: ${charge(i)}`;
    })
  );

  add(
    "Parking",
    list(struct, "parking").map((p) => {
      const where = specified(p.territory_type);
      return `Parking${where ? ` ${humanise(where)}` : ""}: ${charge(p)}`;
    })
  );

  add(
    "Pets",
    list(struct, "pets").map((p) => {
      const type = specified(p.pets_type);
      return `${type ? capitalise(humanise(type)) : "Pets"}: ${charge(p)}`;
    })
  );

  add(
    "Transfers",
    list(struct, "shuttle").map((s) => {
      const dest = specified(s.destination_type);
      const ways = specified(s.shuttle_type);
      const name = dest === "airport_train" ? "Airport and station shuttle" : dest === "airport" ? "Airport shuttle" : "Shuttle";
      return `${name}${ways ? ` (${humanise(ways)})` : ""}: ${charge(s)}`;
    })
  );

  add(
    "Other fees",
    [
      ...list(struct, "check_in_check_out").map((c) => `Early check-in or late check-out: ${charge(c)}`),
      ...list(struct, "add_fee").map((f) => `${capitalise(humanise(specified(f.fee_type) || "fee"))}: ${charge(f)}`),
    ]
  );

  const noShow = struct.no_show as Item | undefined;
  const visa = struct.visa as Item | undefined;
  add("Good to know", [
    noShow && str(noShow.availability) === "available" && str(noShow.time)
      ? `No-show time: ${str(noShow.time).slice(0, 5)}${specified(noShow.day_period) ? ` (${humanise(specified(noShow.day_period))})` : ""}`
      : "",
    visa && str(visa.visa_support) === "support_enable" ? "Visa support available" : "",
  ]);

  return sections;
}

const ENTITIES: Record<string, string> = {
  "&amp;": "&",
  "&nbsp;": " ",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
};

// Supplier HTML to plain paragraphs. List items keep a bullet; everything else
// loses its markup. The result is rendered as text, never as HTML.
export function formatMetapolicyExtraInfo(raw: unknown): string[] {
  const text = str(raw);
  if (!text) return [];
  return text
    .replace(/<li[^>]*>/gi, "\n• ")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|li|ul|ol|div)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&(amp|nbsp|quot|#39|apos|lt|gt);/g, (m) => ENTITIES[m] ?? m)
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line && line !== "•");
}

// "00:00:00" was reported by 4 hotels and almost certainly means unspecified
// rather than a real midnight check-in (§48), so it is not shown.
export function formatPolicyTime(raw: unknown): string | null {
  const value = str(raw);
  if (!/^\d{2}:\d{2}/.test(value) || value.startsWith("00:00")) return null;
  return value.slice(0, 5);
}
