import type { HotelRecord } from "@/lib/directus";
import { hotelAccoladeTier } from "@/lib/hotels/cardHelpers";

export default function AccoladeBadge({ hotel }: { hotel: HotelRecord }) {
  const tier = hotelAccoladeTier(hotel);
  if (!tier) return null;

  return (
    <div
      className={[
        "oltra-status-badge",
        tier === "gold" ? "oltra-status-badge--gold" : "oltra-status-badge--silver",
      ].join(" ")}
    >
      {tier === "gold" ? "Top Accolades" : "Highly Accredited"}
    </div>
  );
}
