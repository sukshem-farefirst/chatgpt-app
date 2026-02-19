import { NextRequest, NextResponse } from "next/server";
import { fetchFlights, resolveAirport, FlightSearchResult } from "./flightApi";
import { formatFlightsAsMCP, sortFlights } from "./flightUtils";
import { RESULTS_URL } from "./types";

interface CacheEntry {
  key: string;
  result: FlightSearchResult;
  markdown: string;
}

let searchCache: CacheEntry | null = null;

function makeCacheKey(
  from: string,
  to: string,
  isoDate: string,
  adults: number,
  children: number,
  cabinClass: string,
  userCountry: string,
): string {
  return [
    from,
    to,
    isoDate,
    String(adults),
    String(children),
    cabinClass,
    userCountry,
  ]
    .join("|")
    .toUpperCase();
}

function mcpResponse(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

function formatReadable(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, id, params } = body;

    const userLocation = body?.metadata?.user?.location;

    const userCountry =
      userLocation?.country ??
      body?.metadata?.user?.locale?.split("-")[1] ??
      "US";

    console.log("YY " + userCountry);

    if (method === "initialize") {
      return mcpResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: { name: "FareFirst Flights", version: "2.0.0" },
      });
    }

    if (method === "notifications/initialized") {
      return new Response(null, { status: 204 });
    }

    if (method === "tools/list") {
      return mcpResponse(id, {
        tools: [
          {
            name: "resolve_airport",
            description: [
              "Resolves a city or airport name to a Skyscanner entityId and IATA code.",
              "Call this BEFORE search_flights whenever the user provides a city/airport name instead of an IATA code.",
              "Pass the returned entityId into search_flights as fromEntityId or toEntityId.",
            ].join(" "),
            inputSchema: {
              type: "object",
              required: ["searchTerm"],
              properties: {
                searchTerm: { type: "string" },
              },
            },
          },
          {
            name: "search_flights",
            description: [
              "Search one-way flights between two airports on a given date.",
              "RULES: Copy tool result exactly, never summarize, reorder, or change flight cards.",
            ].join(" "),
            inputSchema: {
              type: "object",
              required: ["from", "to", "date"],
              properties: {
                from: { type: "string" },
                to: { type: "string" },
                date: { type: "string" },
                adults: { type: "number", minimum: 1, maximum: 9 },
                children: { type: "number", minimum: 0, maximum: 8 },
                cabinClass: {
                  type: "string",
                  enum: [
                    "CABIN_CLASS_ECONOMY",
                    "CABIN_CLASS_PREMIUM_ECONOMY",
                    "CABIN_CLASS_BUSINESS",
                    "CABIN_CLASS_FIRST",
                  ],
                },
                fromEntityId: { type: "string" },
                toEntityId: { type: "string" },
              },
            },
          },
        ],
      });
    }

    if (method === "tools/call" && params?.name === "resolve_airport") {
      const { searchTerm, userCountry: rawUserCountry } =
        params.arguments ?? {};
      const userCountry = rawUserCountry;

      console.log(`userCountry: ${userCountry}"}`);

      if (!searchTerm) {
        return mcpResponse(id, {
          content: [
            { type: "text", text: "Missing required field: searchTerm." },
          ],
        });
      }

      const result = await resolveAirport(searchTerm);

      if (!result) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `Could not resolve airport for "${searchTerm}". Try a more specific name or use the IATA code directly.`,
            },
          ],
        });
      }

      return mcpResponse(id, {
        content: [
          {
            type: "text",
            text: [
              `Resolved: ${result.name} (${result.cityName}, ${result.countryName})`,
              `entityId: ${result.entityId}`,
              `iataCode: ${result.iataCode}`,
              `type: ${result.type}`,
            ].join("\n"),
          },
        ],
      });
    }

    if (method === "tools/call" && params?.name === "search_flights") {
      const {
        from,
        to,
        date,
        adults = 1,
        children = 0,
        cabinClass = "CABIN_CLASS_ECONOMY",
        fromEntityId,
        toEntityId,
        userCountry: rawUserCountry,
      } = params.arguments ?? {};

      const userCountry = rawUserCountry;

      console.log(`userCountry: ${userCountry}"}`);

      if (!from || !to || !date) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: "Missing required fields. Please provide `from`, `to`, and `date`.",
            },
          ],
        });
      }

      const isoDate: string = date;

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (new Date(isoDate) < today) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `Travel date (${formatReadable(isoDate)}) is in the past.`,
            },
          ],
        });
      }

      const cacheKey = makeCacheKey(
        from,
        to,
        isoDate,
        adults,
        children,
        cabinClass,
        userCountry,
      );
      if (searchCache?.key === cacheKey) {
        console.log(`cache hit ${cacheKey}`);
        return mcpResponse(id, {
          content: [{ type: "text", text: searchCache.markdown }],
        });
      }

      const result: FlightSearchResult = await fetchFlights(
        from,
        to,
        isoDate,
        adults,
        children,
        cabinClass,
        fromEntityId,
        toEntityId,
        userCountry,
      );

      const flights = sortFlights(result.flights);
      const resolvedFromEntityId = result.fromEntityId ?? fromEntityId;
      const resolvedToEntityId = result.toEntityId ?? toEntityId;
      const formattedDate = isoDate.replace(/-/g, "");

      if (flights.length === 0) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `No flights found from ${from} to ${to} on ${isoDate}. Please visit [FareFirst.com](https://farefirst.com) for more options.\n\n[Search on FareFirst](${RESULTS_URL}/${fromEntityId ?? from}-${formattedDate}-${toEntityId ?? to}?adults=${adults}&children=${children}&ages=&cabin_class=Y&trip_type=oneway)`,
            },
          ],
        });
      }

      const content = formatFlightsAsMCP(flights, userCountry);
      return mcpResponse(id, { content });
    }
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
