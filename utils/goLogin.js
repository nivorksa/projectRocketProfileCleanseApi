import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";
import { execSync } from "child_process";

// -------------------------------------
// Kill local zombie processes
// -------------------------------------
const killAllGoLoginProcesses = () => {
  try {
    if (process.platform === "win32") {
      execSync("taskkill /F /IM chrome.exe /T", { stdio: "ignore" });
      execSync("taskkill /F /IM orbita.exe /T", { stdio: "ignore" });
      execSync("taskkill /F /IM gologin.exe /T", { stdio: "ignore" });
    } else {
      execSync("pkill -f chrome", { stdio: "ignore" });
      execSync("pkill -f orbita", { stdio: "ignore" });
      execSync("pkill -f gologin", { stdio: "ignore" });
    }
  } catch {}
};

// -------------------------------------
// Force-stop remote session (GoLogin API)
// -------------------------------------
const forceStopProfile = async (token, profileId) => {
  try {
    await fetch(`https://api.gologin.com/browser/${profileId}/stop`, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {}
};

// -------------------------------------
// Main launcher with auto-cleanup
// -------------------------------------
const launchGoLoginBrowser = async ({ token, profileId }) => {
  // Clean BEFORE first attempt
  killAllGoLoginProcesses();
  await forceStopProfile(token, profileId);

  const GL = new GoLogin({
    token,
    profile_id: profileId,
  });

  const maxRetries = 2;
  let wsUrl;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      wsUrl = await GL.start({
        timeout: 120000,
        show: true,
        windowSize: { width: 1920, height: 1080 },
        headless: false,
      });

      if (!wsUrl?.wsUrl) throw new Error("No wsUrl returned");

      break; // success
    } catch (err) {
      console.log(`GoLogin start failed (Attempt ${attempt})`);

      if (attempt === maxRetries) throw err;

      // Clean BEFORE retry
      killAllGoLoginProcesses();
      await forceStopProfile(token, profileId);

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
