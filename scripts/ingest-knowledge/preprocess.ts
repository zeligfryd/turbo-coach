/**
 * Preprocess cycling books from OCR text into clean markdown for RAG ingestion.
 *
 * Usage:
 *   npx tsx scripts/ingest-knowledge/preprocess.ts
 *
 * Outputs:
 *   data/books/training-bible.md   — merged OCR + grey-box tables
 *   data/books/power-meter.md      — cleaned OCR text
 */

import { readFile, writeFile, mkdir } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, "../..");

// ─── Shared Helpers ──────────────────────────────────────────────────────────

/** Collapse 3+ consecutive blank lines to 2. */
const normalizeWhitespace = (text: string): string =>
  text.replace(/\n{4,}/g, "\n\n\n").trim();

/**
 * Returns true if a line is clearly OCR garbage (fragment, symbol, known artifact).
 * Blank lines and markdown elements are never garbage.
 */
function isGarbageLine(t: string): boolean {
  if (t === "" || t === "---") return false;
  if (t.startsWith("#")) return false;
  // Proper markdown table rows: pipe followed by space (not garbled pipe junk)
  if (/^\| /.test(t)) return false;

  // 1–3 character lines: always fragments
  if (t.length <= 3) return true;

  // Known multi-char OCR artifact strings
  if (/^(LI\]?|Li\]?|LJ|LU|rT|iT|oo|ny|ems|cut|wee|eee|ghrp)$/.test(t)) return true;
  // Book title running header (catches apostrophe variants and truncated lines)
  if (/^THE CYCLIST.{1,5}TRAINING BIBL(E)?$/i.test(t)) return true;

  // Lines starting with 2+ symbols (chart axes, garbled pipes like "==:", etc.)
  if (/^[=~>]{2,}/.test(t)) return true;

  // Garbled pipe content: starts with | but is NOT a proper markdown table row
  if (/^\|[^\s]/.test(t)) return true;

  // Lines containing || — double-pipe is always OCR table grid noise
  if (/\|\|/.test(t)) return true;

  // Lines starting with 2+ identical vowels (like "eee =", "ee ee", etc.)
  if (/^([aeiou])\1/i.test(t) && t.length < 15) return true;

  // Lines with no alphabetic characters under 30 chars (pure numbers/symbols)
  if (!/[a-zA-Z]/.test(t) && t.length < 30) return true;

  // ALL CAPS short phrases (≤4 real words, ≤30 chars) are chart axis labels /
  // table column headers — not legitimate prose. All real section headings are
  // converted to Title Case by the line-by-line processor.
  // Include | in the char set to also catch "WORKOUT | OFF", "OPTIONS BY CODE |"
  if (
    t.length <= 30 &&
    /^[A-Z]/.test(t) &&
    /^[A-Z\s\d&:()'|,.]+$/.test(t) &&
    realWordCount(t) <= 4
  ) return true;

  return false;
}

/** Count "real" words — those with ≥3 letters (excludes lone symbols and 1-2 letter fragments). */
function realWordCount(t: string): number {
  return t.split(/\s+/).filter((w) => /[a-zA-Z]{3,}/.test(w)).length;
}

/**
 * Two-pass garbage removal for the Training Bible markdown output:
 *
 * 1. Figure-zone filter: after an OCR figure/table/sidebar heading (no colon =
 *    no descriptive title from the boxes file), skip all content until real prose
 *    resumes (≥5 real words). This strips garbled chart axes, data-point symbols,
 *    table grid noise, etc. while preserving exercise descriptions and prose that
 *    immediately follows a figure.
 *
 * 2. Global garbage filter: strip clearly identifiable artifact lines anywhere in
 *    the text (catches interleaved labels, axis values, OCR fragments outside zones).
 */
