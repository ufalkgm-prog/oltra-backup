import type { FlightSearchState } from "@/app/flights/types";
import { formatDateLabel, travellersLabel } from "@/app/flights/utils";

type Props = {
  search: FlightSearchState;
};

const tripTypes = [
  { key: "one-way", label: "One-way" },
  { key: "return", label: "Return" },
  { key: "round-trip", label: "Round trip" },
] as const;

export default function FlightsSearchBar({ search }: Props) {
  return (
    <section className="oltra-glass oltra-panel flights-search-card">
      <div className="trip-switch">
        {tripTypes.map((item) => {
          const active = search.tripType === item.key;
          return (
            <button
              key={item.key}
              type="button"
              className={`trip-switch__item ${active ? "is-active" : ""}`}
            >
              {item.label}
            </button>
          );
        })}
      </div>

      <div className="flights-search-grid">
        <div className="oltra-field search-field search-field--large">
          <span className="search-label">From</span>
          <span className="search-value">{search.from}</span>
        </div>

        <div className="oltra-field search-field search-field--large">
          <span className="search-label">To</span>
          <span className="search-value">{search.to}</span>
        </div>

        <div className="oltra-field search-field">
          <span className="search-label">Depart</span>
          <span className="search-value">{formatDateLabel(search.departDate)}</span>
        </div>

        <div className="oltra-field search-field">
          <span className="search-label">Return</span>
          <span className="search-value">{formatDateLabel(search.returnDate)}</span>
        </div>

        <div className="oltra-field search-field">
          <span className="search-label">Travellers</span>
          <span className="search-value">
            {travellersLabel(search.adults, search.children, search.infants)}
          </span>
        </div>

        <div className="oltra-field search-field">
          <span className="search-label">Cabin</span>
          <span className="search-value">{search.cabin}</span>
        </div>

        <button type="button" className="oltra-button-primary search-submit">
          Search
        </button>
      </div>
    </section>
  );
}