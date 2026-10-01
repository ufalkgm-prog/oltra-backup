import { test } from "node:test";
import assert from "node:assert/strict";
import { bookingPartnerOf, offsiteHandoff, PARTNER_NAME, sellsThroughRatehawk } from "./bookingPartner.ts";

test("a stored partner wins over RateHawk status", () => {
  // An andBeyond lodge holding a RateHawk id: never priced against RateHawk.
  const lodge = { booking_partner: "andbeyond", ratehawk_status: "not_integrated", ratehawk_hid: 11345712 };
  assert.equal(bookingPartnerOf(lodge), "andbeyond");
  assert.equal(sellsThroughRatehawk(lodge), false);
  assert.equal(sellsThroughRatehawk({ booking_partner: "kayak", ratehawk_status: "passive", ratehawk_hid: 1 }), false);
  assert.equal(sellsThroughRatehawk({ booking_partner: "ratehawk", ratehawk_status: "active", ratehawk_hid: 8473727 }), true);
});

test("RateHawk partner without a hid cannot be priced", () => {
  assert.equal(sellsThroughRatehawk({ booking_partner: "ratehawk", ratehawk_hid: null }), false);
});

test("no partner yet keeps the pre-2026-10-01 rule", () => {
  assert.equal(bookingPartnerOf({ ratehawk_status: "active", ratehawk_hid: 5 }), "ratehawk");
  assert.equal(bookingPartnerOf({ ratehawk_status: null, ratehawk_hid: 5 }), "ratehawk");
  assert.equal(bookingPartnerOf({ ratehawk_status: "passive", ratehawk_hid: 5 }), null);
  assert.equal(bookingPartnerOf({ ratehawk_status: "active", ratehawk_hid: null }), null);
  assert.equal(bookingPartnerOf({ booking_partner: "somebody", ratehawk_status: "active", ratehawk_hid: 5 }), "ratehawk");
});

test("guests see ZenHotels for RateHawk", () => {
  assert.equal(PARTNER_NAME.ratehawk, "ZenHotels");
});

test("pop-up wording per partner", () => {
  const ab = offsiteHandoff({ booking_partner: "andbeyond", hotel_name: "andBeyond Ngala Safari Lodge " });
  assert.equal(ab?.title, "Book with andBeyond");
  assert.match(ab?.body ?? "", /^andBeyond Ngala Safari Lodge is booked directly with andBeyond/);
  // KAYAK is not live: the pop-up must not claim KAYAK takes the booking.
  const ky = offsiteHandoff({ booking_partner: "kayak", hotel_name: "Amanpuri" });
  assert.equal(ky?.title, "Book on the hotel's website");
  assert.match(ky?.body ?? "", /not open yet/);
  assert.equal(offsiteHandoff({ booking_partner: "ratehawk", hotel_name: "x" }), null);
});
