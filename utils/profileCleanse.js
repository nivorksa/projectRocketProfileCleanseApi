import launchGoLoginBrowser from "./goLogin.js";
import extractPageContent from "./scraper/salesNav/extractPageContent.js";
import loginRequired from "./scraper/salesNav/loginRequired.js";
import salesNavIsExpired from "./scraper/salesNav/salesNavIsExpired.js";
import extractFullName from "./scraper/salesNav/extractFullName.js";
import extractJobTitle from "./scraper/salesNav/extractJobTitle.js";
import extractCompany from "./scraper/salesNav/extractCompany.js";
import extractConnectionCount from "./scraper/salesNav/extractConnectionCount.js";
import expandSeeMore from "./scraper/salesNav/expandSeeMore.js";
import isLockedProfile from "./scraper/salesNav/isLockedProfile.js";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const getRandomDelay = () => Math.floor(Math.random() * 500) + 500;

const profileCleanse = async (
  worksheet,
  {
    fullNameColumnIndex,
    jobTitleColumnIndex,
    companyColumnIndex,
    urlColumnIndex,
    minConnectionCount = 0,
    keywordSearchEnabled = false,
    keywords = [],
  },
  goLogin,
  onLog = () => {},
  stopFlag = { stopped: false, filePath: "" },
) => {
  // Use the workbook already created by backend
  const newWorkbook = worksheet.workbook;
  const newSheet = newWorkbook.getWorksheet(worksheet.name);

  const browserPromise = launchGoLoginBrowser(goLogin);

  const browser = await browserPromise; // now wait for browser to be ready

  const page = await browser.newPage();

  // Disable unnecessary resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const blockedTypes = ["image", "stylesheet", "font", "media"];
    if (blockedTypes.includes(req.resourceType())) req.abort();
    else req.continue();
  });

  await page.setViewport({ width: 1366, height: 768 });

  // Add "Note" column
  newSheet.spliceColumns(1, 0, ["Note"]);
  newSheet.getRow(1).commit();

  let rowsSinceLastWrite = 0;

  for (let i = 2; i <= newSheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog({
        status: "Stopped",
        row: i,
        message: `Scraping stopped at row ${i}`,
      });

      await newWorkbook.xlsx.writeFile(stopFlag.filePath);
      break;
    }

    const rowStart = Date.now();

    const row = newSheet.getRow(i);

    try {
      const profileUrl = row.getCell(urlColumnIndex + 1).text.trim();
      const fullNameExcel = row
        .getCell(fullNameColumnIndex + 1)
        .text.trim()
        .toLowerCase();
      const jobTitleExcel = row
        .getCell(jobTitleColumnIndex + 1)
        .text.trim()
        .toLowerCase();
      const companyExcel = row
        .getCell(companyColumnIndex + 1)
        .text.trim()
        .toLowerCase();

      if (!profileUrl || !profileUrl.startsWith("http")) {
        onLog({
          row: i,
          status: "Invalid URL",
        });

        row.getCell(1).value = "error";
        row.commit();
        continue;
      }

      await page.goto(profileUrl, {
        waitUntil: "networkidle2", // wait until most XHR requests finish
        timeout: 0,
      });

      // await page.goto(profileUrl, {
      //   waitUntil: "domcontentloaded",
      //   timeout: 0,
      // });

      // Short delay to allow SPA redirect / GraphQL fetch
      // await delay(4000);

      // Detect page state
      const url = page.url();

      // Handle normal profile

      // await page.waitForSelector('h1[data-anonymize="person-name"]', {
      //   timeout: 15000,
      // });

      try {
        await page.waitForSelector(
          '[data-sn-view-name="lead-current-role"] [data-anonymize="company-name"]',
          { timeout: 20000 },
        );
      } catch {
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
      }

      const locked = await isLockedProfile(page);

      // Extract main fields
      let fullName = null;
      let jobTitle = null;
      let company = null;
      let connectionCount = null;

      if (!locked) {
        [fullName, jobTitle, company, connectionCount] = await Promise.all([
          extractFullName(page),
          extractJobTitle(page),
          extractCompany(page),
          extractConnectionCount(page),
        ]);
      } else {
        [jobTitle, company, connectionCount] = await Promise.all([
          extractJobTitle(page),
          extractCompany(page),
          extractConnectionCount(page),
        ]);
      }

      // Normalize connection count based on lock state
      let normalizedConnectionCount;

      if (connectionCount === "N/A") {
        normalizedConnectionCount = locked ? null : 0;
      } else {
        normalizedConnectionCount = Number(connectionCount);
      }

      const matches = {
        jobTitle: (jobTitle || "").toLowerCase() === jobTitleExcel,
        company: (company || "").toLowerCase() === companyExcel,
      };

      // Check if connection count criterion is applicable
      const hasVisibleConnectionCount = normalizedConnectionCount !== null;

      // Apply connection count check if applicable
      if (hasVisibleConnectionCount) {
        matches.connectionCount =
          normalizedConnectionCount >= minConnectionCount;
      }

      if (!locked) {
        matches.fullName = (fullName || "").toLowerCase() === fullNameExcel;
      }

      const hasMismatch = Object.values(matches).some((v) => v === false);

      let status;

      if (locked && hasMismatch) {
        status = "Locked + Mismatch";
      } else if (locked) {
        status = "Locked";
      } else {
        status = hasMismatch ? "Mismatch" : "Match";
      }

      let noteValue;

      if (locked) {
        noteValue = hasMismatch ? "bad" : "locked";
      } else {
        noteValue = hasMismatch ? "bad" : "good";
      }

      // Keyword search after expanding "See more" sections
      if (
        !locked &&
        !hasMismatch &&
        keywordSearchEnabled &&
        keywords.length > 0
      ) {
        await expandSeeMore(page);
        const pageContent = (await extractPageContent(page)).toLowerCase();
        const matchedKeywords = keywords.filter((k) =>
          pageContent.includes(k.toLowerCase()),
        );
        if (matchedKeywords.length > 0) noteValue = matchedKeywords.join(", ");
      }

      row.getCell(1).value = noteValue;
      row.commit();

      const rowDuration = Date.now() - rowStart;

      onLog({
        row: i,
        status,
        matches,
        note: noteValue,
        excel: {
          fullName: fullNameExcel,
          jobTitle: jobTitleExcel,
          company: companyExcel,
          connectionCount: minConnectionCount,
        },
        salesnav: {
          fullName: (fullName || "").toLowerCase(),
          jobTitle: (jobTitle || "").toLowerCase(),
          company: (company || "").toLowerCase(),
          connectionCount:
            normalizedConnectionCount === null
              ? "N/A"
              : normalizedConnectionCount,
        },
        rowTimeMs: rowDuration,
      });

      rowsSinceLastWrite++;
      if (rowsSinceLastWrite >= 10) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);
        rowsSinceLastWrite = 0;
      }

      await delay(getRandomDelay());
    } catch (err) {
      onLog({
        row: i,
        status: "Error",
        error: err.message,
      });

      row.getCell(1).value = "error";
      row.commit();
      await delay(getRandomDelay());
    }
  }

  if (rowsSinceLastWrite > 0) {
    await newWorkbook.xlsx.writeFile(stopFlag.filePath);
  }

  await browser.close();
};

export default profileCleanse;
