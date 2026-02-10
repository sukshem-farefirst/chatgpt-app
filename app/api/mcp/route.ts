// app/api/mcp/route.ts
import { NextRequest, NextResponse } from "next/server";

// Define TypeScript interfaces
interface FlightCard {
  id: string;
  airline: string;
  flightNumber: string;
  departureTime: string;
  arrivalTime: string;
  origin: string;
  destination: string;
  duration: string;
  stops: string;
  fareClass: string;
  price: string;
  amenities: string[];
  bookingUrl: string;
  airlineLogo?: string;
}

interface SearchParams {
  from: string;
  to: string;
  date: string;
  passengers: number;
}

// MCP Response helper
function mcpResponse(id: string | number | null, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

// Helper functions
function extractAirportCode(input: string): string {
  if (!input) return "DEL";

  // Extract code from parentheses
  const match = input.match(/\(([A-Z]{3})\)/);
  if (match) return match[1];

  // Already a 3-letter code
  if (/^[A-Z]{3}$/.test(input)) return input;

  // City to code mapping
  const cityMap: Record<string, string> = {
    delhi: "DEL",
    bangalore: "BLR",
    bengaluru: "BLR",
    mumbai: "BOM",
    chennai: "MAA",
    kolkata: "CCU",
    hyderabad: "HYD",
    ahmedabad: "AMD",
    pune: "PNQ",
    goa: "GOI",
    mangalore: "IXE",
    kochi: "COK",
    jaipur: "JAI",
    lucknow: "LKO",
    guwahati: "GAU",
  };

  const lower = input.toLowerCase();
  for (const [city, code] of Object.entries(cityMap)) {
    if (lower.includes(city)) return code;
  }

  return input.slice(0, 3).toUpperCase();
}

function parseDate(dateStr: string): string {
  if (!dateStr) return "2026-02-20";
  dateStr = dateStr.trim();

  if (dateStr.includes("/")) {
    const parts = dateStr.split("/").map((p) => p.trim());
    if (parts.length === 3) {
      const [day, month, year] = parts;
      const fullYear = year.length === 2 ? `20${year}` : year;
      return `${fullYear}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
    }
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  return "2026-02-20";
}

// Generate flight cards data
function generateFlightCards(params: SearchParams): FlightCard[] {
  const { from, to, date, passengers } = params;

  // Airline logos
  const airlineLogos: Record<string, string> = {
    IndiGo: "https://img.icons8.com/color/96/indigo-airlines.png",
    "Air India": "https://img.icons8.com/color/96/air-india.png",
    Vistara: "https://img.icons8.com/color/96/vistara.png",
    SpiceJet: "https://img.icons8.com/color/96/spicejet.png",
    "Akasa Air": "https://img.icons8.com/color/96/akasa-air.png",
  };

  const flights: FlightCard[] = [
    {
      id: "indigo-6e-201",
      airline: "IndiGo",
      flightNumber: "6E 201",
      departureTime: "06:00",
      arrivalTime: "08:40",
      origin: from,
      destination: to,
      duration: "2h 40m",
      stops: "Non-stop",
      fareClass: "Economy",
      price: `₹${(3450 * passengers).toLocaleString("en-IN")}`,
      amenities: ["Snack", "Entertainment", "WiFi", "Priority Boarding"],
      bookingUrl: `https://farefirst.com/book?airline=6E&flight=201&from=${from}&to=${to}&date=${date}&passengers=${passengers}`,
      airlineLogo: airlineLogos["IndiGo"],
    },
    {
      id: "air-india-ai-503",
      airline: "Air India",
      flightNumber: "AI 503",
      departureTime: "09:30",
      arrivalTime: "12:10",
      origin: from,
      destination: to,
      duration: "2h 40m",
      stops: "Non-stop",
      fareClass: "Premium Economy",
      price: `₹${(4200 * passengers).toLocaleString("en-IN")}`,
      amenities: ["Meal", "Checked Baggage", "Entertainment", "Lounge Access"],
      bookingUrl: `https://farefirst.com/book?airline=AI&flight=503&from=${from}&to=${to}&date=${date}&passengers=${passengers}`,
      airlineLogo: airlineLogos["Air India"],
    },
    {
      id: "vistara-uk-825",
      airline: "Vistara",
      flightNumber: "UK 825",
      departureTime: "07:20",
      arrivalTime: "11:00",
      origin: from,
      destination: to,
      duration: "3h 40m",
      stops: "1 Stop (via BOM)",
      fareClass: "Business",
      price: `₹${(8500 * passengers).toLocaleString("en-IN")}`,
      amenities: [
        "Lounge Access",
        "Premium Meal",
        "Extra Baggage",
        "Priority Check-in",
      ],
      bookingUrl: `https://farefirst.com/book?airline=UK&flight=825&from=${from}&to=${to}&date=${date}&passengers=${passengers}`,
      airlineLogo: airlineLogos["Vistara"],
    },
    {
      id: "spicejet-sg-415",
      airline: "SpiceJet",
      flightNumber: "SG 415",
      departureTime: "14:15",
      arrivalTime: "16:55",
      origin: from,
      destination: to,
      duration: "2h 40m",
      stops: "Non-stop",
      fareClass: "Economy",
      price: `₹${(3950 * passengers).toLocaleString("en-IN")}`,
      amenities: ["Snack", "Hand Baggage Only"],
      bookingUrl: `https://farefirst.com/book?airline=SG&flight=415&from=${from}&to=${to}&date=${date}&passengers=${passengers}`,
      airlineLogo: airlineLogos["SpiceJet"],
    },
    {
      id: "akasa-qp-1101",
      airline: "Akasa Air",
      flightNumber: "QP 1101",
      departureTime: "18:05",
      arrivalTime: "20:45",
      origin: from,
      destination: to,
      duration: "2h 40m",
      stops: "Non-stop",
      fareClass: "Economy",
      price: `₹${(4300 * passengers).toLocaleString("en-IN")}`,
      amenities: ["Snack", "WiFi", "Entertainment"],
      bookingUrl: `https://farefirst.com/book?airline=QP&flight=1101&from=${from}&to=${to}&date=${date}&passengers=${passengers}`,
      airlineLogo: airlineLogos["Akasa Air"],
    },
  ];

  return flights;
}

// Format flight cards as markdown for ChatGPT display
function formatFlightCardsMarkdown(
  flights: FlightCard[],
  params: SearchParams,
): string {
  const displayDate = new Date(params.date).toLocaleDateString("en-US", {
    weekday: "short",
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  const flightCardsText = flights
    .map((flight) => {
      const amenities = flight.amenities.slice(0, 3).join(" • ");
      return `**${flight.airline} ${flight.flightNumber}** — ${flight.stops}
🕒 ${flight.departureTime} ${flight.origin} → ${flight.arrivalTime} ${flight.destination}
⏱️ ${flight.duration} • ${flight.fareClass}
✨ ${amenities}
💰 **${flight.price}**
🔗 [Book Now](${flight})`;
    })
    .join("\n\n---\n\n");

  return `# ✈️ FareFirst Flights\n\n## ${params.from} → ${params.to} • ${displayDate}\n\n${flightCardsText}\n\n---\n\n**${flights.length} flights found** • Sorted by price\n\n**Options:**\n• Filter by: Non-stop only | Cheapest | Earliest departure\n• Get fare breakdown & baggage details\n• Compare with other dates\n• Proceed to booking`;
}

// Format as simple cards for ChatGPT's display
function formatAsSimpleCards(flights: FlightCard[]): string {
  return flights
    .map(
      (flight) =>
        `- **${flight.airline} ${flight.flightNumber}** — ${flight.stops}\n  ${flight.departureTime} ${flight.origin} → ${flight.arrivalTime} ${flight.destination} (${flight.duration})\n  ${flight.fareClass} • ${flight.amenities.slice(0, 2).join(", ")}\n  ${flight.price} • [Book](${flight.bookingUrl})`,
    )
    .join("\n\n");
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    console.log("MCP Request:", JSON.stringify(body, null, 2));

    const { method, id, params } = body;

    // Handle MCP initialization
    if (method === "initialize") {
      return mcpResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: {},
        },
        serverInfo: {
          name: "FareFirst Flights",
          version: "1.0.0",
          description: "Search and book flights with FareFirst",
        },
      });
    }

    // Handle initialized notification
    if (method === "notifications/initialized") {
      return new Response(null, { status: 204 });
    }

    // List available tools
    if (method === "tools/list") {
      return mcpResponse(id, {
        tools: [
          {
            name: "search_flights",
            description:
              "Search for flights between airports on a specific date",
            inputSchema: {
              type: "object",
              required: ["from", "to", "date"],
              properties: {
                from: {
                  type: "string",
                  description:
                    "Departure airport code or city (e.g., DEL, Delhi, BLR, Bangalore)",
                },
                to: {
                  type: "string",
                  description:
                    "Arrival airport code or city (e.g., BLR, Bangalore, BOM, Mumbai)",
                },
                date: {
                  type: "string",
                  description: "Travel date in YYYY-MM-DD or DD/MM/YYYY format",
                },
                passengers: {
                  type: "integer",
                  description: "Number of passengers (default: 1)",
                  default: 1,
                },
              },
            },
          },
        ],
      });
    }

    // Handle flight search tool call
    if (method === "tools/call" && params.name === "search_flights") {
      const args = params.arguments || {};

      // Extract and validate parameters
      const fromCode = extractAirportCode(args.from || "DEL");
      const toCode = extractAirportCode(args.to || "BLR");
      const date = parseDate(args.date || "2026-02-20");
      const passengers = parseInt(args.passengers) || 1;

      console.log(
        `Searching flights: ${fromCode} → ${toCode} on ${date} for ${passengers} passenger(s)`,
      );

      // Generate flight data
      const searchParams: SearchParams = {
        from: fromCode,
        to: toCode,
        date,
        passengers,
      };

      const flights = generateFlightCards(searchParams);

      // Format date for display
      const displayDate = new Date(date).toLocaleDateString("en-US", {
        weekday: "short",
        year: "numeric",
        month: "short",
        day: "numeric",
      });

      // Create the response text with proper markdown formatting
      const responseText = `✅ Found ${flights.length} flights from ${fromCode} to ${toCode} on ${displayDate}:\n\n${formatAsSimpleCards(flights)}\n\n**What would you like to do next?**\n• Filter by nonstop only\n• Sort by cheapest price\n• Get detailed fare breakdown\n• Proceed to booking`;

      // Return in MCP format - KEEP IT SIMPLE to avoid 424 errors
      return mcpResponse(id, {
        content: [
          {
            type: "text",
            text: responseText,
          },
        ],
        // Minimal additional data - only what's needed
        _meta: {
          flightCount: flights.length,
          origin: fromCode,
          destination: toCode,
          date: displayDate,
        },
      });
    }

    // Handle unknown method
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
        message: "Internal error",
        data: error instanceof Error ? error.message : String(error),
      },
    });
  }
}

