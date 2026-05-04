import "server-only";
import type {
  AgodaAvailabilityRequest,
  AgodaBatchAvailabilityRequest,
  AgodaHotelResult,
  AgodaSearchResponse,
} from "./types";

const AGODA_API_HOST = process.env.AGODA_API_HOST?.trim();
const AGODA_CONTENT_PATH = process.env.AGODA_CONTENT_PATH?.trim();
const AGODA_SITE_ID = process.env.AGODA_SITE_ID?.trim();
const AGODA_API_KEY = process.env.AGODA_API_KEY?.trim();
const AGODA_DEFAULT_LANGUAGE = "en-us";

const AGODA_API_URL =
  AGODA_API_HOST && AGODA_CONTENT_PATH
    ? `${AGODA_API_HOST.replace(/\/+$/, "")}/${AGODA_CONTENT_PATH.replace(/^\/+/, "")}`
    : "";

function assertAgodaConfig() {
  if (!AGODA_API_HOST) throw new Error("Missing env AGODA_API_HOST");
  if (!AGODA_CONTENT_PATH) throw new Error("Missing env AGODA_CONTENT_PATH");
  if (!AGODA_SITE_ID) throw new Error("Missing env AGODA_SITE_ID");
  if (!AGODA_API_KEY) throw new Error("Missing env AGODA_API_KEY");
}

function sanitizeCurrency(currency: string): string {
  const clean = currency.trim().toUpperCase();
  return clean || "EUR";
}

function sanitizeLanguage(language: string | undefined): string {
  return language?.trim().toLowerCase() || AGODA_DEFAULT_LANGUAGE;
}

function buildHotelListSearchBody(input: AgodaAvailabilityRequest) {
  const numberOfAdult = Math.max(1, Math.floor(input.occupancy.numberOfAdult || 2));
  const numberOfChildren = Math.max(
    0,
    Math.floor(input.occupancy.numberOfChildren || 0)
  );

  const occupancy: {
    numberOfAdult: number;
    numberOfChildren: number;
    childrenAges?: number[];
  } = {
    numberOfAdult,
    numberOfChildren,
  };

  if (numberOfChildren > 0 && input.occupancy.childrenAges?.length) {
    occupancy.childrenAges = input.occupancy.childrenAges
      .map((age) => Math.max(0, Math.floor(age)))
      .slice(0, numberOfChildren);
  }

  return {
    siteid: Number(AGODA_SITE_ID),
    apikey: AGODA_API_KEY,
    criteria: {
      additional: {
        currency: sanitizeCurrency(input.currency),
        discountOnly: false,
        language: sanitizeLanguage(input.language),
        occupancy,
      },
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      hotelId: [input.hotelId],
    },
  };
}

function buildHotelBatchSearchBody(input: AgodaBatchAvailabilityRequest) {
  const numberOfAdult = Math.max(1, Math.floor(input.occupancy.numberOfAdult || 2));
  const numberOfChildren = Math.max(
    0,
    Math.floor(input.occupancy.numberOfChildren || 0)
  );

  const occupancy: {
    numberOfAdult: number;
    numberOfChildren: number;
    childrenAges?: number[];
  } = {
    numberOfAdult,
    numberOfChildren,
  };

  if (numberOfChildren > 0 && input.occupancy.childrenAges?.length) {
    occupancy.childrenAges = input.occupancy.childrenAges
      .map((age) => Math.max(0, Math.floor(age)))
      .slice(0, numberOfChildren);
  }

  return {
    siteid: AGODA_SITE_ID,
    apikey: AGODA_API_KEY,
    criteria: {
      additional: {
        currency: sanitizeCurrency(input.currency),
        discountOnly: false,
        language: sanitizeLanguage(input.language),
        occupancy,
      },
      checkInDate: input.checkInDate,
      checkOutDate: input.checkOutDate,
      hotelId: input.hotelIds,
    },
  };
}

export async function searchAgodaHotelAvailability(
  input: AgodaAvailabilityRequest
): Promise<AgodaHotelResult | null> {
  assertAgodaConfig();

  const response = await fetch(AGODA_API_URL!, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip,deflate",
      Authorization: `${AGODA_SITE_ID}:${AGODA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildHotelListSearchBody(input)),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("AGODA RESPONSE STATUS:", response.status);
    console.error("AGODA RESPONSE BODY:", body);
    throw new Error(`Agoda request failed (${response.status})`);
  }

    const json = (await response.json()) as AgodaSearchResponse;

    if (json.error) {
        if (json.error.id === 911) return null;
        console.warn("AGODA ERROR:", json.error);
        return null;
    }

    return json.results?.[0] ?? null;
}

export async function searchAgodaHotelAvailabilityBatch(
  input: AgodaBatchAvailabilityRequest
): Promise<AgodaHotelResult[]> {
  assertAgodaConfig();

  const response = await fetch(AGODA_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Accept-Encoding": "gzip,deflate",
      Authorization: `${AGODA_SITE_ID}:${AGODA_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(buildHotelBatchSearchBody(input)),
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    console.error("AGODA BATCH REQUEST URL:", AGODA_API_URL);
    console.error("AGODA BATCH RESPONSE STATUS:", response.status);
    console.error("AGODA BATCH RESPONSE BODY:", body);
    throw new Error(`Agoda batch request failed (${response.status}) ${body}`);
  }

  const json = (await response.json()) as AgodaSearchResponse;

  if (json.error) {
    if (json.error.id === 911) return [];
    console.warn("AGODA BATCH ERROR:", json.error);
    return [];
  }

  return json.results ?? [];
}