import type { FlightFilters, FlightOption, FlightSearchState } from "@/app/flights/types";

const outboundOptions: FlightOption[] = [
  {
    id: "out-1",
    direction: "outbound",
    tag: "Top pick",
    airlineGroup: "SAS + Singapore Airlines",
    departAirport: "CPH",
    arriveAirport: "HKT",
    departTime: "09:45",
    arriveTime: "06:10 +1",
    duration: "14h 25m",
    stopsLabel: "1 stop",
    layoverLabel: "Singapore · 1h 20m",
    score: 96,
    price: 1240,
    cabin: "Economy",
    segments: [
      {
        flightNo: "SK975",
        airline: "SAS",
        from: "Copenhagen",
        to: "Singapore",
        departTime: "09:45",
        arriveTime: "04:15 +1",
        duration: "12h 30m",
      },
      {
        flightNo: "SQ726",
        airline: "Singapore Airlines",
        from: "Singapore",
        to: "Phuket",
        departTime: "05:35 +1",
        arriveTime: "06:10 +1",
        duration: "1h 35m",
        stopLabel: "Short protected connection",
      },
    ],
  },
  {
    id: "out-2",
    direction: "outbound",
    tag: "Best value",
    airlineGroup: "Lufthansa + Thai Airways",
    departAirport: "CPH",
    arriveAirport: "HKT",
    departTime: "07:15",
    arriveTime: "23:10",
    duration: "16h 55m",
    stopsLabel: "1 stop",
    layoverLabel: "Munich · 2h 05m",
    score: 91,
    price: 1040,
    cabin: "Economy",
    segments: [
      {
        flightNo: "LH2441",
        airline: "Lufthansa",
        from: "Copenhagen",
        to: "Munich",
        departTime: "07:15",
        arriveTime: "08:50",
        duration: "1h 35m",
      },
      {
        flightNo: "TG925",
        airline: "Thai Airways",
        from: "Munich",
        to: "Phuket",
        departTime: "10:55",
        arriveTime: "23:10",
        duration: "11h 15m",
      },
    ],
  },
  {
    id: "out-3",
    direction: "outbound",
    tag: "Fastest",
    airlineGroup: "Qatar Airways",
    departAirport: "CPH",
    arriveAirport: "HKT",
    departTime: "15:20",
    arriveTime: "08:35 +1",
    duration: "13h 15m",
    stopsLabel: "1 stop",
    layoverLabel: "Doha · 1h 10m",
    score: 89,
    price: 1360,
    cabin: "Economy",
    segments: [
      {
        flightNo: "QR162",
        airline: "Qatar Airways",
        from: "Copenhagen",
        to: "Doha",
        departTime: "15:20",
        arriveTime: "22:50",
        duration: "6h 30m",
      },
      {
        flightNo: "QR842",
        airline: "Qatar Airways",
        from: "Doha",
        to: "Phuket",
        departTime: "00:00 +1",
        arriveTime: "08:35 +1",
        duration: "6h 35m",
      },
    ],
  },
  {
    id: "out-4",
    direction: "outbound",
    airlineGroup: "Emirates",
    departAirport: "CPH",
    arriveAirport: "HKT",
    departTime: "14:10",
    arriveTime: "09:55 +1",
    duration: "16h 45m",
    stopsLabel: "1 stop",
    layoverLabel: "Dubai · 3h 05m",
    score: 84,
    price: 1495,
    cabin: "Economy",
    segments: [
      {
        flightNo: "EK152",
        airline: "Emirates",
        from: "Copenhagen",
        to: "Dubai",
        departTime: "14:10",
        arriveTime: "22:35",
        duration: "6h 25m",
      },
      {
        flightNo: "EK396",
        airline: "Emirates",
        from: "Dubai",
        to: "Phuket",
        departTime: "01:40 +1",
        arriveTime: "09:55 +1",
        duration: "6h 15m",
      },
    ],
  },
];

