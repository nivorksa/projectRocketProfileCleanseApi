import launchGoLoginBrowser from "../utils/goLogin.js";
import loginRequired from "../utils/scraper/salesNav/loginRequired.js";
import salesNavIsExpired from "../utils/scraper/salesNav/salesNavIsExpired.js";
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
  const newWorkbook = worksheet.workbook;
  const newSheet = newWorkbook.getWorksheet(worksheet.name);

  const browserPromise = launchGoLoginBrowser(goLogin);
  const browser = await browserPromise; // now wait for browser to be ready

  const page = await browser.newPage();

  // Block unnecessary resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const blocked = ["image", "stylesheet", "font", "media"];
    blocked.includes(req.resourceType()) ? req.abort() : req.continue();
  });

  // await page.setViewport({ width: 1366, height: 768 });

  // Add "Note" column next to URL
  newSheet.spliceColumns(1, 0, ["Profile URN"]);
  newSheet.getRow(1).commit();

  let rowsSinceSave = 0;

  for (let i = 2; i <= newSheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog({ row: i, status: "Stopped", message: `Stopped at row ${i}` });

      await newWorkbook.xlsx.writeFile(stopFlag.filePath);
      break;
    }

    const rowStart = Date.now();

    const row = newSheet.getRow(i);

    try {
      const url = row.getCell(urlColumnIndex + 1).text.trim();

      if (!url || !url.startsWith("http")) {
        row.getCell(1).value = "invalid url";
        row.commit();
        onLog({ row: i, status: "Invalid URL" });
        continue;
      }

      await page.goto(url, {
        waitUntil: "load",
        timeout: 0,
      });

      // Handle logged out session
      if (await loginRequired(page)) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);

        onLog({
          errorStatus: "Logged Out",
          error: "SalesNav session logged out. Please re-login.",
        });

        stopFlag.stopped = true;

        break;
      }

      // Handle expired SalesNav subscription
      if (await salesNavIsExpired(page)) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);

        onLog({
          errorStatus: "Session Expired",
          error: "Your SalesNav subscription is expired.",
        });

        stopFlag.stopped = true;

        break;
      }

      const urn = await extractSalesNavUrn(page);

      row.getCell(1).value = urn || "N/A";
      row.commit();

      const rowTime = Date.now() - rowStart;

      onLog({
        row: i,
        status: urn && urn !== "N/A" ? "Found" : "Not Found",
        urn,
        rowTimeMs: rowTime,
      });

      rowsSinceSave++;
      if (rowsSinceSave >= 10) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);
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
    await newWorkbook.xlsx.writeFile(stopFlag.filePath);
  }

  await browser.close();
};

export default profileUrnFinder;
