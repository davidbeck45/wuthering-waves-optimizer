// Wuthering Tools+: batch import of in-game echoes from PHONE screenshots of
// the Echo inventory (an echo selected, its detail panel on the right).
// Pure logic — layouts, word-box geometry, value legality, registry matching —
// so it can be unit-tested against recorded OCR output. The Vue side
// (PhoneEchoBatchParser.vue) crops, OCRs and renders; it hands this module the
// block pass's words and a callback that OCRs one row's label or value box.
//
// Geometry first (2026-09-12, after album batch 2's misses): the panel is
// OCR'd once as a block WITH word boxes; words cluster into rows by their
// vertical position; the words on the left are the label, the right-hand
// column the value. Every value is re-read from the raw (un-thresholded)
// pixels of its own row and accepted only when it is a legal roll for that
// label (thresholding turned "8.6%" into "LX)"); a row the block pass dropped
// is synthesized at its expected position (rows are 60 px apart, +46 after a
// wrapped label) and read the same way. Mirrors wuwa-tools/echo-import/
// extract.py, which reads the 198-shot "Wuwa Echos" album 198/198.
import { mainEchoesData, getCostByClass } from "../../echoes/index";
import { statsTable, subStatsTable, echoSetLabelMap, verboseStatLabelMap } from "../../echoes/stats";

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One OCR'd word with its box (panel pixels for the block pass). */
export interface Word {
  x: number;
  y: number;
  width: number;
  height: number;
  conf: number;
  text: string;
}

/** The stat table's geometry inside the panel region (panel-relative pixels). */
export interface TableGeometry {
  /** the block pass is OCR'd at this up-scaling */
  blockScale: number;
  /** centre y of the main-stat row: the table starts at a fixed height */
  firstRowCy: number;
  /** rows are this far apart… */
  pitch: number;
  /** …plus this after a label that wraps onto two lines */
  twoLineExtra: number;
  /** a row counts as "at" its expected position within this */
  tolerance: number;
  /** words closer than this vertically belong to the same row */
  rowGap: number;
  /** column boundaries: label words start here, value words start at valueX, values end by valueRight */
  labelX: number;
  valueX: number;
  valueRight: number;
  /** padding around an observed row's words when re-reading it */
  bandPad: number;
  /** half-height of a synthesized row's band */
  synthHalf: number;
}

export interface PhoneLayout {
  key: string;
  label: string;
  width: number;
  height: number;
  regions: {
    /** the echo's name, top of the detail panel */
    name: Region;
    /** the detail panel: name, +level, COST, then the stat rows (1000 px: taller crops make tesseract drop the last row) */
    panel: Region;
    /** the Sonata-filter chip bottom-left (prints the set name when a set filter is active) */
    chip: Region;
    /** the small set glyph right of "+25" */
    setGlyph: Region;
    /** the echo's portrait in the panel */
    echoImage: Region;
    /** "COST 3" */
    cost: Region;
    /** "+25" */
    level: Region;
  };
  table: TableGeometry;
}

/** Measured on a Samsung Galaxy S26 Ultra (3120×1440 landscape, default UI scale). */
export const PHONE_LAYOUTS: PhoneLayout[] = [
  {
    key: "phone-3120x1440",
    label: "Phone, 3120×1440 landscape (Galaxy S26 Ultra)",
    width: 3120,
    height: 1440,
    regions: {
      name: { x: 2225, y: 160, width: 800, height: 80 },
      panel: { x: 2215, y: 150, width: 905, height: 1000 },
      chip: { x: 340, y: 1185, width: 540, height: 60 },
      setGlyph: { x: 2333, y: 260, width: 52, height: 48 },
      echoImage: { x: 2434, y: 203, width: 530, height: 375 },
      cost: { x: 2235, y: 325, width: 190, height: 60 },
      level: { x: 2215, y: 240, width: 130, height: 80 },
    },
    table: { blockScale: 1.5, firstRowCy: 482, pitch: 60, twoLineExtra: 46, tolerance: 25, rowGap: 24, labelX: 80, valueX: 600, valueRight: 770, bandPad: 8, synthHalf: 30 },
  },
];