const returnMatrix: Record<string, FlightOption[]> = {
  "out-1": [
    {
      id: "ret-1a",
      direction: "return",
      tag: "Top pick",
      airlineGroup: "Singapore Airlines + SAS",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "11:55",
      arriveTime: "20:10",
      duration: "15h 15m",
      stopsLabel: "1 stop",
      layoverLabel: "Singapore · 1h 40m",
      score: 95,
      price: 1240,
      cabin: "Economy",
      segments: [
        {
          flightNo: "SQ735",
          airline: "Singapore Airlines",
          from: "Phuket",
          to: "Singapore",
          departTime: "11:55",
          arriveTime: "14:50",
          duration: "1h 55m",
        },
        {
          flightNo: "SK976",
          airline: "SAS",
          from: "Singapore",
          to: "Copenhagen",
          departTime: "16:30",
          arriveTime: "20:10",
          duration: "12h 40m",
        },
      ],
    },
    {
      id: "ret-1b",
      direction: "return",
      tag: "Best value",
      airlineGroup: "Lufthansa + SAS",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "09:05",
      arriveTime: "18:20",
      duration: "16h 15m",
      stopsLabel: "1 stop",
      layoverLabel: "Munich · 2h 10m",
      score: 90,
      price: 1165,
      cabin: "Economy",
      segments: [
        {
          flightNo: "LH781",
          airline: "Lufthansa",
          from: "Phuket",
          to: "Munich",
          departTime: "09:05",
          arriveTime: "16:05",
          duration: "12h 00m",
        },
        {
          flightNo: "SK662",
          airline: "SAS",
          from: "Munich",
          to: "Copenhagen",
          departTime: "18:15",
          arriveTime: "19:20",
          duration: "1h 05m",
        },
      ],
    },
    {
      id: "ret-1c",
      direction: "return",
      tag: "Fastest",
      airlineGroup: "Qatar Airways",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "20:30",
      arriveTime: "07:05 +1",
      duration: "15h 35m",
      stopsLabel: "1 stop",
      layoverLabel: "Doha · 1h 05m",
      score: 89,
      price: 1325,
      cabin: "Economy",
      segments: [
        {
          flightNo: "QR843",
          airline: "Qatar Airways",
          from: "Phuket",
          to: "Doha",
          departTime: "20:30",
          arriveTime: "23:45",
          duration: "7h 15m",
        },
        {
          flightNo: "QR161",
          airline: "Qatar Airways",
          from: "Doha",
          to: "Copenhagen",
          departTime: "00:50 +1",
          arriveTime: "07:05 +1",
          duration: "7h 15m",
        },
      ],
    },
  ],
  "out-2": [
    {
      id: "ret-2a",
      direction: "return",
      tag: "Top pick",
      airlineGroup: "Thai Airways + Lufthansa",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "10:40",
      arriveTime: "18:40",
      duration: "15h 00m",
      stopsLabel: "1 stop",
      layoverLabel: "Bangkok · 1h 35m",
      score: 93,
      price: 1040,
      cabin: "Economy",
      segments: [
        {
          flightNo: "TG218",
          airline: "Thai Airways",
          from: "Phuket",
          to: "Bangkok",
          departTime: "10:40",
          arriveTime: "12:05",
          duration: "1h 25m",
        },
        {
          flightNo: "LH773",
          airline: "Lufthansa",
          from: "Bangkok",
          to: "Copenhagen",
          departTime: "13:40",
          arriveTime: "18:40",
          duration: "12h 00m",
        },
      ],
    },
    {
      id: "ret-2b",
      direction: "return",
      tag: "Best value",
      airlineGroup: "Turkish Airlines",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "22:10",
      arriveTime: "08:55 +1",
      duration: "15h 45m",
      stopsLabel: "1 stop",
      layoverLabel: "Istanbul · 2h 00m",
      score: 88,
      price: 995,
      cabin: "Economy",
      segments: [
        {
          flightNo: "TK173",
          airline: "Turkish Airlines",
          from: "Phuket",
          to: "Istanbul",
          departTime: "22:10",
          arriveTime: "05:15 +1",
          duration: "11h 05m",
        },
        {
          flightNo: "TK1783",
          airline: "Turkish Airlines",
          from: "Istanbul",
          to: "Copenhagen",
          departTime: "07:15 +1",
          arriveTime: "08:55 +1",
          duration: "2h 40m",
        },
      ],
    },
  ],
  "out-3": [
    {
      id: "ret-3a",
      direction: "return",
      tag: "Fastest",
      airlineGroup: "Qatar Airways",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "19:45",
      arriveTime: "06:55 +1",
      duration: "14h 10m",
      stopsLabel: "1 stop",
      layoverLabel: "Doha · 1h 00m",
      score: 94,
      price: 1360,
      cabin: "Economy",
      segments: [
        {
          flightNo: "QR841",
          airline: "Qatar Airways",
          from: "Phuket",
          to: "Doha",
          departTime: "19:45",
          arriveTime: "22:55",
          duration: "7h 10m",
        },
        {
          flightNo: "QR159",
          airline: "Qatar Airways",
          from: "Doha",
          to: "Copenhagen",
          departTime: "23:55",
          arriveTime: "06:55 +1",
          duration: "8h 00m",
        },
      ],
    },
    {
      id: "ret-3b",
      direction: "return",
      tag: "Best value",
      airlineGroup: "Etihad",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "21:20",
      arriveTime: "09:10 +1",
      duration: "16h 50m",
      stopsLabel: "1 stop",
      layoverLabel: "Abu Dhabi · 2h 15m",
      score: 86,
      price: 1195,
      cabin: "Economy",
      segments: [
        {
          flightNo: "EY431",
          airline: "Etihad",
          from: "Phuket",
          to: "Abu Dhabi",
          departTime: "21:20",
          arriveTime: "01:25 +1",
          duration: "8h 05m",
        },
        {
          flightNo: "EY77",
          airline: "Etihad",
          from: "Abu Dhabi",
          to: "Copenhagen",
          departTime: "03:40 +1",
          arriveTime: "09:10 +1",
          duration: "7h 30m",
        },
      ],
    },
  ],
  "out-4": [
    {
      id: "ret-4a",
      direction: "return",
      tag: "Top pick",
      airlineGroup: "Emirates",
      departAirport: "HKT",
      arriveAirport: "CPH",
      departTime: "12:20",
      arriveTime: "21:00",
      duration: "15h 40m",
      stopsLabel: "1 stop",
      layoverLabel: "Dubai · 2h 05m",
      score: 90,
      price: 1495,
      cabin: "Economy",
      segments: [
        {
          flightNo: "EK397",
          airline: "Emirates",
          from: "Phuket",
          to: "Dubai",
          departTime: "12:20",
          arriveTime: "16:40",
          duration: "8h 20m",
        },
        {
          flightNo: "EK151",
          airline: "Emirates",
          from: "Dubai",
          to: "Copenhagen",
          departTime: "18:45",
          arriveTime: "21:00",
          duration: "6h 15m",
        },
      ],
    },
  ],
};

