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

  // Build a header map to quickly find column indexes by header name
  const headerMap = {};
  headerRow.values.forEach((val, idx) => {
    if (typeof val === "string") {
      headerMap[val.trim().toLowerCase()] = idx;
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
        return (
          text.includes("this profile is not available") ||
          text.includes("you do not have access to this profile") ||
          text.includes("content unavailable")
        );
      });

      if (isLocked) {
        onLog(`Row ${i}: locked`);
        row.getCell(1).value = "locked";
        row.commit();
        await delay(getRandomDelay());
        continue;
      }

      const scrapedData = await page.evaluate(() => {
        const name =
          document.querySelector(".text-heading-xlarge")?.innerText.trim() ||
          "";
        const title =
          document
            .querySelector(".text-body-medium.break-words")
            ?.innerText.trim() || "";

        // Get the PRESENT company
        const experienceSection = document.querySelector(
          "#experience ~ .pvs-list"
        );
        const firstExperience = experienceSection?.querySelector("li");

        let company = "";
        if (firstExperience) {
          const companyElement = firstExperience.querySelector(".mr1 span");
          if (companyElement) {
            company = companyElement.innerText.trim();
          }
        }

        return { name, title, company };
      });

      let matched = true;

      for (const colName of columnsToVerify) {
        const colNameLower = colName.trim().toLowerCase();
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
