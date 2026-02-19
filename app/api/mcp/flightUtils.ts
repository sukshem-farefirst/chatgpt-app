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
  return `${hour.toString().padStart(2, "0")}:${minute
    .toString()
    .padStart(2, "0")}`;
}

function formatTime24to12(time: string): string {
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

export function extractData(
  searchData: SearchResponse,
  from: string,
  to: string,
): FlightSummary[] {
  const flights: FlightSummary[] = [];
  let layovers: string[] = [];

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
      const stopsText =
        stopCount === 0
          ? "Direct"
          : `${stopCount} stop${stopCount > 1 ? "s" : ""}`;

      let layoverText: string | undefined;
      layovers = [];

      if (stopCount > 0 && segments && (leg.segmentIds?.length ?? 0) > 1) {
        for (let i = 0; i < leg.segmentIds.length - 1; i++) {
          const firstSeg = segments[leg.segmentIds[i]];
          const secondSeg = segments[leg.segmentIds[i + 1]];

          if (firstSeg && secondSeg) {
            const arrDT = firstSeg.arrivalDateTime;
            const depDT = secondSeg.departureDateTime;

            const arrMs = new Date(
              arrDT.year,
              arrDT.month - 1,
              arrDT.day,
              arrDT.hour,
              arrDT.minute,
            ).getTime();

            const depMs = new Date(
              depDT.year,
              depDT.month - 1,
              depDT.day,
              depDT.hour,
              depDT.minute,
            ).getTime();

            const layoverMins = Math.floor((depMs - arrMs) / 60000);

            const layoverPlace = firstSeg.destinationPlaceId
              ? places?.[firstSeg.destinationPlaceId]
              : null;

            const layoverCity = layoverPlace?.iata ?? "Unknown City";

            layovers.push(
              `${formatDuration(layoverMins)} layover at ${layoverCity}`,
            );
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
        stops: stopsText,
        stopCount,
        layover: layoverText,
        deeplink,
        layovers,
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

export function formatFlightsAsMarkdown(
  flights: FlightSummary[],
  from: string,
  to: string,
  date: string,
  fromEntityId?: string,
  toEntityId?: string,
  adults: number = 1,
  children: number = 0,
  userCountry?: string,
): string {
  const dateCompact = date.replace(/-/g, "");
  const currency = getCurrencyFromCountry(userCountry);

  const directFlights = flights.filter((f) => f.stopCount === 0);
  const stopFlights = flights
    .filter((f) => f.stopCount > 0)
    .sort((a, b) => a.priceRaw - b.priceRaw);

  const lines: string[] = [];

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
    lines.push(`### Cheapest Flights (1 Stop)`, ``);
    lines.push(...tableHeader);
    stopFlights.forEach((f) => lines.push(renderFlightRow(f, currency)));
    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `[View All Results](${RESULTS_URL}/${fromEntityId ?? from}-${dateCompact}-${toEntityId ?? to}?adults=${adults}&children=${children}&ages=&cabin_class=Y&trip_type=oneway)`,
    ``,
  );

  return lines.join("\n");
}

function renderFlightRow(flight: FlightSummary, currency: string): string {
  const stops =
    flight.stopCount === 0
      ? "Direct"
      : `${flight.stopCount} stop${flight.stopCount > 1 ? "s" : ""}`;

  const layovers =
    flight.layovers && flight.layovers.length > 0
      ? `(${flight.layovers.join(", ")})`
      : "";

  const stopsWithLayovers = stops + (layovers ? ` ${layovers}` : "");

  const departure = formatTime24to12(flight.departureTime);
  const arrival = formatTime24to12(flight.arrivalTime);
  const formattedPrice = formatPrice(flight.priceRaw, currency);

  const bookLink = `[Book](Deeplink)`;

  return `| ${flight.airline} | ${departure} | ${arrival} | ${flight.duration} | ${stopsWithLayovers} | ${formattedPrice} | ${bookLink} |`;
}
