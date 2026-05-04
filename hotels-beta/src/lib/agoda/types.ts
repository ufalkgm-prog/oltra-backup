export type AgodaOccupancy = {
  numberOfAdult: number;
  numberOfChildren: number;
  childrenAges?: number[];
};

export type AgodaAvailabilityRequest = {
  hotelId: number;
  checkInDate: string;
  checkOutDate: string;
  currency: string;
  language?: string;
  occupancy: AgodaOccupancy;
};

export type AgodaBatchAvailabilityRequest = {
  hotelIds: number[];
  checkInDate: string;
  checkOutDate: string;
  currency: string;
  language?: string;
  occupancy: AgodaOccupancy;
};

export type AgodaHotelResult = {
  hotelId: number;
  hotelName: string;
  roomtypeName?: string;
  starRating: number;
  reviewScore: number;
  reviewCount?: number;
  currency: string;
  dailyRate: number;
  crossedOutRate: number;
  discountPercentage: number;
  imageURL: string;
  landingURL: string;
  includeBreakfast: boolean;
  freeWifi: boolean;
};

export type AgodaSearchResponse =
  | {
      results: AgodaHotelResult[];
      error?: never;
    }
  | {
      results?: never;
      error: {
        id: number;
        message: string;
      };
    };