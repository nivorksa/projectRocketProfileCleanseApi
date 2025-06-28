import path from "path";
import fs from "fs";
import puppeteerScraper from "../utils/puppeteerScraper.js";
import { fileURLToPath } from "url";
import { dirname } from "path";

// For __dirname equivalent in ES6
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const scrapeProfiles = async (req, res) => {
  try {
    const uploadDir = path.join(__dirname, "../uploads");
    const files = fs.readdirSync(uploadDir);
    if (files.length === 0)
      return res.status(404).json({ message: "No file found." });

    const filePath = path.join(uploadDir, files[0]);
    await puppeteerScraper(filePath);

    res.status(200).json({ message: "Scraping completed successfully." });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: "Scraping failed." });
  }
};

export const downloadCSV = (req, res) => {
  const filePath = path.join(__dirname, "../uploads/updated.csv");
  res.download(filePath, "updated.csv");
};
