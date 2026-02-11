import ExcelJS from "exceljs";
import path from "path";
import ScrapeJob from "../models/job.model.js";

/* ------------------ UPLOAD ------------------ */

export const uploadFile = async (req, res) => {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(req.file.path);

  // store the original file name in a variable
  const originalFileName = req.file.originalname;

  res.json({
    filePath: req.file.path,
    originalFileName,
    sheetNames: workbook.worksheets.map((w) => w.name),
  });

  console.log(req.file.originalname);
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

/* ------------------ DOWNLOAD ------------------ */

export const downloadJobFile = async (req, res) => {
  const job = await ScrapeJob.findOne({ jobId: req.params.jobId });
  if (!job || job.userId.toString() !== req.userId) return res.sendStatus(403);

  res.download(path.resolve(job.cleanseFilePath));
};
