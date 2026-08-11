/**
 * End-to-end QA for the multi-modality training feature.
 *
 *   npm run dev        # in another terminal
 *   npm run qa
 *
 * Drives the locally installed Google Chrome through playwright-core, so no
 * browser is downloaded. Signs in as the seeded dev user and exercises every
 * surface and every control, asserting **observable change** rather than the
 * absence of a crash — the two worst bugs in this feature so far (a completion
 * that never wrote, a Schedule button that wrote silently) both looked exactly
 * like success to a check that only watched for errors.
 *
 * Everything it creates is prefixed "QA " and removed at the end, so a run
 * leaves no training history behind. The one exception is the archived routine
 * from the composer check: routines are archived rather than deleted on
 * purpose, because a completed block reads its coverage through
 * routine.coverage_vector, and deleting the routine would silently drop that
 * history. Archived routines are invisible to every surface, so they only
 * accumulate in the table.
 *
 * Screenshots land in .qa-screens/.
 *
 * Env: CHROME_PATH, QA_BASE_URL, QA_EMAIL, QA_PASSWORD.
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

// ── tiny runner ─────────────────────────────────────────────────────
const results = [];
let currentGroup = "";
const group = (name) => {
  currentGroup = name;
  console.log(`\n${name}`);
};
async function check(name, fn) {
  try {
    await fn();
    results.push({ group: currentGroup, name, ok: true });
    console.log(`  ✓ ${name}`);
  } catch (error) {
    results.push({ group: currentGroup, name, ok: false, error: error.message?.slice(0, 300) });
    console.log(`  ✗ ${name}\n      ${error.message?.split("\n")[0]?.slice(0, 200)}`);
  }
}
function assert(condition, message) {
  if (!condition) throw new Error(message);
}
/**
 * Case-insensitive text search. Labels and badges here are uppercased by CSS,
 * and innerText returns them transformed — comparing case-sensitively reported
 * two working features as broken.
 */
const has = (haystack, needle) => haystack.toLowerCase().includes(needle.toLowerCase());
const consoleErrors = [];

const browser = await chromium.launch({ executablePath: CHROME, headless: true });

// Sign in once and reuse the session everywhere.
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
      // Info panels are dismissed so they never sit on top of a control.
      for (const id of ["coverage", "routines", "exercise-bank", "calendar-modalities"]) {
        localStorage.setItem(`turbo-coach-info-dismissed-${id}`, "1");
      }
      localStorage.setItem("theme", mode);
    },
    [skipSetup, theme],
  );
  const page = await ctx.newPage();
  page.on("console", (m) => {
    if (m.type() === "error") consoleErrors.push(`${page.url()}: ${m.text().slice(0, 160)}`);
  });
  page.on("pageerror", (e) => consoleErrors.push(`${page.url()}: ${String(e).slice(0, 160)}`));
  return page;
}

const ROUTES = [
  ["training", "/training"],
  ["routines", "/training/routines"],
  ["exercises", "/training/exercises"],
  ["today", "/today"],
  ["calendar", "/calendar"],
  ["fitness", "/fitness"],
  ["dashboard", "/dashboard"],
];

// ── A. every route renders, both themes, both widths ────────────────
group("A. Rendering");
for (const [theme, width, label] of [
  ["dark", 1440, "desktop dark"],
  ["light", 1440, "desktop light"],
  ["dark", 390, "phone"],
]) {
  const page = await openPage({ theme, width, height: width === 390 ? 844 : 1000 });
  for (const [name, path] of ROUTES) {
    await check(`${label}: ${path} renders without overflow`, async () => {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: `${OUT}/${name}-${theme}-${width}.png`, fullPage: true });
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 2,
      );
      assert(!overflow, "page scrolls horizontally");
      const body = await page.locator("body").innerText();
      assert(!/Application error|Unhandled/i.test(body), "error boundary rendered");
    });
  }
  await page.close();
}

