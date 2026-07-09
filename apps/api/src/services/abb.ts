export interface AbbHealthResponse {
  configured: boolean;
  status: "not_configured" | "token_ok" | "healthy" | "error";
  tokenUrl?: string;
  baseUrl?: string;
  healthUrl?: string;
  message?: string;
}

export interface AbbRouteCheckResponse {
  configured: boolean;
  comparable: boolean;
  status: "not_configured" | "submitted" | "not_comparable" | "error";
  endpoint?: string;
  message?: string;
  abbResponse?: unknown;
  comparison?: {
    localFuelConsumedL?: number;
    localCo2EmittedKg?: number;
    abbFuelConsumed?: number;
    abbCo2Emitted?: number;
  };
}

type FetchImpl = typeof fetch;

function abbConfigured(): boolean {
  return Boolean(
    process.env.ABB_TOKEN_URL &&
      process.env.ABB_CLIENT_ID &&
      process.env.ABB_CLIENT_SECRET &&
      process.env.ABB_BASE_URL
  );
}

async function requestAbbToken(fetchImpl: FetchImpl): Promise<string> {
  const params = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: process.env.ABB_CLIENT_ID ?? "",
    client_secret: process.env.ABB_CLIENT_SECRET ?? "",
  });

  if (process.env.ABB_OAUTH_SCOPE) {
    params.set("scope", process.env.ABB_OAUTH_SCOPE);
  }

  const response = await fetchImpl(process.env.ABB_TOKEN_URL ?? "", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });

  if (!response.ok) {
    throw new Error(`ABB token request failed with HTTP ${response.status}`);
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) {
    throw new Error("ABB token response did not include access_token");
  }
  return body.access_token;
}

export async function checkAbbHealth(fetchImpl: FetchImpl = fetch): Promise<AbbHealthResponse> {
  if (!abbConfigured()) {
    return {
      configured: false,
      status: "not_configured",
      message: "ABB_TOKEN_URL, ABB_CLIENT_ID, ABB_CLIENT_SECRET, and ABB_BASE_URL are required.",
    };
  }

  try {
    const token = await requestAbbToken(fetchImpl);
    const baseUrl = process.env.ABB_BASE_URL;
    const healthUrl = process.env.ABB_HEALTH_URL;

    if (!healthUrl) {
      return {
        configured: true,
        status: "token_ok",
        tokenUrl: process.env.ABB_TOKEN_URL,
        baseUrl,
        message: `OAuth token acquired (${token.length} chars); set ABB_HEALTH_URL for an API health probe.`,
      };
    }

    const response = await fetchImpl(healthUrl, {
      headers: { Authorization: `Bearer ${token}` },
    });

    return {
      configured: true,
      status: response.ok ? "healthy" : "error",
      tokenUrl: process.env.ABB_TOKEN_URL,
      baseUrl,
      healthUrl,
      message: `ABB health probe returned HTTP ${response.status}`,
    };
  } catch (err) {
    return {
      configured: true,
      status: "error",
      tokenUrl: process.env.ABB_TOKEN_URL,
      baseUrl: process.env.ABB_BASE_URL,
      healthUrl: process.env.ABB_HEALTH_URL,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}

function findNumeric(obj: unknown, keys: string[]): number | undefined {
  if (!obj || typeof obj !== "object") return undefined;
  const record = obj as Record<string, unknown>;

  for (const [key, value] of Object.entries(record)) {
    if (keys.includes(key) && typeof value === "number") return value;
    if (value && typeof value === "object") {
      const nested = findNumeric(value, keys);
      if (typeof nested === "number") return nested;
    }
  }

  return undefined;
}

export async function checkAbbRoute(
  payload: Record<string, unknown>,
  fetchImpl: FetchImpl = fetch
): Promise<AbbRouteCheckResponse> {
  if (!abbConfigured()) {
    return {
      configured: false,
      comparable: false,
      status: "not_configured",
      message: "ABB route checks require ABB OAuth and base URL environment variables.",
    };
  }

  const endpoint =
    process.env.ABB_ROUTE_CHECK_ENDPOINT ||
    `${process.env.ABB_BASE_URL?.replace(/\/$/, "")}/recommended-speed`;

  try {
    const token = await requestAbbToken(fetchImpl);
    const response = await fetchImpl(endpoint, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const abbResponse = (await response.json().catch(() => ({}))) as unknown;
    if (!response.ok) {
      return {
        configured: true,
        comparable: false,
        status: "error",
        endpoint,
        message: `ABB route check failed with HTTP ${response.status}`,
        abbResponse,
      };
    }

    const localFuelConsumedL =
      typeof payload.localFuelConsumedL === "number" ? payload.localFuelConsumedL : undefined;
    const localCo2EmittedKg =
      typeof payload.localCo2EmittedKg === "number" ? payload.localCo2EmittedKg : undefined;
    const abbFuelConsumed = findNumeric(abbResponse, ["fuelConsumedL", "fuelConsumption", "fuel"]);
    const abbCo2Emitted = findNumeric(abbResponse, ["co2EmittedKg", "co2Emission", "co2"]);
    const comparable =
      typeof localFuelConsumedL === "number" ||
      typeof localCo2EmittedKg === "number" ||
      typeof abbFuelConsumed === "number" ||
      typeof abbCo2Emitted === "number";

    return {
      configured: true,
      comparable,
      status: comparable ? "submitted" : "not_comparable",
      endpoint,
      message: comparable
        ? "ABB returned route data with at least one comparable numeric field."
        : "ABB accepted the request, but the response did not include comparable fuel or CO2 totals.",
      abbResponse,
      comparison: {
        localFuelConsumedL,
        localCo2EmittedKg,
        abbFuelConsumed,
        abbCo2Emitted,
      },
    };
  } catch (err) {
    return {
      configured: true,
      comparable: false,
      status: "error",
      endpoint,
      message: err instanceof Error ? err.message : String(err),
    };
  }
}
