import launchGoLoginBrowser from "./goLogin.js";
import extractFullName from "./scraper/salesNav/extractFullName.js";
import extractJobTitle from "./scraper/salesNav/extractJobTitle.js";
import extractCompany from "./scraper/salesNav/extractCompany.js";
import extractConnectionCount from "./scraper/salesNav/extractConnectionCount.js";
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
  },
  goLogin,
  onLog = () => {},
  stopFlag = { stopped: false, filePath: "" }
) => {
  const browser = await launchGoLoginBrowser(goLogin);
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  worksheet.spliceColumns(1, 0, ["Note"]);
  worksheet.getRow(1).commit();

  let rowsSinceLastWrite = 0;

  for (let i = 2; i <= worksheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog({ message: `Scraping stopped at row ${i}` });
      await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
      break;
    }

    const row = worksheet.getRow(i);
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
        waitUntil: "networkidle2",
        timeout: 60000,
      });
      await page.waitForSelector('h1[data-anonymize="person-name"]', {
        timeout: 15000,
      });
      await delay(2000);

      const locked = await isLockedProfile(page);
      if (locked) {
        onLog({
          message: JSON.stringify({ row: i, status: "Locked profile" }),
        });
        row.getCell(1).value = "locked";
        row.commit();
        continue;
      }

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

      row.getCell(1).value = overallMatch ? "good" : "bad";

      onLog({
        message: JSON.stringify({
          row: i,
          status: overallMatch ? "Match" : "Mismatch",
          matches,
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

      row.commit();
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

  await browser.close();
};

export default profileCleanse;
