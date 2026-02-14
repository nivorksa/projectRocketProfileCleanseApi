import express from "express";
import { listJobs, stopJob } from "../controllers/job.controller.js";
import {
  startProfileCleanse,
  streamProfileCleanse,
} from "../controllers/profileCleanse.controller.js";
import {
  startScrapeUrn,
  streamScrapeUrn,
} from "../controllers/scrapeUrn.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

// general job routes
router.get("/list-jobs", verifyToken, listJobs);
router.post("/stop-job", verifyToken, stopJob);

// profile cleansing routes
router.post("/profile-cleanse/start", verifyToken, startProfileCleanse);
router.get("/profile-cleanse/stream", verifyToken, streamProfileCleanse);

// profile urn finder routes
router.post("/profile-urn-finder/start", verifyToken, startScrapeUrn);
router.get("/profile-urn-finder/stream", verifyToken, streamScrapeUrn);

export default router;
