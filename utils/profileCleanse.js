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
import createNewWorkbook from "./createNewWorkbook.js";

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
  stopFlag = { stopped: false, filePath: "" }
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

      // Short delay to allow SPA redirect / GraphQL fetch
      await delay(2000);

      // Detect page state
      const url = page.url();
      const isLoginPage =
        url.includes("/login") ||
        (await page.$('button[type="submit"][aria-label="Sign in"]'));
      const isExpiredPage =
        url.includes("/reactivate") ||
        (await page.$("button.premium-chooser__cta"));

      // Handle logged out session
      if (isLoginPage || (await loginRequired(page))) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);

        onLog({
          status: "Logged Out",
          stopped: true,
          filePath: stopFlag.filePath,
          error: "SalesNav session logged out. Please re-login.",
        });

        break;
      }

      // Handle expired SalesNav subscription
      if (isExpiredPage || (await salesNavIsExpired(page))) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);

        onLog({
          status: "Session Expired",
          stopped: true,
          filePath: stopFlag.filePath,
          error: "Your SalesNav subscription is expired.",
        });

        break;
      }

      // Handle normal profile
      if (!isLoginPage && !isExpiredPage) {
        await page.waitForSelector('h1[data-anonymize="person-name"]', {
          timeout: 0,
        });

        await delay(1000);

        const locked = await isLockedProfile(page);
        if (locked) {
          onLog({
            row: i,
            status: "Locked profile",
          });

          row.getCell(1).value = "locked";
          row.commit();
          continue;
        }

        // Extract main fields
        const [fullName, jobTitle, company, connectionCount] =
          await Promise.all([
            extractFullName(page),
            extractJobTitle(page),
            extractCompany(page),
            extractConnectionCount(page),
          ]);

        const matches = {
          fullName: (fullName || "").toLowerCase() === fullNameExcel,
          jobTitle: (jobTitle || "").toLowerCase() === jobTitleExcel,
          company: (company || "").toLowerCase() === companyExcel,
          connectionCount: (Number(connectionCount) || 0) >= minConnectionCount,
        };

        const overallMatch =
          matches.fullName &&
          matches.jobTitle &&
          matches.company &&
          matches.connectionCount;

        let noteValue = overallMatch ? "good" : "bad";

        // Keyword search after expanding "See more" sections
        if (overallMatch && keywordSearchEnabled && keywords.length > 0) {
          await expandSeeMore(page);
          const pageContent = (await extractPageContent(page)).toLowerCase();
          const matchedKeywords = keywords.filter((k) =>
            pageContent.includes(k.toLowerCase())
          );
          if (matchedKeywords.length > 0)
            noteValue = matchedKeywords.join(", ");
        }

        row.getCell(1).value = noteValue;
        row.commit();

        onLog({
          row: i,
          status: overallMatch ? "Match" : "Mismatch",
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
            connectionCount: Number(connectionCount) || 0,
          },
        });

        rowsSinceLastWrite++;
        if (rowsSinceLastWrite >= 10) {
          await newWorkbook.xlsx.writeFile(stopFlag.filePath);
          rowsSinceLastWrite = 0;
        }

        await delay(getRandomDelay());
      }
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
