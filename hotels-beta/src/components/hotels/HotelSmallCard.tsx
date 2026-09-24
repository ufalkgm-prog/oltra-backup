"use client";

import type { HotelRecord } from "@/lib/directus";
import { useCurrency } from "@/lib/currency/useCurrency";
import {
  getHotelImageAtWidth,
  HOTEL_CARD_PLACEHOLDERS,
  hasHotelPhotos,
  clampHotelText,
} from "@/lib/hotels/cardHelpers";

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
  1: "w-[84px]",
  2: "w-[80px]",
  3: "w-[74px]",
};

const LAYOUT: Record<
  SmallCardColumns,
  { grid: string; image: number; imageBox: string; body: string; clamp: string; right: string }
> = {
  1: {
    grid: "grid-cols-[132px_1fr_auto] gap-3.5",
    image: 132,
    imageBox: "h-20 w-full",
    body: "min-h-[80px]",
    clamp: "line-clamp-3",
    right: SMALL_CARD_ACTION_WIDTH[1],
  },
  2: {
    grid: "grid-cols-[104px_1fr_auto] gap-3",
    image: 104,
    imageBox: "h-[66px] w-full",
    body: "min-h-[66px]",
    clamp: "line-clamp-2",
    right: SMALL_CARD_ACTION_WIDTH[2],
  },
  3: {
    grid: "grid-cols-[88px_1fr_auto] gap-2.5",
    image: 88,
    imageBox: "h-[58px] w-full",
    body: "min-h-[58px]",
    clamp: "line-clamp-2",
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
};

/** Whether we can price and sell this hotel ourselves — the same test as the
 * concierge's `bookableHere`. */
export function isBookableHere(hotel: SellableFields): boolean {
  return hotel.ratehawk_status !== "passive" && Boolean(hotel.ratehawk_hid);
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
   * cannot sell, as "Book on website". */
  bookingHref?: string | null;
  /** Supplied by the caller so the card doesn't have to know about trips - it
   * is a SaveToTripControl, which owns its own popup picker. */
  renderSaveControl?: () => React.ReactNode;
  /** Frames sharing the row. See SmallCardColumns — density only. */
  columns?: SmallCardColumns;
};

export default function HotelSmallCard({
  hotel,
  href,
  availability,
  bookingHref,
  renderSaveControl,
  columns = 1,
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

  const rightBlock = (() => {
    if (isPassive) {
      // With a website to send the guest to, the caveat is the button label
      // below (one neutral button instead of a note plus BOOK), so it is not
      // repeated here. Without one, the note is all there is to say.
      if (bookingHref) return null;
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
            <div className="mt-0.5 text-[10px] uppercase tracking-[0.12em] text-[color:var(--oltra-text-muted)]">
              total stay
            </div>
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
  const topAction = bookableHere
    ? href
      ? { label: "BOOK", neutral: false, go: () => window.location.assign(href) }
      : null
    : bookingHref
      ? {
          label: "Book on website",
          neutral: true,
          go: () => window.open(bookingHref, "_blank", "noopener,noreferrer"),
        }
      : null;

  const actions =
    topAction || renderSaveControl ? (
      <div
        className="mt-1.5 flex w-full flex-col gap-1.5"
        onClick={(e) => e.preventDefault()}
      >
        {topAction ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              topAction.go();
            }}
            /* Sizing lives in .oltra-btn--condensed, not an inline style: the
               Save control below it is rendered by the caller, and the two have
               to match. A hotel we cannot sell gets the neutral button instead
               of BOOK, carrying its caveat as the label. */
            className={`oltra-btn ${
              topAction.neutral ? "oltra-btn--neutral " : ""
            }oltra-btn--condensed oltra-btn--block${
              renderSaveControl ? " oltra-btn--stack-top" : ""
            }`}
          >
            {topAction.label}
          </button>
        ) : null}
        {/* Stacked, not side by side: the save control opens a trip picker
            panel and needs the full column width to anchor it. */}
        {renderSaveControl ? renderSaveControl() : null}
      </div>
    ) : null;

  const inner = (
    <div className={`grid ${layout.grid}`}>
      <div>
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
      </div>

      <div className={`flex ${layout.body} min-w-0 flex-col`}>
        <div className="min-w-0">
          {/* Two lines, then an ellipsis — the middle ground between the two
              things that were wrong. A single truncated line clipped
              "Mandarin Oriental, Lutetia, Paris" to "Mandarin Ori…", which
              names nothing; unbounded wrapping gave it three lines and pushed
              the price down the card. line-clamp keeps the ellipsis, so a
              longer name still reads as cut off rather than as the whole
              name. */}
          <div className="min-w-0 line-clamp-2 text-base font-light tracking-wide break-words text-[color:var(--oltra-text-primary)]">
            {hotel.hotel_name ?? "Untitled hotel"}
          </div>
          {/* Wraps rather than truncates: at three frames the column is
              narrow enough for "Sabi Sand Reserve · South Africa" to clip,
              and a card one line taller beats a location you cannot read. */}
          <div className="mt-0.5 min-w-0 text-xs break-words text-[color:var(--oltra-text-muted)]">
            {nameAndLocation || "—"}
          </div>
        </div>

        {/* Clamped by lines, not by a per-variant character count: the text
            handed in is the same at every width, so a narrow frame shows less
            of it rather than a different string. */}
        {hotel.highlights ? (
          <div
            className={`mt-2 ${layout.clamp} text-xs leading-relaxed text-[color:var(--oltra-text-muted)]`}
          >
            {clampHotelText(hotel.highlights, 170)}
          </div>
        ) : null}
      </div>

      <div className={`flex ${layout.right} shrink-0 flex-col justify-center`}>
        {rightBlock}
        {actions}
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
