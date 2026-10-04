"use client";

import type { HotelRecord } from "@/lib/directus";
import FavouriteStar from "@/components/members/FavouriteStar";
import { useCurrency } from "@/lib/currency/useCurrency";
import {
  getHotelImageAtWidth,
  HOTEL_CARD_PLACEHOLDERS,
  hasHotelPhotos,
} from "@/lib/hotels/cardHelpers";
import { recordBookClick } from "@/lib/members/bookClicks";
import { offsiteHandoff, sellsThroughRatehawk } from "@/lib/hotels/bookingPartner";
import HotelBookButton from "@/components/hotels/HotelBookButton";

export type SmallCardAvailability =
  | { status: "loading" }
  | {
      status: "available";
      currency: string;
      /** Whole-stay total, matching the Hotels page's result cards — not a
       * nightly rate (which is what the old Agoda source returned). */
      pricePerStay: number;
    }
  | { status: "unavailable" }
  | { status: "no-id" }
  | { status: "idle" }
  | { status: "error" }
  /** Why there is no price, when that is known in advance ("Up to 30 nights"). */
  | { status: "note"; text: string };

/** How many result frames are sharing the row this card sits in.
 *
 * The landing page can now show hotels, flights and restaurants side by side,
 * so the same card has to read cleanly at roughly 1200px, 590px and 380px. It
 * is a DENSITY switch and nothing else: every variant shows the same fields,
 * from the same data, with the same actions — only the image size, the column
 * widths and how many lines the highlights get change. There is no branch here
 * that hides a fact at one width and shows it at another.
 *
 * Defaults to 1, so every existing call site is unaffected. */
export type SmallCardColumns = 1 | 2 | 3;

/* The width of a card's BOOK / SAVE column, per density. Exported so the
 * flight rows and restaurant cards beside these cards give their buttons the
 * same width (Ulrik, 2026-09-16) — every BOOK and SAVE on the landing page
 * lines up with every other. Literal class names, so Tailwind sees them. */
export const SMALL_CARD_ACTION_WIDTH: Record<SmallCardColumns, string> = {
  /* Narrowed from 84/80/74 (Ulrik, 2026-09-28). 60px still holds "SAVED",
     the widest one-line label these columns show. At three frames it is 52px,
     narrowed again the same day, so two fit side by side under the 108px
     photo; "SAVED" and "SAVING" then run into the padding but stay inside the
     rim. */
  1: "w-[64px]",
  2: "w-[62px]",
  3: "w-[52px]",
};

/* TWO ARRANGEMENTS (Ulrik, 2026-09-28). The highlights are shown in full in
 * both, and rooms and nights sit on two lines under the price, with no dash.
 *
 *   1, 2  a column on the right: the price, rooms and nights at the top, BOOK
 *         over SAVE at the foot.
 *   3     the price, then BOOK beside SAVE, under the photo; the name comes
 *         down to the price's 13px. */
const LAYOUT: Record<
  SmallCardColumns,
  {
    grid: string;
    gap: string;
    image: number;
    imageBox: string;
    name: string;
    right: string;
  }
> = {
  1: {
    grid: "grid-cols-[132px_1fr]",
    gap: "gap-3.5",
    image: 132,
    imageBox: "h-20 w-full",
    name: "text-base",
    right: SMALL_CARD_ACTION_WIDTH[1],
  },
  2: {
    grid: "grid-cols-[104px_1fr]",
    gap: "gap-3",
    image: 104,
    imageBox: "h-[66px] w-full",
    name: "text-base",
    right: SMALL_CARD_ACTION_WIDTH[2],
  },
  3: {
    grid: "grid-cols-[108px_1fr]",
    gap: "gap-2.5",
    image: 108,
    imageBox: "h-[70px] w-full",
    name: "text-[13px]",
    right: SMALL_CARD_ACTION_WIDTH[3],
  },
};

/* The two fields the test below reads, and nothing more.
 *
 * Structural rather than `HotelRecord` so the concierge's own card shape
 * (`AiHotelCard`, a narrower projection of the same row) can be passed without
 * a cast — AiResultFrames was casting through `unknown` to call this. */
type SellableFields = {
  ratehawk_status?: string | null;
  ratehawk_hid?: number | string | null;
  booking_partner?: string | null;
};

/** Whether we can price and sell this hotel ourselves — the same test as the
 * concierge's `bookableHere`, both from lib/hotels/bookingPartner.ts. */
export function isBookableHere(hotel: SellableFields): boolean {
  return sellsThroughRatehawk(hotel);
}

