import express from "express";
import multer from "../utils/multerConfig.js";
import {
  uploadFile,
  processFile,
  scrapeProfiles,
  stopScraping,
  scrapeProfilesStream,
} from "../controllers/file.controller.js";

const router = express.Router();

router.post("/upload", multer.single("file"), uploadFile);
router.post("/process", processFile);
router.post("/scrape", scrapeProfiles);
router.post("/stop", stopScraping);
router.get("/scrape/stream", scrapeProfilesStream); // SSE streaming endpoint

export default router;
