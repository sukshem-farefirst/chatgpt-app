import fs from "fs";
import path from "path";
import { NextRequest, NextResponse } from "next/server";

const cardsFilePath = path.join(process.cwd(), "app/api/mcp/cards.json");

// 1. ADD: TypeScript Interface to fix the "implicitly has any type" error
interface FlightSegment {
  from: string;
  to: string;
  departure: string;
  arrival: string;
  duration: string;
  stops: string;
  class: string;
}

interface FlightData {
  type: string;
  price: string;
  dates: string;
  segments: FlightSegment[];
  button: {
    text: string;
    url: string;
  };
}

function mcpResponse(id: string | number | null, result: any) {
  return NextResponse.json({ jsonrpc: "2.0", id, result });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, id, params } = body;

    // 1. INITIALIZE
    if (method === "initialize") {
      return mcpResponse(id, {
        protocolVersion: "2024-11-05",
        capabilities: {
          tools: {},
          resources: { subscribe: true },
        },
        serverInfo: { name: "FareFirst-Visual-Server", version: "2.0.0" },
      });
    }

    if (method === "notifications/initialized")
      return new Response(null, { status: 200 });

    // 2. TOOL LISTING
    if (method === "tools/list") {
      return mcpResponse(id, {
        tools: [
          {
            name: "get_farefirst_flight_results",
            description:
              "Fetches flights and displays them as interactive cards.",
            _meta: { "openai/outputTemplate": "ui://flight-card" },
            inputSchema: {
              type: "object",
              properties: {
                from: { type: "string" },
                to: { type: "string" },
                date: { type: "string" },
              },
            },
          },
        ],
      });
    }

    // 3. UI RESOURCE DEFINITION
    if (method === "resources/list") {
      return mcpResponse(id, {
        resources: [
          {
            uri: "ui://flight-card",
            name: "Flight Result Card",
            mimeType: "text/html+skybridge",
          },
        ],
      });
    }

    if (method === "resources/read" && params.uri === "ui://flight-card") {
      return mcpResponse(id, {
        contents: [
          {
            uri: "ui://flight-card",
            mimeType: "text/html+skybridge",
            text: `
        <div id="card-container" style="display: flex; flex-direction: column; gap: 12px; font-family: sans-serif; max-width: 400px;"></div>

        <script>
          const data = window.openai.toolOutput;
          const container = document.getElementById('card-container');

          if (data && data.flights) {
            data.flights.forEach(flight => {
              const card = document.createElement('div');
              card.style = "border: 1px solid #eee; border-radius: 12px; padding: 15px; background: white; box-shadow: 0 2px 4px rgba(0,0,0,0.05);";
              
              card.innerHTML = \`
                <div style="display: flex; justify-content: space-between; margin-bottom: 10px;">
                  <span style="font-weight: bold; color: #555;">\${flight.airline}</span>
                  <span style="color: #1a73e8; font-weight: 800;">\${flight.price}</span>
                </div>
                <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 15px;">
                  <div style="text-align: center;"><b>\${flight.dep_time}</b><div style="font-size: 10px; color: #888;">\${flight.from}</div></div>
                  <div style="flex-grow: 1; border-bottom: 1px dashed #ccc; margin: 0 10px;"></div>
                  <div style="text-align: center;"><b>\${flight.arr_time}</b><div style="font-size: 10px; color: #888;">\${flight.to}</div></div>
                </div>
                <div style="font-size: 11px; color: #666; margin-bottom: 10px;">\${flight.type} • \${flight.stops}</div>
                <a href="\${flight.url}" target="_blank" style="display: block; text-align: center; background: #1a73e8; color: white; padding: 8px; border-radius: 6px; text-decoration: none; font-size: 14px; font-weight: bold;">Select Flight</a>
              \`;
              container.appendChild(card);
            });
          }
        </script>
      `,
          },
        ],
      });
    }

    // 4. TOOL EXECUTION
    if (
      method === "tools/call" &&
      params.name === "get_farefirst_flight_results"
    ) {
      const rawData = JSON.parse(fs.readFileSync(cardsFilePath, "utf-8"));
      const flightList: FlightData[] = rawData.flights || [];

      return mcpResponse(id, {
        content: [
          {
            type: "text",
            text: `I found ${flightList.length} flight options for your search.`,
          },
        ],
        structuredContent: {
          // Fixed mapping to handle your nested JSON structure
          flights: flightList.map((f: FlightData) => ({
            airline: "FareFirst", // You can change this to f.airline if added to JSON
            price: f.price,
            type: f.type,
            stops: f.segments[0]?.stops || "N/A",
            dep_time: f.segments[0]?.departure || "--",
            arr_time: f.segments[0]?.arrival || "--",
            from: f.segments[0]?.from || params.from,
            to: f.segments[0]?.to || params.to,
            url: f.button.url,
          })),
        },
      });
    }
  } catch (err) {
    return NextResponse.json({
      jsonrpc: "2.0",
      id: null,
      error: { code: -32603, message: "Server Error" },
    });
  }
}

