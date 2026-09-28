"use client";

import type { HotelRecord } from "@/lib/directus";
import FavouriteStar from "@/components/members/FavouriteStar";
import { useCurrency } from "@/lib/currency/useCurrency";
import {
  getHotelImageAtWidth,
  HOTEL_CARD_PLACEHOLDERS,
  hasHotelPhotos,
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
  /* Narrowed from 84/80/74 (Ulrik, 2026-09-28). 60px still holds "SAVED",
     the widest one-line label these columns show. */
  1: "w-[64px]",
  2: "w-[62px]",
  3: "w-[60px]",
};

/* TWO ARRANGEMENTS (Ulrik, 2026-09-28). In every one the price and what it
 * covers sit under the photo, and the highlights are shown in full.
 *
 *   1, 2  the name runs the full width of the text column; BOOK and SAVE keep
 *         their place on the right but sit at the BOTTOM, so a long name
 *         extends above them rather than being squeezed beside them. "2 rooms –
 *         7 nights" stays on one line under the price.
 *   3     BOOK over SAVE under the price, below the photo, and the
 *         highlights follow the name and location; rooms and nights go on two
 *         lines under the price, without the dash, and the name comes down to
 *         the price's 13px.
 *
 * `basis` sizes the rooms/nights line to its column: at 104px "2 ROOMS – 14
 * NIGHTS" only fits one line at 9px with almost no tracking. */
const LAYOUT: Record<
  SmallCardColumns,
  {
    grid: string;
    gap: string;
    image: number;
    imageBox: string;
    name: string;
    basis: string;
    right: string;
  }
> = {
  1: {
    grid: "grid-cols-[132px_1fr]",
    gap: "gap-3.5",
    image: 132,
    imageBox: "h-20 w-full",
    name: "text-base",
    basis: "whitespace-nowrap text-[10px] tracking-[0.12em]",
    right: SMALL_CARD_ACTION_WIDTH[1],
  },
  2: {
    grid: "grid-cols-[104px_1fr]",
    gap: "gap-3",
    image: 104,
    imageBox: "h-[66px] w-full",
    name: "text-base",
    basis: "whitespace-nowrap text-[9px] tracking-[0.02em]",
    right: SMALL_CARD_ACTION_WIDTH[2],
  },
  3: {
    grid: "grid-cols-[88px_1fr]",
    gap: "gap-2.5",
    image: 88,
    imageBox: "h-[58px] w-full",
    name: "text-[13px]",
    basis: "text-[10px] tracking-[0.12em]",
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

  /* At three frames BOOK and SAVE go under the price, below the photo. */
  const stacked = columns === 3;
  /* "2 rooms – 7 nights" on one line, or rooms over nights with no dash. */
  const basisLines = !priceBasis ? [] : stacked ? priceBasis.split(" – ") : [priceBasis];

  const rightBlock = (() => {
    if (isPassive) {
      // With a website to send the guest to, the caveat sits over the BOOK
      // button in the actions, so it is not repeated here. Without one, the
      // note is all there is to say.
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
            {basisLines.map((line, i) => (
              <div
                key={i}
                className={`mt-0.5 uppercase text-[color:var(--oltra-text-muted)] ${layout.basis}`}
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
  /* A hotel we cannot sell gets an ordinary BOOK, the same size as SAVE, with
     the orange-red rim and the caveat above it in white italic (Ulrik,
     2026-09-28). It replaced a neutral "Book on website" button whose label
     wrapped and made it taller than SAVE. */
  const topAction = bookableHere
    ? href
      ? { offsite: false, go: () => window.location.assign(href) }
      : null
    : bookingHref
      ? {
          offsite: true,
          go: () => window.open(bookingHref, "_blank", "noopener,noreferrer"),
        }
      : null;
  /* Nothing to book on these dates: BOOK stays, passive, and says why. */
  const noAvailability =
    Boolean(topAction && !topAction.offsite) && availability?.status === "unavailable";

  const actions =
    topAction || renderSaveControl ? (
      <div
        className={`flex flex-col gap-1.5 ${stacked ? `mx-auto ${layout.right}` : "w-full"}`}
        onClick={(e) => e.preventDefault()}
      >
        {topAction?.offsite ? (
          <div className="text-center text-[10px] italic leading-tight text-[color:var(--oltra-text-primary)]">
            Booking not yet possible here – book on website
          </div>
        ) : null}
        {topAction ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              if (noAvailability) return;
              topAction.go();
            }}
            aria-disabled={noAvailability || undefined}
            data-reason={noAvailability ? "No availability for these dates" : undefined}
            /* Sizing lives in .oltra-btn--condensed, not an inline style: the
               Save control below it is rendered by the caller, and the two have
               to match. */
            className={`oltra-btn ${
              topAction.offsite ? "oltra-btn--offsite " : ""
            }oltra-btn--condensed oltra-btn--block${
              renderSaveControl ? " oltra-btn--stack-top" : ""
            }`}
          >
            BOOK
          </button>
        ) : null}
        {renderSaveControl ? renderSaveControl() : null}
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
        {rightBlock ? <div className="mt-1.5">{rightBlock}</div> : null}
        {/* Three frames: BOOK over SAVE, under the price. */}
        {stacked && actions ? <div className="mt-2">{actions}</div> : null}
      </div>

      <div className="flex min-w-0 flex-col">
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

        {stacked || !actions ? (
          highlights
        ) : (
          /* flex-1 so this row takes whatever height the card has left, and
             the actions sit at its foot — under a long name, not beside it. */
          <div className={`flex flex-1 ${layout.gap}`}>
            <div className="min-w-0 flex-1">{highlights}</div>
            <div className={`mt-2 flex ${layout.right} shrink-0 flex-col justify-end`}>
              {actions}
            </div>
          </div>
        )}
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