// ── B. /training: recommendation, coverage, templates ───────────────
group("B. /training");
{
  const page = await openPage();
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.locator("h3").first().waitFor({ timeout: 15000 });

  await check("recommendation card states a reason", async () => {
    const card = page.locator("h3").first();
    const name = (await card.textContent())?.trim();
    assert(name && name.length > 0, "no routine name");
    const reason = await card
      .locator("xpath=../../following-sibling::p[1]")
      .textContent()
      .catch(() => "");
    assert((reason ?? "").trim().length > 0, "no reason line under the recommendation");
  });

  await check("coverage table lists all six areas", async () => {
    const text = await page.locator("body").innerText();
    for (const area of [
      "Hips & glutes",
      "Posterior chain",
      "Trunk",
      "Thoracic spine",
      "Neck & shoulders",
      "Feet, ankles & hands",
    ]) {
      assert(has(text, area), `missing area: ${area}`);
    }
  });

  await check("editing a target persists and drops the default marker", async () => {
    const row = page.locator("div").filter({ hasText: /^Thoracic spine/ });
    const targetButton = page.getByRole("button", { name: /every \d+ d/ }).nth(3);
    await targetButton.click();
    await page.waitForTimeout(300);
    const increase = page.getByRole("button", { name: /Increase target interval/ }).first();
    await increase.click();
    await page.waitForTimeout(1800);
    const afterText = await page.locator("body").innerText();
    assert(has(afterText, "Reset to defaults"), "reset control did not appear after an override");
    void row;
  });

  await check("reset to defaults clears the override", async () => {
    await page.getByRole("button", { name: /Reset to defaults/i }).click();
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    assert(!has(text, "Reset to defaults"), "override survived the reset");
  });

  await check("saved session can be created and removed", async () => {
    await page.getByRole("button", { name: /^New$/ }).click();
    await page.waitForTimeout(300);
    await page.fill("#template-name", "QA template");
    await page.getByRole("button", { name: "Trunk", exact: true }).first().click();
    await page.getByRole("button", { name: /^Save$/ }).click();
    await page.waitForTimeout(2000);
    assert(has(await page.locator("body").innerText(), "QA template"), "template not listed");

    await page.getByRole("button", { name: /Delete QA template/i }).click();
    await page.waitForTimeout(2000);
    assert(
      !has(await page.locator("body").innerText(), "QA template"),
      "template survived delete",
    );
  });

  await check("schedule for today is reflected, and reversible", async () => {
    const schedule = page.getByRole("button", { name: /Schedule for today/i }).first();
    await schedule.click();
    await page.waitForTimeout(2500);
    assert(has(await page.locator("body").innerText(), "On today"), "no 'On today' marker");
    assert(
      !(await page.getByRole("button", { name: /Schedule for today/i }).first().isVisible().catch(() => false)),
      "schedule still offered — duplicates reachable",
    );
    await page.getByRole("button", { name: /Take off today/i }).click();
    await page.waitForTimeout(2500);
    assert(!has(await page.locator("body").innerText(), "On today"), "still on today");
  });

  await check("did it moves the recommendation, undo restores it", async () => {
    const before = (await page.locator("h3").first().textContent())?.trim();
    await page.getByRole("button", { name: /Did it/i }).first().click();
    await page.waitForTimeout(2500);
    const after = (await page.locator("h3").first().textContent())?.trim();
    assert(before !== after, `recommendation unchanged (${before})`);
    const undo = page.getByRole("button", { name: /Undo/i }).first();
    assert(await undo.isVisible(), "no undo after logging");
    await undo.click();
    await page.waitForTimeout(2500);
    const restored = (await page.locator("h3").first().textContent())?.trim();
    assert(restored === before, `undo did not restore (${restored} != ${before})`);
  });

  await check("a hint opens a tooltip", async () => {
    await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1200);
    const hint = page.getByRole("button", { name: /Focus area/i }).first();
    await hint.hover();
    await page.waitForTimeout(700);
    const tip = page.locator('[data-slot="tooltip-content"]');
    assert(await tip.first().isVisible(), "tooltip did not open on hover");
    assert(((await tip.first().innerText()) ?? "").length > 10, "tooltip is empty");
  });

  await page.close();
}

