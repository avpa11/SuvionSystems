import { Router, type Request, type Response } from "express";
import { getCurrentWeather } from "../services/weather.js";

const router = Router();

router.get("/current", async (req: Request, res: Response) => {
  const response = await getCurrentWeather(req.query.lat, req.query.lon);
  res.status(response.status === "invalid_request" ? 400 : response.status === "error" ? 502 : 200).json(response);
});

export default router;
