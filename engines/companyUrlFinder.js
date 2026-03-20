import launchGoLoginBrowser from "../utils/goLogin.js";

const delay = (ms) => new Promise((res) => setTimeout(res, ms));

const normalizeDomain = (url) => {
  if (!url) return "";
  try {
    const u = new URL(url.startsWith("http") ? url : "https://" + url);
    return u.hostname.replace("www.", "");
  } catch {
    return url.replace("www.", "").trim();
  }
};

const companyUrlFinder = async (
  sheet,
  {
    startRow,
    nameColumnIndex,
    websiteColumnIndex,
    goLoginToken,
    goLoginProfileId,
  },
  logCallback,
  stopFlag,
) => {
  let browser;

  try {
    // --- FIXED GoLogin CALL ---
    browser = await launchGoLoginBrowser({
      token: goLoginToken,
      profileId: goLoginProfileId,
    });

    const page = await browser.newPage();

    // Optional: block images/styles/fonts to speed up scraping
    await page.setRequestInterception(true);
    page.on("request", (req) => {
      const blockedTypes = ["image", "stylesheet", "font", "media"];
      if (blockedTypes.includes(req.resourceType())) req.abort();
      else req.continue();
    });

    await page.goto("https://www.linkedin.com/sales/", {
      waitUntil: "domcontentloaded",
    });

    const lastRow = sheet.rowCount;

    for (let rowNumber = startRow; rowNumber <= lastRow; rowNumber++) {
      if (stopFlag.stopped) {
        await logCallback({
          status: "Stopped",
          message: "User requested stop",
        });
        break;
      }

      const startTime = Date.now();

      const row = sheet.getRow(rowNumber);
      const companyName =
        row
          .getCell(nameColumnIndex + 1)
          .value?.toString()
          .trim() || "";
      const website =
        row
          .getCell(websiteColumnIndex + 1)
          .value?.toString()
          .trim() || "";

      if (!companyName) {
        await logCallback({
          row: rowNumber,
          status: "Skipped",
          message: "No company name",
        });
        continue;
      }

      let foundUrl = "Not Found";

      try {
        // --- OPEN SALESNAV COMPANY SEARCH ---
        const searchUrl =
          "https://www.linkedin.com/sales/search/company?keywords=" +
          encodeURIComponent(companyName);

        await page.goto(searchUrl, { waitUntil: "domcontentloaded" });

        // wait for results cards
        try {
          await page.waitForSelector("a[href*='/sales/company/']", {
            timeout: 15000,
          });
        } catch {
          // no results found
        }

        // --- EXTRACT FIRST MATCH ---
        const results = await page.evaluate(() => {
          const cards = document.querySelectorAll("a[href*='/sales/company/']");
          return Array.from(cards)
            .map((a) => a.href)
            .filter(Boolean);
        });

        if (results.length > 0) {
          if (website) {
            const targetDomain = website
              .replace("https://", "")
              .replace("http://", "")
              .replace("www.", "")
              .split("/")[0];

            for (const url of results.slice(0, 5)) {
              await page.goto(url, { waitUntil: "domcontentloaded" });
              await delay(1200);

              const pageDomain = await page.evaluate(() => {
                const link = document.querySelector(
                  "a[data-anonymize='company-website']",
                );
                return link?.href || "";
              });

              if (
                pageDomain &&
                normalizeDomain(pageDomain).includes(targetDomain)
              ) {
                foundUrl = url;
                break;
              }
            }
          }

          // fallback: first result
          if (foundUrl === "Not Found") {
            foundUrl = results[0];
          }
        }
      } catch (err) {
        await logCallback({
          row: rowNumber,
          status: "Error",
          message: err.message,
        });
        foundUrl = "Error";
      }

      row.getCell(websiteColumnIndex + 1).value = foundUrl;
      row.commit();

      const rowTimeMs = Date.now() - startTime;

      await logCallback({
        row: rowNumber,
        status:
          foundUrl === "Not Found"
            ? "Not Found"
            : foundUrl === "Error"
              ? "Error"
              : "Found",
        message: foundUrl,
        rowTimeMs,
      });

      // save periodically
      if (rowNumber % 20 === 0) {
        await sheet.workbook.xlsx.writeFile(stopFlag.filePath);
      }

      await delay(800 + Math.random() * 600);
    }

    // final save
    await sheet.workbook.xlsx.writeFile(stopFlag.filePath);

    await logCallback({
      status: "Completed",
      message: "Company search finished",
    });
  } catch (err) {
    await logCallback({
      status: "Fatal Error",
      message: err.message,
    });
  } finally {
    if (browser) await browser.close();
  }
};

export default companyUrlFinder;
