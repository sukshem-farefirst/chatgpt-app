import { NextRequest, NextResponse } from "next/server";
import {
  fetchFlights,
  resolveAirportWithLogic,
  AirportSuggestion,
  FlightSearchResult,
} from "./flightApi";
import { formatFlightsAsMarkdown, sortFlights } from "./flightUtils";
import { RESULTS_URL } from "./types";

interface CacheEntry {
  key: string;
  result: FlightSearchResult;
  markdown: string;
}

interface PendingSession {
  from: string;
  to: string;
  date: string;
  adults: number;
  children: number;
  cabinClass: string;
  userCountry: string;
  fromCandidates: AirportSuggestion[] | null;
  toCandidates: AirportSuggestion[] | null;
  resolvedFromEntityId?: string;
  resolvedFromIata?: string;
  resolvedToEntityId?: string;
  resolvedToIata?: string;
}

let searchCache: CacheEntry | null = null;
let pendingSession: PendingSession | null = null;

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

function matchFromCandidates(
  input: string,
  candidates: AirportSuggestion[],
): AirportSuggestion | null {
  const q = input.trim().toUpperCase();
  return (
    candidates.find(
      (c) =>
        c.iataCode.toUpperCase() === q ||
        c.name.toUpperCase() === q ||
        c.name.toUpperCase().includes(q),
    ) ?? null
  );
}

function buildAmbiguousBlock(
  label: string,
  term: string,
  airports: AirportSuggestion[],
): string {
  const lines = airports
    .map((a) => `• ${a.name} (${a.iataCode}) — ${a.cityName}, ${a.countryName}`)
    .join("\n");
  return `There are multiple ${label} airports for "${term}" \n${lines}`;
}

