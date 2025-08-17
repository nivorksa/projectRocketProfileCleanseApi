import ExcelJS from "exceljs";
import profileCleanse from "../utils/profileCleanse.js";
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

/**
 * Legacy scrapeProfiles (kept; defaults to SalesNav behavior)
 * Requires: sheetName, fullNameColumn, jobTitleColumn, companyColumn, urlColumn, goLoginToken, goLoginProfileId
 */
export const scrapeProfiles = async (req, res, next) => {
  try {
    const {
      sheetName,
      fullNameColumn,
      jobTitleColumn,
      companyColumn,
      urlColumn,
      goLoginToken,
      goLoginProfileId,
    } = req.body;

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

    await profileCleanse(
      worksheet,
      {
        fullNameColumnIndex,
        jobTitleColumnIndex,
        companyColumnIndex,
        urlColumnIndex,
        minConnectionCount: 0,
        platform: "salesnav",
      },
      goLogin,
      () => {},
      { stopped: false, filePath }
    );

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath);
  } catch (err) {
    next(err);
  }
};

/**
 * Streaming scrape with real-time events, stop support, min connections,
 * and NEW toggles for SalesNav / LinkedIn + URL columns per platform.
 */
export const scrapeProfilesStream = async (req, res, next) => {
  try {
    const {
      sheetName,
      fullNameColumn,
      jobTitleColumn,
      companyColumn,

      // old single column is replaced by specific ones:
      urlColumnSalesNav,
      urlColumnLinkedIn,

      // toggles (strings "true"/"false")
      checkSalesNav,
      checkLinkedIn,

      goLoginToken,
      goLoginProfileId,
      minimumConnections,
    } = req.query;

    if (
      !sheetName ||
      !fullNameColumn ||
      !jobTitleColumn ||
      !companyColumn ||
      !goLoginToken ||
      !goLoginProfileId
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // Parse toggles
    const useSalesNav = String(checkSalesNav || "").toLowerCase() === "true";
    const useLinkedIn = String(checkLinkedIn || "").toLowerCase() === "true";

    if (!useSalesNav && !useLinkedIn) {
      return res.status(400).json({
        message: "Select at least one platform (SalesNav or LinkedIn).",
      });
    }

    // If both are selected, we will default to SalesNav (avoid double-processing/overwrites).
    let chosenPlatform = "salesnav";
    if (useSalesNav) chosenPlatform = "salesnav";
    else if (useLinkedIn) chosenPlatform = "linkedin";

    // Validate URL column presence for the chosen platform
    if (chosenPlatform === "salesnav" && !urlColumnSalesNav) {
      return res
        .status(400)
        .json({ message: "SalesNav URL column is required." });
    }
    if (chosenPlatform === "linkedin" && !urlColumnLinkedIn) {
      return res
        .status(400)
        .json({ message: "LinkedIn URL column is required." });
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
      headers.findIndex((v) => v === String(name).trim().toLowerCase());

    const fullNameColumnIndex = getIndex(fullNameColumn);
    const jobTitleColumnIndex = getIndex(jobTitleColumn);
    const companyColumnIndex = getIndex(companyColumn);

    if (
      [fullNameColumnIndex, jobTitleColumnIndex, companyColumnIndex].some(
        (i) => i <= 0
      )
    ) {
      return res
        .status(400)
        .json({ message: "One or more columns not found." });
    }

    const urlColumnIndex =
      chosenPlatform === "salesnav"
        ? getIndex(urlColumnSalesNav)
        : getIndex(urlColumnLinkedIn);

    if (urlColumnIndex <= 0) {
      return res.status(400).json({ message: "URL column not found." });
    }

    // Parse min connections
    let minConnectionCountNum = parseInt(String(minimumConnections || "0"), 10);
    if (isNaN(minConnectionCountNum)) minConnectionCountNum = 0;

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.flushHeaders?.();

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    // Inform if both were on but we defaulted.
    if (useSalesNav && useLinkedIn) {
      sendEvent({
        message: "[Info] Both toggles ON; defaulting to SalesNav for this run.",
      });
    }

    try {
      await profileCleanse(
        worksheet,
        {
          fullNameColumnIndex,
          jobTitleColumnIndex,
          companyColumnIndex,
          urlColumnIndex,
          minConnectionCount: minConnectionCountNum,
          platform: chosenPlatform, // 'salesnav' | 'linkedin'
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
      const msg = scrapeErr?.message || "Scrape failed";
      sendEvent({ error: true, message: msg });
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
