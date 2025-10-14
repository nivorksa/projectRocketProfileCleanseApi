import ExcelJS from "exceljs";
import path from "path";

const createNewWorkbook = async (worksheet, originalFilePath) => {
  const newWorkbook = new ExcelJS.Workbook();
  const newSheet = newWorkbook.addWorksheet(worksheet.name);

  // Copy only cell values (no styles, no merges)
  worksheet.eachRow({ includeEmpty: true }, (row, rowNumber) => {
    const newRow = newSheet.getRow(rowNumber);
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      newRow.getCell(colNumber).value = cell.value;
    });
    newRow.commit();
  });

  // Generate a new file path
  const dir = path.dirname(originalFilePath);
  const ext = path.extname(originalFilePath);
  const base = path.basename(originalFilePath, ext);
  const newFilePath = path.join(dir, `${base}_cleanse${ext}`);

  // Save new workbook
  await newWorkbook.xlsx.writeFile(newFilePath);

  return { newWorkbook, newFilePath };
};

export default createNewWorkbook;
