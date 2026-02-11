// app/api/mcp/route.ts
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
}

function mcpResponse(id: string | number | null, result: unknown) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

async function fetchFlights(
  from: string,
  to: string,
  date: string,
): Promise<FlightSummary[]> {
  try {
    const response = await fetch(
      `https://airlineapi-5oz2r3w4ya-uc.a.run.app/airlines`,
    );

    if (!response.ok) {
      throw new Error("API request failed");
    }

    const airlines = await response.json();

    const availableAirlines = airlines.filter((airline: any) => {
      const isAvailable =
        airline.is_available ?? airline.isAvailable ?? airline.is_Available;
      return isAvailable === true || isAvailable === "true";
    });

    return availableAirlines.slice(0, 10).map((airline: any, index: number) => {
      const airlineName = airline.name || "Unknown Airline";
      const baseHour = 6 + index * 1;
      const departHour = baseHour % 24;
      const arriveHour = (baseHour + 2) % 24;

      return {
        tripType: "Nonstop",
        airline: airlineName,
        duration: "2h 40m",
        from,
        to,
        price: `₹${(3500 + index * 500).toLocaleString("en-IN")}`,
        departureTime: `${departHour.toString().padStart(2, "0")}:00`,
        arrivalTime: `${arriveHour.toString().padStart(2, "0")}:40`,
      };
    });
  } catch (error) {
    return [
      {
        tripType: "Nonstop",
        airline: "IndiGo",
        duration: "2h 40m",
        from,
        to,
        price: "₹3,500",
        departureTime: "06:00",
        arrivalTime: "08:40",
      },
      {
        tripType: "Nonstop",
        airline: "Air India",
        duration: "2h 40m",
        from,
        to,
        price: "₹4,000",
        departureTime: "09:00",
        arrivalTime: "11:40",
      },
    ];
  }
}

function formatFlights(flights: FlightSummary[]): string {
  return flights
    .map((flight) => {
      const bookingUrl = `https://farefirst.com`;
      return `
### ✈️ ${flight.airline}
${flight.tripType}
${flight.departureTime} → ${flight.arrivalTime}
${flight.duration}
${flight.price}

${bookingUrl}
`;
    })
    .join("\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, id, params } = body;

    if (method === "initialize") {
      return mcpResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: { tools: {} },
        serverInfo: {
          name: "FareFirst Flights",
          version: "1.0.0",
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
            description: "Search flights between cities",
            inputSchema: {
              type: "object",
              required: ["from", "to", "date"],
              properties: {
                from: { type: "string", description: "Departure city/airport" },
                to: { type: "string", description: "Arrival city/airport" },
                date: {
                  type: "string",
                  description: "Travel date (YYYY-MM-DD)",
                },
              },
            },
          },
        ],
      });
    }

    if (method === "tools/call" && params.name === "search_flights") {
      const { from, to, date } = params.arguments;

      const flights = await fetchFlights(from, to, date);

      const header = `**Available Flights: ${from} → ${to}** | ${date}\n\n`;
      const flightList = formatFlights(flights);

      const responseText = header + flightList;

      return mcpResponse(id, {
        content: [{ type: "text", text: responseText }],
      });
    }

    return mcpResponse(id, {
      error: { code: -32601, message: "Method not found" },
    });
  } catch (error) {
    return mcpResponse(null, {
      error: {
        code: -32603,
        message: error instanceof Error ? error.message : "Internal error",
      },
    });
  }
}