export function getDefaultFlightSearch(): FlightSearchState {
  return {
    tripType: "round-trip",
    from: "Copenhagen (CPH)",
    to: "Phuket (HKT)",
    departDate: "2026-07-04",
    returnDate: "2026-07-15",
    adults: 2,
    children: 0,
    infants: 0,
    cabin: "Economy",
  };
}

export function getDefaultFlightFilters(): FlightFilters {
  return {
    trustedAirlinesOnly: true,
    directOnly: false,
    noOvernightLayovers: true,
    noAirportChange: true,
    maxStops: 1,
    sort: "top-picks",
  };
}

export function getOutboundFlights(_search: FlightSearchState, filters: FlightFilters): FlightOption[] {
  let items = [...outboundOptions];

  if (filters.directOnly) {
    items = items.filter((f) => f.stopsLabel.toLowerCase().includes("direct"));
  }

  if (filters.trustedAirlinesOnly) {
    items = items.filter((f) =>
      ["SAS", "Singapore Airlines", "Lufthansa", "Qatar Airways", "Emirates", "Thai Airways"].some((a) =>
        f.airlineGroup.includes(a),
      ),
    );
  }

  return sortFlights(items, filters.sort);
}

export function getReturnFlights(outboundId: string, filters: FlightFilters): FlightOption[] {
  let items = [...(returnMatrix[outboundId] ?? [])];

  if (filters.directOnly) {
    items = items.filter((f) => f.stopsLabel.toLowerCase().includes("direct"));
  }

  if (filters.trustedAirlinesOnly) {
    items = items.filter((f) =>
      ["SAS", "Singapore Airlines", "Lufthansa", "Qatar Airways", "Emirates", "Thai Airways"].some((a) =>
        f.airlineGroup.includes(a),
      ),
    );
  }

  return sortFlights(items, filters.sort);
}

function sortFlights(items: FlightOption[], sort: FlightFilters["sort"]) {
  if (sort === "best-value") return [...items].sort((a, b) => a.price - b.price);
  if (sort === "fastest") return [...items].sort((a, b) => durationToMinutes(a.duration) - durationToMinutes(b.duration));
  return [...items].sort((a, b) => b.score - a.score);
}

function durationToMinutes(input: string) {
  const match = input.match(/(\d+)h\s+(\d+)m/);
  if (!match) return 9999;
  return Number(match[1]) * 60 + Number(match[2]);
}

export function formatPrice(price: number) {
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(price);
}