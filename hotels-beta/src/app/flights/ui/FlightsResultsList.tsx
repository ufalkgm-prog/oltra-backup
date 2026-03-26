import type { FlightOption } from "@/app/flights/types";
import FlightResultCard from "./FlightResultCard";

type Props = {
  title: string;
  subtitle: string;
  flights: FlightOption[];
  selectedId?: string;
};

export default function FlightsResultsList({ title, subtitle, flights, selectedId }: Props) {
  return (
    <section className="oltra-glass oltra-panel results-box">
      <div className="results-box__header">
        <div>
          <p className="eyebrow">{subtitle}</p>
          <h3>{title}</h3>
        </div>
        <button type="button" className="ghost-link">
          View all
        </button>
      </div>

      <div className="results-stack">
        {flights.map((flight) => (
          <FlightResultCard
            key={flight.id}
            flight={flight}
            selected={flight.id === selectedId}
            compact
          />
        ))}
      </div>
    </section>
  );
}