function stripGarbledContent(markdown: string): string {
  const lines = markdown.split("\n");
  const result: string[] = [];

  // OCR-detected heading: `### Figure 4.1` (no colon → no descriptive title)
  const OCR_HEAD_RE = /^### (Figure|Table|Sidebar)\s+[\d.]+[A-Z]?$/;
  // Boxes-file heading: `### Figure 7.1: The Training Year...` (has colon)
  const BOXES_HEAD_RE = /^### (Figure|Table|Sidebar)\s+[\d.]+[A-Z]?:/;

  let inFigureZone = false;
  let captionConsumed = false;
  let zoneLineCount = 0;
  let currentFigureHead = ""; // track current OCR figure heading for repeat detection

  for (const line of lines) {
    const t = line.trim();

    // ── Heading detection ──────────────────────────────────────────────
    if (OCR_HEAD_RE.test(t)) {
      if (inFigureZone && t === currentFigureHead) {
        // Same figure heading repeated → it's a running page header, stay in zone
        continue;
      }
      // New figure zone
      inFigureZone = true;
      captionConsumed = false;
      zoneLineCount = 0;
      currentFigureHead = t;
      result.push(line);
      continue;
    }

    if (BOXES_HEAD_RE.test(t) || /^#{1,6}\s/.test(t)) {
      inFigureZone = false;
      currentFigureHead = "";
      result.push(line);
      continue;
    }

    // ── Inside figure zone ─────────────────────────────────────────────
    if (inFigureZone) {
      zoneLineCount++;

      // Safety valve: after 60 lines, stop filtering (prevents over-stripping)
      if (zoneLineCount > 60) {
        inFigureZone = false;
        if (!isGarbageLine(t)) result.push(line);
        continue;
      }

      if (t === "") continue; // skip blanks inside zone

      if (isGarbageLine(t)) continue; // skip definitive garbage

      // Allow the first clean non-blank line as a figure caption
      if (!captionConsumed) {
        captionConsumed = true;
        result.push(line);
        // If the caption itself has ≥5 real words, it's also prose → exit zone
        if (realWordCount(t) >= 5) inFigureZone = false;
        continue;
      }

      // Exit zone when real prose resumes (≥5 real words, ≥20 chars)
      if (realWordCount(t) >= 5 && t.length >= 20) {
        inFigureZone = false;
        result.push(line);
        continue;
      }

      // Everything else in the zone (garbled chart content, short labels) — skip
      continue;
    }

    // ── Outside figure zone: global garbage filter ─────────────────────
    if (isGarbageLine(t)) continue;

    result.push(line);
  }

  return result.join("\n");
}

// ─── Training Bible ──────────────────────────────────────────────────────────

/**
 * The OCR text has running page headers: every page repeats the chapter title
 * in ALL CAPS (e.g., "SMART TRAINING" on every page of Chapter 2). We use
 * the FIRST occurrence of each new header to detect chapter boundaries,
 * then strip all subsequent occurrences.
 */
const BIBLE_CHAPTER_HEADERS: Record<string, { chapter: number; title: string }> = {
  "THE COMMITTED CYCLIST": { chapter: 1, title: "The Committed Cyclist" },
  "SMART TRAINING": { chapter: 2, title: "Smart Training" },
  "THE SCIENCE OF TRAINING": { chapter: 3, title: "The Science of Training" },
  "INTENSITY": { chapter: 4, title: "Intensity" },
  "TESTING": { chapter: 5, title: "Testing" },
  "RACING ABILITIES": { chapter: 6, title: "Racing Abilities" },
  "TRAINING ABILITIES": { chapter: 6, title: "Racing Abilities" },
  "PLANNING TO RACE": { chapter: 7, title: "Planning to Race" },
  "THE TRAINING YEAR": { chapter: 8, title: "The Training Year" },
  "PLANNING WORKOUTS": { chapter: 9, title: "Planning Workouts" },
  "STAGE RACE TRAINING": { chapter: 10, title: "Stage Race Training" },
  "CASE STUDIES": { chapter: 11, title: "Case Studies" },
  "STRENGTH": { chapter: 12, title: "Strength" },
  "STRETCHING": { chapter: 13, title: "Stretching" },
  "UNIQUE NEEDS": { chapter: 14, title: "Unique Needs" },
  "USING A TRAINING DIARY": { chapter: 15, title: "Using a Training Diary" },
  "FUEL": { chapter: 16, title: "Fuel" },
  "PROBLEMS": { chapter: 17, title: "Problems" },
  "RECOVERY": { chapter: 18, title: "Recovery" },
};

// Build a set of all header strings for fast lookup
const ALL_CHAPTER_HEADERS = new Set(Object.keys(BIBLE_CHAPTER_HEADERS));

