import { NextRequest, NextResponse } from "next/server";
import { fetchFlights, resolveAirport, FlightSearchResult } from "./flightApi";
import { formatFlightsAsMarkdown, sortFlights } from "./flightUtils";
import { BOOKING_URL, RESULTS_URL } from "./types";

function mcpResponse(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
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
                  description: "City or airport name to look up (e.g. 'Delhi', 'Bengaluru', 'Mumbai')",
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
                  description: "Skyscanner entityId for origin (from resolve_airport). Takes priority over 'from' IATA.",
                },
                toEntityId: {
                  type: "string",
                  description: "Skyscanner entityId for destination (from resolve_airport). Takes priority over 'to' IATA.",
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
          content: [{ type: "text", text: "Missing required field: searchTerm." }],
        });
      }

      const result = await resolveAirport(searchTerm);

      if (!result) {
        return mcpResponse(id, {
          content: [{ type: "text", text: `Could not resolve airport for "${searchTerm}". Try a more specific name or use the IATA code directly.` }],
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

      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: "Invalid date format. Please use YYYY-MM-DD (e.g. 2026-03-05).",
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
              text: "Travel date cannot be in the past. Please select a future date.",
            },
          ],
        });
      }

      const result: FlightSearchResult = await fetchFlights(from, to, date, adults, children, cabinClass, fromEntityId, toEntityId);
      const flights = sortFlights(result.flights);
      const resolvedFromEntityId = result.fromEntityId ?? fromEntityId;
      const resolvedToEntityId = result.toEntityId ?? toEntityId;

      if (flights.length === 0) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: `No flights found for ${from} to ${to} on ${date}. Try a different date.\n\n[Search on FareFirst](${BOOKING_URL})`,
            },
          ],
        });
      }

      const markdown = formatFlightsAsMarkdown(flights, from, to, date, resolvedFromEntityId, resolvedToEntityId, adults, children);

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
        message: error instanceof Error ? error.message : "Internal server error",
      },
    });
  }
}