import type { FlightOption } from "@/app/flights/types";
import { formatPrice } from "@/lib/flights";

type Props = {
  outbound: FlightOption;
  inbound?: FlightOption | null;
};

export default function FlightDetailPanel({ outbound, inbound }: Props) {
  return (
    <section className="oltra-glass oltra-panel details-card">
      <div className="details-card__header">
        <div>
          <p className="oltra-label">Itinerary</p>
          <h3>Refined itinerary summary</h3>
        </div>
        <div className="details-total">
          <span>Total</span>
          <strong>{formatPrice(inbound ? Math.max(outbound.price, inbound.price) : outbound.price)}</strong>
        </div>
      </div>

      <div className="details-grid">
        <div className="oltra-output detail-box">
          <div className="doltra-output detail-box__head">
            <span className="detail-pill">Departure</span>
            <strong>{outbound.airlineGroup}</strong>
          </div>

          <div className="segment-list">
            {outbound.segments.map((segment) => (
              <div key={segment.flightNo} className="segment-row">
                <div>
                  <strong>{segment.flightNo}</strong>
                  <p>{segment.airline}</p>
                </div>
                <div>
                  <strong>{segment.departTime}</strong>
                  <p>{segment.from}</p>
                </div>
                <div>
                  <strong>{segment.arriveTime}</strong>
                  <p>{segment.to}</p>
                </div>
                <div>
                  <strong>{segment.duration}</strong>
                  <p>{segment.stopLabel ?? "Protected connection"}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="oltra-output detail-box">
          <div className="oltra-output detail-box__head">
            <span className="detail-pill">Return</span>
            <strong>{inbound?.airlineGroup ?? "Select return option"}</strong>
          </div>

          {inbound ? (
            <div className="segment-list">
              {inbound.segments.map((segment) => (
                <div key={segment.flightNo} className="segment-row">
                  <div>
                    <strong>{segment.flightNo}</strong>
                    <p>{segment.airline}</p>
                  </div>
                  <div>
                    <strong>{segment.departTime}</strong>
                    <p>{segment.from}</p>
                  </div>
                  <div>
                    <strong>{segment.arriveTime}</strong>
                    <p>{segment.to}</p>
                  </div>
                  <div>
                    <strong>{segment.duration}</strong>
                    <p>{segment.stopLabel ?? "Protected connection"}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="oltra-output empty-detail-state">
              Return options appear here once an outbound itinerary is selected.
            </div>
          )}
        </div>
      </div>

      <div className="details-actions">
        <button type="button" className="oltra-button-secondary secondary-button">
          Save to trip
        </button>
        <button type="button" className="oltra-button-primary primary-button">
          Continue to partner
        </button>
      </div>
    </section>
  );
}