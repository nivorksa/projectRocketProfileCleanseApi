import express from "express";
import multer from "../utils/multerConfig.js";
import {
  uploadFile,
  processFile,
  scrapeProfiles,
} from "../controllers/file.controller.js";

const router = express.Router();

router.post("/upload", multer.single("file"), uploadFile);
router.post("/process", processFile);
router.post("/scrape", scrapeProfiles);

export default router;
