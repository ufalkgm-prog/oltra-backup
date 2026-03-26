import type { FlightFilters } from "@/app/flights/types";

type Props = {
  filters: FlightFilters;
};

export default function FlightsFilterRail({ filters }: Props) {
  const chips = [
    filters.trustedAirlinesOnly ? "Trusted airlines" : null,
    filters.directOnly ? "Direct only" : `Max ${filters.maxStops} stop`,
    filters.noOvernightLayovers ? "No overnight layovers" : null,
    filters.noAirportChange ? "No airport change" : null,
    "Flex dates",
    "Morning departure",
    "Protected connections",
  ].filter(Boolean);

  return (
    <section className="oltra-glass oltra-panel filters-card">
      <div className="filters-card__top">
        <div>
          <p className="eyebrow">Filters</p>
          <h3>Calmer selection tools</h3>
        </div>
        <button type="button" className="ghost-link">
          Reset
        </button>
      </div>

      <div className="filter-chips">
        {chips.map((chip) => (
          <button key={chip} type="button" className="oltra-field filter-chip">
            {chip}
          </button>
        ))}
      </div>
    </section>
  );
}