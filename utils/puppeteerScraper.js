const GoLogin = require("gologin");
const puppeteer = require("puppeteer-core");
const fs = require("fs");
const csv = require("csv-parser");
const { Parser } = require("json2csv");
const path = require("path");
const userAgents = require("./userAgents");
const proxies = require("./proxyList");

const GL = new GoLogin({
  token: "YOUR_GOLOGIN_API_TOKEN", // Replace with your GoLogin API token
});

function getRandomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

async function puppeteerScraper(filePath) {
  const records = await new Promise((resolve) => {
    const rows = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on("data", (row) => rows.push(row))
      .on("end", () => resolve(rows));
  });

  // You can either hardcode one profile or rotate multiple GoLogin profiles here
  const goLoginProfileId = "YOUR_GOLOGIN_PROFILE_ID"; // Replace with your GoLogin profile ID

  const { status, wsUrl } = await GL.start(goLoginProfileId);

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl,
  });

  const page = await browser.newPage();

  for (let i = 0; i < records.length; i++) {
    try {
      // Rotate user-agent
      const userAgent = getRandomItem(userAgents);
      await page.setUserAgent(userAgent);

      const { Name, Company, JobTitle, SalesNavURL } = records[i];

      console.log(`Checking profile ${i + 1} of ${records.length}`);

      await page.goto(SalesNavURL, { waitUntil: "networkidle2" });

      // Detect locked profile in Sales Navigator
      const isLocked = await page.evaluate(() => {
        return (
          !!document.querySelector(".locked-content") ||
          document.body.innerText.includes("This profile is unavailable")
        );
      });

      if (isLocked) {
        console.log(`Profile ${i + 1} is locked. Skipping...`);
        records[i].Verification = "Profile Locked - Manual Review Needed";
        continue;
      }

      // Scrape details from Sales Navigator
      const scrapedData = await page.evaluate(() => {
        let name =
          document.querySelector(".profile-topcard-person-entity__name")
            ?.innerText || "";
        let company =
          document.querySelector(".org-top-card-summary__title")?.innerText ||
          "";
        let jobTitle =
          document.querySelector(".profile-topcard-person-entity__headline")
            ?.innerText || "";
        return { name, company, jobTitle };
      });

      const isMatch =
        scrapedData.name.trim().toLowerCase() === Name.trim().toLowerCase() &&
        scrapedData.company
          .trim()
          .toLowerCase()
          .includes(Company.trim().toLowerCase()) &&
        scrapedData.jobTitle
          .trim()
          .toLowerCase()
          .includes(JobTitle.trim().toLowerCase());

      records[i].Verification = isMatch ? "Matched" : "Not Matched";

      const delay = Math.floor(Math.random() * (12000 - 7000 + 1)) + 7000;
      console.log(`Waiting ${delay / 1000}s before next profile...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    } catch (err) {
      console.error(`Error checking profile:`, err);
      records[i].Verification = "Error";
    }
  }

  await browser.close();
  await GL.stop();

  const csvParser = new Parser();
  const updatedCsv = csvParser.parse(records);
  fs.writeFileSync(path.join("./uploads", "updated.csv"), updatedCsv);
}

module.exports = puppeteerScraper;
