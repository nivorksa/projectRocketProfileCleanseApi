import ExcelJS from "exceljs";
import scrapeData from "../utils/scraper.js";

let filePath = "";
let sheetsData = {};

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
    const columnNames = selectedSheet.getRow(1).values.slice(1); // skip first empty cell

    res.status(200).json({ columnNames });
  } catch (err) {
    next(err);
  }
};

export const scrapeProfiles = async (req, res, next) => {
  try {
    const { sheetName, columnsToVerify, urlColumn, goLogin } = req.body;

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(sheetName);

    const headerRow = worksheet.getRow(1);
    const urlColumnIndex = headerRow.values.findIndex(
      (val) => val === urlColumn
    );

    if (urlColumnIndex === -1) {
      return res.status(400).json({ message: "URL column not found." });
    }

    await scrapeData(worksheet, columnsToVerify, urlColumnIndex, goLogin);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath);
  } catch (err) {
    next(err);
  }
};

// SSE streaming scrape endpoint
export const scrapeProfilesStream = async (req, res, next) => {
  try {
    const sheetName = req.query.sheetName;
    const columnsToVerify = req.query.columnsToVerify
      ? req.query.columnsToVerify.split(",")
      : [];
    const urlColumn = req.query.urlColumn;
    const goLoginToken = req.query.goLoginToken;
    const goLoginProfileId = req.query.goLoginProfileId;

    if (
      !sheetName ||
      !Array.isArray(columnsToVerify) ||
      columnsToVerify.length === 0 ||
      !urlColumn ||
      !goLoginToken ||
      !goLoginProfileId
    ) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    // ... rest remains the same, just build goLogin object from token and profileId
    const goLogin = { token: goLoginToken, profileId: goLoginProfileId };

    const workbook = new ExcelJS.Workbook();
    await workbook.xlsx.readFile(filePath);

    const worksheet = workbook.getWorksheet(sheetName);

    const headerRow = worksheet.getRow(1);
    const urlColumnIndex = headerRow.values.findIndex(
      (val) => val === urlColumn
    );

    if (urlColumnIndex === -1) {
      return res.status(400).json({ message: "URL column not found." });
    }

    // Set SSE headers
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.flushHeaders();

    const sendEvent = (data) => {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    };

    await scrapeData(
      worksheet,
      columnsToVerify,
      urlColumnIndex,
      goLogin,
      sendEvent
    );

    await workbook.xlsx.writeFile(filePath);

    sendEvent({ done: true, filePath });

    res.end();
  } catch (err) {
    next(err);
  }
};
