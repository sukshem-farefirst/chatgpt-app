import { NextRequest, NextResponse } from "next/server";
import { fetchFlights, resolveAirport, FlightSearchResult } from "./flightApi";
import { formatFlightsAsMarkdown, sortFlights } from "./flightUtils";
import { BOOKING_URL } from "./types";

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
): string {
  return [from, to, isoDate, String(adults), String(children), cabinClass]
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
              "Example: 'Delhi' → entityId '128667000', iata 'DEL'.",
            ].join(" "),
            inputSchema: {
              type: "object",
              required: ["searchTerm"],
              properties: {
                searchTerm: {
                  type: "string",
                  description:
                    "City or airport name to look up (e.g. 'Delhi', 'Bengaluru', 'Mumbai')",
                },
              },
            },
          },
          {
            name: "search_flights",
            description: [
              "Search one-way flights between two airports on a given date.",
              "RULE: Copy-paste the tool result to the user WORD FOR WORD without any changes.",
              "RULE: Do NOT summarize, group, reorder, rename, or reformat ANY part of the output.",
              "RULE: Every flight card must appear in full with all 6 fields and its own Book link.",
              "RULE: The two footer links must appear at the end of every response.",
              "RULE: Do not add any text, commentary, or follow-up questions before or between flight cards.",
              "RULE: If the user asks the same question again without changing from, to, or date, answer using the cached result you already have. Do NOT call this tool again.",
              "RULE: Only call this tool again when at least one of from, to, or date has changed from the previous search.",
              "RULE: If the tool returns a response that starts with AMBIGUOUS_DATE, do NOT show flight results. Ask the user the exact question from the response and wait for their answer before calling this tool again.",
              "RULE: Never guess the correct interpretation of an ambiguous date like 03/04/2026. Always ask the user to clarify first.",
            ].join(" "),
            inputSchema: {
              type: "object",
              required: ["from", "to", "date"],
              properties: {
                from: {
                  type: "string",
                  description:
                    "Departure airport IATA code (e.g. BLR, DEL, BOM). Convert city names to IATA automatically.",
                },
                to: {
                  type: "string",
                  description:
                    "Arrival airport IATA code (e.g. DEL, BOM, MAA). Convert city names to IATA automatically.",
                },
                date: {
                  type: "string",
                  description:
                    "Travel date in YYYY-MM-DD format. Convert any user-provided date format to YYYY-MM-DD before calling.",
                },
                adults: {
                  type: "number",
                  minimum: 1,
                  maximum: 9,
                  description: "Number of adult passengers (default: 1)",
                },
                children: {
                  type: "number",
                  minimum: 0,
                  maximum: 8,
                  description: "Number of child passengers (default: 0)",
                },
                cabinClass: {
                  type: "string",
                  description: "Cabin class (default: CABIN_CLASS_ECONOMY)",
                  enum: [
                    "CABIN_CLASS_ECONOMY",
                    "CABIN_CLASS_PREMIUM_ECONOMY",
                    "CABIN_CLASS_BUSINESS",
                    "CABIN_CLASS_FIRST",
                  ],
                },
                fromEntityId: {
                  type: "string",
                  description:
                    "Skyscanner entityId for origin (from resolve_airport). Takes priority over 'from' IATA.",
                },
                toEntityId: {
                  type: "string",
                  description:
                    "Skyscanner entityId for destination (from resolve_airport). Takes priority over 'to' IATA.",
                },
              },
            },
          },
        ],
      });
    }

    if (method === "tools/call" && params?.name === "resolve_airport") {
      const { searchTerm } = params.arguments ?? {};

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
      } = params.arguments ?? {};

      if (!from || !to || !date) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: "Missing required fields. Please provide `from`, `to`, and `date` (YYYY-MM-DD).",
            },
          ],
        });
      }

      const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
      const SLASH_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;

      let isoDate: string;

      if (ISO_RE.test(date)) {
        isoDate = date;
      } else if (SLASH_RE.test(date)) {
        const match = date.match(SLASH_RE)!;
        const p1 = parseInt(match[1], 10);
        const p2 = parseInt(match[2], 10);
        const yr = parseInt(match[3], 10);

        if (p1 <= 12 && p2 <= 12) {
          const optA = `${yr}-${String(p2).padStart(2, "0")}-${String(p1).padStart(2, "0")}`;
          const optB = `${yr}-${String(p1).padStart(2, "0")}-${String(p2).padStart(2, "0")}`;
          return mcpResponse(id, {
            content: [
              {
                type: "text",
                text: [
                  `AMBIGUOUS_DATE`,
                  `Did you mean ${formatReadable(optA)} or ${formatReadable(optB)}?`,
                  `Please confirm and I will search flights for you.`,
                ].join("\n"),
              },
            ],
          });
        }

        const [day, month] = p1 > 12 ? [p1, p2] : [p2, p1];
        isoDate = `${yr}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
      } else {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `Invalid date format "${date}". Please use YYYY-MM-DD (e.g. 2026-04-03).`,
            },
          ],
        });
      }

      const today = new Date();
      today.setHours(0, 0, 0, 0);

      if (new Date(isoDate) < today) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `Travel date (${formatReadable(isoDate)}) is in the past. Please select a future date.`,
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
      );

      if (searchCache?.key === cacheKey) {
        console.log(`[cache hit] ${cacheKey}`);
        return mcpResponse(id, {
          content: [{ type: "text", text: searchCache.markdown }],
        });
      }

      console.log(`[cache miss] fetching: ${cacheKey}`);

      const result: FlightSearchResult = await fetchFlights(
        from,
        to,
        isoDate,
        adults,
        children,
        cabinClass,
        fromEntityId,
        toEntityId,
      );

      const flights = sortFlights(result.flights);
      const resolvedFromEntityId = result.fromEntityId ?? fromEntityId;
      const resolvedToEntityId = result.toEntityId ?? toEntityId;

      if (flights.length === 0) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `No flights found for ${from} to ${to} on ${isoDate}. Try a different date.\n\n[Search on FareFirst](${BOOKING_URL})`,
            },
          ],
        });
      }

      const markdown = formatFlightsAsMarkdown(
        flights,
        from,
        to,
        isoDate,
        resolvedFromEntityId,
        resolvedToEntityId,
        adults,
        children,
      );

      searchCache = { key: cacheKey, result, markdown };

      return mcpResponse(id, {
        content: [{ type: "text", text: markdown }],
      });
    }

    return mcpResponse(id, {
      error: { code: -32601, message: "Method not found" },
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