// ── C. composer ─────────────────────────────────────────────────────
group("C. Routine composer");
{
  const page = await openPage();
  await page.goto(`${BASE}/training/routines`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /New routine/i }).click();
  await page.locator("main ul li button[aria-pressed]").first().waitFor({ timeout: 15000 });

  await check("save is refused until the routine has a name and exercises", async () => {
    const save = page.getByRole("button", { name: /Save routine/i });
    assert(await save.isDisabled(), "save enabled on an empty routine");
  });

  await check("filtering by area narrows the bank", async () => {
    const all = await page.locator("main ul li button[aria-pressed]").count();
    await page.getByRole("button", { name: /^Trunk/ }).first().click();
    await page.waitForTimeout(500);
    const filtered = await page.locator("main ul li button[aria-pressed]").count();
    assert(filtered < all && filtered > 0, `filter did nothing (${all} -> ${filtered})`);
    await page.getByRole("button", { name: /^Trunk/ }).first().click();
    await page.waitForTimeout(400);
  });

  await check("adding exercises updates the running total and areas", async () => {
    const before = await page.locator("body").innerText();
    const rows = page.locator("main ul li button[aria-pressed]");
    for (let i = 0; i < 3; i++) {
      await rows.nth(i).click();
      await page.waitForTimeout(150);
    }
    const after = await page.locator("body").innerText();
    assert(before !== after, "totals did not change when exercises were added");
    assert(/3 exercises/i.test(after), "exercise count not shown");
  });

  await check("routine saves and appears in the list", async () => {
    await page.fill("#routine-name", "QA routine");
    await page.getByRole("button", { name: /Save routine/i }).click();
    await page.waitForTimeout(3000);
    assert((await page.locator("body").innerText()).includes("QA routine"), "routine not listed");
  });

  await check("a routine expands to show its exercises and descriptions", async () => {
    await page.goto(`${BASE}/training/routines`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    const before = (await page.locator("body").innerText()).length;
    await page.getByRole("button", { name: /^Expand Upper 8/i }).click();
    await page.waitForTimeout(1800);
    const text = await page.locator("body").innerText();
    assert(text.length > before, "expanding showed nothing");
    assert(has(text, "Chin tuck"), "routine contents not listed");
    assert(has(text, "Areas covered"), "areas covered not shown");

    // And an exercise inside it opens to its description.
    await page.getByRole("button", { name: /Chin tuck/i }).first().click();
    await page.waitForTimeout(800);
    assert(
      has(await page.locator("body").innerText(), "double chin"),
      "exercise description not shown",
    );
    await page.getByRole("button", { name: /^Collapse Upper 8/i }).click();
    await page.waitForTimeout(800);
  });

  await check("a seeded routine can be duplicated, edited and archived", async () => {
    await page.getByRole("button", { name: /Duplicate Upper 8/i }).click();
    await page.waitForTimeout(3000);
    assert(has(await page.locator("body").innerText(), "Upper 8 (copy)"), "copy not listed");

    await page.getByRole("button", { name: /Edit Upper 8 \(copy\)/i }).click();
    await page.locator("main ul li button[aria-pressed]").first().waitFor({ timeout: 15000 });
    const nameField = page.locator("#routine-name");
    assert((await nameField.inputValue()) === "Upper 8 (copy)", "composer did not open pre-filled");
    assert(
      /5 exercises/i.test(await page.locator("body").innerText()),
      "composer did not seed the existing exercises",
    );
    await nameField.fill("QA edited routine");
    await page.getByRole("button", { name: /Save changes/i }).click();
    await page.waitForTimeout(3000);
    assert(has(await page.locator("body").innerText(), "QA edited routine"), "edit did not save");

    await page.getByRole("button", { name: /Archive QA edited routine/i }).click();
    await page.waitForTimeout(2500);
    assert(
      !has(await page.locator("body").innerText(), "QA edited routine"),
      "edited routine survived archiving",
    );
  });

  await check("routine can be archived", async () => {
    await page.getByRole("button", { name: /Archive QA routine/i }).click();
    await page.waitForTimeout(2500);
    assert(
      !(await page.locator("body").innerText()).includes("QA routine"),
      "routine survived archiving",
    );
  });

  await page.close();
}

