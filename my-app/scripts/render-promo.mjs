/**
 * Mirro promo capture harness.
 *
 * Records the /promo stage (real Mirro components, real interactions) to MP4
 * via Chrome's CDP screen-recording API (puppeteer-core `page.record`).
 * Interactions are dispatched as authentic pointer events, synced to the
 * page's own scene clock (`window.__promo.getT()`).
 */
import puppeteer from "puppeteer-core";
import { mkdirSync } from "node:fs";

const CHROME = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const URL = process.env.PROMO_URL ?? "http://127.0.0.1:3100/promo";
const OUT = "render/promo-raw.mp4";

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
console.log("stage ready");

// Begin the scene clock, let the first frames warm up, then start recording
// so there is no dead pre-roll in the take.
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

const t0 = Date.now();

/** Wait until the page's scene clock reaches `t` seconds. */
const until = (t) =>
  page.waitForFunction((x) => window.__promo.getT() >= x, { timeout: 60000 }, t);

/** Center of an element, queried lazily (scenes mount on demand). */
const center = async (sel) => {
  const el = await page.waitForSelector(sel, { timeout: 15000 });
  const box = await el.boundingBox();
  if (!box) throw new Error(`no box for ${sel}`);
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
};

const clickAt = async (t, sel) => {
  await until(t);
  const { x, y } = await center(sel);
  await page.mouse.move(x, y, { steps: 6 });
  await page.mouse.click(x, y);
  console.log(`t=${t}s click ${sel}`);
};

/** Sweep the pointer across an element (for tilt/spotlight). */
const sweep = async (t, sel, { from = { x: 0.15, y: 0.3 }, to = { x: 0.85, y: 0.7 }, steps = 26 } = {}) => {
  await until(t);
  const el = await page.waitForSelector(sel, { timeout: 15000 });
  const box = await el.boundingBox();
  const ax = box.x + box.width * from.x;
  const ay = box.y + box.height * from.y;
  const bx = box.x + box.width * to.x;
  const by = box.y + box.height * to.y;
  await page.mouse.move(ax, ay, { steps: 4 });
  for (let i = 1; i <= steps; i++) {
    const u = i / steps;
    // eased sweep for organic motion
    const e = u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
    await page.mouse.move(ax + (bx - ax) * e, ay + (by - ay) * e, { steps: 1 });
    await new Promise((r) => setTimeout(r, 16));
  }
  console.log(`t=${t}s sweep ${sel}`);
};

try {
  // Scene 3 — icon ballet (5.0–7.5)
  await clickAt(5.15, '[data-promo="heart"] [role="button"]');
  await clickAt(6.05, '[data-promo="menu"] [role="button"]');
  await clickAt(6.65, '[data-promo="sunmoon"] [role="button"]');
  await clickAt(7.25, '[data-promo="bell"] [role="button"]');

  // Scene 4 — tabs + switch (7.5–11.0)
  await until(8.3);
  await page.evaluate(() => {
    const tabs = document.querySelectorAll('[data-promo="tabs"] [role="tab"]');
    for (const tab of tabs) if (tab.textContent.trim() === "Components") tab.click();
  });
  console.log("t=8.3 tab -> Components");
  await clickAt(9.6, '[data-promo="switch"] [role="switch"]');

  // Scene 5 — living surfaces (11.0–14.0). Spotlight goes last: its sweep
  // may overrun the scene boundary, and a fading glow across the cut is fine.
  await sweep(11.2, '[data-promo="tilt"] > div', { from: { x: 0.2, y: 0.25 }, to: { x: 0.8, y: 0.75 }, steps: 18 });
  await clickAt(12.5, '[data-promo="flip"] > div');
  await sweep(12.95, '[data-promo="spotlight"]', { from: { x: 0.1, y: 0.2 }, to: { x: 0.9, y: 0.8 }, steps: 16 });

  // Scenes 6–7 play out ambient; ride to a clean end.
  await until(19.9);
} catch (err) {
  console.error("harness warning:", err.message);
  // Keep rolling to the end so the take is still usable.
  await until(19.9).catch(() => {});
} finally {
  console.log("stopping recorder");
  await recorder.stop();
  await browser.close();
}

console.log("saved", OUT);
