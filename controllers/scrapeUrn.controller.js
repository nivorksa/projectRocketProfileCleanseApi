import fs from "fs";
import ExcelJS from "exceljs";
import { randomUUID } from "crypto";
import ScrapeJob from "../models/job.model.js";
import profileUrnFinder from "../engines/profileUrnFinder.js";
import createNewWorkbook from "../utils/createNewWorkbook.js";
import { runningJobs } from "../utils/jobRuntime.js";

export const startScrapeUrn = async (req, res) => {
  try {
    const userId = req.userId;

    const {
      filePath,
      originalFileName,
      sheetName,
      urlColumn,
      goLoginToken,
      goLoginProfileId,
    } = req.body;

    if (!fs.existsSync(filePath)) {
      return res.status(400).json({ message: "File not found" });
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
      originalFileName,
      cleanseFilePath: newFilePath,
      status: "running",
      lastRow: 1,
      startedAt: new Date(),
      totalRows: sheet.rowCount - 1,
      logs: [{ status: "Started", message: "URN extraction started" }],
      config: {
        urlColumn,
        goLoginToken,
        goLoginProfileId,
      },
    });

    res.json({ jobId });

    runScrapeUrn(jobId).catch(async (err) => {
      await ScrapeJob.updateOne(
        { jobId },
        {
          status: "error",
          error: err.message,
          $push: {
            logs: {
              status: "Error",
              message: "Job crashed",
              error: err.message,
            },
          },
        },
      );
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

const runScrapeUrn = async (jobId) => {
  const job = await ScrapeJob.findOne({ jobId });

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(job.cleanseFilePath);
  const sheet = workbook.getWorksheet(job.sheetName);

  const headers = sheet
    .getRow(1)
    .values.map((v) => (typeof v === "string" ? v.toLowerCase() : v));

  const urlIndex = headers.indexOf(job.config.urlColumn.toLowerCase());

  if (urlIndex < 0) throw new Error("Invalid URL column");

  const stopFlag = { stopped: false, filePath: job.cleanseFilePath };
  runningJobs.set(jobId, { stopFlag });

  let processed = 0;
  let totalTime = 0;

  await profileUrnFinder(
    sheet,
    { urlColumnIndex: urlIndex },
    {
      token: job.config.goLoginToken,
      profileId: job.config.goLoginProfileId,
    },
    async (log) => {
      const update = { $push: { logs: log } };

      if (log.row) update.$set = { lastRow: log.row };

      if (log.rowTimeMs) {
        processed++;
        totalTime += log.rowTimeMs;
        update.$set = {
          ...(update.$set || {}),
          avgRowTimeMs: Math.round(totalTime / processed),
        };
      }

      await ScrapeJob.updateOne({ jobId }, update);
    },
    stopFlag,
  );

  const finishedAt = new Date();
  const durationMs = finishedAt - new Date(job.startedAt);

  await ScrapeJob.updateOne(
    { jobId },
    {
      status: stopFlag.stopped ? "stopped" : "done",
      finishedAt,
      durationMs,
      cleanseFilePath: stopFlag.filePath,
    },
  );

  runningJobs.delete(jobId);
};

export const streamScrapeUrn = async (req, res) => {
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

    /* ---------------- TIME + ETA ---------------- */

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
