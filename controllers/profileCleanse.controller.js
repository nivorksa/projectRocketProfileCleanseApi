import fs from "fs";
import ExcelJS from "exceljs";
import path from "path";
import { randomUUID } from "crypto";
import profileCleanse from "../engines/profileCleanse.js";
import createNewWorkbook from "../utils/createNewWorkbook.js";
import Job from "../models/job.model.js";
import { runningJobs } from "../utils/jobRuntime.js";

/* ------------------ START JOB ------------------ */
export const startProfileCleanse = async (req, res) => {
  try {
    const userId = req.userId;

    const {
      filePath,
      originalFileName,
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

    const jobType = "profileCleanse";

    const existing = await Job.findOne({
      userId,
      jobType,
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

    const job = await Job.create({
      jobId,
      userId,
      jobType,
      sheetName,
      filePath,
      originalFileName,
      cleanseFilePath: newFilePath,
      status: "running",
      lastRow: 1,
      startedAt: new Date(),
      totalRows: sheet.rowCount - 1,
      logs: [
        { id: randomUUID(), status: "Started", message: "Job created" },
        {
          id: randomUUID(),
          status: "Launching GoLogin",
          message: "Initializing browser session",
        },
      ],
      jobData: {
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

    runProfileCleanse(jobId, {
      ...req.body,
      cleanseFilePath: newFilePath,
    }).catch(async (err) => {
      await Job.updateOne({ jobId }, { status: "error", error: err.message });
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------ SCRAPE RUNNER ------------------ */

const runProfileCleanse = async (jobId) => {
  const job = await Job.findOne({ jobId });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.cleanseFilePath);
  const sheet = workbook.getWorksheet(job.sheetName);

  const headers = sheet
    .getRow(1)
    .values.map((v) => (typeof v === "string" ? v.toLowerCase() : v));

  const idx = (name) => headers.indexOf(name.toLowerCase());

  const fullNameIndex = idx(job.jobData.fullNameColumn);
  const jobTitleIndex = idx(job.jobData.jobTitleColumn);
  const companyIndex = idx(job.jobData.companyColumn);
  const urlIndex = idx(job.jobData.urlColumn);

  if (
    [fullNameIndex, jobTitleIndex, companyIndex, urlIndex].some((i) => i < 0)
  ) {
    await Job.updateOne(
      { jobId },
      { status: "error", error: "Invalid column selection" },
    );
    throw new Error("Invalid column selection");
  }

  const stopFlag = { stopped: false, filePath: job.cleanseFilePath };
  runningJobs.set(jobId, { stopFlag });

  await Job.updateOne(
    { jobId },
    {
      status: "running",
      startedAt: job.startedAt || new Date(),
      $push: {
        logs: {
          id: randomUUID(),
          status: "Scraping",
          message: "Scraping in progress",
        },
      },
    },
  );

  const startRow = (job.lastRow || 1) + 1;

  let processedRows = 0;
  let totalRowTimeMs = job.avgRowTimeMs
    ? job.avgRowTimeMs * Math.max(job.lastRow, 1)
    : 0;

  await profileCleanse(
    sheet,
    {
      startRow,
      fullNameColumnIndex: fullNameIndex,
      jobTitleColumnIndex: jobTitleIndex,
      companyColumnIndex: companyIndex,
      urlColumnIndex: urlIndex,
      minConnectionCount: Number(job.jobData.minimumConnections),
      keywordSearchEnabled: job.jobData.keywordSearchEnabled,
      keywords: job.jobData.keywords || [],
    },
    {
      token: job.jobData.goLoginToken,
      profileId: job.jobData.goLoginProfileId,
    },
    async (log) => {
      const update = {
        $push: { logs: { id: randomUUID(), ...log } },
      };

      if (log.row !== undefined) {
        update.$set = { lastRow: log.row };
      }

      if (log.rowTimeMs) {
        processedRows += 1;
        totalRowTimeMs += log.rowTimeMs;

        update.$set = {
          ...(update.$set || {}),
          avgRowTimeMs: Math.round(totalRowTimeMs / processedRows),
        };
      }

      await Job.updateOne({ jobId }, update);
    },
    stopFlag,
  );

  const finishedAt = new Date();
  const startedAtTime = job.startedAt
    ? new Date(job.startedAt).getTime()
    : finishedAt.getTime();
  const durationMs = finishedAt.getTime() - startedAtTime;

  await Job.updateOne(
    { jobId },
    {
      status: stopFlag.stopped ? "stopped" : "done",
      finishedAt,
      durationMs,
      cleanseFilePath: stopFlag.filePath,
      $push: {
        logs: {
          id: randomUUID(),
          status: stopFlag.stopped ? "Stopped" : "Completed",
          message: stopFlag.stopped
            ? "Scraping stopped safely"
            : "Scraping completed successfully",
        },
      },
    },
  );

  runningJobs.delete(jobId);
};

/* ------------------ STREAM ------------------ */

export const streamProfileCleanse = async (req, res) => {
  const { jobId, from = 0 } = req.query;

  const job = await Job.findOne({ jobId });

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
    const j = await Job.findOne({ jobId });

    if (!j) {
      clearInterval(interval);
      return res.end();
    }

    /* ---------------- Logs ---------------- */
    const newLogs = j.logs.slice(lastSentIndex);
    if (newLogs.length > 0) {
      for (const log of newLogs) {
        res.write(`data: ${JSON.stringify({ type: "log", payload: log })}\n\n`);
      }
      lastSentIndex += newLogs.length;
    }

    /* ---------------- Time + ETA ---------------- */
    const now = Date.now();
    const startedAt = j.startedAt ? new Date(j.startedAt).getTime() : null;

    let elapsedMs = 0;
    let estimatedTotalMs = null;
    let remainingMs = null;

    if (startedAt && j.lastRow && j.totalRows && j.lastRow > 0) {
      elapsedMs = now - startedAt;

      const avgPerRow = elapsedMs / j.lastRow;
      estimatedTotalMs = Math.round(avgPerRow * j.totalRows);
      remainingMs = Math.max(estimatedTotalMs - elapsedMs, 0);
    }

    res.write(
      `data: ${JSON.stringify({
        type: "time",
        payload: {
          serverTime: now,
          startedAt,
          elapsedMs,
          estimatedTotalMs,
          remainingMs,
          processedRows: j.lastRow || 0,
          totalRows: j.totalRows || 0,
        },
      })}\n\n`,
    );

    // heartbeat
    res.write(`:\n\n`);

    /* ---------------- Completion ---------------- */
    if (j.status !== "running") {
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          payload: {
            status: j.status,
            filePath: j.cleanseFilePath,
            startedAt: j.startedAt?.getTime(),
            finishedAt: j.endedAt?.getTime(),
            durationMs: j.durationMs,
          },
        })}\n\n`,
      );
      clearInterval(interval);
      return res.end();
    }
  }, 1000);

  req.on("close", () => clearInterval(interval));
};