/** Hotels we can sell first; the ones that only send the guest to the hotel's
 * own site last (Ulrik, 2026-09-21).
 *
 * A "Book on website" card is a dead end for us and a worse offer for the
 * guest — no price, no rooms, no saving it to a trip with a figure attached —
 * so it belongs at the bottom of any list it appears in rather than sitting
 * between two properties we can actually price.
 *
 * Array.prototype.sort is stable, so this moves those cards to the end and
 * changes nothing else: whatever order the list arrived in — editorial rank,
 * availability, the concierge's own ranking — survives inside both groups. */
export function sellableFirst<T extends SellableFields>(hotels: T[]): T[] {
  return [...hotels].sort((a, b) => Number(isBookableHere(b)) - Number(isBookableHere(a)));
}

/** Whether the card draws a button above SAVE, so callers can stack the pair. */
export function smallCardHasTopAction(
  hotel: HotelRecord,
  href: string | undefined,
  bookingHref: string | null | undefined
): boolean {
  return isBookableHere(hotel) ? Boolean(href) : Boolean(bookingHref);
}

type Props = {
  hotel: HotelRecord;
  /** The Hotels page with this hotel selected. The card links there, and so
   * does BOOK for a hotel we sell — room selection happens on that page. */
  href?: string;
  availability?: SmallCardAvailability;
  /** The hotel's own booking link or website — used ONLY for a hotel we
   * cannot sell, behind the orange-rimmed BOOK. */
  bookingHref?: string | null;
  /** Supplied by the caller so the card doesn't have to know about trips - it
   * is a SaveToTripControl, which owns its own popup picker. */
  renderSaveControl?: () => React.ReactNode;
  /** Frames sharing the row. See SmallCardColumns — density only. */
  columns?: SmallCardColumns;
  /** The member has it as a favourite: a star after the name. Passed by the
   * list, which reads lib/members/favourites.ts once for all its cards. */
  isFavourite?: boolean;
  /** What the price covers, from lib/priceBasis.ts: "2 rooms – 7 nights".
   * The card cannot know the stay or the room count itself. */
  priceBasis?: string;
  /** Lines under the location, before the highlights: Members > Saved trips
   * puts the saved stay's dates and party here. Nothing on the landing page. */
  details?: React.ReactNode;
  /** BOOK passive with this reason, whatever the availability says - a saved
   * trip whose dates have passed. */
  blockedReason?: string | null;
};

