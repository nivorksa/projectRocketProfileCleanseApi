import ExcelJS from "exceljs";
import { extractColumnNames } from "../utils/excelUtils.js";
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
    const columnNames = extractColumnNames(selectedSheet);

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

    // Fix: pass column index instead of column name
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