export interface ResolvedLayout {
  layout: PhoneLayout;
  scale: number;
  exact: boolean;
  regions: PhoneLayout["regions"];
  table: TableGeometry;
}

/**
 * Picks the layout whose aspect ratio matches the image (within 2.5 %) and
 * scales its regions to the image size. Same-aspect phones at other
 * resolutions get proportionally scaled crops (`exact: false`).
 */
export function resolveLayout(width: number, height: number): ResolvedLayout | null {
  for (const layout of PHONE_LAYOUTS) {
    const want = layout.width / layout.height;
    const have = width / height;
    if (Math.abs(have - want) / want > 0.025) continue;
    const scale = width / layout.width;
    const scaleRegion = (r: Region): Region => ({
      x: Math.round(r.x * scale),
      y: Math.round(r.y * scale),
      width: Math.round(r.width * scale),
      height: Math.round(r.height * scale),
    });
    const t = layout.table;
    return {
      layout,
      scale,
      exact: width === layout.width && height === layout.height,
      regions: {
        name: scaleRegion(layout.regions.name),
        panel: scaleRegion(layout.regions.panel),
        chip: scaleRegion(layout.regions.chip),
        setGlyph: scaleRegion(layout.regions.setGlyph),
        echoImage: scaleRegion(layout.regions.echoImage),
        cost: scaleRegion(layout.regions.cost),
        level: scaleRegion(layout.regions.level),
      },
      table: {
        blockScale: t.blockScale,
        firstRowCy: t.firstRowCy * scale,
        pitch: t.pitch * scale,
        twoLineExtra: t.twoLineExtra * scale,
        tolerance: t.tolerance * scale,
        rowGap: t.rowGap * scale,
        labelX: t.labelX * scale,
        valueX: t.valueX * scale,
        valueRight: t.valueRight * scale,
        bandPad: t.bandPad * scale,
        synthHalf: t.synthHalf * scale,
      },
    };
  }
  return null;
}

// ---------------------------------------------------------------- matching

