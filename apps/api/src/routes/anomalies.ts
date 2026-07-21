import { Router, type Request, type Response } from "express";
import { AnomalyEvent } from "../db/mongodb.js";
import { getAnomalySchedulerStatus } from "../services/anomalies.js";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const limit = Math.min(Number(req.query.limit ?? 20), 100);
  const events = await AnomalyEvent.find({}, { _id: 0 })
    .sort({ timestamp: -1 })
    .limit(limit)
    .lean();

  res.json({
    scheduler: getAnomalySchedulerStatus(),
    events,
  });
});

export default router;