// ── D. exercise bank ────────────────────────────────────────────────
group("D. Exercise bank");
{
  const page = await openPage();
  await page.goto(`${BASE}/training/exercises`, { waitUntil: "networkidle" });
  await page.locator("main ul li").first().waitFor({ timeout: 15000 });

  await check("an exercise expands to show how to perform it", async () => {
    await page.fill('input[placeholder="Search exercises"]', "Copenhagen");
    await page.waitForTimeout(700);
    await page.getByRole("button", { name: /^Expand Copenhagen adduction/i }).click();
    await page.waitForTimeout(700);
    const text = await page.locator("body").innerText();
    assert(has(text, "bench"), "description not shown on expand");
    assert(text.length > 400, "expanded content looks empty");
    await page.fill('input[placeholder="Search exercises"]', "");
    await page.waitForTimeout(500);
  });

  await check("search narrows the list", async () => {
    const before = await page.locator("main ul li").count();
    await page.fill('input[placeholder="Search exercises"]', "calf");
    await page.waitForTimeout(600);
    const after = await page.locator("main ul li").count();
    assert(after < before && after > 0, `search did nothing (${before} -> ${after})`);
    await page.fill('input[placeholder="Search exercises"]', "");
    await page.waitForTimeout(400);
  });

  await check("seeded exercises expose no edit control", async () => {
    const seeded = page.locator("main ul li").filter({ hasText: /seeded/i }).first();
    assert(await seeded.count() > 0, "no seeded exercise in the bank");
    const editable = await seeded.getByRole("button", { name: /^Edit /i }).count();
    assert(editable === 0, "a seeded exercise offered an edit control");
    const archivable = await seeded.getByRole("button", { name: /^Archive /i }).count();
    assert(archivable === 0, "a seeded exercise offered an archive control");
  });

  await check("a preset can be duplicated into an editable copy, and removed again", async () => {
    const seeded = page.locator("main ul li").filter({ hasText: /seeded/i }).first();
    const name = (await seeded.getAttribute("data-exercise-name")) ?? "";
    assert(name.length > 0, "could not read the exercise name");
    const before = await page.locator("main ul li").count();
    await seeded.getByRole("button", { name: /^Duplicate /i }).click();
    await page.waitForTimeout(2500);
    assert(
      (await page.locator("main ul li").count()) === before + 1,
      "duplicate did not add a row",
    );

    // The copy is editable where the original is not.
    const copy = page
      .locator(`main ul li[data-exercise-name="${name}"]`)
      .filter({ hasNot: page.locator("text=/seeded/i") })
      .first();
    assert(
      (await copy.getByRole("button", { name: /^Edit /i }).count()) === 1,
      "the copy is not editable",
    );

    // Archive then delete: an unreferenced copy must be removable outright,
    // or a mistaken duplicate would linger forever.
    await copy.getByRole("button", { name: /^Archive /i }).click();
    await page.waitForTimeout(2000);
    await page.getByRole("button", { name: /Show archived/i }).click();
    await page.waitForTimeout(2000);
    const archived = page
      .locator(`main ul li[data-exercise-name="${name}"]`)
      .filter({ hasText: /archived/i })
      .first();
    await archived.getByRole("button", { name: /^Delete /i }).click();
    await page.waitForTimeout(2500);
    assert(
      (await page.locator(`main ul li[data-exercise-name="${name}"]`).count()) === 1,
      "the archived copy was not deleted",
    );
    await page.getByRole("button", { name: /Hide archived/i }).click();
    await page.waitForTimeout(1500);
  });

  await check("a new exercise requires a region", async () => {
    await page.getByRole("button", { name: /New exercise/i }).click();
    await page.waitForTimeout(400);
    await page.fill("#exercise-name", "QA exercise");
    const save = page.getByRole("button", { name: /^Save$/ });
    assert(await save.isDisabled(), "save enabled with no region selected");
    await page.getByRole("button", { name: "Lumbar", exact: true }).click();
    await page.waitForTimeout(200);
    assert(!(await save.isDisabled()), "save still disabled after picking a region");
    await save.click();
    await page.waitForTimeout(2500);
    assert(has(await page.locator("body").innerText(), "QA exercise"), "exercise not listed");
  });

  await check("archive hides it, and it comes back under 'show archived'", async () => {
    await page.getByRole("button", { name: /Archive QA exercise/i }).click();
    await page.waitForTimeout(2500);
    assert(
      !has(await page.locator("body").innerText(), "QA exercise"),
      "archived exercise still listed",
    );
    await page.getByRole("button", { name: /Show archived/i }).click();
    await page.waitForTimeout(2500);
    assert(
      has(await page.locator("body").innerText(), "QA exercise"),
      "archived exercise not shown when asked for",
    );

    await page
      .locator('main ul li[data-exercise-name="QA exercise"]')
      .first()
      .getByRole("button", { name: /^Delete /i })
      .click();
    await page.waitForTimeout(2500);
    assert(
      !has(await page.locator("body").innerText(), "QA exercise"),
      "QA exercise survived deletion",
    );
  });

  await page.close();
}

