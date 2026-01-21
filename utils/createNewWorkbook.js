import ExcelJS from "exceljs";
import path from "path";
import fs from "fs";

// Ensure cleansed folder exists
const cleansedDir = path.join(process.cwd(), "cleansed");
if (!fs.existsSync(cleansedDir)) fs.mkdirSync(cleansedDir, { recursive: true });

const createNewWorkbook = async (worksheet, originalFilePath) => {
  const newWorkbook = new ExcelJS.Workbook();
  const newSheet = newWorkbook.addWorksheet(worksheet.name);

  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const newRow = newSheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      newRow.getCell(colNumber).value = cell.value;
    });
    newRow.commit();
  });

  // Save cleansed workbook in 'cleansed/' folder
  const ext = path.extname(originalFilePath);
  const base = path.basename(originalFilePath, ext);
  const newFilePath = path.join(cleansedDir, `${base}_cleansed${ext}`);

  await newWorkbook.xlsx.writeFile(newFilePath);

  return { newWorkbook, newFilePath };
};

export default createNewWorkbook;
