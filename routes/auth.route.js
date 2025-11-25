import express from "express";
import {
  register,
  login,
  getCurrentUser,
  logout,
} from "../controllers/auth.controller.js";

const router = express.Router();

router.post("/register", register);
router.post("/login", login);
router.get("/getCurrentUser", getCurrentUser);
router.post("/logout", logout);

export default router;
