import launchGoLoginBrowser from "../utils/goLogin.js";
import extractSalesNavUrn from "../utils/scraper/linkedIn/leads/extractSalesNavUrn.js";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const getRandomDelay = () => Math.floor(Math.random() * 500) + 500;

const profileUrnFinder = async (
  worksheet,
  { urlColumnIndex },
  goLogin,
  onLog = () => {},
  stopFlag = { stopped: false, filePath: "" },
) => {
  const workbook = worksheet.workbook;
  const sheet = workbook.getWorksheet(worksheet.name);

  const browser = await launchGoLoginBrowser(goLogin);
  const page = await browser.newPage();

  // Block unnecessary resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const blocked = ["image", "stylesheet", "font", "media"];
    blocked.includes(req.resourceType()) ? req.abort() : req.continue();
  });

  await page.setViewport({ width: 1366, height: 768 });

  // Add "Note" column next to URL
  sheet.spliceColumns(1, 0, ["Profile URN"]);
  sheet.getRow(1).commit();

  let rowsSinceSave = 0;

  for (let i = 2; i <= sheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog({ row: i, status: "Stopped", message: `Stopped at row ${i}` });
      await workbook.xlsx.writeFile(stopFlag.filePath);
      break;
    }

    const rowStart = Date.now();
    const row = sheet.getRow(i);

    try {
      const url = row.getCell(urlColumnIndex + 1).text.trim();

      if (!url || !url.startsWith("http")) {
        row.getCell(1).value = "invalid url";
        row.commit();
        onLog({ row: i, status: "Invalid URL" });
        continue;
      }

      await page.goto(url, { waitUntil: "networkidle2", timeout: 0 });

      const urn = await extractSalesNavUrn(page);

      row.getCell(1).value = urn || "N/A";
      row.commit();

      const rowTime = Date.now() - rowStart;

      onLog({
        row: i,
        status: urn && urn !== "N/A" ? "URN Found" : "Not Found",
        urn,
        rowTimeMs: rowTime,
      });

      rowsSinceSave++;
      if (rowsSinceSave >= 10) {
        await workbook.xlsx.writeFile(stopFlag.filePath);
        rowsSinceSave = 0;
      }

      await delay(getRandomDelay());
    } catch (err) {
      row.getCell(1).value = "error";
      row.commit();

      onLog({
        row: i,
        status: "Error",
        message: `Row ${i} — Error`,
        error: err.message,
      });

      await delay(getRandomDelay());
    }
  }

  if (rowsSinceSave > 0) {
    await workbook.xlsx.writeFile(stopFlag.filePath);
  }

  await browser.close();
};

export default profileUrnFinder;
