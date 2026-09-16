import type { RestaurantRecord } from "@/app/restaurants/types";
import { buildAwardsLabel } from "@/app/restaurants/utils";
import {
  SMALL_CARD_ACTION_WIDTH,
  type SmallCardColumns,
} from "@/components/hotels/HotelSmallCard";

/* A restaurant in a result frame, shaped like HotelSmallCard so the landing
 * page's three frames read as one set of results rather than three designs.
 *
 * No image and no price block, and neither is an omission: the restaurants
 * collection carries no photo fields at all (see RestaurantRecord), and
 * restaurants have no availability or rate to fetch. What it does carry —
 * type, cuisine, area, awards — is the whole record, so the card shows the
 * whole record.
 *
 * Labels come from the Restaurants page's own utils, so an award code renders
 * identically here and there.
 *
 * Same three density variants as the hotel card, for the same reason: the
 * landing page can show one, two or three frames side by side. */

const LAYOUT: Record<SmallCardColumns, { clamp: string; pad: string }> = {
  1: { clamp: "line-clamp-3", pad: "min-h-[80px]" },
  2: { clamp: "line-clamp-2", pad: "min-h-[66px]" },
  3: { clamp: "line-clamp-2", pad: "min-h-[58px]" },
};

type Props = {
  restaurant: RestaurantRecord;
  href?: string;
  columns?: SmallCardColumns;
  /** A SaveToTripControl, supplied by the caller — the same arrangement as
   * HotelSmallCard, so the card need not know about trips. Added 2026-09-15 so
   * a restaurant from the concierge's trip can be saved like its hotels and
   * flights. */
  renderSaveControl?: () => React.ReactNode;
};

export default function RestaurantSmallCard({
  restaurant,
  href,
  columns = 1,
  renderSaveControl,
}: Props) {
  const layout = LAYOUT[columns];

  const meta = [restaurant.cuisine, restaurant.local_area, restaurant.city]
    .filter(Boolean)
    .join(" · ");

  const awards = buildAwardsLabel(restaurant);
  const blurb = restaurant.highlights || restaurant.description || "";

  /* Nothing in here may force the card wider than its column.
   *
   * The first version did: the title row was a flex pair of a truncating name
   * and a shrink-0 type badge, and `truncate` cannot shrink a flex child
   * without min-w-0 — so the name kept its full intrinsic width, the badge
   * refused to give any back, and the list grew a horizontal scrollbar
   * (measured at 413px of content in a 329px box).
   *
   * The rule now is: wrap, never clip and never overflow. A long name or a
   * long area line makes the card a line taller, which is the right trade in
   * a column this narrow. */
  const inner = (
    <div className={`flex ${layout.pad} min-w-0 flex-col`}>
      <div className="flex min-w-0 flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <div className="min-w-0 text-base font-light tracking-wide break-words text-[color:var(--oltra-text-primary)]">
          {restaurant.restaurant_name}
        </div>
        {restaurant.restaurant_type ? (
          <div className="text-[10px] uppercase tracking-[0.12em] text-[color:var(--oltra-text-muted)]">
            {restaurant.restaurant_type}
          </div>
        ) : null}
      </div>

      <div className="mt-0.5 min-w-0 text-xs break-words text-[color:var(--oltra-text-muted)]">
        {meta || "—"}
      </div>

      {blurb ? (
        <div
          className={`mt-2 ${layout.clamp} text-xs leading-relaxed text-[color:var(--oltra-text-muted)]`}
        >
          {blurb}
        </div>
      ) : null}

      {awards ? (
        <div className="mt-1.5 min-w-0 text-[11px] break-words text-[color:var(--oltra-text-muted)]">
          {awards}
        </div>
      ) : null}

      {/* Inside the card's link, so a click on the control or its trip picker
          must not follow it — the same guard HotelSmallCard's actions carry. */}
      {renderSaveControl ? (
        <div className="mt-2 flex justify-end" onClick={(e) => e.preventDefault()}>
          {/* The hotel card's action width, so SAVE matches BOOK and SAVE
              there; the caller's control fills it (oltra-btn--block). */}
          <div className={SMALL_CARD_ACTION_WIDTH[columns]}>{renderSaveControl()}</div>
        </div>
      ) : null}
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
