import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const getRandomDelay = () => Math.floor(Math.random() * 4000) + 3000;

const scrapeData = async (
  worksheet,
  columnsToVerify,
  urlColumnIndex,
  goLoginCredentials,
  onLog = () => {}
) => {
  const { token, profileId } = goLoginCredentials;

  const GL = new GoLogin({ token, profile_id: profileId });
  const { status, wsUrl } = await GL.start();

  if (status !== "success") throw new Error("GoLogin profile failed to start");

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
  const page = await browser.newPage();

  const headerRow = worksheet.getRow(1);
  headerRow.getCell(1).value = "Verification Result";
  headerRow.commit();

  const headerMap = {};
  headerRow.values.forEach((val, idx) => {
    if (typeof val === "string") {
      // Clean: remove spaces, convert to lowercase
      headerMap[val.trim().toLowerCase().replace(/\s+/g, " ")] = idx;
    }
  });

  for (let i = 2; i <= worksheet.rowCount; i++) {
    const row = worksheet.getRow(i);

    try {
      const profileUrl = row.getCell(urlColumnIndex).text.trim();

      if (!profileUrl.startsWith("http")) {
        onLog(`Row ${i}: Invalid URL`);
        row.getCell(1).value = "error";
        row.commit();
        continue;
      }

      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });
      await delay(5000);

      const isLocked = await page.evaluate(() => {
        const text = document.body.innerText.toLowerCase();

        const isSalesNavLocked =
          text.includes("you can't view this profile") ||
          text.includes("upgrade to unlock profiles") ||
          text.includes("profile unavailable") ||
          text.includes("this profile is not available") ||
          text.includes("you do not have access to this profile") ||
          text.includes("content unavailable");

        const hasNoNameOrTitle =
          !document.querySelector('[data-anonymize="person-name"]') &&
          !document.querySelector('[data-anonymize="headline"]');

        return isSalesNavLocked || hasNoNameOrTitle;
      });

      const scrapedData = await page.evaluate(() => {
        const name =
          document
            .querySelector('[data-anonymize="person-name"]')
            ?.innerText.trim() || "";

        const title =
          document
            .querySelector('[data-anonymize="headline"]')
            ?.innerText.trim() || "";

        let company = "";

        // Try to get present company from the "current company" section
        const currentCompanyElement = document.querySelector(
          'div[data-test-lead-info-section="currentCompany"] a'
        );
        if (currentCompanyElement) {
          company = currentCompanyElement.innerText.trim();
        } else if (title.includes(" at ")) {
          // Fallback: extract company from the headline
          company = title.split(" at ")[1].trim();
        }

        return { name, title, company };
      });

      if (isLocked || (!scrapedData.name && !scrapedData.title)) {
        onLog(`Row ${i}: locked`);
        row.getCell(1).value = "locked";
        row.commit();
        await delay(getRandomDelay());
        continue;
      }

      let matched = true;

      for (const colName of columnsToVerify) {
        const colNameLower = colName.trim().toLowerCase().replace(/\s+/g, " ");
        const headerCellIndex = headerMap[colNameLower];

        if (!headerCellIndex) {
          onLog(`Row ${i}: Column "${colName}" not found`);
          matched = false;
          continue;
        }

        const sheetValue = row
          .getCell(headerCellIndex)
          .text.trim()
          .toLowerCase();

        let linkedInValue = "";
        if (colNameLower === "company name") {
          linkedInValue = scrapedData.company.toLowerCase();
        } else if (colNameLower === "full name") {
          linkedInValue = scrapedData.name.toLowerCase();
        } else if (colNameLower === "job title") {
          linkedInValue = scrapedData.title.toLowerCase();
        } else {
          onLog(`Row ${i}: No scraped field for column "${colName}"`);
          matched = false;
          continue;
        }

        if (!linkedInValue.includes(sheetValue)) {
          matched = false;
        }
      }

      row.getCell(1).value = matched ? "good" : "bad";
      row.commit();
      onLog(`Row ${i}: ${matched ? "good" : "bad"}`);

      await delay(getRandomDelay());
    } catch (err) {
      onLog(`Row ${i}: error - ${err.message}`);
      row.getCell(1).value = "error";
      row.commit();
      await delay(getRandomDelay());
    }
  }

  await browser.close();
  await GL.stop();
};

export default scrapeData;
