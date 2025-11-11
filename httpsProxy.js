import express from "express";
import https from "https";
import httpProxy from "http-proxy-middleware";
import fs from "fs";

const app = express();

// SSL certs from certbot
const options = {
  key: fs.readFileSync("/etc/letsencrypt/live/api.nivorksa.xyz/privkey.pem"),
  cert: fs.readFileSync("/etc/letsencrypt/live/api.nivorksa.xyz/fullchain.pem"),
};

// Proxy to your local backend (e.g. running on 8800)
app.use(
  "/",
  httpProxy.createProxyMiddleware({
    target: "http://localhost:8800",
    changeOrigin: true,
    ws: true,
  })
);

https.createServer(options, app).listen(443, () => {
  console.log("HTTPS proxy running on port 443 → localhost:8800");
});
