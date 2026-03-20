import express from "express";
import multer from "../utils/multerConfig.js";
import {
  uploadFile,
  processFile,
  downloadJobFile,
} from "../controllers/file.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

/* ---------------- File upload, download & inspection ---------------- */

router.post("/upload", verifyToken, multer.single("file"), uploadFile);
router.post("/process", verifyToken, processFile);
router.get("/download/:jobId", verifyToken, downloadJobFile); // download result

export default router;
