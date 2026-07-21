import net from "node:net";

const API_HOST = process.env.API_HOST ?? "http://localhost:4001";
const WEB_HOST = process.env.WEB_HOST ?? "http://localhost:4000";
const MONGO_HOST = process.env.MONGO_HOST ?? "127.0.0.1";
const MONGO_PORT = Number(process.env.MONGO_PORT ?? 27017);

const results = [];

function record(name, ok, detail = "") {
  results.push({ name, ok, detail });
  const marker = ok ? "PASS" : "FAIL";
  console.log(`${marker} ${name}${detail ? ` - ${detail}` : ""}`);
}

function checkTcp(host, port, timeoutMs = 1500) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    const done = (ok, detail = "") => {
      socket.destroy();
      resolve({ ok, detail });
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => done(true, `${host}:${port}`));
    socket.once("timeout", () => done(false, `timeout connecting to ${host}:${port}`));
    socket.once("error", (err) => done(false, err.message));
  });
}

async function checkJson(name, url, validate = () => true) {
  try {
    const response = await fetch(url);
    const body = await response.json();
    const ok = response.ok && validate(body);
    record(name, ok, `HTTP ${response.status}`);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

async function checkHttp(name, url) {
  try {
    const response = await fetch(url);
    record(name, response.ok, `HTTP ${response.status}`);
  } catch (err) {
    record(name, false, err instanceof Error ? err.message : String(err));
  }
}

const mongo = await checkTcp(MONGO_HOST, MONGO_PORT);
record("MongoDB TCP", mongo.ok, mongo.detail);

await checkJson("API health", `${API_HOST}/health`, (body) => body.status === "ok");
await checkJson("API status", `${API_HOST}/status`, (body) => body.status === "ok" && body.mongo);
await checkJson("Validation sources", `${API_HOST}/validation/sources`, (body) =>
  Array.isArray(body.sources)
);
await checkJson("Anomalies endpoint", `${API_HOST}/anomalies?limit=1`, (body) =>
  Array.isArray(body.events) && body.scheduler
);

const end = new Date();
const start = new Date(end.getTime() - 3_600_000);
await checkJson(
  "Report endpoint",
  `${API_HOST}/report?startDate=${encodeURIComponent(start.toISOString())}&endDate=${encodeURIComponent(end.toISOString())}`,
  (body) => typeof body.fuelConsumedL === "number" && Array.isArray(body.validationSources)
);

await checkHttp("Web app", WEB_HOST);

const failed = results.filter((result) => !result.ok);
if (failed.length > 0) {
  console.error(`Runtime smoke failed: ${failed.length}/${results.length} checks failed.`);
  process.exit(1);
}

console.log(`Runtime smoke passed: ${results.length}/${results.length} checks passed.`);
