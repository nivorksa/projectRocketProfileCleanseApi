import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";
import fetch from "node-fetch";

const API_BASE = "https://api.gologin.com";

// Clean up leftover clones for a given profile
const cleanupLeftoverClones = async (token, originalProfileId) => {
  const url = `${API_BASE}/browser/list`;
  const response = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    console.warn(`Failed to fetch profiles: ${response.status}`);
    return;
  }

  const data = await response.json();
  for (const profile of data) {
    if (profile.parentId === originalProfileId) {
      try {
        await fetch(`${API_BASE}/browser/v2/${profile.id}`, {
          method: "DELETE",
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });
        console.log(`Deleted leftover clone ${profile.id}`);
      } catch (err) {
        console.warn(`Failed to delete clone ${profile.id}: ${err.message}`);
      }
    }
  }
};

// Clone a profile for a new session
const cloneProfile = async (token, originalProfileId) => {
  const url = `${API_BASE}/browser/clone_multi`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ browsersIds: [originalProfileId] }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Clone failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const cloneId = data[0]?.id;
  if (!cloneId) {
    throw new Error(`Clone response missing id: ${JSON.stringify(data)}`);
  }
  return cloneId;
};

// Delete a clone after session ends
const deleteProfile = async (token, profileId) => {
  const url = `${API_BASE}/browser/v2/${profileId}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    console.warn(`Failed to delete profile ${profileId}: ${response.status}`);
  }
};

// Launch GoLogin browser safely with cleanup
const launchGoLoginBrowser = async ({
  token,
  profileId: originalProfileId,
}) => {
  await cleanupLeftoverClones(token, originalProfileId);

  const cloneId = await cloneProfile(token, originalProfileId);

  const GL = new GoLogin({ token, profile_id: cloneId });

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
      if (!wsUrl || !wsUrl.wsUrl) throw new Error("No wsUrl returned");
      break;
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

  const origClose = browser.close.bind(browser);
  browser.close = async () => {
    try {
      await origClose();
    } catch (err) {
      console.log("Error closing browser:", err);
    }
    await deleteProfile(token, cloneId);
    console.log(`Deleted cloned profile ${cloneId}`);
  };

  return browser;
};

export default launchGoLoginBrowser;
