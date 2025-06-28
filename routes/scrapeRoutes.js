import express from "express";
import {
  scrapeProfiles,
  downloadCSV,
} from "../controllers/scrapeController.js";

const router = express.Router();

router.post("/", scrapeProfiles);
router.get("/download", downloadCSV);

export default router;
