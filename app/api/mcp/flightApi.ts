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

export interface AirportAmbiguous {
  status: "ambiguous";
  airports: AirportSuggestion[];
  message: string;
}

export interface AirportResolved {
  status: "resolved";
  airport: AirportSuggestion;
}

export interface AirportNotFound {
  status: "not_found";
  message: string;
}

export type AirportResolveResult =
  | AirportResolved
  | AirportAmbiguous
  | AirportNotFound;

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
  console.log("BBBB "+userCountry);
  
  return COUNTRY_CURRENCY[userCountry.toUpperCase()] ?? "USD";
}

export async function fetchAirportSuggestions(
  searchTerm: string,
  suggestMarket: "IN" | "US" = "IN",
): Promise<AirportSuggestion[]> {
  try {
    const res = await fetch(
      `https://super.staging.net.in/api/v1/ss/v3/autosuggest/flights?live=true`,
      {
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
      },
    );

    if (!res.ok) {
      return [];
    }

    const data = await res.json();
    const places: AirportSuggestion[] = (data?.places ?? []).map(
      (place: any) => ({
        entityId: place.entityId,
        iataCode: place.iataCode,
        name: place.name,
        cityName: place.cityName || place.name,
        countryName: place.countryName,
        type: place.type,
      }),
    );

    return places;
  } catch (err) {
    return [];
  }
}

export async function resolveAirportWithLogic(
  searchTerm: string,
  suggestMarket: "IN" | "US" = "IN",
): Promise<AirportResolveResult> {
  const allPlaces = await fetchAirportSuggestions(searchTerm, suggestMarket);

  if (allPlaces.length === 0) {
    return {
      status: "not_found",
      message: `Could not find any airport or city matching "${searchTerm}". Please try a more specific name or use the IATA code directly.`,
    };
  }

  if (allPlaces.length === 1) {
    return { status: "resolved", airport: allPlaces[0] };
  }

  const exactIataMatch = allPlaces.find(
    (p) =>
      p.iataCode?.toUpperCase() === searchTerm.trim().toUpperCase() &&
      p.type === "PLACE_TYPE_AIRPORT",
  );
  if (exactIataMatch) {
    return { status: "resolved", airport: exactIataMatch };
  }

  const airportOnlyPlaces = deduplicateByEntityId(
    allPlaces.filter((p) => p.type !== "PLACE_TYPE_CITY"),
  );

  if (airportOnlyPlaces.length === 1) {
    return { status: "resolved", airport: airportOnlyPlaces[0] };
  }

  if (airportOnlyPlaces.length > 1) {
    const airportList = airportOnlyPlaces
      .map(
        (a) =>
          `• ${a.name} (${a.iataCode}) — ${a.cityName}, ${a.countryName} [entityId:${a.entityId}]`,
      )
      .join("\n");

    return {
      status: "ambiguous",
      airports: airportOnlyPlaces,
      message: `There are multiple airports for "${searchTerm}" \n${airportList}`,
    };
  }

  return { status: "resolved", airport: allPlaces[0] };
}

function deduplicateByEntityId(
  places: AirportSuggestion[],
): AirportSuggestion[] {
  const seen = new Set<string>();
  return places.filter((p) => {
    if (seen.has(p.entityId)) return false;
    seen.add(p.entityId);
    return true;
  });
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
      layovers: [],
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
      layovers: [],
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
  console.log(`Country: ${userCountry} | currency: ${currency}`);

  try {
    const resolvedFromEntityId = fromEntityId;
    const resolvedToEntityId = toEntityId;

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

    const searchRes = await fetch(
      `${BASE_URL}/live/search/create?live=${IS_LIVE}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": "SSZbsPSLJKxYqHCQDHvOG6EnhZZFG4TTSI",
        },
        body: JSON.stringify(payload),
      },
    );

    console.log("Payload : "+JSON.stringify(payload));
    

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
    console.log(`flight count: ${initialFlights.length}`);

    return {
      flights: initialFlights,
      fromEntityId: resolvedFromEntityId,
      toEntityId: resolvedToEntityId,
    };
  } catch (error) {
    console.error("error:", error);
    return { flights: fallbackFlights(from, to) };
  }
}
