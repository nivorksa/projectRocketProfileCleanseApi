import launchGoLoginBrowser from "./goLogin.js";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));
const getRandomDelay = () => Math.floor(Math.random() * 1000) + 1000;

/**
 * Dynamically load extractor set based on platform.
 * platform: 'salesnav' | 'linkedin'
 */
const loadExtractors = async (platform) => {
  if (platform === "salesnav") {
    const [fullNameMod, jobTitleMod, companyMod, connMod, lockedMod] =
      await Promise.all([
        import("./scraper/salesNav/extractFullName.js"),
        import("./scraper/salesNav/extractJobTitle.js"),
        import("./scraper/salesNav/extractCompany.js"),
        import("./scraper/salesNav/extractConnectionCount.js"),
        import("./scraper/salesNav/isLockedProfile.js"),
      ]);
    return {
      extractFullName: fullNameMod.default,
      extractJobTitle: jobTitleMod.default,
      extractCompany: companyMod.default,
      extractConnectionCount: connMod.default,
      isLockedProfile: lockedMod.default, // used only for SalesNav
      initialWaitSelector: 'h1[data-anonymize="person-name"]', // SalesNav typical
    };
  }

  if (platform === "linkedin") {
    const [fullNameMod, jobTitleMod, companyMod, connMod] = await Promise.all([
      import("./scraper/linkedIn/extractFullName.js"),
      import("./scraper/linkedIn/extractJobTitle.js"),
      import("./scraper/linkedIn/extractCompany.js"),
      import("./scraper/linkedIn/extractConnectionCount.js"),
    ]);
    return {
      extractFullName: fullNameMod.default,
      extractJobTitle: jobTitleMod.default,
      extractCompany: companyMod.default,
      extractConnectionCount: connMod.default,
      isLockedProfile: async () => false, // LinkedIn: do NOT check locked
      initialWaitSelector: null, // let extractors work; rely on networkidle + small delay
    };
  }

  throw new Error(`Unsupported platform: ${platform}`);
};

/**
 * Profile cleanse core
 * - Uses dynamic extractors set by platform.
 * - Reads single URL column selected (SalesNav OR LinkedIn).
 * - Keeps your existing "good/bad/error/locked" + mismatch JSON logging shape,
 *   with 'salesnav' payload key maintained for UI compatibility (even on LinkedIn).
 */
const profileCleanse = async (
  worksheet,
  {
    fullNameColumnIndex,
    jobTitleColumnIndex,
    companyColumnIndex,
    urlColumnIndex, // platform-specific column index
    minConnectionCount = 0,
    platform = "salesnav", // 'salesnav' | 'linkedin'
  },
  goLogin,
  onLog = () => {},
  stopFlag = { stopped: false, filePath: "" }
) => {
  const usingLinkedIn = platform === "linkedin";
  const usingSalesNav = platform === "salesnav";

  const {
    extractFullName,
    extractJobTitle,
    extractCompany,
    extractConnectionCount,
    isLockedProfile,
    initialWaitSelector,
  } = await loadExtractors(platform);

  const browser = await launchGoLoginBrowser(goLogin);
  const page = await browser.newPage();
  await page.setViewport({ width: 1366, height: 768 });

  // Insert "Note" column as the first column (only once per run)
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
        onLog({
          message: JSON.stringify({
            row: i,
            status: "Invalid URL",
            platform,
          }),
        });
        row.getCell(1).value = "error";
        row.commit();
        rowsSinceLastWrite++;
        if (rowsSinceLastWrite >= 10 || i === worksheet.rowCount) {
          await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
          rowsSinceLastWrite = 0;
        }
        continue;
      }

      // SalesNav: wait for stable selector
      if (usingSalesNav && initialWaitSelector) {
        await page.goto(profileUrl, {
          waitUntil: "networkidle2",
          timeout: 60000,
        });
        await page.waitForSelector(initialWaitSelector, { timeout: 15000 });
        await delay(2000);
      }

      // LinkeIn
      if (usingLinkedIn && !initialWaitSelector) {
        // Navigate to profile
        await page.goto(profileUrl, {
          waitUntil: "domcontentloaded",
          timeout: 60000,
        });
        await delay(3000);
      }

      // LinkedIn: do NOT check locked. SalesNav: DO check locked.
      if (usingSalesNav) {
        const locked = await isLockedProfile(page);
        if (locked) {
          onLog({
            message: JSON.stringify({
              row: i,
              status: "Locked",
              platform,
            }),
          });
          row.getCell(1).value = "locked";
          row.commit();
          rowsSinceLastWrite++;
          if (rowsSinceLastWrite >= 10 || i === worksheet.rowCount) {
            await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
            rowsSinceLastWrite = 0;
          }
          await delay(getRandomDelay());
          continue;
        }
      }

      // Extract all fields with the platform-specific extractors
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

      // ⚠️ UI compatibility: keep `salesnav` object key even for LinkedIn
      onLog({
        message: JSON.stringify({
          row: i,
          status: overallMatch ? "Match" : "Mismatch",
          platform, // extra info; UI may ignore
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
      rowsSinceLastWrite++;
      if (rowsSinceLastWrite >= 10 || i === worksheet.rowCount) {
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        rowsSinceLastWrite = 0;
      }
      await delay(getRandomDelay());
    } catch (err) {
      onLog({
        message: JSON.stringify({
          row: i,
          status: "Error",
          platform,
          error: err.message,
        }),
      });
      row.getCell(1).value = "error";
      row.commit();
      rowsSinceLastWrite++;
      if (rowsSinceLastWrite >= 10 || i === worksheet.rowCount) {
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        rowsSinceLastWrite = 0;
      }
      await delay(getRandomDelay());
    }
  }

  await browser.close();
};

export default profileCleanse;
