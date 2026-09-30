import puppeteer from "puppeteer-core";

/** Screenshots the hero and reports metadata, for visual + numeric checking. */
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const W = Number(process.env.SHOT_W ?? 1600);
const H = Number(process.env.SHOT_H ?? 1100);
const OUT = process.env.SHOT_OUT ?? "render/hero-wide.png";
const THEME = process.env.SHOT_THEME ?? "light";
const URL = process.env.SHOT_URL ?? "http://127.0.0.1:3000/";

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  args: ["--no-sandbox", "--hide-scrollbars"],
});
const page = await browser.newPage();
await page.evaluateOnNewDocument((t) => {
  try {
    window.localStorage.setItem("mirro-theme", t);
  } catch {}
}, THEME);
const errs = [];
page.on("pageerror", (e) => errs.push("pageerror: " + e.message));
page.on("console", (m) => {
  if (m.type() === "error" && !m.text().includes("WebSocket") && !m.text().includes("403"))
    errs.push("console: " + m.text());
});
await page.setViewport({ width: W, height: H, deviceScaleFactor: 1 });
await page.goto(URL, { waitUntil: "networkidle0", timeout: 180000 });
await new Promise((r) => setTimeout(r, 3500));

await page.screenshot({ path: OUT });
console.log("errors:", errs.length ? errs.slice(0, 6) : "none");
console.log("wrote", OUT, W, "x", H);
await browser.close();
