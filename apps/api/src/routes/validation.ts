import express, { Router, type Request, type Response } from "express";
import {
  getValidationSources,
  refreshValidationSources,
} from "../services/officialSources.js";
import {
  getValidationAgentStatus,
  runValidationAgent,
} from "../services/validationAgent.js";
import {
  createRealtimeCall,
  getRealtimeAgentStatus,
  getRealtimeSessionConfig,
} from "../services/realtimeAgent.js";
import { getVesselContext } from "../services/vesselContext.js";

const router = Router();

router.get("/sources", (_req: Request, res: Response) => {
  res.json(getValidationSources());
});

router.post("/sources/refresh", async (_req: Request, res: Response) => {
  const response = await refreshValidationSources();
  res.status(response.configured ? 200 : 503).json(response);
});

router.get("/vessel-context", async (_req: Request, res: Response) => {
  try {
    res.json(await getVesselContext());
  } catch {
    res.status(503).json({ error: "Vessel context is unavailable" });
  }
});

router.get("/agent/status", (_req: Request, res: Response) => {
  res.json(getValidationAgentStatus());
});

router.post("/agent", async (req: Request, res: Response) => {
  if (
    typeof req.body?.prompt !== "string" ||
    !req.body.prompt.trim() ||
    req.body.prompt.length > 12_000
  ) {
    res
      .status(400)
      .json({
        error: "prompt must be a non-empty string of at most 12000 characters",
      });
    return;
  }
  const prompt =
    typeof req.body?.prompt === "string"
      ? req.body.prompt
      : "Validate the latest Suvion maritime emissions calculation setup.";
  const response = await runValidationAgent(prompt);
  res.status(response.status === "error" ? 502 : 200).json(response);
});

router.get("/realtime/status", (_req: Request, res: Response) => {
  res.json(getRealtimeAgentStatus());
});

router.get("/realtime/session-config", async (_req: Request, res: Response) => {
  const response = await getRealtimeSessionConfig();
  res.status(response.status === "error" ? 502 : 200).json(response);
});

router.post(
  "/realtime/calls",
  express.text({ type: ["application/sdp", "text/plain"], limit: "1mb" }),
  async (req: Request, res: Response) => {
    if (typeof req.body !== "string" || req.body.trim().length === 0) {
      res.status(400).json({
        configured: Boolean(process.env.OPENAI_API_KEY),
        enabled: process.env.REALTIME_AGENT_ENABLED !== "false",
        status: "invalid_request",
        message: "Request body must be a WebRTC SDP offer.",
      });
      return;
    }

    const response = await createRealtimeCall(req.body);
    if (response.status === "completed" && response.sdp) {
      res.type(response.contentType ?? "application/sdp").send(response.sdp);
      return;
    }

    res.status(response.status === "error" ? 502 : 200).json(response);
  },
);

export default router;
