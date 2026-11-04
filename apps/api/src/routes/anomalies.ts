import { Router, type Request, type Response } from "express";
import { AnomalyEvent } from "../db/mongodb.js";
import { getAnomalySchedulerStatus } from "../services/anomalies.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const rawLimit = req.query.limit ?? "20";
  if (
    typeof rawLimit !== "string" ||
    !/^\d+$/.test(rawLimit) ||
    Number(rawLimit) < 1 ||
    Number(rawLimit) > 100
  ) {
    res
      .status(400)
      .json({ error: "limit must be an integer between 1 and 100" });
    return;
  }
  const limit = Number(rawLimit);
  try {
    const events = await AnomalyEvent.find({}, { _id: 0 })
      .sort({ timestamp: -1 })
      .limit(limit)
      .lean();

    res.json({
      scheduler: getAnomalySchedulerStatus(),
      events,
    });
  } catch {
    res.status(503).json({ error: "Anomaly data is unavailable" });
  }
});

export default router;
