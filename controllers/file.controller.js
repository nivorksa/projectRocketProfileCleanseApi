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

    // ✅ Prevent duplicate jobs per user
    const existing = await ScrapeJob.findOne({
      userId,
      status: "running",
    });

    if (existing) {
      return res.json({ jobId: existing.jobId });
    }

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ message: "Excel file not found" });
    }

    const jobId = randomUUID();

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);
    const sheet = workbook.getWorksheet(sheetName);

    const { newFilePath } = await createNewWorkbook(sheet, filePath);

    const job = await ScrapeJob.create({
      jobId,
      userId,
      sheetName,
      filePath,
      cleanseFilePath: newFilePath,
      status: "running",
      lastRow: 1,
      logs: [
        { status: "Started", message: "Job created" },
        {
          status: "Launching GoLogin",
          message: "Initializing browser session",
        },
      ],
      config: {
        fullNameColumn,
        companyColumn,
        jobTitleColumn,
        urlColumn,
        minimumConnections,
        keywordSearchEnabled,
        keywords,
        goLoginToken,
        goLoginProfileId,
      },
    });

    res.json({ jobId });

    runScrape(jobId, {
      ...req.body,
      cleanseFilePath: newFilePath,
    }).catch(async (err) => {
      await ScrapeJob.updateOne(
        { jobId },
        { status: "error", error: err.message }
      );
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------ SCRAPE RUNNER ------------------ */

const runScrape = async (jobId, config) => {
  const job = await ScrapeJob.findOne({ jobId });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.cleanseFilePath);
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
    await ScrapeJob.updateOne(
      { jobId },
      { status: "error", error: "Invalid column selection" }
    );
    throw new Error("Invalid column selection");
  }

  const stopFlag = { stopped: false, filePath: job.cleanseFilePath };

  runningJobs.set(jobId, { stopFlag });

  await ScrapeJob.updateOne(
    { jobId },
    { $push: { logs: { status: "Scraping", message: "Scraping in progress" } } }
  );

  // ✅ Resume from last processed row
  const startRow = (job.lastRow || 1) + 1;

  await profileCleanse(
    sheet,
    {
      startRow,
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
    async (log) => {
      await ScrapeJob.updateOne(
        { jobId },
        {
          $push: { logs: log },
          ...(log.row !== undefined ? { $set: { lastRow: log.row } } : {}),
        }
      );
    },
    stopFlag
  );

  await ScrapeJob.updateOne(
    { jobId },
    {
      status: stopFlag.stopped ? "stopped" : "done",
      cleanseFilePath: stopFlag.filePath,
      $push: {
        logs: {
          status: stopFlag.stopped ? "Stopped" : "Completed",
          message: stopFlag.stopped
            ? "Scraping stopped safely"
            : "Scraping completed successfully",
        },
      },
    }
  );

  runningJobs.delete(jobId);
};

/* ------------------ STREAM ------------------ */

export const streamScrape = async (req, res) => {
  const { jobId, from = 0 } = req.query;

  const job = await ScrapeJob.findOne({ jobId });

  if (!job || job.userId.toString() !== req.userId) {
    return res.sendStatus(403);
  }

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  let lastSentIndex = Number(from);

  const interval = setInterval(async () => {
    const j = await ScrapeJob.findOne({ jobId });

    if (!j) {
      console.warn(`Job ${jobId} not found. Stopping stream.`);
      clearInterval(interval);
      return res.end();
    }

    const newLogs = j.logs.slice(lastSentIndex);
    if (newLogs.length > 0) {
      for (const log of newLogs) {
        res.write(`data: ${JSON.stringify(log)}\n\n`);
      }
      lastSentIndex += newLogs.length;
    }

    // send heartbeat
    res.write(`:\n\n`);

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

  await ScrapeJob.updateOne(
    { jobId },
    {
      $push: {
        logs: {
          status: "Stop Requested",
          message: "Scraping stop requested by user",
        },
      },
      stopRequested: true,
    }
  );

  const runtime = runningJobs.get(jobId);
  if (runtime) {
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
