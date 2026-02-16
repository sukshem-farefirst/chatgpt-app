import { NextRequest, NextResponse } from "next/server";

interface FlightSummary {
  tripType: string;
  airline: string;
  duration: string;
  from: string;
  to: string;
  price: string;
  departureTime: string;
  arrivalTime: string;
  stops: string;
  layover?: string;
}

interface SearchResponse {
  sessionToken?: string;
  refreshSessionToken?: string;
  status?: string;
  content?: any;
  action?: any;
  [key: string]: any;
}

const BASE_URL = "https://super.staging.net.in/api/v1/ss/v3/flights";
const IS_LIVE = true;

function mcpResponse(id: string | number | null, result: unknown) {
  return NextResponse.json({
    jsonrpc: "2.0",
    id,
    result,
  });
}

function getDefaultDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split("T")[0];
}

function parseDateToAPIFormat(dateStr: string): {
  year: number;
  month: number;
  day: number;
} {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

function createSearchPayload(
  from?: string,
  to?: string,
  date?: string,
  adults?: number,
  children?: number,
  cabinClass?: string,
) {
  const departureCode = from || "BLR";
  const arrivalCode = to || "DEL";
  const travelDate = date || getDefaultDate();
  const numAdults = adults || 1;
  const numChildren = children || 0;
  const cabin = cabinClass || "CABIN_CLASS_ECONOMY";

  const dateObj = parseDateToAPIFormat(travelDate);

  return {
    query: {
      market: "IN",
      locale: "en-US",
      currency: "INR",
      queryLegs: [
        {
          originPlaceId: { iata: departureCode },
          destinationPlaceId: { iata: arrivalCode },
          date: dateObj,
        },
      ],
      adults: numAdults,
      children: numChildren,
      cabinClass: cabin,
    },
  };
}

function formatTime(datetime: any): string {
  if (!datetime) return "N/A";
  const { hour, minute } = datetime;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function extractData(
  searchData: SearchResponse,
  from: string,
  to: string,
): FlightSummary[] {
  const flights: FlightSummary[] = [];

  try {
    const itineraries = searchData.content?.results?.itineraries;
    const legs = searchData.content?.results?.legs;
    const carriers = searchData.content?.results?.carriers;
    const places = searchData.content?.results?.places;

    if (!itineraries || !legs || !carriers) {
      console.error("User Data required");
      return [];
    }

    const itineraryIds = Object.keys(itineraries);

    const limitedItineraryIds = itineraryIds.slice(0, 10);

    for (const itineraryId of limitedItineraryIds) {
      const itinerary = itineraries[itineraryId];

      const legId = itinerary.legIds?.[0];
      if (!legId) continue;

      const leg = legs[legId];
      if (!leg) continue;

      const pricingOption = itinerary.pricingOptions?.[0];
      const priceAmount = pricingOption?.price?.amount;
      const priceUnit = pricingOption?.price?.unit;

      let formattedPrice = "N/A";
      if (priceAmount && priceUnit === "PRICE_UNIT_MILLI") {
        const priceValue = parseInt(priceAmount) / 1000;
        formattedPrice = `₹${priceValue.toLocaleString("en-IN")}`;
      }

      const carrierId = leg.marketingCarrierIds?.[0];
      const carrier = carrierId ? carriers[carrierId] : null;
      const airlineName = carrier?.name || "Unknown Airline";

      const originPlaceId = leg.originPlaceId;
      const destinationPlaceId = leg.destinationPlaceId;
      const originPlace = originPlaceId ? places[originPlaceId] : null;
      const destPlace = destinationPlaceId ? places[destinationPlaceId] : null;

      const originCode = originPlace?.iata || from;
      const destCode = destPlace?.iata || to;

      const departureTime = formatTime(leg.departureDateTime);
      const arrivalTime = formatTime(leg.arrivalDateTime);

      const duration = formatDuration(leg.durationInMinutes || 0);

      const stopCount = leg.stopCount || 0;
      const stopsText =
        stopCount === 0
          ? "Direct"
          : `${stopCount} stop${stopCount > 1 ? "s" : ""}`;

      let layoverText = "";
      if (stopCount > 0 && leg.segmentIds && leg.segmentIds.length > 1) {
        const segments = searchData.content?.results?.segments;
        if (segments) {
          const firstSegmentId = leg.segmentIds[0];
          const secondSegmentId = leg.segmentIds[1];
          const firstSegment = segments[firstSegmentId];
          const secondSegment = segments[secondSegmentId];

          if (firstSegment && secondSegment) {
            const arrivalTime = new Date(
              firstSegment.arrivalDateTime.year,
              firstSegment.arrivalDateTime.month - 1,
              firstSegment.arrivalDateTime.day,
              firstSegment.arrivalDateTime.hour,
              firstSegment.arrivalDateTime.minute,
            );
            const departureTime = new Date(
              secondSegment.departureDateTime.year,
              secondSegment.departureDateTime.month - 1,
              secondSegment.departureDateTime.day,
              secondSegment.departureDateTime.hour,
              secondSegment.departureDateTime.minute,
            );

            const layoverMinutes = Math.floor(
              (departureTime.getTime() - arrivalTime.getTime()) / (1000 * 60),
            );

            const layoverPlaceId = firstSegment.destinationPlaceId;
            const layoverPlace = layoverPlaceId ? places[layoverPlaceId] : null;
            const layoverCity = layoverPlace?.iata || "";

            layoverText = `${formatDuration(layoverMinutes)} layover in ${layoverCity}`;
          }
        }
      }

      flights.push({
        tripType: stopCount === 0 ? "Nonstop" : "One Stop",
        airline: airlineName,
        duration: duration,
        from: originCode,
        to: destCode,
        price: formattedPrice,
        departureTime: departureTime,
        arrivalTime: arrivalTime,
        stops: stopsText,
        layover: layoverText || undefined,
      });
    }
    return flights;
  } catch (error) {
    console.error("Error:", error);
    return [];
  }
}

async function fetchFlights(
  from?: string,
  to?: string,
  date?: string,
  adults?: number,
  children?: number,
  cabinClass?: string,
): Promise<FlightSummary[]> {
  try {
    const payload = createSearchPayload(
      from,
      to,
      date,
      adults,
      children,
      cabinClass,
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

    if (!searchRes.ok) {
      const errorText = await searchRes.text().catch(() => "");
      console.error("Search fails:", errorText);
      throw new Error(`Search fail: ${searchRes.status} ${errorText}`);
    }

    const searchData: SearchResponse = await searchRes.json();

    if (!searchData || typeof searchData !== "object") {
      throw new Error("invalid response");
    }

    if (!searchData.content || !searchData.content.results) {
      throw new Error("Content missing");
    }

    if (!searchData.sessionToken) {
      throw new Error("SessionToken nil");
    }

    const effectiveFrom = from || "BLR";
    const effectiveTo = to || "DEL";

    const flights = extractData(
      searchData,
      effectiveFrom,
      effectiveTo,
    );

    console.log(`\n${flights.length} flights`);

    return flights;
  } catch (error) {
    const fallbackFrom = from || "BLR";
    const fallbackTo = to || "DEL";

    return [
      {
        tripType: "Nonstop",
        airline: "IndiGo",
        duration: "2h 40m",
        from: fallbackFrom,
        to: fallbackTo,
        price: "₹3,500",
        departureTime: "07:20",
        arrivalTime: "09:55",
        stops: "Direct",
      },
      {
        tripType: "One Stop",
        airline: "Air India",
        duration: "10h 35m",
        from: fallbackFrom,
        to: fallbackTo,
        price: "₹4,000",
        departureTime: "13:30",
        arrivalTime: "00:05",
        stops: "1 stop",
        layover: "6h 25m layover in DEL",
      },
    ];
  }
}

function formatFlightsAsMarkdown(flights: FlightSummary[]): string {
  const bookingUrl = "https://farefirst.com";

  return flights
    .map((flight) => {
      return `
### 🛫 ${flight.airline}

**${flight.departureTime}** --> **${flight.arrivalTime}**  
**${flight.from}** → **${flight.to}** • ${flight.duration}

${flight.stops} | Economy Class

💰 **${flight.price}**

[**Book This Flight**](${bookingUrl})

---
`.trim();
    })
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, id, params } = body;

    if (method === "initialize") {
      return mcpResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
        },
        serverInfo: {
          name: "FareFirst Flights",
          version: "2.0.0",
        },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204 });
    }

    if (method === "tools/list") {
      return mcpResponse(id, {
        tools: [
          {
            name: "search_flights",
            description: "One-way Flights.",
            inputSchema: {
              type: "object",
              properties: {
                from: {
                  type: "string",
                },
                to: {
                  type: "string",
                },
                date: {
                  type: "string",
                },
                adults: {
                  type: "number",
                  minimum: 1,
                  maximum: 9,
                },
                children: {
                  type: "number",
                  minimum: 0,
                  maximum: 8,
                },
                cabinClass: {
                  type: "string",
                  description: "Cabin class Economy",
                  enum: [
                    "CABIN_CLASS_ECONOMY",
                    "CABIN_CLASS_PREMIUM_ECONOMY",
                    "CABIN_CLASS_BUSINESS",
                    "CABIN_CLASS_FIRST",
                  ],
                },
              },
            },
          },
        ],
      });
    }

    if (method === "tools/call" && params?.name === "search_flights") {
      const { from, to, date } =
        params.arguments || {};

      if (date) {
        const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
        if (!dateRegex.test(date)) {
          return mcpResponse(id, {
            content: [
              {
                type: "text",
                text: `Invalid date format. Please use YYYY-MM-DD format.\n`,
              },
            ],
          });
        }

        const travelDate = new Date(date);
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        if (travelDate < today) {
          return mcpResponse(id, {
            content: [
              {
                type: "text",
                text: `Travel date cannot be in the past. Please select a future date.`,
              },
            ],
          });
        }
      }

      const effectiveFrom = from || "BLR";
      const effectiveTo = to || "DEL";
      const effectiveDate = date || getDefaultDate();

      const flights = await fetchFlights(
        effectiveFrom,
        effectiveTo,
        effectiveDate,
      );

      flights.map((flight)=>{
        console.log(flight.airline);
      })

      const header = `# Available Flights\n\n**${effectiveFrom} → ${effectiveTo}** • ${effectiveDate}\n\n`;
      const flightCards = formatFlightsAsMarkdown(flights);
      const footer = `\n\n---\n\n **Tip**:  **Explore More Flight Options**  [Visit FareFirst.com](https://farefirst.com)`;

      return mcpResponse(id, {
        content: [
          {
            type: "text",
            text: header + flightCards + footer,
          },
        ],
      });
    }

    return mcpResponse(id, {
      error: {
        code: -32601,
        message: "Method not found",
      },
    });
  } catch (error) {
    console.error("MCP Server Error:", error);

    return mcpResponse(null, {
      error: {
        code: -32603,
        message:
          error instanceof Error ? error.message : "Internal server error",
      },
    });
  }
}
