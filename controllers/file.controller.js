import ExcelJS from "exceljs";
import scrapeData from "../utils/scraper.js";
import fs from "fs";
import path from "path";

let filePath = "";
let sheetsData = {};
let scrapingStopped = false; // global stop flag

export const uploadFile = async (req, res, next) => {
  try {
    filePath = req.file.path;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const sheetNames = workbook.worksheets.map((ws) => ws.name);

    sheetsData = {};
    workbook.worksheets.forEach((sheet) => {
      sheetsData[sheet.name] = sheet;
    });

    res.status(200).json({ sheetNames });
  } catch (err) {
    next(err);
  }
};

export const processFile = async (req, res, next) => {
  try {
    const { sheetName } = req.body;

    const selectedSheet = sheetsData[sheetName];
    const columnNames = selectedSheet.getRow(1).values.slice(1);

    res.status(200).json({ columnNames });
  } catch (err) {
    next(err);
  }
};

// Legacy scrapeProfiles (if you still want to keep it)
export const scrapeProfiles = async (req, res, next) => {
  try {
    const {
      sheetName,
      companyColumn,
      urlColumn,
      goLoginToken,
      goLoginProfileId,
    } = req.body;

    if (
      !sheetName ||
      !companyColumn ||
      !urlColumn ||
      !goLoginToken ||
      !goLoginProfileId
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const goLogin = { token: goLoginToken, profileId: goLoginProfileId };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(sheetName);

    const headerRow = worksheet.getRow(1);
    const headerValuesNormalized = headerRow.values.map((val) =>
      typeof val === "string" ? val.trim().toLowerCase() : val
    );

    const urlColumnIndex = headerValuesNormalized.findIndex(
      (val) => val === urlColumn.trim().toLowerCase()
    );
    const companyColumnIndex = headerValuesNormalized.findIndex(
      (val) => val === companyColumn.trim().toLowerCase()
    );

    if (urlColumnIndex === -1 || urlColumnIndex === 0) {
      return res.status(400).json({ message: "URL column not found." });
    }
    if (companyColumnIndex === -1 || companyColumnIndex === 0) {
      return res.status(400).json({ message: "Company column not found." });
    }

    await scrapeData(
      worksheet,
      {
        companyColumnIndex,
        urlColumnIndex,
        minConnectionCount: 0, // no min connections in legacy
      },
      goLogin,
      () => {},
      { stopped: false, filePath } // pass filePath for saving
    );

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath);
  } catch (err) {
    next(err);
  }
};

// Streaming scrape with real-time events and stop support + min connections param
export const scrapeProfilesStream = async (req, res, next) => {
  try {
    const {
      sheetName,
      fullNameColumn,
      jobTitleColumn,
      companyColumn,
      urlColumn,
      goLoginToken,
      goLoginProfileId,
      minimumConnections, // ✅ Correct param name
    } = req.query;

    if (
      !sheetName ||
      !fullNameColumn ||
      !jobTitleColumn ||
      !companyColumn ||
      !urlColumn ||
      !goLoginToken ||
      !goLoginProfileId
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    scrapingStopped = false;

    const goLogin = { token: goLoginToken, profileId: goLoginProfileId };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(sheetName);
    const headerRow = worksheet.getRow(1);
    const headers = headerRow.values.map((v) =>
      typeof v === "string" ? v.trim().toLowerCase() : v
    );

    const getIndex = (name) =>
      headers.findIndex((v) => v === name.trim().toLowerCase());

    const fullNameColumnIndex = getIndex(fullNameColumn);
    const jobTitleColumnIndex = getIndex(jobTitleColumn);
    const companyColumnIndex = getIndex(companyColumn);
    const urlColumnIndex = getIndex(urlColumn);

    if (
      [
        fullNameColumnIndex,
        jobTitleColumnIndex,
        companyColumnIndex,
        urlColumnIndex,
      ].some((i) => i <= 0)
    ) {
      return res
        .status(400)
        .json({ message: "One or more columns not found." });
    }

    // ✅ Parse minimumConnections to number properly
    let minConnectionCountNum = parseInt(minimumConnections, 10);
    if (isNaN(minConnectionCountNum)) minConnectionCountNum = 0;

    console.log("Backend received minConnectionCount:", minConnectionCountNum);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders();

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    try {
      await scrapeData(
        worksheet,
        {
          fullNameColumnIndex,
          jobTitleColumnIndex,
          companyColumnIndex,
          urlColumnIndex,
          minConnectionCount: minConnectionCountNum, // ✅ Send as number
        },
        goLogin,
        sendEvent,
        {
          get stopped() {
            return scrapingStopped;
          },
          filePath,
        }
      );

      await workbook.xlsx.writeFile(filePath);

      if (scrapingStopped) {
        sendEvent({ stopped: true, filePath });
      } else {
        sendEvent({ done: true, filePath });
      }

      res.end();
    } catch (scrapeErr) {
      sendEvent({ error: true, message: scrapeErr.message || "Scrape failed" });
      res.end();
    }
  } catch (err) {
    if (!res.headersSent) next(err);
    res.end();
  }
};

// Stop scraping endpoint sets flag
export const stopScraping = (req, res) => {
  scrapingStopped = true;
  res.status(200).json({ message: "Scraping stopped" });
};

export const downloadFile = (req, res) => {
  const { path: fileToDownload } = req.query;

  if (!fileToDownload) {
    return res.status(400).json({ message: "File path is required" });
  }

  // Make sure path is safe and file exists
  // Adjust base directory if needed to avoid path traversal vulnerabilities
  const absolutePath = path.resolve(fileToDownload);

  fs.access(absolutePath, fs.constants.F_OK, (err) => {
    if (err) {
      return res.status(404).json({ message: "File not found" });
    }
    res.download(absolutePath, (downloadErr) => {
      if (downloadErr) {
        console.error("Download error:", downloadErr);
        res.status(500).end();
      }
    });
  });
};
