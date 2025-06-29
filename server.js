import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { dirname } from "path";
import fileRoutes from "./routes/file.route.js";
import { allowedOrigins } from "./utils/config.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = http.createServer(app);

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

const upload = multer({ dest: "uploads/" });

// API routes with upload middleware
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
  console.log(`Backend server is running on port ${PORT}!`);
});
