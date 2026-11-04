import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import fs from "fs";
import { refreshValidationSources } from "../services/officialSources.js";
import { runValidationAgent } from "../services/validationAgent.js";
import {
  buildRealtimeCallsSessionPayload,
  getRealtimeAgentStatus,
  getRealtimeSessionConfig,
} from "../services/realtimeAgent.js";
import { getCurrentWeather } from "../services/weather.js";
import {
  clearVesselContextForTest,
  formatVesselContextForAgent,
  getVesselContext,
  recordVesselReading,
} from "../services/vesselContext.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
  clearVesselContextForTest();
  delete process.env.FIRECRAWL_API_KEY;
  delete process.env.OPENAI_API_KEY;
  delete process.env.VALIDATION_AGENT_ENABLED;
  delete process.env.REALTIME_AGENT_ENABLED;
  delete process.env.OPENWEATHER_API_KEY;
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("validation services", () => {
  test("Firecrawl refresh is unavailable without an API key", async () => {
    const cachePath = "/tmp/suvion-validation-test-cache.json";
    process.env.VALIDATION_SOURCE_CACHE_PATH = cachePath;
    try {
      fs.unlinkSync(cachePath);
    } catch {
      // no cached test file to remove
    }

    const response = await refreshValidationSources();
    expect(response.configured).toBe(false);
    expect(
      response.sources.every((source) => source.status === "unavailable"),
    ).toBe(true);
  });

  test("validation agent is disabled by default", async () => {
    const response = await runValidationAgent("validate");
    expect(response.status).toBe("disabled");
  });

  test("validation agent can be explicitly disabled", async () => {
    process.env.VALIDATION_AGENT_ENABLED = "false";
    const response = await runValidationAgent("validate");
    expect(response.status).toBe("disabled");
  });

  test("realtime agent is disabled by default", async () => {
    const status = getRealtimeAgentStatus();
    const config = await getRealtimeSessionConfig();

    expect(status.status).toBe("disabled");
    expect(config.status).toBe("disabled");
  });

  test("realtime agent can be explicitly disabled", async () => {
    process.env.REALTIME_AGENT_ENABLED = "false";
    const status = getRealtimeAgentStatus();
    const config = await getRealtimeSessionConfig();

    expect(status.status).toBe("disabled");
    expect(config.status).toBe("disabled");
  });

  test("realtime calls payload includes the required session type", () => {
    const payload = buildRealtimeCallsSessionPayload({
      type: "session",
      model: "gpt-realtime",
      instructions: "Answer vessel questions.",
    });

    expect(payload).toMatchObject({
      type: "realtime",
      model: "gpt-realtime",
      instructions: "Answer vessel questions.",
    });
  });

  test("weather lookup reports not configured without OpenWeather key", async () => {
    const response = await getCurrentWeather("37.7749", "-122.4194");

    expect(response.configured).toBe(false);
    expect(response.status).toBe("not_configured");
    expect(response.location).toEqual({ lat: 37.7749, lon: -122.4194 });
  });

  test("weather lookup rejects invalid coordinates", async () => {
    const response = await getCurrentWeather("1000", "-122.4194");

    expect(response.status).toBe("invalid_request");
  });

  test("vessel context records live backend signals for agent prompts", async () => {
    const now = new Date("2026-07-09T12:00:00.000Z");
    recordVesselReading({
      stream: "fuel",
      value: 11.2,
      unit: "L/h",
      timestamp: now,
    });
    recordVesselReading({
      stream: "positionLat",
      value: 37.7749,
      unit: "deg",
      timestamp: now,
    });
    recordVesselReading({
      stream: "positionLon",
      value: -122.4194,
      unit: "deg",
      timestamp: now,
    });
    recordVesselReading({
      stream: "co2",
      value: 30.16,
      unit: "kg/h",
      fuelType: "diesel",
      cacheHit: false,
      timestamp: now.toISOString(),
    });

    const context = await getVesselContext({
      includeMongo: false,
      now: new Date("2026-07-09T12:00:30.000Z"),
    });
    const promptText = formatVesselContextForAgent(context);

    expect(context.position).toMatchObject({ lat: 37.7749, lon: -122.4194 });
    expect(context.latestSignals.map((signal) => signal.stream)).toEqual(
      expect.arrayContaining(["fuel", "positionLat", "positionLon", "co2"]),
    );
    expect(promptText).toContain("Fuel flow");
    expect(promptText).toContain("CO2 rate");
  });
});

test("source verification rejects a lookalike domain containing an official hostname", async () => {
  process.env.FIRECRAWL_API_KEY = "test-key";
  const fakeFetch = (async () =>
    new Response(
      JSON.stringify({
        data: {
          web: [
            {
              url: "https://imo.org.attacker.example/paper",
              title: "Untrusted",
            },
          ],
        },
      }),
      { status: 200 },
    )) as typeof fetch;
  const response = await refreshValidationSources(fakeFetch);
  expect(response.sources.every((source) => source.status !== "verified")).toBe(
    true,
  );
  expect(
    response.sources.every((source) => !source.url.includes("attacker")),
  ).toBe(true);
});

test.each(["", " ", [], null, {}])(
  "weather rejects missing or non-scalar coordinates",
  async (value) => {
    expect((await getCurrentWeather(value, "10")).status).toBe(
      "invalid_request",
    );
  },
);