const BIBLE_GLOBAL_HEADER = /^THE CYCLIST.{1,5}TRAINING BIBL(E)?$/i;
const BIBLE_FRONT_MATTER_RE = /^(FOREWORD|ACKNOWLEDGMENTS|PROLOGUE|INTRODUCTION)$/;
const BIBLE_PART_RE = /^PART\s+([IVX0-9|l]+)\s*$/;
const BIBLE_SIDEBAR_RE = /^Sidebar\s+(\d+\.\d+)/;
const BIBLE_FIGURE_TABLE_RE = /^(Figure|Table)\s+(\d+\.\d+[A-Z]?)/;
const BIBLE_APPENDIX_START_RE = /^APPENDIX/;
const BIBLE_CHAPTER_IN_TOC_RE = /^Chapter\s+\d+\s*:/;

const cleanRoman = (raw: string): string => {
  const map: Record<string, string> = {
    "|": "I", "l": "I", "Il": "II", "Ill": "III", "lll": "III",
    "IV": "IV", "V": "V",
  };
  return map[raw] ?? raw.toUpperCase();
};

/** Find the first real content line (after copyright, TOC, etc.) — the Foreword. */
const findContentStart = (lines: string[]): number => {
  for (let i = 0; i < lines.length; i++) {
    if (BIBLE_FRONT_MATTER_RE.test(lines[i].trim())) return i;
  }
  return 0;
};

/** Find where the Glossary/Index starts (stop processing there). */
const findBackMatterStart = (lines: string[]): number => {
  for (let i = lines.length - 1; i > 0; i--) {
    if (/^GLOSSARY$/i.test(lines[i].trim())) return i;
    if (/^INDEX$/i.test(lines[i].trim()) && i > lines.length - 3000) return i;
  }
  return lines.length;
};

