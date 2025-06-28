// server.js
import express from "express";
import cors from "cors";
import multer from "multer";
import path from "path";
import scrapeRoutes from "./routes/scrapeRoutes.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: "./uploads/" });

app.post("/api/upload", upload.single("file"), (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No file uploaded." });
  res.status(200).json({
    message: "File uploaded successfully.",
    fileName: req.file.filename,
  });
});

app.use("/api/scrape", scrapeRoutes);

// For __dirname replacement in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

app.use("/downloads", express.static(path.join(__dirname, "uploads")));

const PORT = 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
