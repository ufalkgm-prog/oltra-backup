import type { FlightOption } from "@/app/flights/types";

type Props = {
  flight: FlightOption;
  selected?: boolean;
  compact?: boolean;
};

export default function FlightResultCard({ flight, selected = false, compact = false }: Props) {
  return (
    <article className={`oltra-output flight-card ${selected ? "is-selected" : ""} ${compact ? "is-compact" : ""}`}>
      <div className="flight-card__main">
        <div className="flight-card__head">
          <div>
            {flight.tag ? <span className="flight-tag">{flight.tag}</span> : null}
            <h4>{flight.airlineGroup}</h4>
          </div>
          <div className="flight-score">{flight.score}</div>
        </div>

        <div className="flight-timeline">
          <div className="flight-time-block">
            <strong>{flight.departTime}</strong>
            <span>{flight.departAirport}</span>
          </div>

          <div className="flight-line">
            <span>{flight.duration}</span>
            <div className="flight-line__track" />
            <small>{flight.stopsLabel}</small>
          </div>

          <div className="flight-time-block flight-time-block--right">
            <strong>{flight.arriveTime}</strong>
            <span>{flight.arriveAirport}</span>
          </div>
        </div>

        <p className="flight-meta">{flight.layoverLabel}</p>
      </div>

      <button type="button" className="flight-card__book">
        <span className="flight-card__book-price">{`EUR ${new Intl.NumberFormat("en-GB", { maximumFractionDigits: 0 }).format(flight.price)}`}</span>
        <span className="flight-card__book-label">BOOK</span>
      </button>
    </article>
  );
}