export default function HotelSmallCard({
  hotel,
  href,
  availability,
  bookingHref,
  renderSaveControl,
  columns = 1,
  isFavourite = false,
  priceBasis = "",
  details,
  blockedReason,
}: Props) {
  /* The card prices in whatever the member picked in the header, converting
     from the currency the supplier quoted. */
  const { currency: displayCurrency, format: formatMoney } = useCurrency();
  const layout = LAYOUT[columns];
  /* Asked for at twice the drawn width, for a sharp image on dense screens. */
  const img = getHotelImageAtWidth(hotel, layout.image * 2) ?? HOTEL_CARD_PLACEHOLDERS[0];
  const hasPhoto = hasHotelPhotos(hotel);
  const nameAndLocation = [hotel.city, hotel.country].filter(Boolean).join(" · ");

  // A stored property fact, checked before any live result: Ratehawk never
  // sells this hotel, so "No availability" would wrongly read as "sold out".
  const isPassive = hotel.ratehawk_status === "passive";
  /* Booked through another partner (KAYAK, andBeyond): the BOOK pop-up names
     it, and this line says it where the price would be. */
  const handoff = offsiteHandoff(hotel);

  /* At three frames BOOK and SAVE go side by side under the price. */
  const stacked = columns === 3;
  /* Rooms over nights, no dash, in every density (Ulrik, 2026-09-28). */
  const basisLines = !priceBasis ? [] : priceBasis.split(" – ");

  const rightBlock = (() => {
    if (handoff) {
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          {handoff.partner === "andbeyond" ? "Booked with andBeyond" : "Book on the hotel’s website"}
        </div>
      );
    }
    if (isPassive) {
      // Where the price would be, in the "No availability" format (Ulrik,
      // 2026-09-28), with the orange-rimmed BOOK below it. Without a website
      // to send the guest to, the note is all there is to say.
      if (bookingHref) {
        return (
          <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
            Booking not yet possible here – book on website
          </div>
        );
      }
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          Check availability on website
        </div>
      );
    }
    if (!availability) return null;
    if (availability.status === "available") {
      return (
        <div className="flex flex-col items-center justify-center">
          <div className="w-full text-center">
            {/* The member's currency, not the supplier's (Ulrik, 2026-09-21).
                This printed `availability.currency` — whatever Ratehawk quoted
                — so with USD selected the same hotel read "EUR 5,940" on the
                landing page and "USD 6,813" on the Hotels page, which converts.
                Two prices for one hotel. */}
            <div className="text-[13px] font-light leading-tight tracking-wide text-[color:var(--oltra-text-primary)]">
              {displayCurrency} {formatMoney(availability.pricePerStay, availability.currency)}
            </div>
            {basisLines.map((line, i) => (
              <div
                key={i}
                /* leading-tight, as the flight rows' price basis inherits from
                   the price (Ulrik, 2026-09-28): without it each 10px line
                   took the page's fixed 24px line height. */
                className="mt-0.5 text-[10px] uppercase leading-tight tracking-[0.12em] text-[color:var(--oltra-text-muted)]"
              >
                {line}
              </div>
            ))}
          </div>
        </div>
      );
    }
    if (availability.status === "loading") {
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          Checking availability…
        </div>
      );
    }
    if (availability.status === "unavailable") {
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          No availability
        </div>
      );
    }
    if (availability.status === "no-id") {
      return null;
    }
    if (availability.status === "note") {
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          {availability.text}
        </div>
      );
    }
    if (availability.status === "error") {
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          Price check unavailable
        </div>
      );
    }
    return (
      <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
        Select dates
      </div>
    );
  })();

  // The card itself is a link, so everything in the actions column has to
  // cancel the anchor's navigation. stopPropagation alone is not enough:
  // it stops listeners from firing but the browser still runs the anchor's
  // default action for a click anywhere in its subtree. That is why saving a
  // hotel from a trip-picker row used to navigate to the hotel - the picker
  // panel stopped propagation but never called preventDefault. Doing it once
  // here covers the picker panel too, since it renders inside this column.
  // BOOK for a hotel we sell goes to the Hotels page with it selected, where
  // the guest chooses a room — never to the hotel's own site, which is what it
  // used to open. Only a hotel we cannot sell sends the guest away, and says so.
  const bookableHere = isBookableHere(hotel);
  /* A hotel booked elsewhere (KAYAK, andBeyond, or its own website) gets the
     same BOOK as one we sell, and the pop-up names who takes the booking
     (Ulrik, 2026-10-01). It replaced the orange-red-rimmed BOOK of 2026-09-28. */
  const topAction = bookableHere
    ? href
      ? { offsite: false as const, go: () => window.location.assign(href) }
      : null
    : bookingHref
      ? { offsite: true as const }
      : null;
  /* BOOK stays, passive, and says why: no dates chosen yet — for every BOOK,
     the hotel's own website included (Ulrik, 2026-09-28) — or nothing free on
     the dates that were. "idle" is what callers pass without dates. */
  const bookBlockedReason = blockedReason
    ? blockedReason
    : availability?.status === "idle"
      ? "Select dates to book"
      : topAction && !topAction.offsite && availability?.status === "unavailable"
        ? "No availability for these dates"
        : null;

  const actions =
    topAction || renderSaveControl ? (
      <div
        className="flex w-full flex-col gap-1.5"
        onClick={(e) => e.preventDefault()}
      >
        {/* Three frames: side by side under the price, each 52px across the
            108px photo (Ulrik, 2026-09-28). Stacked otherwise. */}
        <div className={stacked ? "grid grid-cols-2 gap-1" : "contents"}>
        {topAction?.offsite && bookingHref ? (
          <HotelBookButton
            title={handoff?.title ?? "Book on the hotel’s website"}
            body={handoff?.body ?? `We can’t book ${hotel.hotel_name?.trim() || "this hotel"} here yet. You book directly on its own website.`}
            href={bookingHref}
            onProceed={() => {
              // Leaving for a partner's or the hotel's own site is still booking intent.
              const hotelId = Number(hotel.id);
              if (Number.isInteger(hotelId) && hotelId > 0) recordBookClick({ kind: "hotel_external", hotelId });
            }}
            blockedReason={bookBlockedReason}
            className={`oltra-btn oltra-btn--condensed oltra-btn--block${
              renderSaveControl && !stacked ? " oltra-btn--stack-top" : ""
            }`}
          />
        ) : topAction && !topAction.offsite ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (bookBlockedReason) return;
              topAction.go();
            }}
            aria-disabled={bookBlockedReason ? true : undefined}
            data-reason={bookBlockedReason ?? undefined}
            /* Sizing lives in .oltra-btn--condensed, not an inline style: the
               Save control below it is rendered by the caller, and the two have
               to match. */
            className={`oltra-btn oltra-btn--condensed oltra-btn--block${
              renderSaveControl && !stacked ? " oltra-btn--stack-top" : ""
            }`}
          >
            BOOK
          </button>
        ) : null}
        {renderSaveControl ? renderSaveControl() : null}
        </div>
      </div>
    ) : null;

  /* In full (Ulrik, 2026-09-28) — no character cap and no line clamp. */
  const highlights = hotel.highlights?.trim() ? (
    <div className="mt-2 text-xs leading-relaxed text-[color:var(--oltra-text-muted)]">
      {hotel.highlights.trim()}
    </div>
  ) : null;

  const inner = (
    <div className={`grid ${layout.grid} ${layout.gap}`}>
      <div className="min-w-0">
        <div className="overflow-hidden rounded-[var(--oltra-radius-md)]">
          {hasPhoto ? (
            /* Plain <img>, as everywhere else supplier photos are drawn: both
               sources already serve the requested size, and next/image would
               re-optimise (and bill) each one again. It also cannot reach the
               Directus proxy — the optimiser fetches server-side with no beta
               cookie, so the middleware redirects it to the login page and the
               image never loads. */
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={img}
              alt=""
              className={`${layout.imageBox} object-cover`}
            />
          ) : (
            <div className={`oltra-photo-placeholder ${layout.imageBox}`}>
              Photos coming soon
            </div>
          )}
        </div>
        {stacked && rightBlock ? <div className="mt-1.5">{rightBlock}</div> : null}
        {/* Three frames: BOOK beside SAVE, under the price. */}
        {stacked && actions ? <div className="mt-2">{actions}</div> : null}
      </div>

      {/* items-baseline: the price sits on the name's first line rather than
          above it (Ulrik, 2026-09-28) — the name has the page's taller line,
          so top alignment set the smaller price higher than the name. */}
      <div
        className={stacked ? "flex min-w-0 flex-col" : `flex min-w-0 items-baseline ${layout.gap}`}
      >
        <div className="flex min-w-0 flex-1 flex-col">
        <div className="min-w-0">
          {/* Two lines, then an ellipsis — the middle ground between the two
              things that were wrong. A single truncated line clipped
              "Mandarin Oriental, Lutetia, Paris" to "Mandarin Ori…", which
              names nothing; unbounded wrapping gave it three lines and pushed
              the price down the card. line-clamp keeps the ellipsis, so a
              longer name still reads as cut off rather than as the whole
              name. */}
          {/* The star beside the clamped name, not inside it: line-clamp
              hides overflow, which would cut the star's popup. */}
          <div className="flex min-w-0 items-baseline">
            <div className={`min-w-0 line-clamp-2 ${layout.name} font-light tracking-wide break-words text-[color:var(--oltra-text-primary)]`}>
              {hotel.hotel_name ?? "Untitled hotel"}
            </div>
            {isFavourite ? <FavouriteStar /> : null}
          </div>
          {/* Wraps rather than truncates: at three frames the column is
              narrow enough for "Sabi Sand Reserve · South Africa" to clip,
              and a card one line taller beats a location you cannot read. */}
          <div className="mt-0.5 min-w-0 text-xs break-words text-[color:var(--oltra-text-muted)]">
            {nameAndLocation || "—"}
          </div>
        </div>

        {details}
        {highlights}
        </div>

        {/* One and two frames: the price with rooms and nights under it at the
            top right, BOOK and SAVE straight under it (Ulrik, 2026-09-28).
            84px so a price like "GBP 12,345" fits on one line and a status
            note wraps rather than widening the column. */}
        {!stacked && (rightBlock || actions) ? (
          <div className="flex w-[84px] shrink-0 flex-col gap-2">
            <div>{rightBlock}</div>
            {actions ? <div className={`self-center ${layout.right}`}>{actions}</div> : null}
          </div>
        ) : null}
      </div>

    </div>
  );

  const className =
    "oltra-output block w-full text-left bg-[var(--oltra-field-bg)] hover:bg-[var(--oltra-field-bg-strong)] transition";

  if (href) {
    return (
      <a href={href} className={className}>
        {inner}
      </a>
    );
  }

  return <div className={className}>{inner}</div>;
}
