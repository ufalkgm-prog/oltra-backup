export type InspirePurpose =
  | "beach"
  | "ski"
  | "city_break"
  | "safari"
  | "mountains";

export type InspireMonth =
  | "january"
  | "february"
  | "march"
  | "april"
  | "may"
  | "june"
  | "july"
  | "august"
  | "september"
  | "october"
  | "november"
  | "december";

export type InspireHotelPoint = {
  id: string;
  hotelid: string;
  hotel_name: string;
  lat: number;
  lng: number;
  thumbnail?: string | null;
};

export type InspireCity = {
  id: string;
  city: string;
  country: string;
  region: string;
  lat: number;
  lng: number;
  hotelCount: number;
  hotels: InspireHotelPoint[];
  purposes: InspirePurpose[];
  coastal: boolean;
  ski: boolean;
  monthlyAvgTempC: Record<InspireMonth, number>;
};

export type InspireFilters = {
  originLat: number;
  originLng: number;
  month: InspireMonth;
  maxFlightHours: number;
  purpose: InspirePurpose | "";
};

export type InspireCityMatch = {
  city: InspireCity;
  estimatedFlightHours: number;
  selectedMonthTempC: number;
  purposeScore: number;
};