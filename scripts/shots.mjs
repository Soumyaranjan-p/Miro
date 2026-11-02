/**
 * Dev-only screenshot harness for design review.
 *
 * Captures the settings window at its real size (1000 x 700) and the overlay at
 * the real overlay window size (380 x 132), in both colour schemes, so the
 * interface can be judged as pixels instead of as source.
 *
 * Usage: node scripts/shots.mjs <outDir> [--pages=home,statistics] [--scheme=light]
 *
 * Playwright lives in the StageShow install (dev tooling, never shipped); it is
 * resolved from there rather than added to the app's dependencies.
 */
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const require = createRequire(join(root, ".agents", "skills", "stageshow", "package.json"));
const { chromium } = require("playwright-core");

const outDir = resolve(process.argv[2] ?? join(root, ".verify", "shots"));
const flag = (name, fallback) => {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const BASE = "http://127.0.0.1:1420";
const PAGES = flag("pages", "home,statistics,shortcuts,settings").split(",");
const SCHEMES = flag("scheme", "light,dark").split(",");
const ONLY_OVERLAY = process.argv.includes("--overlay-only");

mkdirSync(outDir, { recursive: true });

async function launch() {
  for (const channel of ["msedge", "chrome"]) {
    try {
      return await chromium.launch({ channel });
    } catch {
      // try the next installed browser
    }
  }
  throw new Error("no Edge or Chrome found for playwright-core");
}

const browser = await launch();

for (const scheme of SCHEMES) {
  const context = await browser.newContext({
    viewport: { width: 1000, height: 700 },
    deviceScaleFactor: 1,
    colorScheme: scheme,
  });
  const page = await context.newPage();

  if (!ONLY_OVERLAY) {
    for (const name of PAGES) {
      await page.goto(`${BASE}/?page=${name}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(700);
      await page.screenshot({ path: join(outDir, `${name}-${scheme}.png`) });
    }
  }

  await context.close();

  const overlay = await browser.newContext({
    viewport: { width: 380, height: 132 },
    deviceScaleFactor: 2,
    colorScheme: scheme,
  });
  const opage = await overlay.newPage();
  for (const state of ["recording", "live", "processing", "inserted", "error"]) {
    await opage.goto(`${BASE}/overlay.html?state=${state}`, { waitUntil: "networkidle" });
    await opage.waitForTimeout(900);
    await opage.screenshot({
      path: join(outDir, `overlay-${state}-${scheme}.png`),
      omitBackground: true,
    });
  }
  await overlay.close();
}

await browser.close();
console.log(`shots written to ${outDir}`);
