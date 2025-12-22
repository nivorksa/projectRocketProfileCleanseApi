import express from "express";
import multer from "../utils/multerConfig.js";
import {
  uploadFile,
  processFile,
  startScrape,
  streamScrape,
  stopScrape,
  listJobs,
  downloadJobFile,
} from "../controllers/file.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

/* ---------------- File upload & inspection ---------------- */

router.post("/upload", verifyToken, multer.single("file"), uploadFile);
router.post("/process", verifyToken, processFile);

/* ---------------- Job-based scraping ---------------- */

router.post("/scrape/start", verifyToken, startScrape); // create job
router.get("/scrape/stream", verifyToken, streamScrape); // attach SSE
router.post("/scrape/stop", verifyToken, stopScrape); // stop by jobId

/* ---------------- Job management ---------------- */

router.get("/jobs", verifyToken, listJobs); // list user's jobs
router.get("/download/:jobId", verifyToken, downloadJobFile); // download result

export default router;
