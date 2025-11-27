import express from "express";
import { addToken } from "../controllers/file.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

router.post("/addToken", verifyToken, addToken);

export default router;
