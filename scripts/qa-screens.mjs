/**
 * Screenshot and smoke-check the training surfaces in a real browser.
 *
 *   npm run dev            # in another terminal
 *   node scripts/qa-screens.mjs
 *
 * Drives the locally installed Google Chrome through playwright-core, so
 * nothing is downloaded. Signs in as the seeded local dev user, walks the
 * screens, and reports console errors, uncaught exceptions and horizontal
 * overflow — the three failures that are invisible to typecheck and tests.
 *
 * Screenshots land in .qa-screens/ (gitignored). Look at them: this catches
 * layout problems, not just crashes.
 */

import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";
import { resolve } from "node:path";

const CHROME =
  process.env.CHROME_PATH ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const BASE = process.env.QA_BASE_URL ?? "http://localhost:3000";
const EMAIL = process.env.QA_EMAIL ?? "test@example.com";
const PASSWORD = process.env.QA_PASSWORD ?? "password123";
const OUT = resolve(process.cwd(), ".qa-screens");

mkdirSync(OUT, { recursive: true });

const problems = [];
const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// Sign in once, then reuse the session for every context.
const bootCtx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const boot = await bootCtx.newPage();
await boot.goto(`${BASE}/auth/login`, { waitUntil: "networkidle" });
await boot.fill("#email", EMAIL);
await boot.fill("#password", PASSWORD);
await boot.click('button[type="submit"]');
await boot.waitForURL((url) => !url.pathname.startsWith("/auth"), { timeout: 20000 });
const storageState = await bootCtx.storageState();
await bootCtx.close();

async function openPage({ width = 1440, height = 1000, theme = "dark", skipSetup = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width, height }, storageState });
  await ctx.addInitScript(
    ([done, mode]) => {
      if (done) localStorage.setItem("turbo-coach-training-setup-done", "1");
      localStorage.setItem("theme", mode);
    },
    [skipSetup, theme],
  );
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") problems.push(`console: ${m.text().slice(0, 180)}`);
  });
  page.on("pageerror", (e) => problems.push(`pageerror: ${String(e).slice(0, 180)}`));
  return page;
}

async function capture(page, name, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  const overflows = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
  );
  if (overflows) problems.push(`${path}: horizontal overflow`);
  console.log(`  ${path}${overflows ? "   [H-OVERFLOW]" : ""}`);
}

console.log("desktop, dark:");
{
  const page = await openPage();
  for (const [name, path] of [
    ["training", "/training"],
    ["routines", "/training/routines"],
    ["exercises", "/training/exercises"],
    ["today", "/today"],
    ["calendar", "/calendar"],
    ["fitness", "/fitness"],
    ["dashboard", "/dashboard"],
  ]) {
    await capture(page, name, path);
  }
  await page.close();
}

console.log("desktop, light:");
{
  const page = await openPage({ theme: "light" });
  for (const [name, path] of [
    ["training-light", "/training"],
    ["exercises-light", "/training/exercises"],
  ]) {
    await capture(page, name, path);
  }
  await page.close();
}

console.log("phone:");
{
  const page = await openPage({ width: 390, height: 844 });
  await capture(page, "today-mobile", "/today");
  await capture(page, "training-mobile", "/training");
  await page.close();
}

console.log("first-run setup:");
{
  const page = await openPage({ skipSetup: false });
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^Next/ }).waitFor({ timeout: 15000 });
  for (let step = 1; step <= 2; step++) {
    await page.screenshot({ path: `${OUT}/setup-step${step}.png`, fullPage: true });
    await page.getByRole("button", { name: /^Next/ }).click();
    await page.waitForTimeout(400);
  }
  await page.screenshot({ path: `${OUT}/setup-step3.png`, fullPage: true });
  console.log("  3 steps rendered");
  await page.close();
}

// Round trip: log a routine, confirm the recommendation moves and Undo restores
// it. Cleans up after itself so running QA leaves no training history behind.
console.log("did-it round trip:");
{
  const page = await openPage();
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.locator("h3").first().waitFor({ timeout: 15000 });
  const before = (await page.locator("h3").first().textContent())?.trim();
  await page.getByRole("button", { name: /Did it/i }).first().click();
  await page.waitForTimeout(2500);
  const after = (await page.locator("h3").first().textContent())?.trim();
  console.log(`  recommendation: "${before}" -> "${after}"`);
  if (before === after) problems.push("logging a routine did not change the recommendation");

  const undo = page.getByRole("button", { name: /Undo/i }).first();
  if (!(await undo.isVisible().catch(() => false))) {
    problems.push("no Undo shown after logging a routine");
  } else {
    await undo.click();
    await page.waitForTimeout(2500);
    const restored = (await page.locator("h3").first().textContent())?.trim();
    console.log(`  after undo: "${restored}"`);
    if (restored !== before) problems.push(`undo did not restore the recommendation (${restored})`);
  }
  await page.close();
}

await browser.close();

console.log(`\nscreenshots: ${OUT}`);
if (problems.length) {
  console.log("\nproblems:");
  console.log([...new Set(problems)].map((p) => `  - ${p}`).join("\n"));
  process.exitCode = 1;
} else {
  console.log("\nno console errors, no overflow, round trip clean");
}
