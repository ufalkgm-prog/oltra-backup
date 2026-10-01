/* WHO SELLS A HOTEL — one answer for every page and the concierge.
 *
 * Since 2026-10-01 every published hotel has a `booking_partner` in Directus
 * (Ulrik): RateHawk, KAYAK, or andBeyond, which is a direct partner. The rule
 * is that a published hotel must be bookable through its partner and carry
 * photos from it, or it is unpublished.
 *
 * Before this the test "can we sell it ourselves" was written out in ten
 * places as `ratehawk_status !== "passive" && ratehawk_hid`. That was wrong for
 * andBeyond lodges, which can hold a RateHawk id without RateHawk being their
 * partner, so they were priced against RateHawk on every search. Everything now
 * asks this file.
 *
 * A row with no partner yet (unpublished hotels, mostly) keeps the old test, so
 * nothing that was not reviewed changes behaviour.
 *
 * RateHawk is shown to guests as ZenHotels: ZenHotels runs the checkout and is
 * merchant of record (§32). The name was settled 2026-10-01.
 */

export type BookingPartner = "ratehawk" | "kayak" | "andbeyond";

type PartnerFields = {
  booking_partner?: string | null;
  ratehawk_status?: string | null;
  ratehawk_hid?: number | string | null;
};

const PARTNERS: readonly BookingPartner[] = ["ratehawk", "kayak", "andbeyond"];

export function bookingPartnerOf(hotel: PartnerFields): BookingPartner | null {
  const stored = hotel.booking_partner;
  if (stored && (PARTNERS as readonly string[]).includes(stored)) return stored as BookingPartner;
  // Not yet given a partner: the pre-2026-10-01 test.
  return hotel.ratehawk_status !== "passive" && Boolean(hotel.ratehawk_hid) ? "ratehawk" : null;
}

/** Whether we price and sell this hotel ourselves, through RateHawk. Only
 * these hotels are sent to RateHawk for rates. */
export function sellsThroughRatehawk(hotel: PartnerFields): boolean {
  return bookingPartnerOf(hotel) === "ratehawk" && Boolean(hotel.ratehawk_hid);
}

/** Sold, but not by RateHawk: another partner, or RateHawk-passive. As
 * opposed to a hotel with no supplier record at all. */
export function soldElsewhere(hotel: PartnerFields): boolean {
  const partner = bookingPartnerOf(hotel);
  return hotel.ratehawk_status === "passive" || (partner !== null && partner !== "ratehawk");
}

/** The name a guest sees for each partner. */
export const PARTNER_NAME: Record<BookingPartner, string> = {
  ratehawk: "ZenHotels",
  kayak: "KAYAK",
  andbeyond: "andBeyond",
};

/* KAYAK's click-out is not built yet (docs/kayak-integration-plan.md): it
 * needs affiliate approval and the integration behind its own flag. Until
 * then a KAYAK hotel books on its own website, and the pop-up says so rather
 * than naming a booking KAYAK cannot take yet. */
export const KAYAK_BOOKING_LIVE = false;

export type PartnerHandoff = {
  partner: BookingPartner;
  /** Pop-up heading. */
  title: string;
  /** One or two sentences under it: who takes the booking. */
  body: string;
};

/** What the BOOK pop-up says for a hotel booked away from myOLTRA (KAYAK or
 * andBeyond). Null for RateHawk, which books here. */
export function offsiteHandoff(hotel: PartnerFields & { hotel_name?: string | null }): PartnerHandoff | null {
  const partner = bookingPartnerOf(hotel);
  const name = hotel.hotel_name?.trim() || "the hotel";
  if (partner === "andbeyond") {
    return {
      partner,
      title: "Book with andBeyond",
      body: `${name} is booked directly with andBeyond, our partner for their lodges. You continue on their website to choose dates and rooms and to pay.`,
    };
  }
  if (partner === "kayak") {
    return KAYAK_BOOKING_LIVE
      ? { partner, title: "Book via KAYAK", body: `You continue to the booking site KAYAK found for ${name}.` }
      : {
          partner,
          title: "Book on the hotel's website",
          body: `Booking ${name} through our partner KAYAK is not open yet. For now you book directly on the hotel's own website.`,
        };
  }
  return null;
}
