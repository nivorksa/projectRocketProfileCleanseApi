import express from "express";
import { addToken, getUserTokens } from "../controllers/token.controller.js";
import { verifyToken } from "../middleware/jwt.js";

const router = express.Router();

router.post("/addToken", verifyToken, addToken);
router.get("/getUserTokens", verifyToken, getUserTokens);

export default router;
