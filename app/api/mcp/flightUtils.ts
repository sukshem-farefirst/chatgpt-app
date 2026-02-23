import { FlightSummary, SearchResponse, DateObj, RESULTS_URL } from "./types";

export function getDefaultDate(): string {
  const date = new Date();
  date.setDate(date.getDate() + 7);
  return date.toISOString().split("T")[0];
}

export function parseDateToAPIFormat(dateStr: string): DateObj {
  const [year, month, day] = dateStr.split("-").map(Number);
  return { year, month, day };
}

export function formatTime(datetime: any): string {
  if (!datetime) return "N/A";
  const { hour, minute } = datetime;
  return `${hour.toString().padStart(2, "0")}:${minute.toString().padStart(2, "0")}`;
}

function formatTime24to12(time: string): string {
  if (!time || time === "N/A") return "N/A";
  const [hourStr, minute] = time.split(":");
  const hour = parseInt(hourStr, 10);
  const period = hour >= 12 ? "pm" : "am";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return `${h12}:${minute} ${period}`;
}

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

const CURRENCY_SYMBOL: Record<string, string> = {
  INR: "₹",
  USD: "$",
  GBP: "£",
  EUR: "€",
  AED: "AED",
  AUD: "A$",
  CAD: "C$",
  SGD: "S$",
  JPY: "¥",
  CNY: "¥",
};

const COUNTRY_TO_CURRENCY: Record<string, string> = {
  IN: "INR",
  US: "USD",
  GB: "GBP",
  AE: "AED",
  AU: "AUD",
  CA: "CAD",
  SG: "SGD",
  JP: "JPY",
  CN: "CNY",
};

function getCurrencyFromCountry(userCountry?: string): string {
  if (!userCountry) return "USD";
  return COUNTRY_TO_CURRENCY[userCountry.toUpperCase()] ?? "USD";
}

export function formatPrice(milliAmount: number, currency: string): string {
  const amount = milliAmount / 1000;
  const symbol = CURRENCY_SYMBOL[currency] ?? `${currency} `;
  const formatted = amount.toLocaleString("en-US", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  return `${symbol}${formatted}`;
}

async function shortenDeeplinks(urls: string[]): Promise<string[]> {
  try {
    const response = await fetch(
      "https://shortnerurl-5oz2r3w4ya-uc.a.run.app/shorten",
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls }),
      },
    );
    if (!response.ok) return urls;
    const data = await response.json();
    if (!data?.shortUrls || !Array.isArray(data.shortUrls)) return urls;
    return data.shortUrls;
  } catch {
    return urls;
  }
}

async function attachShortLinks(
  flights: FlightSummary[],
): Promise<FlightSummary[]> {
  const allUrls: string[] = [];

  flights.forEach((flight) => {
    const deeplinks = Array.isArray(flight.deeplink)
      ? flight.deeplink
      : typeof flight.deeplink === "string"
        ? [flight.deeplink]
        : [];
    allUrls.push(...deeplinks);
  });

  if (allUrls.length === 0) return flights;

  const shortUrls = await shortenDeeplinks(allUrls);
  let index = 0;

  return flights.map((flight) => {
    const deeplinks = Array.isArray(flight.deeplink)
      ? flight.deeplink
      : typeof flight.deeplink === "string"
        ? [flight.deeplink]
        : [];
    const updatedLinks = shortUrls.slice(index, index + deeplinks.length);
    index += deeplinks.length;
    return { ...flight, deeplink: updatedLinks };
  });
}