/** "Crit. Rate" -> "critrate", "Reminiscence: Fleurdelys" -> "reminiscencefleurdelys" */
export function norm(s: string | null | undefined): string {
  return (s ?? "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** difflib-style similarity: 2 × longest-common-subsequence / total length. */
export function similarity(a: string, b: string): number {
  if (!a.length || !b.length) return 0;
  const prev = new Array<number>(b.length + 1).fill(0);
  const cur = new Array<number>(b.length + 1).fill(0);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    for (let j = 0; j <= b.length; j++) prev[j] = cur[j];
  }
  return (2 * prev[b.length]) / (a.length + b.length);
}

interface EchoEntry {
  key: string;
  name: string;
  cost: number;
  sets: string[];
}

let echoIndex: Map<string, EchoEntry> | null = null;
function getEchoIndex(): Map<string, EchoEntry> {
  if (echoIndex) return echoIndex;
  echoIndex = new Map();
  for (const echo of Object.values(mainEchoesData)) {
    const entry: EchoEntry = {
      key: echo.key,
      name: echo.name,
      cost: getCostByClass(echo.class),
      sets: echo.sets ?? [],
    };
    echoIndex.set(norm(echo.name), entry);
    echoIndex.set(norm(echo.key), entry);
  }
  return echoIndex;
}

export function echoEntry(key: string): EchoEntry | null {
  const echo = mainEchoesData[key];
  if (!echo) return null;
  return { key: echo.key, name: echo.name, cost: getCostByClass(echo.class), sets: echo.sets ?? [] };
}

/** Word-prefixes of an OCR'd name strip: the "Phantom:" skin prefix dropped, art junk after the name tolerated. */
export function nameCandidates(text: string): string[] {
  const stripped = text.trim().replace(/^\s*phantom\s*[:;.]?\s*/i, "");
  const head = stripped.split(/[,)(|{}<>/\\[\]]/)[0];
  const words = head.split(/\s+/).filter(Boolean);
  const out: string[] = [];
  for (let k = words.length; k >= 1; k--) out.push(words.slice(0, k).join(" "));
  return out;
}

/** Best registry match over every candidate from every text; the read COST breaks near-ties. */
export function bestEcho(texts: string | string[], cost: number | null = null): { echo: EchoEntry; score: number } | null {
  const index = getEchoIndex();
  const scored = new Map<string, number>();
  for (const text of Array.isArray(texts) ? texts : [texts]) {
    for (const cand of nameCandidates(text ?? "")) {
      const c = norm(cand);
      if (c.length < 3) continue;
      if (index.has(c)) scored.set(c, Math.max(scored.get(c) ?? 0, 1));
      for (const key of index.keys()) {
        const score = similarity(c, key);
        if (score >= 0.55) scored.set(key, Math.max(scored.get(key) ?? 0, score));
      }
    }
  }
  if (!scored.size) return null;
  const ranked = [...scored.entries()].sort((a, b) => b[1] - a[1]);
  const [bestKey, bestScore] = ranked[0];
  if (cost !== null) {
    for (const [key, score] of ranked) {
      if (score >= bestScore - 0.15 && index.get(key)!.cost === cost) return { echo: index.get(key)!, score };
    }
  }
  return { echo: index.get(bestKey)!, score: bestScore };
}

let setIndex: Map<string, string> | null = null;
function getSetIndex(): Map<string, string> {
  if (setIndex) return setIndex;
  setIndex = new Map();
  for (const [key, label] of Object.entries(echoSetLabelMap)) {
    setIndex.set(norm(label), key);
    setIndex.set(norm(key), key);
  }
  return setIndex;
}

/** Fuzzy-matches the Sonata-filter chip text against every set label. */
export function bestSet(text: string): { set: string; score: number } | null {
  const index = getSetIndex();
  const cand = norm(text);
  if (!cand) return null;
  const exact = index.get(cand);
  if (exact) return { set: exact, score: 1 };
  let best: { set: string; score: number } | null = null;
  for (const [key, set] of index) {
    const score = similarity(cand, key);
    if (score >= 0.7 && (!best || score > best.score)) best = { set, score };
  }
  return best;
}

// ---------------------------------------------------------------- labels and values

/** Stat phrases as printed in-game, longest first; partial phrases cover two-line labels. */
const ALIASES: Array<[string, string]> = [
  ["Resonance Liberation DMG Bonus", "ResonanceLiberationDMGBonus"],
  ["Resonance Liberation DMG", "ResonanceLiberationDMGBonus"],
  ["Resonance Liberation", "ResonanceLiberationDMGBonus"],
  ["Resonance Skill DMG Bonus", "ResonanceSkillDMGBonus"],
  ["Resonance Skill DMG", "ResonanceSkillDMGBonus"],
  ["Resonance Skill", "ResonanceSkillDMGBonus"],
  ["Basic Attack DMG Bonus", "BasicAttackDMGBonus"],
  ["Basic Attack DMG", "BasicAttackDMGBonus"],
  ["Basic Attack", "BasicAttackDMGBonus"],
  ["Heavy Attack DMG Bonus", "HeavyAttackDMGBonus"],
  ["Heavy Attack DMG", "HeavyAttackDMGBonus"],
  ["Heavy Attack", "HeavyAttackDMGBonus"],
  ["Energy Regen", "EnergyRegen"],
  ["Healing Bonus", "HealingBonus"],
  ["Crit. Rate", "CritRate"],
  ["Crit Rate", "CritRate"],
  ["Crit. DMG", "CritDMG"],
  ["Crit DMG", "CritDMG"],
  ["HP", "HP"],
  ["ATK", "ATK"],
  ["DEF", "DEF"],
  ...(["Glacio", "Fusion", "Electro", "Aero", "Spectro", "Havoc"] as const).flatMap((el): Array<[string, string]> => [
    [`${el} DMG Bonus`, el],
    [`${el} DMG`, el],
  ]),
];
const ALIAS_NORM: Array<[string, string]> = ALIASES.map(([label, key]): [string, string] => [norm(label), key]).sort((a, b) => b[0].length - a[0].length);
/** the second line of a wrapped label */
const CONTINUATIONS = new Set(["dmgbonus", "bonus", "dmg", "liberationdmgbonus", "skilldmgbonus", "attackdmgbonus"]);
/** labels that wrap onto two lines and stretch their row */
export const TWO_LINE_KEYS = new Set(["ResonanceLiberationDMGBonus", "ResonanceSkillDMGBonus"]);
/** Row 2 of the panel at +25 is fixed by cost. */
const FIXED_SECONDARY: Record<number, [string, number]> = { 4: ["ATK_FLAT", 150], 3: ["ATK_FLAT", 100], 1: ["HP_FLAT", 2280] };

export type StatRow = [key: string, value: string];
export type RowRole = "main" | "secondary" | "sub";

/** Normalized, whitespace/punctuation-insensitive alias match on the END of the label (icons leave junk in front). */
export function labelKey(text: string | null | undefined): string | null {
  const n = norm(text);
  if (!n) return null;
  for (const [alias, key] of ALIAS_NORM) {
    if (n === alias || (n.endsWith(alias) && n.length - alias.length <= 3)) return key;
  }
  return null;
}

/** The "Echo Skill" heading below the table (a re-read label may come back as "ho Skill"). */
export function isTerminator(text: string | null | undefined): boolean {
  const n = norm(text);
  return n.startsWith("echoskill") || (n.includes("skill") && !n.includes("resonance"));
}

export interface ValueCandidate {
  num: number;
  pct: boolean;
}

/** Every reading of a value string: "108%" also yields 10.8 (a dropped decimal point). */
export function valueCandidates(text: string): ValueCandidate[] {
  const out: ValueCandidate[] = [];
  const re = /(\d{1,4})(?:[.,](\d))?\s*(%?)/g;
  const compact = text.replace(/ /g, "");
  let m: RegExpExecArray | null;
  while ((m = re.exec(compact)) !== null) {
    const [, whole, dec, pct] = m;
    if (dec !== undefined) out.push({ num: Number(`${whole}.${dec}`), pct: pct === "%" });
    else {
      out.push({ num: Number(whole), pct: pct === "%" });
      if (pct === "%" && whole.length >= 2) out.push({ num: Number(`${whole.slice(0, -1)}.${whole.slice(-1)}`), pct: true });
    }
  }
  return out;
}

const legalKey = (num: number, pct: boolean): string => `${num.toFixed(1)}|${pct ? "%" : ""}`;

/** -> legal (number, percent?) -> app stat key for this row. Percent-vs-flat decides the HP/ATK/DEF keys. */
export function legalValues(key: string, role: RowRole, cost: number | null): Map<string, string> {
  const legal = new Map<string, string>();
  if (role === "sub") {
    for (const [k, values] of Object.entries(subStatsTable as Record<string, number[]>)) {
      const base = k.endsWith("_FLAT") ? k.slice(0, -5) : k;
      if (base !== key) continue;
      for (const v of values) legal.set(legalKey(v, !k.endsWith("_FLAT")), k);
    }
  } else if (role === "main") {
    const table = cost !== null ? ((statsTable as Record<number, Record<string, Record<number, number>>>)[cost] ?? {}) : {};
    for (const [k, ranks] of Object.entries(table)) {
      if (k !== key || ranks[5] === undefined) continue;
      legal.set(legalKey(ranks[5], true), k);
      if (k === "HealingBonus") legal.set(legalKey(26.4, true), k); // the game prints 26.4 %, the app table says 26.0
    }
  } else {
    const fixed = cost !== null ? FIXED_SECONDARY[cost] : undefined;
    if (fixed && fixed[0].startsWith(key)) legal.set(legalKey(fixed[1], false), fixed[0]);
  }
  return legal;
}

/** First reading of `text` that is legal for the row -> [appKey, value string] (percents "8.6%", flats "50"). */
export function pickLegal(text: string, legal: Map<string, string>): StatRow | null {
  for (const { num, pct } of valueCandidates(text)) {
    const k = legal.get(legalKey(num, pct));
    if (k) return [k, pct ? `${num.toFixed(1)}%` : String(Math.round(num))];
  }
  return null;
}

// ---------------------------------------------------------------- rows

export interface Row {
  cy: number;
  top: number;
  bottom: number;
  words: Word[];
  /** the words between labelX and valueX, left to right */
  label: string;
  valueWords: Word[];
  value: string;
  valueConf: number;
}

/** Groups words into rows by vertical centre (top to bottom; a gap larger than rowGap starts a new row). */
export function clusterRows(words: Word[], table: TableGeometry): Row[] {
  const rows: Array<{ cy: number; words: Word[] }> = [];
  const center = (w: Word): number => w.y + w.height / 2;
  for (const word of [...words].sort((a, b) => center(a) - center(b))) {
    const cy = center(word);
    const last = rows[rows.length - 1];
    if (last && Math.abs(cy - last.cy) <= table.rowGap) {
      last.words.push(word);
      last.cy = last.words.reduce((sum, w) => sum + center(w), 0) / last.words.length;
    } else rows.push({ cy, words: [word] });
  }
  return rows.map(({ cy, words: ws }) => {
    const sorted = [...ws].sort((a, b) => a.x - b.x);
    const valueWords = sorted.filter((w) => w.x >= table.valueX);
    return {
      cy,
      top: Math.min(...sorted.map((w) => w.y)),
      bottom: Math.max(...sorted.map((w) => w.y + w.height)),
      words: sorted,
      label: sorted.filter((w) => w.x >= table.labelX && w.x < table.valueX).map((w) => w.text).join(" "),
      valueWords,
      value: valueWords.map((w) => w.text).join(" "),
      valueConf: valueWords.length ? Math.min(...valueWords.map((w) => w.conf)) : -1,
    };
  });
}

/** "COST 3", also "COSI 3" / "COSl1 1" */
export function parseCost(text: string): number | null {
  const m = /C[O0]S\S*\s*([134])/i.exec(text);
  return m ? Number(m[1]) : null;
}

export function parseLevel(text: string): number | null {
  const m = /\+?\s*(\d{1,2})/.exec(text);
  return m ? Number(m[1]) : null;
}

/** The COST read from the block pass's own words, when the dedicated crop was unreadable. */
export function costFromRows(rows: Row[], table: TableGeometry): number | null {
  for (const row of rows) {
    const tokens = row.words.filter((w) => w.x < table.valueX).map((w) => w.text);
    const at = tokens.findIndex((t) => norm(t).startsWith("cost"));
    if (at < 0) continue;
    const m = /[134]/.exec(tokens.slice(at, at + 2).join(" "));
    return m ? Number(m[0]) : null;
  }
  return null;
}

// ---------------------------------------------------------------- re-reads

/** One preprocessing of a row's box for a re-read; `key` names it in recorded fixtures. */
export interface ReadVariant {
  key: string;
  scale: number;
  mode: "plain" | "color";
  whitelist?: string;
}

const DIGITS = "0123456789.%";
/** value box: greyscale ×2 / ×3, then the untouched pixels; digits-only first, then free text */
export const VALUE_VARIANTS: ReadVariant[] = [
  { key: "g200/psm7/wl", scale: 2, mode: "plain", whitelist: DIGITS },
  { key: "g200/psm7", scale: 2, mode: "plain" },
  { key: "g300/psm7/wl", scale: 3, mode: "plain", whitelist: DIGITS },
  { key: "g300/psm7", scale: 3, mode: "plain" },
  { key: "raw200/psm7/wl", scale: 2, mode: "color", whitelist: DIGITS },
  { key: "raw200/psm7", scale: 2, mode: "color" },
];
export const LABEL_VARIANTS: ReadVariant[] = [
  { key: "g200", scale: 2, mode: "plain" },
  { key: "g300", scale: 3, mode: "plain" },
];

export interface ReadRequest {
  kind: "label" | "value";
  row: number;
  /** [top, bottom] in panel pixels */
  band: [number, number];
  variant: ReadVariant;
}
/** OCRs one row's label or value box (single line) and returns the text. */
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
export type BoxReader = (request: ReadRequest) => Promise<string>;

/** The image region (absolute pixels) a read request covers. */
export function readRegion(panel: Region, table: TableGeometry, request: ReadRequest): Region {
  const [top, bottom] = request.band;
  const x0 = request.kind === "value" ? table.valueX : table.labelX;
  const x1 = request.kind === "value" ? table.valueRight : table.valueX;
  return { x: Math.round(panel.x + x0), y: Math.round(panel.y + top), width: Math.round(x1 - x0), height: Math.max(1, Math.round(bottom - top)) };
}

// ---------------------------------------------------------------- records

export interface ScanInput {
  /** the block pass over the panel: words in panel pixels */
  words: Word[];
  name: string;
  chip: string;
  costText: string;
  levelText: string;
}

export interface RowDebug {
  i: number;
  source: "block" | "synth";
  cy: number;
  label: string | null;
  value: string | null;
  block: string;
}

export interface ScanRecord {
  file: string;
  echo: string | null;
  echoName: string | null;
  echoScore: number;
  set: string | null;
  cost: number | null;
  level: number | null;
  rank: number;
  main: StatRow | null;
  subs: StatRow[];
  flags: string[];
  ocr: { name: string; chip: string; panel: string[] };
  rows: RowDebug[];
}

export interface RecordHints {
  /** set matched from the glyph next to "+25" (used when the chip is not readable) */
  setFromGlyph?: string | null;
  /** echo matched from the portrait (used when the name is not readable) */
  echoFromImage?: string | null;
}

const q = (s: string | null | undefined): string => JSON.stringify((s ?? "").trim());

/**
 * The block pass's words + the small texts + a box reader -> a flagged record.
 * Walks the stat table from the known first-row position: observed rows come
 * from the block pass, a gap where a row should be is read from the raw pixels.
 */
export async function scanEcho(file: string, input: ScanInput, read: BoxReader, table: TableGeometry, hints: RecordHints = {}): Promise<ScanRecord> {
  const flags: string[] = [];
  const rows = clusterRows(input.words, table);
  const readLabel = async (row: number, band: [number, number]): Promise<string | null> => {
    let last: string | null = null;
    for (const variant of LABEL_VARIANTS) {
      const text = (await read({ kind: "label", row, band, variant })).trim();
      if (labelKey(text)) return text;
      if (text) last = text;
    }
    return last;
  };
  const readValue = async (row: number, band: [number, number], legal: Map<string, string>): Promise<StatRow | null> => {
    for (const variant of VALUE_VARIANTS) {
      const hit = pickLegal((await read({ kind: "value", row, band, variant })).trim(), legal);
      if (hit) return hit;
    }
    return null;
  };

  // cost: its own crop, else the block pass, else the registry; level: its own crop (a sanity read only)
  let cost = parseCost(input.costText) ?? costFromRows(rows, table);
  const level = parseLevel(input.levelText);

  // name: the name strip + the panel's first row, the cost as tiebreaker
  const firstRow = rows.length ? rows[0].words.map((w) => w.text).join(" ") : "";
  let matched = bestEcho([input.name, firstRow], cost);
  if (!matched && hints.echoFromImage) {
    const fromImage = echoEntry(hints.echoFromImage);
    if (fromImage) {
      matched = { echo: fromImage, score: 0.6 };
      flags.push(`echo name unreadable (${q(input.name)}); taken from the portrait: ${fromImage.name}`);
    }
  }
  if (!matched) flags.push(`echo name unreadable: ${q(input.name)} / ${q(firstRow)}`);
  else if (matched.score < 0.7) flags.push(`echo name fuzzy (${matched.score.toFixed(2)}): ${q(input.name)} -> ${matched.echo.name}`);
  const echo = matched?.echo ?? null;
  const registryCost = echo?.cost ?? null;
  if (cost === null) {
    cost = registryCost;
    if (registryCost !== null) flags.push("COST not read, using the registry");
  } else if (registryCost !== null && cost !== registryCost) {
    flags.push(`COST ${cost} read but the registry says ${registryCost} for ${echo!.name}`);
    cost = registryCost;
  }

  // set: chip text, else glyph, else the echo's only set
  let set: string | null = null;
  const chip = bestSet(input.chip);
  if (chip && (!echo || echo.sets.includes(chip.set))) set = chip.set;
  else if (chip && echo) flags.push(`chip set ${chip.set} is not allowed for ${echo.name}; allowed ${echo.sets.join(", ")}`);
  if (!set && hints.setFromGlyph && (!echo || echo.sets.includes(hints.setFromGlyph))) set = hints.setFromGlyph;
  if (!set && echo && echo.sets.length === 1) set = echo.sets[0];
  if (!set) flags.push(`set unknown (chip ${q(input.chip)}, allowed ${echo ? echo.sets.join(", ") : "?"})`);

  // the stat table
  const cands = rows.filter((r) => r.cy >= table.firstRowCy - table.tolerance && r.label && !(r.valueWords.length === 0 && CONTINUATIONS.has(norm(r.label))));
  const parsed: Array<StatRow | null> = [];
  const debug: RowDebug[] = [];
  let expected = table.firstRowCy;
  let ci = 0;
  while (parsed.length < 7) {
    const i = parsed.length;
    const role: RowRole = i === 0 ? "main" : i === 1 ? "secondary" : "sub";
    const r: Row | undefined = cands[ci];
    if (r && isTerminator(r.label)) break;
    if (r && r.cy < expected - table.tolerance) {
      ci += 1; // junk above the row we expect next
      continue;
    }
    let key: string | null;
    let blockValue: string;
    let cy: number;
    let source: "block" | "synth";
    let band: [number, number];
    let text: string | null = null;
    if (r && Math.abs(r.cy - expected) <= table.tolerance) {
      ci += 1;
      band = [Math.max(0, r.top - table.bandPad), r.bottom + table.bandPad];
      key = labelKey(r.label);
      blockValue = r.value;
      cy = r.cy;
      source = "block";
      if (!key) {
        text = await readLabel(i, band);
        if (text !== null && isTerminator(text)) break;
        key = labelKey(text ?? "");
      }
    } else {
      // the block pass has no row here: synthesize it
      cy = expected;
      source = "synth";
      blockValue = "";
      band = [Math.max(0, cy - table.synthHalf), cy + table.synthHalf];
      text = await readLabel(i, band);
      if (text !== null && isTerminator(text)) break;
      key = labelKey(text ?? "");
    }
    if (!key) {
      flags.push(`row ${i} label unreadable (${source} at y=${Math.round(cy)}: ${q(source === "block" ? r!.label : text)})`);
      parsed.push(null);
      debug.push({ i, source, cy: Math.round(cy), label: null, value: null, block: blockValue });
      expected = cy + table.pitch;
      continue;
    }
    const legal = legalValues(key, role, cost);
    if (!legal.size) {
      flags.push(`row ${i} ${key} is not a legal ${role} stat for cost ${cost}`);
      parsed.push(null);
      debug.push({ i, source, cy: Math.round(cy), label: key, value: null, block: blockValue });
      expected = cy + table.pitch + (TWO_LINE_KEYS.has(key) ? table.twoLineExtra : 0);
      continue;
    }
    const hitBlock = blockValue ? pickLegal(blockValue, legal) : null;
    const hitRaw = await readValue(i, band, legal);
    const hit = hitRaw ?? hitBlock;
    if (!hit) {
      flags.push(`row ${i} ${key}: value unreadable (${source}; block ${q(blockValue)})`);
      parsed.push(null);
    } else {
      if (hitRaw && hitBlock && (hitRaw[0] !== hitBlock[0] || hitRaw[1] !== hitBlock[1])) {
        flags.push(`row ${i} ${key}: raw read ${hitRaw[1]} vs block read ${hitBlock[1]} (took raw)`);
      }
      parsed.push(hit);
    }
    debug.push({ i, source, cy: Math.round(cy), label: key, value: hit ? hit[1] : null, block: blockValue });
    expected = cy + table.pitch + (TWO_LINE_KEYS.has(key) ? table.twoLineExtra : 0);
  }
  if (parsed.length < 7) flags.push(`only ${parsed.length} stat rows found (expected 7)`);

  const main = parsed[0] ?? null;
  if (!main) flags.push("main stat not read");
  else {
    const tableForCost = cost !== null ? ((statsTable as Record<number, Record<string, Record<number, number>>>)[cost] ?? {}) : {};
    const expect = tableForCost[main[0]]?.[5];
    const v = Number(main[1].replace("%", ""));
    if (expect !== undefined && Math.abs(v - expect) > 0.05 && !(main[0] === "HealingBonus" && Math.abs(v - 26.4) < 0.05)) {
      flags.push(`main ${main[0]} ${main[1]} != +25 value ${expect} (under-leveled or misread; level read ${q(input.levelText)})`);
    }
  }
  const second = parsed[1];
  if (second && cost !== null) {
    const fixed = FIXED_SECONDARY[cost];
    if (fixed && (second[0] !== fixed[0] || Math.round(Number(second[1])) !== fixed[1])) flags.push(`secondary row ${second[0]} ${second[1]} != expected ${fixed[0]} ${fixed[1]}`);
  }
  const subs = parsed.slice(2, 7).filter((p): p is StatRow => p !== null);
  if (subs.length < 5) flags.push(`only ${subs.length} substats read`);

  return {
    file,
    echo: echo?.key ?? null,
    echoName: echo?.name ?? null,
    echoScore: matched?.score ?? 0,
    set,
    cost,
    level,
    rank: 5,
    main,
    subs,
    flags,
    ocr: { name: input.name.trim(), chip: input.chip.trim(), panel: debug.map((d) => `${d.label ?? "?"} ${d.value ?? "?"}${d.source === "synth" ? " (synthesized row)" : ""}`) },
    rows: debug,
  };
}

// ---------------------------------------------------------------- importer shape

/** stat key -> the verbose label CalculatorEchoImporter maps back through verboseStatLabelMap */
const KEY_TO_LABEL: Record<string, string> = {};
for (const [label, key] of Object.entries(verboseStatLabelMap)) {
  if (!(key in KEY_TO_LABEL)) KEY_TO_LABEL[key] = label;
}

export interface ParsedEchoForImporter {
  cost: number | null;
  rank: number;
  mainStatLabel: string;
  substats: Array<{ subStat: string; subStatValue: string }>;
  echo: string | null;
  set: string | null;
}

/** A record in the shape CalculatorEchoParser emits, so CalculatorEchoImporter's review + save flow can take it. */
export function toParsedEcho(record: ScanRecord): ParsedEchoForImporter {
  const label = (key: string): string => KEY_TO_LABEL[key.replace(/_FLAT$/, "")] ?? key;
  return {
    cost: record.cost,
    rank: record.rank,
    mainStatLabel: record.main ? label(record.main[0]) : "",
    substats: record.subs.map(([key, value]) => ({
      subStat: label(key),
      subStatValue: key.endsWith("_FLAT") ? value.replace("%", "") : value.endsWith("%") ? value : `${value}%`,
    })),
    echo: record.echo,
    set: record.set,
  };
}

export const SUBSTAT_KEYS = Object.keys(subStatsTable);
export const MAIN_STAT_KEYS = Array.from(new Set(Object.values(statsTable).flatMap((byStat) => Object.keys(byStat))));
export { KEY_TO_LABEL };
