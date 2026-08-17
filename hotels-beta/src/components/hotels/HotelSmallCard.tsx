import Image from "next/image";
import type { HotelRecord } from "@/lib/directus";
import {
  getHotelImageSet,
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
  | { status: "error" };

type Props = {
  hotel: HotelRecord;
  href?: string;
  availability?: SmallCardAvailability;
  /** Absolute booking URL, or null when the hotel has no bookable link. */
  bookingHref?: string | null;
  /** Supplied by the caller so the card doesn't have to know about trips - it
   * is a SaveToTripControl, which owns its own popup picker. */
  renderSaveControl?: () => React.ReactNode;
};

export default function HotelSmallCard({
  hotel,
  href,
  availability,
  bookingHref,
  renderSaveControl,
}: Props) {
  const img = getHotelImageSet(hotel)[0] ?? HOTEL_CARD_PLACEHOLDERS[0];
  const hasPhoto = hasHotelPhotos(hotel);
  const nameAndLocation = [hotel.city, hotel.country].filter(Boolean).join(" · ");

  // A stored property fact, checked before any live result: Ratehawk never
  // sells this hotel, so "No availability" would wrongly read as "sold out".
  const isPassive = hotel.ratehawk_status === "passive";

  const rightBlock = (() => {
    if (isPassive) {
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
            <div className="text-[13px] font-light leading-tight tracking-wide text-[color:var(--oltra-text-primary)]">
              {availability.currency}{" "}
              {Math.round(availability.pricePerStay).toLocaleString()}
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
    if (availability.status === "error") {
      return (
        <div className="text-center text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          Price check unavailable
        </div>
      );
    }
    return (
      <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
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
  const actions =
    bookingHref || renderSaveControl ? (
      <div
        className="mt-1.5 flex w-full flex-col gap-1.5"
        onClick={(e) => e.preventDefault()}
      >
        {bookingHref ? (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              window.open(bookingHref, "_blank", "noopener,noreferrer");
            }}
            /* Sizing lives in .oltra-button--xs, not an inline style: the Save
               control beside it is rendered by the caller, and the two have to
               match. */
            className="oltra-button-primary oltra-button--xs w-full"
          >
            BOOK
          </button>
        ) : null}
        {/* Stacked, not side by side: the save control opens a trip picker
            panel and needs the full column width to anchor it. */}
        {renderSaveControl ? renderSaveControl() : null}
      </div>
    ) : null;

  const inner = (
    <div className="grid grid-cols-[132px_1fr_auto] gap-3.5">
      <div>
        <div className="overflow-hidden rounded-[var(--oltra-radius-md)]">
          {hasPhoto ? (
            <Image src={img} alt="" width={132} height={80} className="h-20 w-full object-cover" sizes="132px" />
          ) : (
            <div className="oltra-photo-placeholder h-20 w-full">Photos coming soon</div>
          )}
        </div>
      </div>

      <div className="flex min-h-[80px] min-w-0 flex-col">
        <div className="min-w-0">
          <div className="truncate text-base font-light tracking-wide text-[color:var(--oltra-text-primary)]">
            {hotel.hotel_name ?? "Untitled hotel"}
          </div>
          <div className="mt-0.5 text-xs text-[color:var(--oltra-text-muted)]">
            {nameAndLocation || "—"}
          </div>
        </div>

        {hotel.highlights ? (
          <div className="mt-2 text-xs leading-relaxed text-[color:var(--oltra-text-muted)]">
            {clampHotelText(hotel.highlights, 170)}
          </div>
        ) : null}
      </div>

      <div className="flex w-[100px] shrink-0 flex-col justify-center">
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
