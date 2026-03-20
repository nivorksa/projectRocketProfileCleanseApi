import fs from "fs";
import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import companyUrlFinder from "../engines/companyUrlFinder.js";
import createNewWorkbook from "../utils/createNewWorkbook.js";
import Job from "../models/job.model.js";
import { runningJobs } from "../utils/jobRuntime.js";

/* ------------------ START JOB ------------------ */
export const startCompanyUrlFinder = async (req, res) => {
  try {
    const userId = req.userId;

    const {
      filePath,
      originalFileName,
      sheetName,
      companyNameColumn,
      companyWebsiteUrlColumn,
    } = req.body;

    const jobType = "companyUrlFinder";

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
        { status: "Started", message: "Job created" },
        { status: "Preparing", message: "Initializing company finder" },
      ],
      jobData: {
        companyNameColumn,
        companyWebsiteUrlColumn,
      },
    });

    res.json({ jobId });

    runCompanyUrlFinder(jobId).catch(async (err) => {
      await Job.updateOne({ jobId }, { status: "error", error: err.message });
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

/* ------------------ RUNNER ------------------ */

const runCompanyUrlFinder = async (jobId) => {
  const job = await Job.findOne({ jobId });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.cleanseFilePath);
  const sheet = workbook.getWorksheet(job.sheetName);

  const headers = sheet
    .getRow(1)
    .values.map((v) => (typeof v === "string" ? v.toLowerCase() : v));

  const idx = (name) => headers.indexOf(name.toLowerCase());

  const nameIndex = idx(job.jobData.companyNameColumn);
  const websiteIndex = idx(job.jobData.companyWebsiteUrlColumn);

  if ([nameIndex, websiteIndex].some((i) => i < 0)) {
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
        logs: { status: "Running", message: "Searching companies" },
      },
    },
  );

  const startRow = (job.lastRow || 1) + 1;

  let processedRows = 0;
  let totalRowTimeMs = job.avgRowTimeMs
    ? job.avgRowTimeMs * Math.max(job.lastRow, 1)
    : 0;

  await companyUrlFinder(
    sheet,
    {
      startRow,
      nameColumnIndex: nameIndex,
      websiteColumnIndex: websiteIndex,
    },
    async (log) => {
      const update = { $push: { logs: log } };

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
          status: stopFlag.stopped ? "Stopped" : "Completed",
          message: stopFlag.stopped
            ? "Process stopped safely"
            : "Company matching completed",
        },
      },
    },
  );

  runningJobs.delete(jobId);
};

export const streamCompanyUrlFinder = async (req, res) => {
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

    /* ---------------- SEND NEW LOGS ---------------- */
    const newLogs = j.logs.slice(lastSentIndex);

    if (newLogs.length > 0) {
      for (const log of newLogs) {
        res.write(
          `data: ${JSON.stringify({
            type: "log",
            payload: log,
          })}\n\n`,
        );
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

    /* ---------------- JOB FINISHED ---------------- */
    if (j.status !== "running") {
      res.write(
        `data: ${JSON.stringify({
          type: "done",
          payload: {
            status: j.status,
            filePath: j.cleanseFilePath,
            startedAt: j.startedAt?.getTime(),
            finishedAt: j.finishedAt?.getTime(),
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
