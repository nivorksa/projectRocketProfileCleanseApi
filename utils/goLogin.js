import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

const launchGoLoginBrowser = async ({ token, profileId }) => {
  const GL = new GoLogin({
    token,
    profile_id: profileId,
    disableFontDownloading: true,
  });

  // Wrap the start in a retry with extended timeout
  const maxRetries = 2;
  let wsUrl;
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      wsUrl = await GL.start({
        timeout: 120000, // 2 minutes
        // Force visible, full-screen mode
        show: true,
        windowSize: { width: 1920, height: 1080 },
        // You can also try disabling headless explicitly
        headless: false,
        extraArgs: [
          "--no-sandbox",
          "--disable-setuid-sandbox",
          "--disable-gpu",
          "--disable-dev-shm-usage",
          "--font-masking-mode=3",
        ],
      });

      if (!wsUrl || !wsUrl.wsUrl) throw new Error("No wsUrl returned");
      break; // success
    } catch (err) {
      if (attempt === maxRetries) throw err;
      console.log(`GoLogin start failed, retrying (${attempt})...`);
      await new Promise((res) => setTimeout(res, 5000));
    }
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.wsUrl,
    defaultViewport: null,
  });

  return browser;
};

export default launchGoLoginBrowser;
