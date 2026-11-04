import express, { type ErrorRequestHandler } from "express";
import cors from "cors";
import { rateLimit } from "express-rate-limit";
import reportRouter from "./routes/report.js";
import validationRouter from "./routes/validation.js";
import anomaliesRouter from "./routes/anomalies.js";
import weatherRouter from "./routes/weather.js";
import { getRuntimeStatus } from "./services/status.js";

export function allowedOrigins(): string[] {
  return (
    process.env.ALLOWED_ORIGINS ?? "http://localhost:4000,http://127.0.0.1:4000"
  )
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function isAllowedOrigin(origin: string | undefined): boolean {
  return !origin || allowedOrigins().includes(origin);
}

export function createApp() {
  const app = express();
  app.disable("x-powered-by");
  app.use((_req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use((req, res, next) => {
    if (!isAllowedOrigin(req.get("origin"))) {
      res.status(403).json({ error: "Origin is not allowed" });
      return;
    }
    next();
  });
  app.use(
    cors({ origin: allowedOrigins(), exposedHeaders: ["Content-Disposition"] }),
  );
  app.use(express.json({ limit: "32kb" }));
  app.use(
    "/report",
    rateLimit({
      windowMs: 60_000,
      limit: 60,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    reportRouter,
  );
  app.use(
    "/validation",
    rateLimit({
      windowMs: 60_000,
      limit: 20,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    validationRouter,
  );
  app.use(
    "/weather",
    rateLimit({
      windowMs: 60_000,
      limit: 30,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
    weatherRouter,
  );
  app.use("/anomalies", anomaliesRouter);
  app.get("/health", (_req, res) =>
    res.json({ status: "ok", ts: new Date().toISOString() }),
  );
  app.get("/status", (_req, res) => {
    const status = getRuntimeStatus();
    res.status(status.mongo.connected ? 200 : 503).json(status);
  });
  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    const status =
      err.status === 413 ? 413 : err instanceof SyntaxError ? 400 : 500;
    res
      .status(status)
      .json({
        error:
          status === 413
            ? "Request body too large"
            : status === 400
              ? "Invalid JSON"
              : "Request failed",
      });
  };
  app.use(errorHandler);
  return app;
}
