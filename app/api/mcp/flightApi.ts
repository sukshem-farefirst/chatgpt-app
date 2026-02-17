import {
  FlightSummary,
  SearchResponse,
  BASE_URL,
  IS_LIVE,
  // POLL_MAX_ATTEMPTS,
  // POLL_INTERVAL_MS,  
} from "./types";
import { parseDateToAPIFormat, getDefaultDate, extractData } from "./flightUtils";

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

export async function resolveAirport(
  searchTerm: string
): Promise<AirportSuggestion | null> {
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
            market: "IN",
            locale: "en-US",
            searchTerm,
            includedEntityTypes: ["PLACE_TYPE_CITY", "PLACE_TYPE_AIRPORT"],
          },
          limit: 1,
          isDestination: true,
        }),
      }
    );

    if (!res.ok) {
      console.error(`Autosuggest failed: ${res.status}`);
      return null;
    }

    const data = await res.json();
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
    console.error("resolveAirport error:", err);
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
      market: "IN",
      locale: "en-US",
      currency: "INR",
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


// TODO: Re-enable polling when ready.
// Max 3 attempts, each spaced POLL_INTERVAL_MS apart (default 60 s) → 3-min cap.

// async function pollForResults(
//   sessionToken: string,
//   from: string,
//   to: string
// ): Promise<FlightSummary[]> {
//   let lastData: SearchResponse | null = null;
//
//   for (let attempt = 1; attempt <= POLL_MAX_ATTEMPTS; attempt++) {
//     console.log(`Poll attempt ${attempt}/${POLL_MAX_ATTEMPTS}...`);
//
//     if (attempt > 1) {
//       await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
//     }
//
//     const pollRes = await fetch(
//       `${BASE_URL}/live/search/poll?live=${IS_LIVE}&token=${sessionToken}`,
//       {
//         method: "GET",
//         headers: {
//           "Content-Type": "application/json",
//           "x-api-key": "apikey",
//         },
//       }
//     );
//
//     if (!pollRes.ok) {
//       console.error(`Poll attempt ${attempt} failed with status ${pollRes.status}`);
//       continue;
//     }
//
//     const pollData: SearchResponse = await pollRes.json();
//     lastData = pollData;
//
//     const status = pollData.status ?? pollData.content?.status ?? "";
//     console.log(`Poll status: ${status}`);
//
//     if (status === "RESULT_STATUS_COMPLETE") {
//       console.log("Poll complete – extracting results");
//       return extractData(pollData, from, to);
//     }
//
//     if (attempt === POLL_MAX_ATTEMPTS && pollData.content?.results) {
//       console.log("Max poll attempts reached – using partial results");
//       return extractData(pollData, from, to);
//     }
//   }
//
//   if (lastData?.content?.results) {
//     return extractData(lastData, from, to);
//   }
//
//   return [];
// }

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
      deeplink:"https://farefirst.com"
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
            deeplink:"https://farefirst.com"

    },
  ];
}

export async function fetchFlights(
  from: string = "BLR",
  to: string = "DEL",
  date: string = getDefaultDate(),
  adults: number = 1,
  children: number = 0,
  cabinClass: string = "CABIN_CLASS_ECONOMY",
  fromEntityId?: string,
  toEntityId?: string,
): Promise<FlightSearchResult> {
  try {
    console.log("=== Flight Search Request ===");
    console.log(`From: ${from} | To: ${to} | Date: ${date}`);
    console.log(`Adults: ${adults} | Children: ${children} | Cabin: ${cabinClass}`);
    console.log(`EntityIds provided — from: ${fromEntityId ?? "none"}, to: ${toEntityId ?? "none"}`);

    let resolvedFromEntityId = fromEntityId;
    let resolvedToEntityId = toEntityId;

    if (!resolvedFromEntityId) {
      console.log(`Resolving origin: "${from}"...`);
      const origin = await resolveAirport(from);
      if (origin) {
        resolvedFromEntityId = origin.entityId;
        console.log(`Origin resolved → ${origin.name} (${origin.iataCode}) | entityId: ${origin.entityId}`);
      } else {
        console.warn(`Could not resolve origin "${from}", falling back to IATA`);
      }
    }

    if (!resolvedToEntityId) {
      console.log(`Resolving destination: "${to}"...`);
      const destination = await resolveAirport(to);
      if (destination) {
        resolvedToEntityId = destination.entityId;
        console.log(`Destination resolved → ${destination.name} (${destination.iataCode}) | entityId: ${destination.entityId}`);
      } else {
        console.warn(`Could not resolve destination "${to}", falling back to IATA`);
      }
    }

    console.log(`Final entityIds — from: ${resolvedFromEntityId ?? from}, to: ${resolvedToEntityId ?? to}`);
    console.log("=============================");

    const payload = createSearchPayload(from, to, date, adults, children, cabinClass, resolvedFromEntityId, resolvedToEntityId);

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
    console.log(`Initial results: ${initialFlights.length} flights`);

    // ── Step 5: Poll disabled – returning initial results directly ──
    // TODO: Re-enable when polling is ready.
    // const status = searchData.status ?? searchData.content?.status ?? "";
    // let finalFlights = initialFlights;
    // if (status !== "RESULT_STATUS_COMPLETE") {
    //   console.log("Results incomplete – starting poll cycle...");
    //   const polledFlights = await pollForResults(searchData.sessionToken, from, to);
    //   finalFlights = polledFlights.length >= initialFlights.length
    //     ? polledFlights
    //     : initialFlights;
    // }

    console.log(`Final flight count: ${initialFlights.length}`);
    
    return {
      flights: initialFlights,
      fromEntityId: resolvedFromEntityId,
      toEntityId: resolvedToEntityId,
    };
  } catch (error) {
    console.error("fetchFlights error – using fallback data:", error);
    return { flights: fallbackFlights(from, to) };
  }
}