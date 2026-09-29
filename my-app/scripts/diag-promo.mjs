/**
 * Diagnostic: screenshot the promo stage mid-scene-1 without recording,
 * to isolate page rendering vs CDP recording artifacts.
 */
import puppeteer from "puppeteer-core";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.PROMO_URL ?? "http://127.0.0.1:3100/promo";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForFunction(() => !!window.__promo, { timeout: 30000 });
await page.evaluate(() => window.__promo.start());
await new Promise((r) => setTimeout(r, 1200));
await page.screenshot({ path: "render/diag-scene1.png" });
// also probe the DOM for the disc element and its computed state
const probe = await page.evaluate(() => {
  const svg = document.querySelector('svg[viewBox="0 0 24 24"]');
  const circle = svg?.querySelector("circle");
  if (!circle) return { circle: false };
  const cs = getComputedStyle(circle);
  return {
    circle: true,
    fill: cs.fill,
    opacity: cs.opacity,
    transform: cs.transform,
    r: circle.getAttribute("r"),
    bbox: (() => { const b = circle.getBoundingClientRect(); return { x: b.x, y: b.y, w: b.width, h: b.height }; })(),
  };
});
console.log(JSON.stringify(probe, null, 2));
await browser.close();
