import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise((r) => setTimeout(r, ms));
const getRandomDelay = () => Math.floor(Math.random() * 4000) + 3000;

const scrapeData = async (
  worksheet,
  {
    fullNameColumnIndex,
    jobTitleColumnIndex,
    companyColumnIndex,
    urlColumnIndex,
  },
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

  worksheet.spliceColumns(1, 0, ["Note"]);
  worksheet.getRow(1).commit();

  for (let i = 2; i <= worksheet.rowCount; i++) {
    if (stopFlag.stopped) {
      onLog({ message: `Scraping stopped at row ${i}` });
      break;
    }

    const row = worksheet.getRow(i);

    try {
      const profileUrl = row.getCell(urlColumnIndex + 1).text.trim();

      const fullNameFromExcel = row
        .getCell(fullNameColumnIndex + 1)
        .text.trim()
        .toLowerCase();
      const jobTitleFromExcel = row
        .getCell(jobTitleColumnIndex + 1)
        .text.trim()
        .toLowerCase();
      const companyFromExcel = row
        .getCell(companyColumnIndex + 1)
        .text.trim()
        .toLowerCase();

      if (!profileUrl.startsWith("http")) {
        onLog({ message: `Row ${i}: Invalid URL` });
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

      const isLocked = await page.evaluate(() => {
        const nameHeader = document.querySelector(
          'h1[data-anonymize="person-name"]'
        );
        const unlockButton = Array.from(
          document.querySelectorAll("button")
        ).find(
          (btn) => btn.innerText.trim().toLowerCase() === "unlock full profile"
        );
        return (
          nameHeader?.innerText.trim() === "LinkedIn Member" || !!unlockButton
        );
      });

      if (isLocked) {
        onLog({ message: `Row ${i}: Locked profile` });
        row.getCell(1).value = "locked";
        row.commit();
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        await delay(getRandomDelay());
        continue;
      }

      const profileData = await page.evaluate(() => {
        const fullNameEl = document.querySelector(
          'h1[data-anonymize="person-name"]'
        );
        const jobTitleEl = document.querySelector(
          'span[data-anonymize="job-title"]'
        );
        const companyEl = document.querySelector(
          '[data-sn-view-name="lead-current-role"] a[data-anonymize="company-name"]'
        );
        return {
          fullName: fullNameEl?.innerText?.trim()?.toLowerCase() || "",
          jobTitle: jobTitleEl?.innerText?.trim()?.toLowerCase() || "",
          company: companyEl?.innerText?.trim()?.toLowerCase() || "",
        };
      });

      const matches = {
        fullName: profileData.fullName === fullNameFromExcel,
        jobTitle: profileData.jobTitle === jobTitleFromExcel,
        company: profileData.company === companyFromExcel,
      };

      if (matches.fullName && matches.jobTitle && matches.company) {
        row.getCell(1).value = "good";
        onLog({
          message: `Row ${i}: Match | Excel: [${fullNameFromExcel}, ${jobTitleFromExcel}, ${companyFromExcel}] | SalesNav: [${profileData.fullName}, ${profileData.jobTitle}, ${profileData.company}]`,
        });
      } else {
        row.getCell(1).value = "bad";
        onLog({
          message: `Row ${i}: Mismatch | Excel: [${fullNameFromExcel}, ${jobTitleFromExcel}, ${companyFromExcel}] | SalesNav: [${profileData.fullName}, ${profileData.jobTitle}, ${profileData.company}]`,
        });
      }

      row.commit();
      await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
      await delay(getRandomDelay());
    } catch (err) {
      onLog({ message: `Row ${i}: Error - ${err.message}` });
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
