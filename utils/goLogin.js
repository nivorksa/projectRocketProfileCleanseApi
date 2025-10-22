import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

const launchGoLoginBrowser = async ({ token, profileId }) => {
  const GL = new GoLogin({
    token,
    profile_id: profileId,
  });

  // Wrap the start in a retry with extended timeout
  const maxRetries = 2;
  let wsUrl;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      wsUrl = await GL.start({
        // Increase timeout here (milliseconds)
        timeout: 120000, // 2 minutes instead of default
      });

      if (!wsUrl || !wsUrl.wsUrl) throw new Error("No wsUrl returned");

      break; // success
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`GoLogin start failed, retrying (${attempt})...`);
      await new Promise((res) => setTimeout(res, 5000)); // wait 5 sec before retry
    }
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.wsUrl,
    defaultViewport: null,
  });

  return browser;
};

export default launchGoLoginBrowser;
