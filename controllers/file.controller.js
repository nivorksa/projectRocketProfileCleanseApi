import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";
import { randomUUID } from "crypto";
import profileCleanse from "../utils/profileCleanse.js";
import createNewWorkbook from "../utils/createNewWorkbook.js";
import { runningJobs } from "../utils/jobRuntime.js";
import ScrapeJob from "../models/scrapeJob.model.js";

/* ------------------ UPLOAD ------------------ */

export const uploadFile = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(req.file.path);

  res.json({
    filePath: req.file.path,
    sheetNames: workbook.worksheets.map((w) => w.name),
  });
};

/* ------------------ PROCESS ------------------ */

export const processFile = async (req, res) => {
  const { filePath, sheetName } = req.body;

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  const sheet = workbook.getWorksheet(sheetName);

  res.json({
    columnNames: sheet.getRow(1).values.slice(1),
    totalRows: sheet.rowCount - 1,
  });
};

/* ------------------ START JOB ------------------ */

export const startScrape = async (req, res) => {
  try {
    const jobId = randomUUID();
    const userId = req.userId;

    const {
      filePath,
      sheetName,
      fullNameColumn,
      jobTitleColumn,
      companyColumn,
      urlColumn,
      minimumConnections,
      keywordSearchEnabled,
      keywords,
      goLoginToken,
      goLoginProfileId,
    } = req.body;

    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ message: "Excel file not found" });
    }

    // Read original workbook
    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(sheetName);

    // ✅ Create a cleansed workbook BEFORE scraping
    const { newWorkbook, newFilePath } = await createNewWorkbook(
      sheet,
      filePath
    );

    const job = await ScrapeJob.create({
      jobId,
      userId,
      sheetName,
      filePath, // original file
      cleanseFilePath: newFilePath, // cleansed copy
      status: "running",
    });

    runningJobs.set(jobId, {
      stopFlag: { stopped: false },
      logs: [
        {
          status: "Started",
          message: "Job created",
        },
        {
          status: "Launching GoLogin",
          message: "Initializing browser session",
        },
      ],
    });

    res.json({ jobId });

    // Start the scrape
    runScrape(jobId, { ...req.body, cleanseFilePath: newFilePath }).catch(
      async (err) => {
        console.error("Scrape error:", err);
        const job = await ScrapeJob.findOne({ jobId });
        if (job) {
          job.status = "error";
          job.error = err.message;
          await job.save();
        }
      }
    );
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------ SCRAPE RUNNER ------------------ */

const runScrape = async (jobId, config) => {
  const job = await ScrapeJob.findOne({ jobId });
  const runtime = runningJobs.get(jobId);

  // Read cleansed workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(config.cleanseFilePath);
  const sheet = workbook.getWorksheet(job.sheetName);

  const headers = sheet
    .getRow(1)
    .values.map((v) => (typeof v === "string" ? v.toLowerCase() : v));

  const idx = (name) => headers.indexOf(name.toLowerCase());
  const fullNameIndex = idx(config.fullNameColumn);
  const jobTitleIndex = idx(config.jobTitleColumn);
  const companyIndex = idx(config.companyColumn);
  const urlIndex = idx(config.urlColumn);

  if (
    [fullNameIndex, jobTitleIndex, companyIndex, urlIndex].some((i) => i < 0)
  ) {
    job.status = "error";
    job.error = "Invalid column selection";
    await job.save();
    throw new Error("Invalid column selection");
  }

  const stopFlag = { stopped: false, filePath: config.cleanseFilePath };
  runtime.stopFlag = stopFlag;

  runtime.logs.push({
    status: "Scraping",
    message: "Scraping in progress",
  });

  await profileCleanse(
    sheet,
    {
      fullNameColumnIndex: fullNameIndex,
      jobTitleColumnIndex: jobTitleIndex,
      companyColumnIndex: companyIndex,
      urlColumnIndex: urlIndex,
      minConnectionCount: Number(config.minimumConnections),
      keywordSearchEnabled: config.keywordSearchEnabled,
      keywords: config.keywords || [],
    },
    {
      token: config.goLoginToken,
      profileId: config.goLoginProfileId,
    },
    (log) => runtime.logs.push(log),
    stopFlag
  );

  job.status = runtime.stopFlag.stopped ? "stopped" : "done";

  runtime.logs.push({
    status: runtime.stopFlag.stopped ? "Stopped" : "Completed",
    message: runtime.stopFlag.stopped
      ? "Scraping stopped safely"
      : "Scraping completed successfully",
  });

  job.cleanseFilePath = stopFlag.filePath;
  await job.save();
};

/* ------------------ STREAM ------------------ */

export const streamScrape = async (req, res) => {
  const { jobId } = req.query;
  const job = await ScrapeJob.findOne({ jobId });

  if (!job || job.userId.toString() !== req.userId) {
    return res.sendStatus(403);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const runtime = runningJobs.get(jobId);
  let lastSentIndex = 0;

  const interval = setInterval(async () => {
    // Send only NEW logs
    while (runtime && lastSentIndex < runtime.logs.length) {
      res.write(`data: ${JSON.stringify(runtime.logs[lastSentIndex++])}\n\n`);
    }

    // heartbeat (transport-only)
    res.write(`:\n\n`);

    const j = await ScrapeJob.findOne({ jobId });
    if (j.status !== "running") {
      res.write(
        `data: ${JSON.stringify({
          done: true,
          filePath: j.cleanseFilePath,
        })}\n\n`
      );
      clearInterval(interval);
      res.end();
    }
  }, 1000);

  req.on("close", () => clearInterval(interval));
};

/* ------------------ STOP ------------------ */

export const stopScrape = async (req, res) => {
  const { jobId } = req.body;
  const runtime = runningJobs.get(jobId);
  if (runtime) {
    runtime.logs.push({
      status: "Stop Requested",
      message: "Scraping stop requested by user",
    });

    runtime.stopFlag.stopped = true;
  }

  res.sendStatus(200);
};

/* ------------------ JOB LIST ------------------ */

export const listJobs = async (req, res) => {
  const jobs = await ScrapeJob.find({
    userId: req.userId,
    status: "running",
  }).sort({ createdAt: -1 });

  res.json(jobs);
};

/* ------------------ DOWNLOAD ------------------ */

export const downloadJobFile = async (req, res) => {
  const job = await ScrapeJob.findOne({ jobId: req.params.jobId });
  if (!job || job.userId.toString() !== req.userId) return res.sendStatus(403);

  res.download(path.resolve(job.cleanseFilePath));
};
