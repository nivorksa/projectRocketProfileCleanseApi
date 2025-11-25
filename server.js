import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import http from "http";
import mongoose from "mongoose";
import dotenv from "dotenv";
import cookieParser from "cookie-parser";
import { fileURLToPath } from "url";
import { dirname } from "path";
import authRoutes from "./routes/auth.route.js";
import fileRoutes from "./routes/file.route.js";
import { allowedOrigins } from "./utils/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

dotenv.config();

mongoose.set("strictQuery", true);

const connect = async () => {
  try {
    await mongoose.connect(process.env.MONGO);
    console.log("Connected to mongoDB!");
  } catch (error) {
    console.error("MongoDB Connection Error:", error);
  }
};

// CORS configuration
app.use(
  cors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error("Not allowed by CORS"));
      }
    },
    credentials: true,
  })
);

app.use(express.json());
app.use(cookieParser());

const upload = multer({ dest: "uploads/" });

// API routes with upload middleware
app.use("/api/auth", authRoutes);
app.use("/api/file", fileRoutes);

// Global error handler
app.use((err, req, res, next) => {
  const errorStatus = err.status || 500;
  const errorMessage = err.message || "Something went wrong!";
  return res.status(errorStatus).send(errorMessage);
});

// Start server
const PORT = process.env.PORT || 8800;
httpServer.listen(PORT, () => {
  connect();
  console.log(`Backend server is running on port ${PORT}!`);
});

// Log the DISPLAY environment variable
console.log("DISPLAY environment variable:", process.env.DISPLAY);