async function preprocessTrainingBible(): Promise<string> {
  const ocrPath = resolve(ROOT, "the-cyclists-training-bible.txt");
  const boxesPath = resolve(ROOT, "training-bible-boxes.md");

  const ocrText = await readFile(ocrPath, "utf-8");
  const boxesText = await readFile(boxesPath, "utf-8");

  // ── Parse boxes file by chapter / appendix number ──────────────────────
  const boxesByKey = new Map<string, string>();

  const boxesSections = boxesText.split(/^(?=## )/m);
  for (const section of boxesSections) {
    const firstLine = section.split("\n")[0];
    const chMatch = firstLine.match(/^## Chapter\s+(\d+)/);
    const appMatch = firstLine.match(/^## Appendix\s+([A-Z])/);
    const partMatch = firstLine.match(/^## Part\s+(\w+)/i);

    let key: string | null = null;
    if (chMatch) key = `ch${chMatch[1]}`;
    else if (appMatch) key = `app${appMatch[1]}`;
    else if (partMatch) key = `part_${partMatch[1].toLowerCase()}`;

    if (key) {
      const existing = boxesByKey.get(key) ?? "";
      const content = section.replace(/^## [^\n]+\n+/, "").trim();
      boxesByKey.set(key, existing ? `${existing}\n\n---\n\n${content}` : content);
    }
  }

  // ── Process OCR text ───────────────────────────────────────────────────
  const lines = ocrText.split("\n");
  const contentStart = findContentStart(lines);
  const backMatterStart = findBackMatterStart(lines);
  const output: string[] = [];
  output.push("# The Cyclist's Training Bible — Joe Friel (3rd Edition)\n");

  let currentChapterKey = "";
  let emittedChapters = new Set<number>();
  let lastChapterNum = 0; // enforce sequential ordering
  let lastFrontMatter = ""; // deduplicate front matter headings
  let emittedFrontMatter = new Set<string>(); // track all emitted front matter
  let inAppendix = false;
  let emittedAppendices = new Set<string>();
  let emittedEpilogue = false;
  let skipNext = 0;

  for (let i = contentStart; i < backMatterStart; i++) {
    if (skipNext > 0) { skipNext--; continue; }
    const trimmed = lines[i].trim();

    // ── Skip global noise ──────────────────────────────────────────────
    if (BIBLE_GLOBAL_HEADER.test(trimmed)) continue;
    // Skip Part I title fragments ("THE" / "SELF-TRAINED" / "CYCLIST" on their own lines)
    if (/^(SELF-TRAINED|CYCLIST)$/.test(trimmed)) continue;
    // Skip isolated Roman numeral page numbers
    if (/^[IVXivx]{1,5}$/.test(trimmed)) continue;
    // Skip isolated Arabic page numbers (surrounded by blanks)
    if (/^\d{1,3}$/.test(trimmed)) {
      const prevBlank = i > 0 && lines[i - 1].trim() === "";
      const nextBlank = i < lines.length - 1 && lines[i + 1].trim() === "";
      if (prevBlank && nextBlank) continue;
    }
    // Skip TOC lines (dots, "Chapter N:" references in early pages)
    if (/\.{3,}/.test(trimmed) && trimmed.length < 80) continue;
    if (/^_{2,}/.test(trimmed)) continue;
    if (/^CONTENTS$/i.test(trimmed)) continue;
    // Skip "Chapter N:" lines from TOC (they don't contain useful body text)
    if (BIBLE_CHAPTER_IN_TOC_RE.test(trimmed) && !inAppendix) {
      // Only skip if we haven't entered that chapter yet via page headers
      const chNum = parseInt(trimmed.match(/Chapter\s+(\d+)/)?.[1] ?? "0", 10);
      if (!emittedChapters.has(chNum)) continue;
    }

    // ── Front matter headings ──────────────────────────────────────────
    if (BIBLE_FRONT_MATTER_RE.test(trimmed)) {
      // Skip duplicates — OCR doubles them and they reappear as running page headers
      if (trimmed === lastFrontMatter || emittedFrontMatter.has(trimmed)) continue;
      lastFrontMatter = trimmed;
      emittedFrontMatter.add(trimmed);
      flushBoxes(output, currentChapterKey, boxesByKey);
      const title = trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
      output.push(`\n## ${title}\n`);
      currentChapterKey = "";
      // Skip duplicate within next few lines (may have blanks between)
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const t = lines[j].trim();
        if (t === "") continue;
        if (BIBLE_FRONT_MATTER_RE.test(t) && t === trimmed) { skipNext = j - i; }
        break;
      }
      continue;
    }
    lastFrontMatter = ""; // Reset when we see non-front-matter content

    // ── Part headings ──────────────────────────────────────────────────
    const partMatch = BIBLE_PART_RE.exec(trimmed);
    if (partMatch && !ALL_CHAPTER_HEADERS.has(trimmed)) {
      flushBoxes(output, currentChapterKey, boxesByKey);
      const num = cleanRoman(partMatch[1]);
      let partTitle = "";
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        const t = lines[j].trim();
        if (t === "" || BIBLE_GLOBAL_HEADER.test(t) || /^[IVXivx]{1,5}$/.test(t)) continue;
        if (ALL_CHAPTER_HEADERS.has(t)) break;
        partTitle = t.replace(/[©®]/g, "").trim();
        break;
      }
      output.push(`\n# Part ${num}${partTitle ? ": " + partTitle : ""}\n`);

      const partNumMap: Record<string, string> = { "I": "one", "II": "two", "III": "three", "IV": "four", "V": "five" };
      const pk = partNumMap[num];
      if (pk) {
        currentChapterKey = `part_${pk}`;
        flushBoxes(output, currentChapterKey, boxesByKey);
        currentChapterKey = "";
      }

      // Chapter 1 doesn't have its own page header (uses book title),
      // so emit it automatically after Part I
      if (num === "I" && !emittedChapters.has(1)) {
        emittedChapters.add(1);
        lastChapterNum = 1;
        currentChapterKey = "ch1";
        output.push(`\n## Chapter 1: The Committed Cyclist\n`);
      }
      continue;
    }

    // ── Chapter page headers → chapter boundary detection ──────────────
    if (ALL_CHAPTER_HEADERS.has(trimmed)) {
      const info = BIBLE_CHAPTER_HEADERS[trimmed];
      // Only accept a new chapter if it's sequentially valid (prevents
      // content words like "RECOVERY" inside Chapter 9 figures from
      // prematurely triggering Chapter 18)
      if (!emittedChapters.has(info.chapter) && info.chapter > lastChapterNum) {
        // Verify it's the next expected chapter or close to it
        // (allow gaps of at most 2 for chapters that might not have
        // their own page header in the OCR, like Ch 1 / "THE COMMITTED CYCLIST")
        if (info.chapter <= lastChapterNum + 3) {
          flushBoxes(output, currentChapterKey, boxesByKey);
          emittedChapters.add(info.chapter);
          lastChapterNum = info.chapter;
          currentChapterKey = `ch${info.chapter}`;
          output.push(`\n## Chapter ${info.chapter}: ${info.title}\n`);
        }
      }
      // Either way, skip the header line (it's a running page header)
      continue;
    }

    // ── "HISTORICAL PERSPECTIVES" — marks beginning of Part I / Ch 1 ──
    if (trimmed === "HISTORICAL PERSPECTIVES") {
      // Part I title ("THE SELF-TRAINED CYCLIST") is split across multiple
      // lines in the OCR, hard to detect. Use this landmark instead.
      if (!emittedChapters.has(1)) {
        output.push(`\n# Part I: The Self-Trained Cyclist\n`);
        emittedChapters.add(1);
        lastChapterNum = 1;
        currentChapterKey = "ch1";
        output.push(`\n## Chapter 1: The Committed Cyclist\n`);
      }
      output.push(`\n### Historical Perspectives\n`);
      continue;
    }

    // ── Appendix headings ──────────────────────────────────────────────
    if (BIBLE_APPENDIX_START_RE.test(trimmed)) {
      inAppendix = true;

      // Extract letter: "APPENDIX A", "APPENDIXA", "APPENDIX" + letter on next line, "APPENDIX2"
      let letter = "";
      let title = "";
      const inlineMatch = trimmed.match(/APPENDIX\s*([A-D0-9])/);
      if (inlineMatch) {
        letter = inlineMatch[1];
      } else {
        // Look ahead for letter
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          const t = lines[j].trim();
          if (t === "") continue;
          if (/^[A-D0-9]$/.test(t)) {
            letter = t;
            skipNext = j - i;
            break;
          }
          break;
        }
      }

      // Fix common OCR misreads for appendix letters
      if (letter === "6") letter = "B";
      if (letter === "0" || letter === "2") letter = "D";

      // Skip duplicate appendix running headers
      if (letter && emittedAppendices.has(letter)) {
        // Still skip ahead past the letter on next line
        continue;
      }

      if (letter) {
        emittedAppendices.add(letter);
        flushBoxes(output, currentChapterKey, boxesByKey);

        // Look ahead for title
        const searchFrom = i + skipNext + 1;
        for (let j = searchFrom; j < Math.min(searchFrom + 5, lines.length); j++) {
          const t = lines[j].trim();
          if (t === "" || BIBLE_GLOBAL_HEADER.test(t) || /^APPENDIX/.test(t) || /^[A-D]$/.test(t)) continue;
          title = t;
          skipNext = j - i;
          break;
        }
        currentChapterKey = `app${letter}`;
        output.push(`\n## Appendix ${letter}${title ? ": " + title : ""}\n`);
      }
      continue;
    }

    // ── Sidebar headings ───────────────────────────────────────────────
    const sidebarMatch = BIBLE_SIDEBAR_RE.exec(trimmed);
    if (sidebarMatch) {
      output.push(`\n### Sidebar ${sidebarMatch[1]}\n`);
      continue;
    }

    // ── Figure / Table captions ────────────────────────────────────────
    const figMatch = BIBLE_FIGURE_TABLE_RE.exec(trimmed);
    if (figMatch) {
      output.push(`\n### ${figMatch[1]} ${figMatch[2]}\n`);
      continue;
    }

    // ── Epilogue ───────────────────────────────────────────────────────
    if (/^EPILOGUE$/i.test(trimmed)) {
      if (!emittedEpilogue) {
        emittedEpilogue = true;
        flushBoxes(output, currentChapterKey, boxesByKey);
        currentChapterKey = "";
        output.push(`\n## Epilogue\n`);
      }
      continue;
    }

    // ── Regular content line ───────────────────────────────────────────
    output.push(lines[i]);
  }

  // Flush any remaining boxes for the last chapter
  flushBoxes(output, currentChapterKey, boxesByKey);

  // Append any unmatched boxes sections (safety net)
  for (const [key, content] of boxesByKey) {
    if (content) {
      output.push(`\n---\n\n### [Additional: ${key}]\n\n${content}\n`);
      boxesByKey.set(key, "");
    }
  }

  return normalizeWhitespace(stripGarbledContent(output.join("\n")));
}

function flushBoxes(
  output: string[],
  key: string,
  boxesByKey: Map<string, string>
): void {
  if (!key) return;
  const content = boxesByKey.get(key);
  if (content) {
    output.push(`\n---\n\n${content}\n`);
    boxesByKey.set(key, ""); // Mark as consumed
  }
}

// ─── Power Meter Book ────────────────────────────────────────────────────────

const PM_CHAPTERS: Record<number, string> = {
  1: "Why Train with Power?",
  2: "Power Tools",
  3: "Power-Based Training: Where to Begin?",
  4: "Determining Your Strengths and Weaknesses",
  5: "Using Power for Optimal Workouts",
  6: "Interpreting the Data",
  7: "Beyond Average Power",
  8: "Shifting to the Power Duration Model",
  9: "Using Power to Manage Performance",
  10: "Developing a Power-Based Training Plan",
  11: "Tracking Changes in Your Fitness",
  12: "A Powerful Triathlete",
  13: "Racing Faster with a Power Meter",
  14: "Power for Other Disciplines: Cyclocross, Track, Ultra-Endurance",
};

const PM_CHAPTER_TITLE_RE = new RegExp(
  `^(${Object.values(PM_CHAPTERS).map(t => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})$`
);

const PM_SECTION_HEADING_RE = /^[A-Z][A-Z ''\-:,/()]{5,}$/;
const PM_IMAGE_RE = /^\[images?\]$/;
const PM_SMALL_WORDS = new Set(["AND", "OR", "THE", "A", "AN", "IN", "OF", "TO", "FOR", "WITH", "AT", "BY", "ON", "IS"]);

async function preprocessPowerMeter(): Promise<string> {
  const ocrPath = resolve(ROOT, "training_and_racing_with_a_power_meter.txt");
  const ocrText = await readFile(ocrPath, "utf-8");
  const lines = ocrText.split("\n");
  const output: string[] = [];
  output.push("# Training and Racing with a Power Meter — Allen, Coggan & McGregor (3rd Edition)\n");

  // Skip front matter up to Foreword
  let startIdx = 0;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim() === "Foreword") { startIdx = i; break; }
  }

  let inReferences = false;
  let inIndex = false;
  let skipNext = 0;

  for (let i = startIdx; i < lines.length; i++) {
    if (skipNext > 0) { skipNext--; continue; }
    const trimmed = lines[i].trim();

    // ── Skip noise ─────────────────────────────────────────────────────
    if (PM_IMAGE_RE.test(trimmed)) continue;
    if (/^[-──]{10,}$/.test(trimmed)) continue;

    // ── Stop at Index ──────────────────────────────────────────────────
    if (trimmed === "Index" && i > 10000) { inIndex = true; }
    if (inIndex) continue;

    // ── References section ─────────────────────────────────────────────
    if (trimmed === "References" && i > 10000) {
      inReferences = true;
      output.push("\n## References\n");
      continue;
    }
    if (inReferences) {
      if (trimmed.startsWith("Appendix") || trimmed === "Glossary") {
        inReferences = false;
      } else {
        output.push(lines[i]);
        continue;
      }
    }

    // ── Glossary ───────────────────────────────────────────────────────
    if (trimmed === "Glossary" && i > 10000) {
      output.push("\n## Glossary\n");
      // Output the rest until Index
      for (let j = i + 1; j < lines.length; j++) {
        if (lines[j].trim() === "Index") break;
        output.push(lines[j]);
      }
      break;
    }

    // ── Front matter headings ──────────────────────────────────────────
    if (/^(Foreword|Introduction|Acknowledgments|Abbreviations)$/.test(trimmed) && !inReferences) {
      output.push(`\n## ${trimmed}\n`);
      continue;
    }

    // ── Epilogue ───────────────────────────────────────────────────────
    if (/^Epilogue:/.test(trimmed)) {
      output.push(`\n## ${trimmed}\n`);
      continue;
    }

    // ── Appendix ───────────────────────────────────────────────────────
    if (/^Appendix:\s*(.+)/.test(trimmed)) {
      output.push(`\n## ${trimmed}\n`);
      continue;
    }

    // ── Chapter headings (digit on own line → blank → title) ───────────
    if (/^\d{1,2}$/.test(trimmed)) {
      const chNum = parseInt(trimmed, 10);
      if (PM_CHAPTERS[chNum]) {
        let titleIdx = -1;
        for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
          if (lines[j].trim() === "") continue;
          titleIdx = j;
          break;
        }
        if (titleIdx >= 0 && PM_CHAPTER_TITLE_RE.test(lines[titleIdx].trim())) {
          output.push(`\n## Chapter ${chNum}: ${PM_CHAPTERS[chNum]}\n`);
          skipNext = titleIdx - i;
          continue;
        }
      }
    }

    // ── Section headings (ALL CAPS) ────────────────────────────────────
    if (PM_SECTION_HEADING_RE.test(trimmed) && trimmed.length > 8) {
      // Avoid false positives with data containing numbers
      if (/\d/.test(trimmed) && !/LEVEL \d/.test(trimmed)) {
        output.push(lines[i]);
        continue;
      }
      const titleCased = trimmed
        .split(/\s+/)
        .map((w, idx) => {
          if (idx > 0 && PM_SMALL_WORDS.has(w)) return w.toLowerCase();
          return w.charAt(0) + w.slice(1).toLowerCase();
        })
        .join(" ");
      output.push(`\n### ${titleCased}\n`);
      continue;
    }

    // ── Workout level headings ─────────────────────────────────────────
    if (/^LEVEL\s+\d+:/.test(trimmed)) {
      const titleCased = trimmed.charAt(0) + trimmed.slice(1).toLowerCase();
      output.push(`\n### ${titleCased}\n`);
      continue;
    }

    // ── Workout codes (AR-W1, EN-W1, etc.) ─────────────────────────────
    if (/^\s*[A-Z]{2,3}-[WR]\d+/.test(trimmed)) {
      const parts = trimmed.split(/\s{2,}/);
      if (parts.length >= 2) {
        output.push(`\n#### ${parts[0].trim()}: ${parts[1].trim()}\n`);
        if (parts[2]) output.push(`*${parts[2].trim()}*\n`);
        continue;
      }
    }

    // ── Table references ───────────────────────────────────────────────
    if (/^Table\s+\d+\.\d+/.test(trimmed) && trimmed.length < 100) {
      output.push(`\n### ${trimmed}\n`);
      continue;
    }

    // ── Regular content ────────────────────────────────────────────────
    output.push(lines[i]);
  }

  return normalizeWhitespace(output.join("\n"));
}

