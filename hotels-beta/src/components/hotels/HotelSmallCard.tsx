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
  const hasPhoto = hasHotelPhotos(hotel);
  const nameAndLocation = [hotel.city, hotel.country].filter(Boolean).join(" · ");

  const rightBlock = (() => {
    if (!availability) return null;
    if (availability.status === "available") {
      return (
        <div className="flex w-[100px] shrink-0 flex-col items-center gap-1">
          {availability.landingURL ? (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                window.open(availability.landingURL, "_blank", "noopener,noreferrer");
              }}
              className="oltra-button-primary w-full"
              style={{ height: "26px", minHeight: "26px", fontSize: "0.66rem", letterSpacing: "0.18em", padding: "0 12px" }}
            >
              BOOK
            </button>
          ) : null}
          <div className="w-full text-center">
            <div className="text-[13px] font-light leading-tight tracking-wide text-[color:var(--oltra-text-primary)]">
              {availability.currency}{" "}
              {Math.round(availability.dailyRate).toLocaleString()}
            </div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--oltra-text-muted)]">
              / night
            </div>
          </div>
        </div>
      );
    }
    if (availability.status === "loading") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          Checking Agoda…
        </div>
      );
    }
    if (availability.status === "unavailable") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
          Not available on Agoda
        </div>
      );
    }
    if (availability.status === "no-id") {
      return null;
    }
    if (availability.status === "error") {
      return (
        <div className="w-[100px] shrink-0 text-right text-[11px] leading-tight text-[color:var(--oltra-text-muted)]">
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