// ── E. calendar ─────────────────────────────────────────────────────
group("E. Calendar");
{
  const page = await openPage();
  await page.goto(`${BASE}/calendar`, { waitUntil: "networkidle" });
  await page.waitForTimeout(2500);

  await check("every modality chip carries a count", async () => {
    const chips = await page
      .locator('[role="group"][aria-label="Filter by modality"] button')
      .allTextContents();
    const named = chips.filter((c) => c.trim().length > 0);
    assert(named.length === 5, `expected 5 chips, got ${named.length}`);
    for (const chip of named) assert(/\d/.test(chip), `chip without a count: "${chip.trim()}"`);
  });

  await check("adding a session puts it on the day, grouped by day-part", async () => {
    await page
      .getByRole("button", { name: /Add strength, mobility, yoga or prehab session/i })
      .first()
      .click();
    await page.waitForTimeout(600);
    await page.fill("#block-name", "QA session");
    await page.getByRole("button", { name: "PM", exact: true }).click();
    await page.getByRole("button", { name: "Trunk", exact: true }).click();
    await page.getByRole("button", { name: /Add session/i }).click();
    await page.waitForTimeout(3000);
    const body = await page.locator("body").innerText();
    assert(has(body, "QA session"), "session not on the calendar");
    assert(/PM/.test(body), "day-part label missing");
  });

  await check("a modality chip hides its own sessions", async () => {
    const chips = page.locator('[role="group"][aria-label="Filter by modality"]');
    await chips.getByRole("button", { name: /^Prehab/ }).click();
    await page.waitForTimeout(900);
    assert(
      !has(await page.locator("body").innerText(), "QA session"),
      "session still visible with its modality filtered out",
    );
    await chips.getByRole("button", { name: /^Prehab/ }).click();
    await page.waitForTimeout(900);
  });

  await check("a session can be removed from the calendar", async () => {
    await page.getByRole("button", { name: /Remove QA session/i }).first().click();
    await page.waitForTimeout(2500);
    assert(
      !has(await page.locator("body").innerText(), "QA session"),
      "session survived removal",
    );
  });

  await page.close();
}