// ─── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const outDir = resolve(ROOT, "data/books");
  await mkdir(outDir, { recursive: true });

  console.log("Preprocessing The Cyclist's Training Bible...");
  const bible = await preprocessTrainingBible();
  const biblePath = resolve(outDir, "training-bible.md");
  await writeFile(biblePath, bible, "utf-8");
  const bibleSections = bible.split(/^#+\s/m).length - 1;
  console.log(`  → ${biblePath} (${(bible.length / 1024).toFixed(0)} KB, ~${bibleSections} heading sections)`);

  console.log("Preprocessing Training and Racing with a Power Meter...");
  const pm = await preprocessPowerMeter();
  const pmPath = resolve(outDir, "power-meter.md");
  await writeFile(pmPath, pm, "utf-8");
  const pmSections = pm.split(/^#+\s/m).length - 1;
  console.log(`  → ${pmPath} (${(pm.length / 1024).toFixed(0)} KB, ~${pmSections} heading sections)`);

  console.log("\nDone. Review output, then run ingestion:");
  console.log(`  INGEST_SOURCE=${biblePath} INGEST_SOURCE_LABEL="The Cyclist's Training Bible (Friel)" npx tsx scripts/ingest-knowledge/ingest.ts`);
  console.log(`  INGEST_SOURCE=${pmPath} INGEST_SOURCE_LABEL="Training and Racing with a Power Meter (Allen/Coggan)" npx tsx scripts/ingest-knowledge/ingest.ts`);
}

main().catch((err) => {
  console.error("Preprocessing failed:", err);
  process.exit(1);
});