// GET endpoint for testing
export async function GET(req: NextRequest) {
  const searchParams = req.nextUrl.searchParams;
  const from = searchParams.get("from") || "Delhi";
  const to = searchParams.get("to") || "Bangalore";
  const date = searchParams.get("date") || "2026-02-20";
  const passengers = parseInt(searchParams.get("passengers") || "1");

  const fromCode = extractAirportCode(from);
  const toCode = extractAirportCode(to);
  const parsedDate = parseDate(date);

  // Generate flight data
  const searchParamsObj: SearchParams = {
    from: fromCode,
    to: toCode,
    date: parsedDate,
    passengers,
  };

  const flights = generateFlightCards(searchParamsObj);

  // Create HTML preview
  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <title>FareFirst Flights - MCP Test</title>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <style>
      * {
        margin: 0;
        padding: 0;
        box-sizing: border-box;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      }
      
      body {
        background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
        min-height: 100vh;
        padding: 20px;
      }
      
      .container {
        max-width: 1000px;
        margin: 0 auto;
        background: white;
        border-radius: 20px;
        padding: 30px;
        box-shadow: 0 10px 40px rgba(0,0,0,0.1);
      }
      
      .header {
        text-align: center;
        margin-bottom: 30px;
        padding-bottom: 20px;
        border-bottom: 2px solid #e2e8f0;
      }
      
      .header h1 {
        color: #1e40af;
        font-size: 32px;
        margin-bottom: 10px;
      }
      
      .search-info {
        background: #f8fafc;
        padding: 15px;
        border-radius: 12px;
        margin-bottom: 25px;
        display: flex;
        justify-content: space-between;
        align-items: center;
      }
      
      .flight-card {
        border: 2px solid #e2e8f0;
        border-radius: 16px;
        padding: 25px;
        margin-bottom: 20px;
        background: white;
        transition: all 0.3s ease;
      }
      
      .flight-card:hover {
        border-color: #3b82f6;
        box-shadow: 0 10px 25px rgba(59, 130, 246, 0.15);
        transform: translateY(-3px);
      }
      
      .flight-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      
      .airline-info {
        display: flex;
        align-items: center;
        gap: 15px;
      }
      
      .airline-logo {
        width: 50px;
        height: 50px;
        border-radius: 10px;
        object-fit: contain;
        background: #f1f5f9;
        padding: 5px;
      }
      
      .airline-name {
        font-size: 22px;
        font-weight: 700;
        color: #1e293b;
      }
      
      .flight-number {
        color: #64748b;
        font-size: 16px;
        margin-top: 5px;
      }
      
      .price {
        color: #059669;
        font-size: 28px;
        font-weight: 800;
      }
      
      .route {
        display: flex;
        align-items: center;
        justify-content: space-between;
        margin: 25px 0;
        padding: 20px 0;
        border-top: 1px solid #f1f5f9;
        border-bottom: 1px solid #f1f5f9;
      }
      
      .time {
        font-size: 28px;
        font-weight: 700;
        color: #0f172a;
      }
      
      .airport {
        font-size: 16px;
        color: #64748b;
        margin-top: 8px;
        font-weight: 500;
      }
      
      .arrow {
        color: #3b82f6;
        font-size: 28px;
        font-weight: bold;
      }
      
      .duration {
        text-align: center;
        color: #64748b;
        font-size: 14px;
        margin-top: 10px;
      }
      
      .details {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin: 20px 0;
      }
      
      .badge {
        background: #e0f2fe;
        color: #0369a1;
        padding: 8px 16px;
        border-radius: 20px;
        font-weight: 600;
        font-size: 14px;
      }
      
      .amenities {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
        margin: 15px 0;
      }
      
      .amenity {
        background: #f0f9ff;
        color: #0c4a6e;
        padding: 6px 12px;
        border-radius: 16px;
        font-size: 13px;
      }
      
      .book-button {
        display: block;
        width: 100%;
        background: linear-gradient(135deg, #3b82f6, #1d4ed8);
        color: white;
        text-align: center;
        padding: 16px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 700;
        font-size: 18px;
        transition: all 0.3s;
        border: none;
        cursor: pointer;
        margin-top: 20px;
      }
      
      .book-button:hover {
        background: linear-gradient(135deg, #2563eb, #1e40af);
        transform: scale(1.02);
      }
      
      .footer {
        text-align: center;
        margin-top: 40px;
        padding-top: 20px;
        border-top: 1px solid #e2e8f0;
        color: #64748b;
      }
      
      .test-info {
        background: #fef3c7;
        padding: 15px;
        border-radius: 12px;
        margin-top: 30px;
        border: 1px solid #f59e0b;
      }
      
      @media (max-width: 768px) {
        .container {
          padding: 20px;
        }
        
        .header h1 {
          font-size: 24px;
        }
        
        .route {
          flex-direction: column;
          text-align: center;
          gap: 15px;
        }
        
        .arrow {
          transform: rotate(90deg);
        }
      }
    </style>
  </head>
  <body>
    <div class="container">
      <div class="header">
        <h1>✈️ FareFirst Flight Search</h1>
        <p>MCP Server Test Interface</p>
      </div>
      
      <div class="search-info">
        <div>
          <strong>Route:</strong> ${fromCode} → ${toCode}
        </div>
        <div>
          <strong>Date:</strong> ${parsedDate}
        </div>
        <div>
          <strong>Passengers:</strong> ${passengers}
        </div>
        <div>
          <strong>Flights found:</strong> ${flights.length}
        </div>
      </div>
      
      ${flights
        .map(
          (flight) => `
      <div class="flight-card">
        <div class="flight-header">
          <div class="airline-info">
            ${flight.airlineLogo ? `<img src="${flight.airlineLogo}" alt="${flight.airline}" class="airline-logo">` : ""}
            <div>
              <div class="airline-name">${flight.airline}</div>
              <div class="flight-number">${flight.flightNumber}</div>
            </div>
          </div>
          <div class="price">${flight.price}</div>
        </div>
        
        <div class="route">
          <div>
            <div class="time">${flight.departureTime}</div>
            <div class="airport">${flight.origin}</div>
          </div>
          <div style="text-align: center;">
            <div class="arrow">→</div>
            <div class="duration">${flight.duration}</div>
          </div>
          <div>
            <div class="time">${flight.arrivalTime}</div>
            <div class="airport">${flight.destination}</div>
          </div>
        </div>
        
        <div class="details">
          <span class="badge">${flight.fareClass}</span>
          <span style="color: #475569; font-weight: 500;">${flight.stops}</span>
        </div>
        
        ${
          flight.amenities.length > 0
            ? `
        <div class="amenities">
          ${flight.amenities.map((amenity) => `<span class="amenity">${amenity}</span>`).join("")}
        </div>
        `
            : ""
        }
        
        <a href="${flight.bookingUrl}" class="book-button" target="_blank">
          Book Now
        </a>
      </div>
      `,
        )
        .join("")}
      
      <div class="test-info">
        <h3>Test in ChatGPT:</h3>
        <p>Use: <strong>@FareFirst Find flights from ${from} to ${to} on ${date}</strong></p>
        <p style="margin-top: 10px; font-size: 14px;">
          The MCP server will return formatted flight cards that ChatGPT can display.
        </p>
      </div>
      
      <div class="footer">
        <p>FareFirst MCP Server • Version 1.0.0</p>
        <p style="margin-top: 10px; font-size: 14px;">
          This is a test interface. All flight data is sample data.
        </p>
      </div>
    </div>
  </body>
  </html>`;

  return new Response(html, {
    headers: { "Content-Type": "text/html" },
  });
}
