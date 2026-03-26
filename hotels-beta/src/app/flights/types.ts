export type TripType = "round-trip" | "one-way" | "return";

export type CabinClass = "Economy" | "Premium Economy" | "Business" | "First";

export type FlightSegment = {
  flightNo: string;
  airline: string;
  from: string;
  to: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  stopLabel?: string;
};

export type FlightOption = {
  id: string;
  direction: "outbound" | "return";
  tag?: "Top pick" | "Best value" | "Fastest";
  airlineGroup: string;
  departAirport: string;
  arriveAirport: string;
  departTime: string;
  arriveTime: string;
  duration: string;
  stopsLabel: string;
  layoverLabel?: string;
  score: number;
  price: number;
  cabin: CabinClass;
  segments: FlightSegment[];
};

export type FlightSearchState = {
  tripType: TripType;
  from: string;
  to: string;
  departDate: string;
  returnDate: string;
  adults: number;
  children: number;
  infants: number;
  cabin: CabinClass;
};

export type FlightFilters = {
  trustedAirlinesOnly: boolean;
  directOnly: boolean;
  noOvernightLayovers: boolean;
  noAirportChange: boolean;
  maxStops: number;
  sort: "top-picks" | "best-value" | "fastest";
};