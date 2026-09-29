/** Screenshot just the pond canvas (light + dark). */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.POND_URL ?? "http://127.0.0.1:3100/";
mkdirSync("render", { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars", "--force-device-scale-factor=1"],
});
const page = await browser.newPage();
// Wide viewport so the pond uses its 16:8 landscape aspect.
await page.setViewport({ width: 1500, height: 1000, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle0", timeout: 120000 });
await page.waitForSelector('section[aria-label="Interactive koi pond"]', { timeout: 30000 });

const shoot = async (name, dark) => {
  await page.evaluate((d) => {
    document.documentElement.classList.toggle("dark", d);
  }, dark);
  const el = await page.$('section[aria-label="Interactive koi pond"] canvas');
  await el.scrollIntoView();
  await new Promise((r) => setTimeout(r, 3200)); // let fish glide a while
  await el.screenshot({ path: `render/${name}.png` });
  const box = await el.boundingBox();
  console.log("saved", name, Math.round(box.width) + "x" + Math.round(box.height));
};

await shoot("pond-dark", true);
await shoot("pond-light", false);
await browser.close();