export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

// import { NextRequest } from "next/server";

// // 1. MCP Initialization Response Helper
// function mcpResponse(id: string | number | null, result: any) {
//   return Response.json({ jsonrpc: "2.0", id, result });
// }

// async function fetchFlightData(params: any) {
//   // Replace this with your actual external API logic
//   const res = await fetch("https://airlineapi-5oz2r3w4ya-uc.a.run.app", {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify(params)
//   });
//   return res.json();
// }

// function toFlightCard(apiData: any) {
//   const segment = apiData.segments[0];
//   return {
//     type: "text", // MCP standard uses 'text' or 'resource'
//     text: JSON.stringify({
//       tripType: "One way",
//       date: segment.date,
//       price: `$${apiData.price.amount}`,
//       departureTime: segment.departureTime,
//       arrivalTime: segment.arrivalTime,
//       route: `${segment.from} - ${segment.to}`,
//       duration: segment.duration,
//       stops: segment.stops === 0 ? "Nonstop" : `${segment.stops} stops`,
//     }, null, 2)
//   };
// }

// export async function POST(req: NextRequest) {
//   try {
//     const body = await req.json();
//     const { method, id, params } = body;

//     // --- STEP 1: HANDLE MCP HANDSHAKE (Fixes your validation error) ---
//     if (method === "initialize") {
//       return mcpResponse(id, {
//         protocolVersion: "2024-11-05",
//         capabilities: {
//           tools: {}, // Tells Gemini you have tools
//         },
//         serverInfo: { name: "FareFirst", version: "1.0.0" }
//       });
//     }

//     if (method === "notifications/initialized") {
//       return new Response(null, { status: 200 });
//     }

//     // --- STEP 2: DEFINE THE TOOL ---
//     if (method === "tools/list") {
//       return mcpResponse(id, {
//         tools: [
//           {
//             name: "get_flight_cards",
//             description: "Fetches flight availability and pricing. Use this when the user asks for flights.",
//             inputSchema: {
//               type: "object",
//               properties: {
//                 from: { type: "string", description: "Origin city/airport" },
//                 to: { type: "string", description: "Destination city/airport" },
//                 date: { type: "string", description: "Date of travel (YYYY-MM-DD)" }
//               },
//               required: ["from", "to", "date"]
//             }
//           }
//         ]
//       });
//     }

//     // --- STEP 3: EXECUTE THE TOOL ---
//     if (method === "tools/call") {
//       const { name, arguments: args } = params;

//       if (name === "get_flight_cards") {
//         const apiData = await fetchFlightData(args);

//         // Return 10 cards by mapping your API data if it returns an array
//         // For now, we follow your single-card logic:
//         const card = toFlightCard(apiData);

//         return mcpResponse(id, {
//           content: [card]
//         });
//       }
//     }

//     return Response.json({ jsonrpc: "2.0", id, error: { code: -32601, message: "Method not found" } });

//   } catch (error) {
//     return Response.json({ jsonrpc: "2.0", id: null, error: { code: -32603, message: "Internal error" } });
//   }
// }

// // OPTIONS and GET remain the same
// export async function OPTIONS() {
//   return new Response(null, {
//     status: 204,
//     headers: {
//       "Access-Control-Allow-Origin": "*",
//       "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
//       "Access-Control-Allow-Headers": "Content-Type"
//     }
//   });
// }

// export async function GET() {
//   return Response.json({ status: "ok" });
// }
