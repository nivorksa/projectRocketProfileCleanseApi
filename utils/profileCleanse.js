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
  // Create a new workbook for cleansing
  const { newWorkbook, newFilePath } = await createNewWorkbook(
    worksheet,
    stopFlag.filePath
  );
  stopFlag.filePath = newFilePath;
  const newSheet = newWorkbook.getWorksheet(worksheet.name);

  const browser = await launchGoLoginBrowser(goLogin);
  const page = await browser.newPage();

  // Disable unnecessary resources
  await page.setRequestInterception(true);
  page.on("request", (req) => {
    const blockedTypes = ["image", "stylesheet", "font", "media", "websocket"];
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
      onLog({ message: `Scraping stopped at row ${i}` });
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
        onLog({ message: JSON.stringify({ row: i, status: "Invalid URL" }) });
        row.getCell(1).value = "error";
        row.commit();
        continue;
      }

      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 45000,
      });

      // Wait until either profile content OR reactivate page appears
      await Promise.race([
        // Login page loaded
        page.waitForSelector('button[type="submit"][aria-label="Sign in"]', {
          timeout: 8000,
        }),

        // Normal profile loaded
        page.waitForSelector('h1[data-anonymize="person-name"]', {
          timeout: 8000,
        }),

        // SalesNav expired → reactivate page
        page.waitForSelector("button.premium-chooser__cta", {
          timeout: 8000,
        }),
      ]).catch(() => {});

      // Check for logged out session
      const isLoggedOut = await loginRequired(page);

      if (isLoggedOut) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);

        onLog({
          message: JSON.stringify({
            status: "Logged Out",
            stopped: true,
            filePath: stopFlag.filePath,
            message: "SalesNav session logged out. Please re-login.",
          }),
        });

        break;
      }

      // Check for expired SalesNav subscription
      const isExpired = await salesNavIsExpired(page);

      if (isExpired) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);

        onLog({
          message: JSON.stringify({
            status: "Session Expired",
            stopped: true,
            filePath: stopFlag.filePath,
            message: "Your SalesNav subscription is expired.",
          }),
        });

        break;
      }

      try {
        await page.waitForSelector('h1[data-anonymize="person-name"]', {
          timeout: 10000,
        });
      } catch {}

      await delay(1000);

      const locked = await isLockedProfile(page);
      if (locked) {
        onLog({
          message: JSON.stringify({ row: i, status: "Locked profile" }),
        });
        row.getCell(1).value = "locked";
        row.commit();
        continue;
      }

      // Extract main fields
      const [fullName, jobTitle, company, connectionCount] = await Promise.all([
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
        if (matchedKeywords.length > 0) noteValue = matchedKeywords.join(", ");
      }

      row.getCell(1).value = noteValue;
      row.commit();

      onLog({
        message: JSON.stringify({
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
        }),
      });

      rowsSinceLastWrite++;
      if (rowsSinceLastWrite >= 10) {
        await newWorkbook.xlsx.writeFile(stopFlag.filePath);
        rowsSinceLastWrite = 0;
      }

      await delay(getRandomDelay());
    } catch (err) {
      onLog({
        message: JSON.stringify({
          row: i,
          status: "Error",
          error: err.message,
        }),
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
