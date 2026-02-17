import {
  FlightSummary,
  SearchResponse,
  DateObj,
  BOOKING_URL,
  RESULTS_URL,
} from "./types";

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

export function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
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

    if (!itineraries || !legs || !carriers) {
      console.error("Missing required data fields in API response");
      return [];
    }

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
      let formattedPrice = "Price N/A";

      if (priceAmount && priceUnit === "PRICE_UNIT_MILLI") {
        priceRaw = parseInt(priceAmount) / 1000;
        formattedPrice = `Rs. ${priceRaw.toLocaleString("en-IN")}`;
      }

      const carrierId = leg.marketingCarrierIds?.[0];
      const carrier = carrierId ? carriers[carrierId] : null;
      const deeplink = pricingOption?.items?.[0]?.deepLink;
      const airlineName =
        carrier?.name?.trim() ||
        carrier?.displayCode?.trim() ||
        carrier?.iata?.trim() ||
        (carrierId ? String(carrierId) : null) ||
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

      if (stopCount > 0 && segments && (leg.segmentIds?.length ?? 0) > 1) {
        const firstSeg = segments[leg.segmentIds[0]];
        const secondSeg = segments[leg.segmentIds[1]];

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

          const layoverMins = Math.floor((depMs - arrMs) / 60_000);
          const layoverPlace = firstSeg.destinationPlaceId
            ? places?.[firstSeg.destinationPlaceId]
            : null;
          const layoverCity = layoverPlace?.iata ?? "";

          layoverText = `${formatDuration(layoverMins)} layover in ${layoverCity}`;
        }
      }

      flights.push({
        tripType: stopCount === 0 ? "Nonstop" : "One Stop",
        airline: airlineName,
        duration,
        from: originCode,
        to: destCode,
        price: formattedPrice,
        priceRaw,
        departureTime,
        arrivalTime,
        stops: stopsText,
        stopCount,
        layover: layoverText,
        deeplink: deeplink,
      });
    }

    console.log(
      `Extracted ${flights.length} flights from ${itineraryIds.length} itineraries`,
    );
    return flights;
  } catch (error) {
    console.error("Error extracting flight data:", error);
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
): string {
  const dateCompact = date.replace(/-/g, "");
  const directFlights = flights.filter((f) => f.stopCount === 0);
  const stopFlights = flights
    .filter((f) => f.stopCount > 0)
    .sort((a, b) => a.priceRaw - b.priceRaw);

  const lines: string[] = [];
  lines.push(
    `IMPORTANT: Output the following flight results EXACTLY as shown below.`,
    `Do not summarize, group, reorder, or reformat. Show every flight card in full.`,
    ``,
  );

  lines.push(
    `## Flights: ${from} → ${to} | ${date}`,
    `${flights.length} flights found | Economy | Per adult`,
    ``,
  );

  const tableHeader = [
    `| Airline | Departure | Arrival | Duration | Stops | Price | Book |`,
    `|---------|-----------|---------|----------|-------|-------|------|`,
  ];

  if (directFlights.length > 0) {
    lines.push(`### Best Flights (Direct)`, ``);
    lines.push(...tableHeader);
    directFlights.forEach((f) => lines.push(renderFlightRow(f)));
    lines.push(``);
  }

  if (stopFlights.length > 0) {
    lines.push(`### Cheapest Flights (1 Stop)`, ``);
    lines.push(...tableHeader);
    stopFlights.forEach((f) => lines.push(renderFlightRow(f)));
    lines.push(``);
  }

  lines.push(
    `---`,
    ``,
    `[Book on FareFirst](${BOOKING_URL})`,
    ``,
    `[View All Results](${RESULTS_URL}/${fromEntityId ?? from}-${dateCompact}-${toEntityId ?? to}?adults=${adults}&children=${children}&ages=&cabin_class=Y&trip_type=oneway)`,
    ``,
  );

  return lines.join("\n");
}

function renderFlightRow(flight: FlightSummary): string {
  const stops = flight.layover
    ? `${flight.stops} (${flight.layover})`
    : flight.stops;

  const bookLink = `[Book](${flight.deeplink})`;

  return `| ${flight.airline} | ${flight.departureTime} | ${flight.arrivalTime} | ${flight.duration} | ${stops} | ${flight.price} | ${bookLink} |`;
}
