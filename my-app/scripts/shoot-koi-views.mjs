import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--no-sandbox","--hide-scrollbars","--use-gl=angle","--enable-unsafe-swiftshader","--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle0", timeout: 180000 });
const sel = 'section[aria-label="Procedural koi pond"] canvas';
const canvas = await page.waitForSelector(sel, { timeout: 60000 });
await canvas.scrollIntoView();
await new Promise(r => setTimeout(r, 4500));
await canvas.screenshot({ path: "render/koi-day.png" });
console.log("day captured");
// cursor style check
const cursor = await page.$eval(sel, el => getComputedStyle(el).cursor);
console.log("cursor:", cursor);
// toggle night
const clicked = await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const b = btns.find(x => x.textContent.trim() === "Night view");
  if (!b) return false;
  b.click();
  return true;
});
console.log("night toggle clicked:", clicked);
await new Promise(r => setTimeout(r, 4500));
await canvas.screenshot({ path: "render/koi-night.png" });
console.log("night captured; errors:", errs.length ? errs.slice(0,5) : "none");
await browser.close();
