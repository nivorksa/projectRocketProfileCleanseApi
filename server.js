import express from "express";
import cors from "cors";
import http from "http";
// import fileRoutes from "./routes/file.route.js";
import { allowedOrigins } from "./utils/config.js";

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

// JSON parsing
app.use(express.json({ limit: "10mb" }));

// API routes
// app.use("/api/file", fileRoutes);

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
