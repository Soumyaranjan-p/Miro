import puppeteer from "puppeteer-core";
const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: true,
  args: ["--no-sandbox","--hide-scrollbars","--use-gl=angle","--enable-unsafe-swiftshader","--enable-webgl","--ignore-gpu-blocklist"],
});
const page = await browser.newPage();
const errs = [];
page.on("pageerror", e => errs.push("pageerror: " + e.message));
page.on("console", m => { if (m.type() === "error") errs.push("console: " + m.text()); });
await page.setViewport({ width: 1600, height: 1000, deviceScaleFactor: 1 });
await page.goto("http://127.0.0.1:3100/", { waitUntil: "networkidle0", timeout: 180000 });
const el = await page.waitForSelector('section[aria-label="Procedural koi pond"] canvas', { timeout: 60000 });
await el.scrollIntoView();
await new Promise(r => setTimeout(r, 5000));
const box = await el.boundingBox();
console.log("canvas box:", JSON.stringify(box));
const info = await page.evaluate(() => {
  const c = document.querySelector('section[aria-label="Procedural koi pond"] canvas');
  const gl = c.getContext("webgl2") || c.getContext("webgl");
  return { w: c.width, h: c.height, hasGL: !!gl, renderer: gl ? gl.getParameter(gl.VERSION) : null };
});
console.log("canvas:", JSON.stringify(info));
await el.screenshot({ path: "render/koi-three.png" });
console.log("errors:", errs.length ? errs.slice(0,6) : "none");
await browser.close();
