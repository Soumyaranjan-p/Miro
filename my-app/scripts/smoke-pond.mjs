import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({ executablePath: CHROME, headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1500, height: 1000 });
await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle0" });
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
await page.waitForSelector('section[aria-label="Interactive koi pond"]');
// exercise both interactions
const el = await page.$('section[aria-label="Interactive koi pond"] canvas');
const box = await el.boundingBox();
await page.mouse.click(box.x + box.width * 0.5, box.y + box.height * 0.5);
await new Promise(r=>setTimeout(r,800));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const s = btns.find(b => b.textContent.trim() === "Scatter");
  s && s.click();
});
await new Promise(r=>setTimeout(r,800));
await page.evaluate(() => {
  const btns = [...document.querySelectorAll("button")];
  const f = btns.find(b => b.textContent.trim() === "Feed the fish");
  f && f.click();
});
await new Promise(r=>setTimeout(r,1200));
console.log("interactions OK; page errors:", errs.length ? errs : "none");
await browser.close();
