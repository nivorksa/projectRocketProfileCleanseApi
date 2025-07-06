import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const getRandomDelay = () => Math.floor(Math.random() * 4000) + 3000;

const scrapeData = async (
  worksheet,
  companyColumnIndex,
  urlColumnIndex,
  goLoginCredentials,
  onLog = () => {},
  stopFlag = { stopped: false, filePath: "" }
) => {
  const { token, profileId } = goLoginCredentials;

  const GL = new GoLogin({ token, profile_id: profileId });
  const { status, wsUrl } = await GL.start();

  if (status !== "success") throw new Error("GoLogin profile failed to start");

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
  const page = await browser.newPage();

  // Create or overwrite Note header in col 1
  const headerRow = worksheet.getRow(1);
  headerRow.getCell(1).value = "Note";
  headerRow.commit();

  for (let i = 2; i <= worksheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog(`Scraping stopped at row ${i}`);
      break;
    }

    const row = worksheet.getRow(i);

    try {
      const companyFromExcel = row
        .getCell(companyColumnIndex)
        .text.trim()
        .toLowerCase();
      const profileUrl = row.getCell(urlColumnIndex).text.trim();

      if (!profileUrl.startsWith("http")) {
        onLog(`Row ${i}: Invalid URL`);
        row.getCell(1).value = "error";
        row.commit();
        // Save after update
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        continue;
      }

      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await delay(5000);

      const isLocked = await page.evaluate(() => {
        const bodyText = document.body.innerText.toLowerCase();
        return (
          bodyText.includes("you can't view this profile") ||
          bodyText.includes("upgrade to unlock profiles") ||
          bodyText.includes("profile unavailable") ||
          bodyText.includes("this profile is not available") ||
          bodyText.includes("you do not have access to this profile") ||
          bodyText.includes("content unavailable")
        );
      });

      if (isLocked) {
        onLog(`Row ${i}: profile appears locked`);
        row.getCell(1).value = "locked";
        row.commit();
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        await delay(getRandomDelay());
        continue;
      }

      // Extract current company
      const scrapedCompany = await page.evaluate(() => {
        const currentRoleSection = document.querySelector(
          '[data-sn-view-name="lead-current-role"]'
        );

        if (!currentRoleSection) return "";

        const companyLink = currentRoleSection.querySelector(
          'a[data-anonymize="company-name"]'
        );
        return companyLink?.innerText?.trim()?.toLowerCase() || "";
      });

      if (!scrapedCompany) {
        onLog(`Row ${i}: no company info found on profile`);
        row.getCell(1).value = "no company info";
        row.commit();
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        await delay(getRandomDelay());
        continue;
      }

      if (scrapedCompany.includes(companyFromExcel)) {
        row.getCell(1).value = "good";
        onLog(
          `Row ${i}: Match -> Excel: "${companyFromExcel}", SalesNav: "${scrapedCompany}"`
        );
      } else {
        row.getCell(1).value = "bad";
        onLog(
          `Row ${i}: Mismatch -> Excel: "${companyFromExcel}", SalesNav: "${scrapedCompany}"`
        );
      }

      row.commit();
      await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);

      await delay(getRandomDelay());
    } catch (err) {
      onLog(`Row ${i}: error - ${err.message}`);
      row.getCell(1).value = "error";
      row.commit();
      await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
      await delay(getRandomDelay());
    }
  }

  await browser.close();
  await GL.stop();
};

export default scrapeData;
