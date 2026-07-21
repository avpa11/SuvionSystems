import fs from "fs";
import os from "os";
import path from "path";

export interface ValidationSource {
  id: string;
  title: string;
  url: string;
  domains: string[];
  query: string;
  fetchedAt: string | null;
  status: "reference" | "verified" | "unavailable" | "error";
  snippet?: string;
  error?: string;
}

export interface ValidationSourcesResponse {
  configured: boolean;
  refreshedAt: string | null;
  sources: ValidationSource[];
}

const FIRECRAWL_API_URL = process.env.FIRECRAWL_API_URL || "https://api.firecrawl.dev";
const CACHE_PATH =
  process.env.VALIDATION_SOURCE_CACHE_PATH ??
  path.join(os.tmpdir(), "suvion-validation-sources.json");

export const OFFICIAL_SOURCE_DEFINITIONS: ValidationSource[] = [
  {
    id: "imo-cii-g1",
    title: "IMO MEPC.352(78) CII calculation guidelines",
    url: "https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/MEPC.352(78).pdf",
    domains: ["imo.org", "wwwcdn.imo.org"],
    query: "IMO MEPC.352(78) CII calculation fuel consumption CF",
    fetchedAt: null,
    status: "reference",
  },
  {
    id: "imo-eedi-cf",
    title: "IMO MEPC.364(79) fuel to CO2 conversion factors",
    url: "https://wwwcdn.imo.org/localresources/en/OurWork/Environment/Documents/Air%20pollution/MEPC.364(79).pdf",
    domains: ["imo.org", "wwwcdn.imo.org"],
    query: "IMO MEPC.364(79) conversion factor CF HFO LNG MGO",
    fetchedAt: null,
    status: "reference",
  },
  {
    id: "imo-fourth-ghg-study",
    title: "IMO Fourth Greenhouse Gas Study 2020",
    url: "https://www.imo.org/en/OurWork/Environment/Pages/Fourth-IMO-Greenhouse-Gas-Study-2020.aspx",
    domains: ["imo.org", "www.imo.org"],
    query: "IMO Fourth Greenhouse Gas Study 2020 shipping emissions global anthropogenic emissions 2.89%",
    fetchedAt: null,
    status: "reference",
  },
  {
    id: "epa-passenger-vehicle-co2",
    title: "EPA greenhouse gas emissions from a typical passenger vehicle",
    url: "https://www.epa.gov/greenvehicles/greenhouse-gas-emissions-typical-passenger-vehicle",
    domains: ["epa.gov", "www.epa.gov"],
    query: "EPA typical passenger vehicle emits 4.6 metric tons carbon dioxide per year",
    fetchedAt: null,
    status: "reference",
  },
  {
    id: "epa-ghg-equivalencies",
    title: "EPA greenhouse gas equivalencies calculations and references",
    url: "https://www.epa.gov/energy/greenhouse-gas-equivalencies-calculator-calculations-and-references",
    domains: ["epa.gov", "www.epa.gov"],
    query: "EPA greenhouse gas equivalencies 8887 grams CO2 per gallon gasoline 10180 grams CO2 per gallon diesel",
    fetchedAt: null,
    status: "reference",
  },
  {
    id: "signalk-subscriptions",
    title: "Signal K delta stream and subscription protocol",
    url: "https://signalk.org/specification/1.7.0/doc/data_model.html",
    domains: ["signalk.org"],
    query: "Signal K WebSocket stream subscribe none vessels self delta",
    fetchedAt: null,
    status: "reference",
  },
];

function cloneReferenceSources(): ValidationSource[] {
  return OFFICIAL_SOURCE_DEFINITIONS.map((source) => ({ ...source }));
}

function mergeCachedSources(cache: ValidationSourcesResponse | null): ValidationSourcesResponse {
  if (!cache) {
    return {
      configured: Boolean(process.env.FIRECRAWL_API_KEY),
      refreshedAt: null,
      sources: cloneReferenceSources(),
    };
  }

  const cachedById = new Map(cache.sources.map((source) => [source.id, source]));
  return {
    configured: Boolean(process.env.FIRECRAWL_API_KEY),
    refreshedAt: cache.refreshedAt,
    sources: OFFICIAL_SOURCE_DEFINITIONS.map((definition) => ({
      ...definition,
      ...cachedById.get(definition.id),
      domains: definition.domains,
      query: definition.query,
    })),
  };
}

function readCache(): ValidationSourcesResponse | null {
  try {
    const raw = fs.readFileSync(CACHE_PATH, "utf8");
    return JSON.parse(raw) as ValidationSourcesResponse;
  } catch {
    return null;
  }
}

function writeCache(payload: ValidationSourcesResponse): void {
  fs.writeFileSync(CACHE_PATH, JSON.stringify(payload, null, 2), "utf8");
}

export function getValidationSources(): ValidationSourcesResponse {
  return mergeCachedSources(readCache());
}

interface FirecrawlSearchResult {
  title?: string;
  url?: string;
  description?: string;
  markdown?: string;
}

interface FirecrawlSearchResponse {
  data?: FirecrawlSearchResult[] | { web?: FirecrawlSearchResult[] };
  success?: boolean;
  error?: string;
}

function extractFirecrawlWebResults(body: FirecrawlSearchResponse): FirecrawlSearchResult[] {
  if (Array.isArray(body.data)) {
    return body.data;
  }

  return body.data?.web ?? [];
}

export async function refreshValidationSources(
  fetchImpl: typeof fetch = fetch
): Promise<ValidationSourcesResponse> {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  const refreshedAt = new Date().toISOString();

  if (!apiKey) {
    const response = {
      configured: false,
      refreshedAt,
      sources: cloneReferenceSources().map((source) => ({
        ...source,
        status: "unavailable" as const,
        error: "FIRECRAWL_API_KEY is not configured",
      })),
    };
    writeCache(response);
    return response;
  }

  const sources = await Promise.all(
    OFFICIAL_SOURCE_DEFINITIONS.map(async (source) => {
      try {
        const res = await fetchImpl(`${FIRECRAWL_API_URL}/v2/search`, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            query: source.query,
            limit: 3,
            sources: ["web"],
            includeDomains: source.domains,
          }),
        });

        if (!res.ok) {
          return {
            ...source,
            fetchedAt: refreshedAt,
            status: "error" as const,
            error: `Firecrawl search failed with HTTP ${res.status}`,
          };
        }

        const body = (await res.json()) as FirecrawlSearchResponse;
        const results = extractFirecrawlWebResults(body);
        const match = results.find((item) =>
          source.domains.some((domain) => item.url?.includes(domain))
        );

        return {
          ...source,
          url: match?.url ?? source.url,
          title: match?.title ?? source.title,
          snippet: match?.description ?? match?.markdown?.slice(0, 240),
          fetchedAt: refreshedAt,
          status: match ? ("verified" as const) : ("reference" as const),
          error: body.error,
        };
      } catch (err) {
        return {
          ...source,
          fetchedAt: refreshedAt,
          status: "error" as const,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    })
  );

  const response = { configured: true, refreshedAt, sources };
  writeCache(response);
  return response;
}
