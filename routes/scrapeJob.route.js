import express from "express";
import {
  startScrape,
  streamScrape,
  stopScrape,
  listJobs,
} from "../controllers/scrapeJob.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

/* ---------------- Job-based scraping ---------------- */

router.post("/scrape/start", verifyToken, startScrape); // create job
router.get("/scrape/stream", verifyToken, streamScrape); // attach SSE
router.post("/scrape/stop", verifyToken, stopScrape); // stop by jobId
router.get("/jobs", verifyToken, listJobs); // list user's jobs

export default router;
