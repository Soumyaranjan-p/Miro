/**
 * Mirro launch-teaser capture — 8s at 1920x1080/30fps via CDP recording.
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.PROMO_URL ?? "http://127.0.0.1:3100/promo-teaser";
const OUT = "render/teaser-raw.mp4";

mkdirSync("render", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: [
    "--no-sandbox",
    "--hide-scrollbars",
    "--force-device-scale-factor=1",
    "--window-size=1920,1080",
    "--autoplay-policy=no-user-gesture-required",
  ],
});

const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });

console.log("navigating to", URL);
await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForFunction(() => !!window.__promo, { timeout: 30000 });
await page.evaluate(() => window.__promo.start());
await new Promise((r) => setTimeout(r, 150));

const recorder = await page.record({
  path: OUT,
  fps: 30,
  maxWidth: 1920,
  maxHeight: 1080,
  overwrite: true,
});
console.log("recording started");

await page.waitForFunction(
  (x) => window.__promo.getT() >= x,
  { timeout: 60000 },
  8.15
);

await recorder.stop();
await browser.close();
console.log("saved", OUT);