export function extractData(
  searchData: SearchResponse,
  from: string,
  to: string,
): FlightSummary[] {
  const flights: FlightSummary[] = [];

  try {
    const { itineraries, legs, carriers, places, segments } =
      searchData.content?.results ?? {};

    if (!itineraries || !legs || !carriers) return [];

    const itineraryIds = Object.keys(itineraries).slice(0, 10);

    for (const itineraryId of itineraryIds) {
      const itinerary = itineraries[itineraryId];
      const legId = itinerary.legIds?.[0];
      if (!legId) continue;

      const leg = legs[legId];
      if (!leg) continue;

      const pricingOption = itinerary.pricingOptions?.[0];
      const priceAmount = pricingOption?.price?.amount;
      const priceUnit = pricingOption?.price?.unit;

      let priceRaw = 0;
      if (priceAmount && priceUnit === "PRICE_UNIT_MILLI") {
        priceRaw = parseInt(priceAmount);
      }

      const carrierId = leg.marketingCarrierIds?.[0];
      const carrier = carrierId ? carriers[carrierId] : null;
      const deeplink = pricingOption?.items?.[0]?.deepLink;

      const airlineName =
        carrier?.name?.trim() ||
        carrier?.displayCode?.trim() ||
        carrier?.iata?.trim() ||
        "Unknown Airline";

      const originPlace = leg.originPlaceId
        ? places?.[leg.originPlaceId]
        : null;
      const destPlace = leg.destinationPlaceId
        ? places?.[leg.destinationPlaceId]
        : null;

      const originCode = originPlace?.iata ?? from;
      const destCode = destPlace?.iata ?? to;

      const departureTime = formatTime(leg.departureDateTime);
      const arrivalTime = formatTime(leg.arrivalDateTime);
      const duration = formatDuration(leg.durationInMinutes ?? 0);
      const stopCount: number = leg.stopCount ?? 0;

      let layovers: string[] = [];

      if (stopCount > 0 && segments && leg.segmentIds?.length > 1) {
        for (let i = 0; i < leg.segmentIds.length - 1; i++) {
          const firstSeg = segments[leg.segmentIds[i]];
          const nextSeg = segments[leg.segmentIds[i + 1]];

          if (!firstSeg || !nextSeg) continue;

          const layoverPlace = firstSeg.destinationPlaceId
            ? places?.[firstSeg.destinationPlaceId]
            : null;

          const layoverCity = layoverPlace?.iata ?? "Unknown";

          const arr = firstSeg.arrivalDateTime;
          const dep = nextSeg.departureDateTime;

          if (!arr || !dep) {
            layovers.push(layoverCity);
            continue;
          }

          const arrival = new Date(
            arr.year,
            arr.month - 1,
            arr.day,
            arr.hour,
            arr.minute,
          ).getTime();

          const departure = new Date(
            dep.year,
            dep.month - 1,
            dep.day,
            dep.hour,
            dep.minute,
          ).getTime();

          const diff = Math.floor((departure - arrival) / 60000);

          if (diff <= 0 || isNaN(diff)) {
            layovers.push(layoverCity);
          } else {
            layovers.push(`${layoverCity} - ${formatDuration(diff)}`);
          }
        }
      }

      flights.push({
        tripType: stopCount === 0 ? "Nonstop" : "One Stop",
        airline: airlineName,
        duration,
        from: originCode,
        to: destCode,
        price: "",
        priceRaw,
        departureTime,
        arrivalTime,
        stops: stopCount === 0 ? "Direct" : `${stopCount} stop`,
        stopCount,
        layovers,
        deeplink,
      });
    }

    return flights;
  } catch {
    return [];
  }
}

export function sortFlights(flights: FlightSummary[]): FlightSummary[] {
  const direct = flights.filter((f) => f.stopCount === 0);
  const oneStop = flights
    .filter((f) => f.stopCount > 0)
    .sort((a, b) => a.priceRaw - b.priceRaw);
  return [...direct, ...oneStop];
}

export function formatFlightObject(f: FlightSummary, currency: string) {
  const layoverStr =
    f.layovers && f.layovers.length > 0 ? ` (${f.layovers.join(", ")})` : "";

  return {
    airline: f.airline,
    departure: formatTime24to12(f.departureTime),
    arrival: formatTime24to12(f.arrivalTime),
    duration: f.duration,
    stops: f.stopCount === 0 ? "Direct" : `${f.stopCount} stop${layoverStr}`,
    price: formatPrice(f.priceRaw, currency),
    book: Array.isArray(f.deeplink)
      ? (f.deeplink[0] ?? null)
      : (f.deeplink ?? null),
  };
}

