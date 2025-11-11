import express from "express";
import https from "https";
import { createProxyMiddleware } from "http-proxy-middleware";
import fs from "fs";

const app = express();

// SSL certs from Let's Encrypt
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/api.nivorksa.xyz/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/api.nivorksa.xyz/fullchain.pem"),
};

// Proxy all requests to backend on 8800
app.use(
  "/",
  createProxyMiddleware({
    target: "http://localhost:8800",
    changeOrigin: true,
    ws: true,
  })
);

// Bind explicitly to all IPv4 addresses
https.createServer(options, app).listen(443, "0.0.0.0", () => {
  console.log("HTTPS proxy running on port 443 → localhost:8800");
});
