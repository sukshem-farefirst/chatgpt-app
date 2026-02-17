export interface FlightSummary {
  tripType: string;
  airline: string;
  duration: string;
  from: string;
  to: string;
  price: string;
  departureTime: string;
  arrivalTime: string;
  stops: string;
  stopCount: number;
  layover?: string;
  priceRaw: number; 
}

export interface SearchResponse {
  sessionToken?: string;
  refreshSessionToken?: string;
  status?: string;
  content?: any;
  action?: any;
  [key: string]: any;
}

export interface DateObj {
  year: number;
  month: number;
  day: number;
}

export const BASE_URL = "https://super.staging.net.in/api/v1/ss/v3/flights";
export const IS_LIVE = true;
export const BOOKING_URL = "https://farefirst.com";
export const RESULTS_URL = "https://staging.net.in/flight-results/";

export const POLL_MAX_ATTEMPTS = 3;
export const POLL_INTERVAL_MS = 60_000;