export async function buildStructuredFlightResponse(
  flights: FlightSummary[],
  from: string,
  to: string,
  date: string,
  adults: number = 1,
  children: number = 0,
  userCountry?: string,
): Promise<string> {
  const currency = getCurrencyFromCountry(userCountry);
  const formattedDate = date.replace(/-/g, "");
  const flightsWithShortLinks = await attachShortLinks(flights);

  const directFlights = flightsWithShortLinks
    .filter((f) => f.stopCount === 0)
    .map((f) => formatFlightObject(f, currency));

  const connectingFlights = flightsWithShortLinks
    .filter((f) => f.stopCount > 0)
    .sort((a, b) => a.priceRaw - b.priceRaw)
    .map((f) => formatFlightObject(f, currency));

  const structured = {
    route: `${from} → ${to}`,
    date,
    direct_flights: directFlights,
    connecting_flights: connectingFlights,
    view_all: `${RESULTS_URL}${from}-${formattedDate}-${to}?adults=${adults}&children=${children}&ages=&cabin_class=Y&trip_type=oneway`,
  };

  return JSON.stringify(structured, null, 2);
}

export async function formatFlightsAsMarkdown(
  flights: FlightSummary[],
  from: string,
  to: string,
  date: string,
  fromEntityId?: string,
  toEntityId?: string,
  adults: number = 1,
  children: number = 0,
  userCountry?: string,
): Promise<string> {
  const dateCompact = date.replace(/-/g, "");
  const currency = getCurrencyFromCountry(userCountry);
  const flightsWithShortLinks = await attachShortLinks(flights);

  const directFlights = flightsWithShortLinks.filter((f) => f.stopCount === 0);
  const stopFlights = flightsWithShortLinks
    .filter((f) => f.stopCount > 0)
    .sort((a, b) => a.priceRaw - b.priceRaw);

  const lines: string[] = [];
  lines.push(`### ${from}-${to} on ${date}`, ``);

  const tableHeader = [
    `| Airline | Departure | Arrival | Duration | Stops | Price | Book |`,
    `|---------|-----------|---------|----------|-------|-------|------|`,
  ];

  if (directFlights.length > 0) {
    lines.push(`### Best Flights (Direct)`, ``);
    lines.push(...tableHeader);
    directFlights.forEach((f) => lines.push(renderFlightRow(f, currency)));
    lines.push(``);
  }

  if (stopFlights.length > 0) {
    const maxStops = Math.max(...stopFlights.map((f) => f.stopCount));
    const stopHeading =
      maxStops === 1
        ? "Cheapest Flights (1 Stop)"
        : "Cheapest Flights (With Stops)";
    lines.push(`### ${stopHeading}`, ``);
    lines.push(...tableHeader);
    stopFlights.forEach((f) => lines.push(renderFlightRow(f, currency)));
    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `[View All Results](${RESULTS_URL}/${from}-${dateCompact}-${to}?adults=${adults}&children=${children}&ages=&cabin_class=Y&trip_type=oneway)`,
    ``,
  );

  return lines.join("\n");
}

function renderFlightRow(flight: FlightSummary, currency: string): string {
  let stops: string;

  if (flight.stopCount === 0) {
    stops = "Direct";
  } else {
    const stopLabel =
      flight.stopCount === 1 ? "1 stop" : `${flight.stopCount} stops`;

    const layoverDetails =
      flight.layovers && flight.layovers.length > 0
        ? ` (${flight.layovers.join(", ")})`
        : "";

    stops = stopLabel + layoverDetails;
  }

  const departure = formatTime24to12(flight.departureTime);
  const arrival = formatTime24to12(flight.arrivalTime);
  const formattedPrice = formatPrice(flight.priceRaw, currency);

  const link =
    Array.isArray(flight.deeplink) && flight.deeplink.length > 0
      ? flight.deeplink[0]
      : undefined;

  const bookLink = link ? `[Book](${link})` : "N/A";

  return `| ${flight.airline} | ${departure} | ${arrival} | ${flight.duration} | ${stops} | ${formattedPrice} | ${bookLink} |`;
}
