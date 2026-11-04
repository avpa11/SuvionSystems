import { describe, test, expect, afterEach } from "@jest/globals";
import request from "supertest";
import { createApp } from "../app.js";

const originalOrigins = process.env.ALLOWED_ORIGINS;
afterEach(() => {
  if (originalOrigins === undefined) delete process.env.ALLOWED_ORIGINS;
  else process.env.ALLOWED_ORIGINS = originalOrigins;
});

describe("HTTP public-release boundaries", () => {
  test("permits the configured dashboard and rejects unrelated browser origins", async () => {
    process.env.ALLOWED_ORIGINS = "http://localhost:4000";
    const app = createApp();
    const response = await request(app)
      .get("/health")
      .set("Origin", "http://localhost:4000")
      .expect(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://localhost:4000",
    );
    expect(response.headers["x-powered-by"]).toBeUndefined();
    await request(app)
      .get("/health")
      .set("Origin", "https://untrusted.example")
      .expect(403);
  });
  test("rejects malformed JSON and oversized prompts before calling providers", async () => {
    const app = createApp();
    await request(app)
      .post("/validation/agent")
      .set("Content-Type", "application/json")
      .send("{")
      .expect(400);
    await request(app)
      .post("/validation/agent")
      .send({ prompt: "x".repeat(12_001) })
      .expect(400);
  });
  test("readiness returns 503 when MongoDB is unavailable", async () => {
    await request(createApp()).get("/status").expect(503);
  });
});
