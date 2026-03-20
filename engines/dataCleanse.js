const dataCleanse = async (
  worksheet,
  { startRow = 2, columnIndex, keywords = [] },
  onLog = () => {},
  stopFlag = { stopped: false, filePath: "" },
) => {
  const workbook = worksheet.workbook;
  const sheet = workbook.getWorksheet(worksheet.name);

  // 🧠 Escape regex special characters
  const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  // 🧠 Normalize keywords
  const normalized = keywords
    .map((k) => escapeRegex(k.trim().toLowerCase()))
    .filter(Boolean);

  const regex =
    normalized.length > 0
      ? new RegExp(`\\b(${normalized.join("|")})\\b`, "i")
      : null;

  let rowsSinceLastWrite = 0;

  for (let i = startRow; i <= sheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog({
        status: "Stopped",
        row: i,
        message: `Stopped at row ${i}`,
      });

      await workbook.xlsx.writeFile(stopFlag.filePath);
      break;
    }

    const rowStart = Date.now();
    const row = sheet.getRow(i);

    try {
      // Use correct column index (NO +1, no shifting)
      const cell = row.getCell(columnIndex);

      let value = cell.text?.trim().toLowerCase();

      if (!value) continue;

      let matched = false;

      if (regex && regex.test(value)) {
        matched = true;

        // Highlight cell
        cell.fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: "FFFFFF00" }, // yellow
        };
      }

      const rowTimeMs = Date.now() - rowStart;

      onLog({
        row: i,
        status: matched ? "Matched" : "No Match",
        value,
        rowTimeMs,
      });

      rowsSinceLastWrite++;

      // 💾 Save periodically
      if (rowsSinceLastWrite >= 50) {
        await workbook.xlsx.writeFile(stopFlag.filePath);
        rowsSinceLastWrite = 0;
      }
    } catch (err) {
      onLog({
        row: i,
        status: "Error",
        error: err.message,
      });
    }
  }

  // Final save
  if (rowsSinceLastWrite > 0) {
    await workbook.xlsx.writeFile(stopFlag.filePath);
  }
};

export default dataCleanse;
