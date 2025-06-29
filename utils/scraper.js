import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getRandomDelay = () => Math.floor(Math.random() * 4000) + 3000; // 3-7 seconds

const scrapeData = async (
  worksheet,
  columnsToVerify,
  urlColumnIndex,
  goLoginCredentials
) => {
  const { token, profileId } = goLoginCredentials;

  const GL = new GoLogin({ token, profile_id: profileId });
  const { status, wsUrl } = await GL.start();

  if (status !== "success") throw new Error("GoLogin profile failed to start");

  const browser = await puppeteer.connect({ browserWSEndpoint: wsUrl });
  const page = await browser.newPage();

  const headerRow = worksheet.getRow(1);
  headerRow.getCell(1).value = "Verification Result";

  for (let i = 2; i <= worksheet.rowCount; i++) {
    try {
      const row = worksheet.getRow(i);
      const profileUrl = row.getCell(urlColumnIndex).text.trim();

      await page.goto(profileUrl, { waitUntil: "domcontentloaded" });
      await delay(5000);

      const scrapedData = await page.evaluate(() => {
        return {
          name:
            document.querySelector(".text-heading-xlarge")?.innerText.trim() ||
            "",
          company:
            document
              .querySelector(".pv-entity__secondary-title")
              ?.innerText.trim() || "",
          title:
            document
              .querySelector(".text-body-medium.break-words")
              ?.innerText.trim() || "",
        };
      });

      let matched = true;

      for (const colName of columnsToVerify) {
        const headerCellIndex = headerRow.values.findIndex(
          (val) => val === colName
        );

        if (headerCellIndex === -1) {
          console.error(`Column "${colName}" not found in the header.`);
          matched = false; // Consider this a failed match since the column is missing.
          continue;
        }

        const sheetValue = row
          .getCell(headerCellIndex)
          .text.trim()
          .toLowerCase();
        const linkedInValue =
          scrapedData[colName.toLowerCase()]?.trim().toLowerCase() || "";

        if (!linkedInValue.includes(sheetValue)) matched = false;
      }

      row.getCell(1).value = matched ? "good" : "bad";
      row.commit();

      await delay(getRandomDelay());
    } catch (err) {
      console.error(`Error processing row ${i}:`, err);
      row.getCell(1).value = "error";
      row.commit();
    }
  }

  await browser.close();
  await GL.stop();
};

export default scrapeData;
