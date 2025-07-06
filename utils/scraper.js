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

  // Insert new "Note" column at position 1 (this shifts all columns and data to the right automatically)
  worksheet.spliceColumns(1, 0, ["Note"]);

  // Commit header row change
  worksheet.getRow(1).commit();

  for (let i = 2; i <= worksheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog(`Scraping stopped at row ${i}`);
      break;
    }

    const row = worksheet.getRow(i);

    try {
      const companyFromExcel = row
        .getCell(companyColumnIndex + 1)
        .text.trim()
        .toLowerCase();
      const profileUrl = row.getCell(urlColumnIndex + 1).text.trim();

      if (!profileUrl.startsWith("http")) {
        onLog(`Row ${i}: Invalid URL`);
        row.getCell(1).value = "error";
        row.commit();
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        continue;
      }

      await page.goto(profileUrl, {
        waitUntil: "domcontentloaded",
        timeout: 60000,
      });

      await delay(5000);

      // Improved locked profile detection
      const isLocked = await page.evaluate(() => {
        const nameHeader = document.querySelector(
          'h1[data-anonymize="person-name"]'
        );
        const isNameLinkedInMember =
          nameHeader?.innerText.trim() === "LinkedIn Member";

        const unlockButton = Array.from(
          document.querySelectorAll("button")
        ).find(
          (btn) => btn.innerText.trim().toLowerCase() === "unlock full profile"
        );

        return isNameLinkedInMember || !!unlockButton;
      });

      if (isLocked) {
        onLog(`Row ${i}: profile appears locked`);
        // Leave note column empty for locked profiles
        row.getCell(1).value = "";
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

      // Exact string comparison for company names
      if (scrapedCompany === companyFromExcel) {
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
