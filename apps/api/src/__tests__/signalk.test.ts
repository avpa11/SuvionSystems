import { describe, expect, test, beforeEach, afterEach } from "@jest/globals";
import { getSignalKConfig, resolveSignalKUrl } from "../adapter/signalk.js";

const ORIGINAL_ENV = { ...process.env };

beforeEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

afterEach(() => {
  process.env = { ...ORIGINAL_ENV };
});

describe("Signal K configuration", () => {
  test("forces subscribe=none on configured stream URLs", () => {
    process.env.SIGNALK_URL = "wss://demo.signalk.org/signalk/v1/stream?subscribe=all";
    expect(resolveSignalKUrl()).toBe("wss://demo.signalk.org/signalk/v1/stream?subscribe=none");
  });

  test("is disabled by default and reports explicit subscriptions", () => {
    delete process.env.SIGNALK_ENABLED;
    const config = getSignalKConfig();
    expect(config.enabled).toBe(false);
    expect(config.subscriptionPaths).toContain("navigation.position");
    expect(config.subscriptionPaths).toContain("tanks.freshWater.0.currentLevel");
  });
});
