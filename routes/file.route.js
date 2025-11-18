import express from "express";
import multer from "../utils/multerConfig.js";
import {
  uploadFile,
  processFile,
  scrapeProfiles,
  stopScraping,
  scrapeProfilesStream,
  downloadFile,
} from "../controllers/file.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

router.post("/upload", multer.single("file"), verifyToken, uploadFile);
router.post("/process", verifyToken, processFile);
router.post("/scrape", verifyToken, scrapeProfiles);
router.post("/stop", stopScraping);
router.get("/scrape/stream", verifyToken, scrapeProfilesStream); // SSE streaming endpoint
router.get("/download", verifyToken, downloadFile);

export default router;