async function resolveUserCountry(
  req: NextRequest,
  body: any,
): Promise<{ country: string; setCookie: boolean }> {
  const country = body?.params?.arguments?.userCountry ?? "US";
  return { country, setCookie: false };
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { method, id, params } = body;

    const { country: userCountry } = await resolveUserCountry(req, body);

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
            name: "search_flights",
            description: [
              "Search one-way flights between two airports on a given date.",
              "Pass city names or IATA codes for `from` and `to` — autosuggest runs server-side automatically.",
              "If either airport is ambiguous the tool returns a list; call it again with selectedFromIata and/or selectedToIata set to the IATA code the user chose.",
              "The server resolves all entityIds internally. Only executes the flight search when both airports are fully resolved.",
              "IMPORTANT: The tool returns PRE-FORMATTED MARKDOWN.",
              "You MUST display the response EXACTLY as returned.",
              "Do NOT summarize, paraphrase, or reformat the markdown.",
              "Do NOT convert it into bullet points or plain text.",
              "Render the markdown table exactly as provided.",
              "The Book column MUST be a clickable markdown hyperlink using the 'book' field: [Book](url). Never show raw URLs.",
              "Show direct_flights under heading '### Best Flights (Direct)' and connecting_flights under '### Cheapest Flights (1 Stop)'.",
              "Always end with a View All Results link using the 'view_all' field from the JSON.",
              "Never show raw JSON to the user.",
              "When tool returns status no_flights_found, respond with: No flights found for [from] to [to] on [date]. [Search on FareFirst](url).",
              "CRITICAL: After a successful result is returned, DO NOT call the MCP server again unless at least one of these parameters changes: `from`, `to`, or `date`.",
              "If none of these values change, reuse the existing result and do not trigger another tool call.",
            ].join(" "),
            readOnly: true,
            openWorld: true,
            destructive: false,
            inputSchema: {
              type: "object",
              required: ["from", "to", "date"],
              properties: {
                from: {
                  type: "string",
                  description:
                    "Origin city name or IATA code (e.g. 'Goa' or 'GOI')",
                },
                to: {
                  type: "string",
                  description:
                    "Destination city name or IATA code (e.g. 'New York' or 'JFK')",
                },
                date: {
                  type: "string",
                  description: "Travel date in ISO format YYYY-MM-DD",
                },
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
                selectedFromIata: {
                  type: "string",
                  description:
                    "IATA code the user chose for origin from an ambiguous list. Set ONLY after the tool returned an ambiguous origin list.",
                },
                selectedToIata: {
                  type: "string",
                  description:
                    "IATA code the user chose for destination from an ambiguous list. Set ONLY after the tool returned an ambiguous destination list.",
                },
              },
            },
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
        selectedFromIata,
        selectedToIata,
        userCountry: rawUserCountry,
      } = params.arguments ?? {};

      const effectiveUserCountry: string = rawUserCountry ?? userCountry;

      if (!from || !to || !date) {
        return mcpResponse(id, {
          content: [
            {
              type: "text",
              text: "Please provide origin, destination, and travel date.",
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
              text: `Travel date (${formatReadable(isoDate)}) is in the past. Please provide a future date.`,
            },
          ],
        });
      }

      const session = pendingSession;
      const fromInput = selectedFromIata ?? from;
      const toInput = selectedToIata ?? to;

      let resolvedFromEntityId: string | undefined =
        session?.resolvedFromEntityId;
      let resolvedFromIata: string = session?.resolvedFromIata ?? from;
      let fromCandidates: AirportSuggestion[] | null = null;
      let fromNeedsAutosuggest = true;

      if (session?.fromCandidates) {
        const match = matchFromCandidates(fromInput, session.fromCandidates);
        if (match) {
          resolvedFromEntityId = match.entityId;
          resolvedFromIata = match.iataCode;
          fromNeedsAutosuggest = false;
        } else {
          fromCandidates = session.fromCandidates;
          fromNeedsAutosuggest = true;
        }
      } else if (session && !session.fromCandidates) {
        fromNeedsAutosuggest = false;
      }

      let resolvedToEntityId: string | undefined = session?.resolvedToEntityId;
      let resolvedToIata: string = session?.resolvedToIata ?? to;
      let toCandidates: AirportSuggestion[] | null = null;
      let toNeedsAutosuggest = true;

      if (session?.toCandidates) {
        const match = matchFromCandidates(toInput, session.toCandidates);
        if (match) {
          resolvedToEntityId = match.entityId;
          resolvedToIata = match.iataCode;
          toNeedsAutosuggest = false;
        } else {
          toCandidates = session.toCandidates;
          toNeedsAutosuggest = true;
        }
      } else if (session && !session.toCandidates) {
        toNeedsAutosuggest = false;
      }

      if (fromNeedsAutosuggest || toNeedsAutosuggest) {
        const [originResult, destResult] = await Promise.all([
          fromNeedsAutosuggest
            ? resolveAirportWithLogic(fromInput, "IN")
            : Promise.resolve(null),
          toNeedsAutosuggest
            ? resolveAirportWithLogic(toInput, "US")
            : Promise.resolve(null),
        ]);

        if (originResult !== null) {
          if (originResult.status === "resolved") {
            resolvedFromEntityId = originResult.airport.entityId;
            resolvedFromIata = originResult.airport.iataCode;
            fromCandidates = null;
          } else if (originResult.status === "ambiguous") {
            fromCandidates = originResult.airports;
          } else {
            return mcpResponse(id, {
              content: [
                {
                  type: "text",
                  text: `Could not find origin airport for "${fromInput}". Please try a different name or IATA code.`,
                },
              ],
            });
          }
        }

        if (destResult !== null) {
          if (destResult.status === "resolved") {
            resolvedToEntityId = destResult.airport.entityId;
            resolvedToIata = destResult.airport.iataCode;
            toCandidates = null;
          } else if (destResult.status === "ambiguous") {
            toCandidates = destResult.airports;
          } else {
            return mcpResponse(id, {
              content: [
                {
                  type: "text",
                  text: `Could not find destination airport for "${toInput}". Please try a different name or IATA code.`,
                },
              ],
            });
          }
        }
      }

      if (fromCandidates || toCandidates) {
        pendingSession = {
          from,
          to,
          date: isoDate,
          adults,
          children,
          cabinClass,
          userCountry: effectiveUserCountry,
          fromCandidates,
          toCandidates,
          resolvedFromEntityId,
          resolvedFromIata,
          resolvedToEntityId,
          resolvedToIata,
        };

        const ambiguousBlocks: string[] = [];
        if (fromCandidates)
          ambiguousBlocks.push(
            buildAmbiguousBlock("origin", fromInput, fromCandidates),
          );
        if (toCandidates)
          ambiguousBlocks.push(
            buildAmbiguousBlock("destination", toInput, toCandidates),
          );

        const suffix =
          ambiguousBlocks.length > 1
            ? '\n\nPlease reply with both IATA codes (e.g. "GOI" for Goa, "JFK" for New York).'
            : "\n\nPlease reply with the IATA code to continue.";

        return mcpResponse(id, {
          content: [
            { type: "text", text: ambiguousBlocks.join("\n\n") + suffix },
          ],
        });
      }

      pendingSession = null;
      return await runSearch({
        id,
        from: resolvedFromIata,
        to: resolvedToIata,
        date: isoDate,
        adults,
        children,
        cabinClass,
        fromEntityId: resolvedFromEntityId!,
        toEntityId: resolvedToEntityId!,
        userCountry: effectiveUserCountry,
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

async function runSearch({
  id,
  from,
  to,
  date,
  adults,
  children,
  cabinClass,
  fromEntityId,
  toEntityId,
  userCountry,
}: {
  id: string | number | null;
  from: string;
  to: string;
  date: string;
  adults: number;
  children: number;
  cabinClass: string;
  fromEntityId: string;
  toEntityId: string;
  userCountry: string;
}) {
  const cacheKey = makeCacheKey(
    from,
    to,
    date,
    adults,
    children,
    cabinClass,
    userCountry,
  );

  if (searchCache?.key === cacheKey) {
    return mcpResponse(id, {
      content: [{ type: "text", text: searchCache.markdown }],
    });
  }

  const result: FlightSearchResult = await fetchFlights(
    from,
    to,
    date,
    adults,
    children,
    cabinClass,
    fromEntityId,
    toEntityId,
    userCountry,
  );

  const flights = sortFlights(result.flights);
  const formattedDate = date.replace(/-/g, "");

  if (flights.length === 0) {
    const link = `${RESULTS_URL}${from}-${formattedDate}-${to}?adults=${adults}&children=${children}&ages=&cabin_class=Y&trip_type=oneway`;

    return mcpResponse(id, {
      content: [
        {
          type: "text",
          text:
            `Flights found from ${from} to ${to} on ${date}.\n\n` +
            `Please visit FareFirst for more options.\n\n` +
            `[Results on FareFirst](${link})`,
        },
      ],
    });
  }

  const markdown = await formatFlightsAsMarkdown(
    flights,
    from,
    to,
    date,
    fromEntityId,
    toEntityId,
    adults,
    children,
    userCountry,
  );

  searchCache = { key: cacheKey, result, markdown };

  return mcpResponse(id, {
    content: [{ type: "text", text: markdown }],
  });
}