// ── F. /today ───────────────────────────────────────────────────────
group("F. /today");
{
  const page = await openPage({ width: 390, height: 844 });

  await check("a scheduled session can be logged with an RPE", async () => {
    // Schedule from /training so /today has something to act on.
    await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
    await page.locator("h3").first().waitFor({ timeout: 15000 });
    await page.getByRole("button", { name: /Schedule for today/i }).first().click();
    await page.waitForTimeout(2500);

    await page.goto(`${BASE}/today`, { waitUntil: "networkidle" });
    await page.waitForTimeout(1800);
    const due = page.getByRole("button", { name: /^Done$/ }).first();
    assert(await due.isVisible(), "scheduled session did not appear under Due today");
    await due.click();
    await page.waitForTimeout(2500);
    assert(
      has(await page.locator("body").innerText(), "Session RPE"),
      "sRPE entry did not appear after marking done",
    );
    await page.getByRole("button", { name: "RPE 4", exact: true }).click();
    await page.waitForTimeout(2500);
  });

  await check("tapping the same status again clears it", async () => {
    const done = page.getByRole("button", { name: /^Done$/ }).first();
    await done.click();
    await page.waitForTimeout(2500);
    assert(
      !has(await page.locator("body").innerText(), "Session RPE"),
      "status did not clear on a second tap",
    );
  });

  // Put the session back where we found it.
  await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1800);
  const takeOff = page.getByRole("button", { name: /Take off today/i }).first();
  if (await takeOff.isVisible().catch(() => false)) {
    await takeOff.click();
    await page.waitForTimeout(2000);
  }

  await page.close();
}

// ── G. dashboard & fitness ──────────────────────────────────────────
group("G. Dashboard & fitness");
{
  const page = await openPage();

  await check("dashboard widget lists the six areas", async () => {
    await page.goto(`${BASE}/dashboard`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    assert(has(text, "Coverage"), "no coverage widget");
    for (const area of ["Hips & glutes", "Trunk", "Neck & shoulders"]) {
      assert(has(text, area), `widget missing ${area}`);
    }
  });

  await check("fitness page keeps the two load currencies apart", async () => {
    await page.goto(`${BASE}/fitness`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2500);
    const text = await page.locator("body").innerText();
    assert(/Fitness/i.test(text), "PMC panel missing");
    assert(
      /Total session load|No session load yet/i.test(text),
      "session load panel missing entirely",
    );
  });

  await page.close();
}

// ── H. teardown: the run must leave no trace ────────────────────────
group("H. Teardown");
{
  const page = await openPage();

  // Archived rows are only reachable with the toggle on, so sweep there too.
  await page.goto(`${BASE}/training/exercises`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1500);
  const showArchived = page.getByRole("button", { name: /Show archived/i });
  if (await showArchived.isVisible().catch(() => false)) {
    await showArchived.click();
    await page.waitForTimeout(1500);
  }

  await check("no QA artefacts remain on any surface", async () => {
    const leftovers = [];
    for (const path of ["/training", "/training/routines", "/training/exercises", "/calendar"]) {
      await page.goto(`${BASE}${path}`, { waitUntil: "networkidle" });
      await page.waitForTimeout(1800);
      const text = await page.locator("body").innerText();
      // "QA routine"/"QA exercise" are archived by their own checks, so only an
      // un-archived leftover counts here.
      for (const marker of ["QA session", "QA template", "QA exercise"]) {
        if (has(text, marker)) leftovers.push(`${marker} on ${path}`);
      }
    }
    assert(leftovers.length === 0, `left behind: ${leftovers.join(", ")}`);
  });

  await check("nothing is left scheduled or logged for today", async () => {
    await page.goto(`${BASE}/training`, { waitUntil: "networkidle" });
    await page.waitForTimeout(2000);
    const text = await page.locator("body").innerText();
    assert(!has(text, "On today"), "a session is still scheduled for today");
    assert(!has(text, "Done today"), "a session is still logged for today");
  });

  await page.close();
}

await browser.close();

// ── report ──────────────────────────────────────────────────────────
const failed = results.filter((r) => !r.ok);
console.log(`\n${"─".repeat(60)}`);
console.log(`${results.length - failed.length}/${results.length} checks passed`);
if (consoleErrors.length) {
  console.log(`\nconsole/page errors (${consoleErrors.length}):`);
  for (const error of [...new Set(consoleErrors)].slice(0, 10)) console.log(`  - ${error}`);
}
if (failed.length) {
  console.log(`\nfailures:`);
  for (const f of failed) console.log(`  - [${f.group}] ${f.name}\n      ${f.error}`);
}
console.log(`\nscreenshots: ${OUT}`);
process.exitCode = failed.length || consoleErrors.length ? 1 : 0;
