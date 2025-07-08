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
    minConnectionCount = 0,
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

      if (!profileUrl.startsWith("http")) {
        onLog({
          message: JSON.stringify({
            row: i,
            status: "Invalid URL",
          }),
        });
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
        const unlockBtn = [...document.querySelectorAll("button")].find(
          (btn) => btn.innerText.trim().toLowerCase() === "unlock full profile"
        );
        return (
          nameHeader?.innerText.trim() === "LinkedIn Member" || !!unlockBtn
        );
      });

      if (isLocked) {
        onLog({
          message: JSON.stringify({
            row: i,
            status: "Locked",
          }),
        });
        row.getCell(1).value = "locked";
        row.commit();
        await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
        await delay(getRandomDelay());
        continue;
      }

      const { fullName, jobTitle, company, connectionCount } =
        await page.evaluate(() => {
          const name =
            document
              .querySelector('h1[data-anonymize="person-name"]')
              ?.innerText?.trim()
              .toLowerCase() || "";
          const title =
            document
              .querySelector('span[data-anonymize="job-title"]')
              ?.innerText?.trim()
              .toLowerCase() || "";
          const comp =
            document
              .querySelector(
                '[data-sn-view-name="lead-current-role"] a[data-anonymize="company-name"]'
              )
              ?.innerText?.trim()
              .toLowerCase() || "";
          const connections =
            [
              ...document.querySelectorAll(
                "div.ZSOyOxRwAUDbEAuwsWIlFlRlCKvaQRQ"
              ),
            ]
              .map((d) => d.innerText.trim())
              .find((txt) => txt.toLowerCase().includes("connections")) || "";
          const connMatch = connections.match(/(\d+)/);
          return {
            fullName: name,
            jobTitle: title,
            company: comp,
            connectionCount: connMatch ? parseInt(connMatch[1], 10) : 0,
          };
        });

      const matches = {
        fullName: fullName === fullNameExcel,
        jobTitle: jobTitle === jobTitleExcel,
        company: company === companyExcel,
        connectionCount: connectionCount >= minConnectionCount,
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
            fullName,
            jobTitle,
            company,
            connectionCount,
          },
        }),
      });

      row.commit();
      await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
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
      await worksheet.workbook.xlsx.writeFile(stopFlag.filePath);
      await delay(getRandomDelay());
    }
  }

  await browser.close();
  await GL.stop();
};

export default scrapeData;
