import type { HotelRecord } from "@/lib/directus";
import AccoladeBadge from "./AccoladeBadge";
import {
  getHotelImageSet,
  HOTEL_CARD_PLACEHOLDERS,
  clampHotelText,
} from "@/lib/hotels/cardHelpers";

export type SmallCardAvailability =
  | { status: "loading" }
  | {
      status: "available";
      currency: string;
      dailyRate: number;
      landingURL?: string;
    }
  | { status: "unavailable" }
  | { status: "no-id" }
  | { status: "idle" }
  | { status: "error" };

type Props = {
  hotel: HotelRecord;
  href?: string;
  availability?: SmallCardAvailability;
};

export default function HotelSmallCard({ hotel, href, availability }: Props) {
  const img = getHotelImageSet(hotel)[0] ?? HOTEL_CARD_PLACEHOLDERS[0];
  const nameAndLocation = [hotel.city, hotel.country].filter(Boolean).join(" · ");

  const rightBlock = (() => {
    if (!availability) return null;
    if (availability.status === "available") {
      return (
        <div className="flex w-[100px] shrink-0 flex-col items-end gap-1">
          {availability.landingURL ? (
            <a
              href={availability.landingURL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="oltra-button-primary inline-flex h-7 w-full items-center justify-center px-3 text-[10px] tracking-[0.14em]"
            >
              BOOK
            </a>
          ) : null}
          <div className="w-full text-right">
            <div className="text-[13px] font-light leading-tight tracking-wide text-white">
              {availability.currency}{" "}
              {Math.round(availability.dailyRate).toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-white/48">
              / night
            </div>
          </div>
        </div>
      );
    }
    if (availability.status === "loading") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-white/62">
          Checking Agoda…
        </div>
      );
    }
    if (availability.status === "unavailable") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-white/56">
          Not available on Agoda
        </div>
      );
    }
    if (availability.status === "no-id") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-white/45">
          No Agoda ID
        </div>
      );
    }
    if (availability.status === "error") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-white/55">
          Price check unavailable
        </div>
      );
    }
    return (
      <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-white/45">
        Select dates
      </div>
    );
  })();

  const inner = (
    <div className="grid grid-cols-[132px_1fr_auto] gap-3.5">
      <div>
        <div className="overflow-hidden rounded-[var(--oltra-radius-md)]">
          <img src={img} alt="" className="h-20 w-full object-cover" />
        </div>
      </div>

      <div className="flex min-h-[80px] min-w-0 flex-col">
        <div className="min-w-0">
          <div className="truncate text-base font-light tracking-wide text-white">
            {hotel.hotel_name ?? "Untitled hotel"}
          </div>
          <div className="mt-0.5 text-xs text-white/55">
            {nameAndLocation || "—"}
          </div>
          <div className="mt-1.5">
            <AccoladeBadge hotel={hotel} />
          </div>
        </div>

        {hotel.highlights ? (
          <div className="mt-2 text-xs leading-relaxed text-white/65">
            {clampHotelText(hotel.highlights, 170)}
          </div>
        ) : null}
      </div>

      {rightBlock}
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
