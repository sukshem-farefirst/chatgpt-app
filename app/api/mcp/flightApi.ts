import { FlightSummary, SearchResponse, BASE_URL, IS_LIVE } from "./types";
import {
  parseDateToAPIFormat,
  getDefaultDate,
  extractData,
} from "./flightUtils";

export interface AirportSuggestion {
  entityId: string;
  iataCode: string;
  name: string;
  cityName: string;
  countryName: string;
  type: string;
}

export interface FlightSearchResult {
  flights: FlightSummary[];
  fromEntityId?: string;
  toEntityId?: string;
}

type PlaceId = { iata: string } | { entityId: string };

const COUNTRY_CURRENCY: Record<string, string> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  AE: "AED",
  AU: "AUD",
  CA: "CAD",
  SG: "SGD",
  EU: "EUR",
  DE: "EUR",
  FR: "EUR",
  IT: "EUR",
  ES: "EUR",
  NL: "EUR",
  JP: "JPY",
  CN: "CNY",
  HK: "HKD",
  MY: "MYR",
  TH: "THB",
  NZ: "NZD",
  ZA: "ZAR",
  CH: "CHF",
  SE: "SEK",
  NO: "NOK",
  DK: "DKK",
  PL: "PLN",
  MX: "MXN",
  BR: "BRL",
  AR: "ARS",
  NG: "NGN",
  KE: "KES",
  PH: "PHP",
  ID: "IDR",
  VN: "VND",
  PK: "PKR",
  BD: "BDT",
  LK: "LKR",
  NP: "NPR",
};

export function getCurrencyForCountry(userCountry: string): string {
  return COUNTRY_CURRENCY[userCountry.toUpperCase()] ?? "USD";
}

export async function resolveAirport(
  searchTerm: string,
  suggestMarket: "IN" | "US" = "IN",
): Promise<AirportSuggestion | null> {
  try {
    const res = await fetch(`https://super.staging.net.in/api/v1/ss/v3/autosuggest/flights?live=true`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        "x-api-key": "SSZbsPSLJKxYqHCQDHvOG6EnhZZFG4TTSI",
      },
      body: JSON.stringify({
        query: {
          market: suggestMarket,
          locale: "en-US",
          searchTerm,
          includedEntityTypes: ["PLACE_TYPE_CITY", "PLACE_TYPE_AIRPORT"],
        },
        limit: 7,
        isDestination: true,
      }),
    });

    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      console.error(`[resolveAirport] Autosuggest failed (market:${suggestMarket}): ${res.status} ${errText}`);
      return null;
    }

    const data = await res.json();
    console.log(
      `[resolveAirport] market:${suggestMarket} | "${searchTerm}" → ${data?.places?.length ?? 0} result(s) | top: ${data?.places?.[0]?.iataCode ?? "none"}`,
    );

    const place = data?.places?.[0];
    if (!place) return null;

    return {
      entityId: place.entityId,
      iataCode: place.iataCode,
      name: place.name,
      cityName: place.cityName || place.name,
      countryName: place.countryName,
      type: place.type,
    };
  } catch (err) {
    console.error("[resolveAirport] Error:", err);
    return null;
  }
}

function createSearchPayload(
  from: string,
  to: string,
  date: string,
  adults: number,
  children: number,
  cabinClass: string,
  userCountry: string,
  currency: string,
  fromEntityId?: string,
  toEntityId?: string,
) {
  const originPlaceId: PlaceId = fromEntityId
    ? { entityId: fromEntityId }
    : { iata: from };

  const destinationPlaceId: PlaceId = toEntityId
    ? { entityId: toEntityId }
    : { iata: to };

  return {
    query: {
      market: userCountry,
      locale: "en-US",
      currency,
      queryLegs: [
        {
          originPlaceId,
          destinationPlaceId,
          date: parseDateToAPIFormat(date),
        },
      ],
      adults,
      children,
      cabinClass,
    },
  };
}

function fallbackFlights(from: string, to: string): FlightSummary[] {
  return [
    {
      tripType: "Nonstop",
      airline: "IndiGo",
      duration: "2h 40m",
      from,
      to,
      price: "₹3,500",
      priceRaw: 3500,
      departureTime: "07:20",
      arrivalTime: "09:55",
      stops: "Direct",
      stopCount: 0,
      deeplink: "https://farefirst.com",
    },
    {
      tripType: "One Stop",
      airline: "Air India",
      duration: "10h 35m",
      from,
      to,
      price: "₹4,000",
      priceRaw: 4000,
      departureTime: "13:30",
      arrivalTime: "00:05",
      stops: "1 stop",
      stopCount: 1,
      layover: "6h 25m layover in DEL",
      deeplink: "https://farefirst.com",
    },
  ];
}

export async function fetchFlights(
  from: string = "JFK",
  to: string = "DXB",
  date: string = getDefaultDate(),
  adults: number = 1,
  children: number = 0,
  cabinClass: string = "CABIN_CLASS_ECONOMY",
  fromEntityId?: string,
  toEntityId?: string,
  userCountry: string = "US",
): Promise<FlightSearchResult> {
  const currency = getCurrencyForCountry(userCountry);
  console.log(`[fetchFlights] market: ${userCountry} | currency: ${currency}`);

  try {
    let resolvedFromEntityId = fromEntityId;
    let resolvedToEntityId = toEntityId;

    if (!resolvedFromEntityId) {
      const origin = await resolveAirport(from, "IN");
      if (origin) {
        resolvedFromEntityId = origin.entityId;
        console.log(`[fetchFlights] origin: ${from} → ${origin.iataCode} (${origin.entityId})`);
      } else {
        console.warn(`[fetchFlights] could not resolve origin "${from}", falling back to IATA`);
      }
    }

    if (!resolvedToEntityId) {
      const destination = await resolveAirport(to, "US");
      if (destination) {
        resolvedToEntityId = destination.entityId;
        console.log(`[fetchFlights] destination: ${to} → ${destination.iataCode} (${destination.entityId})`);
      } else {
        console.warn(`[fetchFlights] could not resolve destination "${to}", falling back to IATA`);
      }
    }

    console.log(`[fetchFlights] entityIds: from=${resolvedFromEntityId ?? from}, to=${resolvedToEntityId ?? to}`);

    const payload = createSearchPayload(
      from,
      to,
      date,
      adults,
      children,
      cabinClass,
      userCountry,
      currency,
      resolvedFromEntityId,
      resolvedToEntityId,
    );

    console.log(`[fetchFlights] payload: ${JSON.stringify(payload)}`);

    const searchRes = await fetch(`${BASE_URL}/live/search/create?live=${IS_LIVE}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": "SSZbsPSLJKxYqHCQDHvOG6EnhZZFG4TTSI",
      },
      body: JSON.stringify(payload),
    });

    if (!searchRes.ok) {
      const errorText = await searchRes.text().catch(() => "");
      throw new Error(`Search failed: ${searchRes.status} ${errorText}`);
    }

    const searchData: SearchResponse = await searchRes.json();

    if (!searchData?.content?.results) {
      throw new Error("Invalid search response: missing content.results");
    }

    if (!searchData.sessionToken) {
      throw new Error("Invalid search response: missing sessionToken");
    }

    const initialFlights = extractData(searchData, from, to);
    console.log(`[fetchFlights] flight count: ${initialFlights.length}`);

    return {
      flights: initialFlights,
      fromEntityId: resolvedFromEntityId,
      toEntityId: resolvedToEntityId,
    };
  } catch (error) {
    console.error("[fetchFlights] error – using fallback data:", error);
    return { flights: fallbackFlights(from, to) };
  }
}