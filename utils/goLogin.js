import { GoLogin } from "gologin";
import puppeteer from "puppeteer-core";

export const launchGoLoginBrowser = async ({ token, profileId }) => {
  const GL = new GoLogin({
    token,
    profile_id: profileId,
  });

  const wsUrl = await GL.start();

  if (!wsUrl || !wsUrl.wsUrl) {
    throw new Error("Failed to get WebSocket URL from GoLogin.");
  }

  const browser = await puppeteer.connect({
    browserWSEndpoint: wsUrl.wsUrl,
    defaultViewport: null,
  });

  return browser;
};
