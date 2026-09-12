// Wuthering Tools+: batch import of in-game echoes from PHONE screenshots of
// the Echo inventory (an echo selected, its detail panel on the right).
// Pure logic — layouts, OCR text parsing, registry matching and validation —
// so it can be unit-tested against recorded OCR transcripts. The Vue side
// (PhoneEchoBatchParser.vue) only crops, OCRs and renders.
import { mainEchoesData, getCostByClass } from "../../echoes/index";
import { statsTable, subStatsTable, echoSetLabelMap, verboseStatLabelMap } from "../../echoes/stats";

export interface Region {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PhoneLayout {
  key: string;
  label: string;
  width: number;
  height: number;
  regions: {
    /** the echo's name, top of the detail panel */
    name: Region;
    /** the whole detail panel: name, +level, COST, then the stat rows */
    panel: Region;
    /** the Sonata-filter chip bottom-left (prints the set name when a set filter is active) */
    chip: Region;
    /** the small set glyph right of "+25" */
    setGlyph: Region;
    /** the echo's portrait in the panel */
    echoImage: Region;
  };
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
    },
  },
];

export interface ResolvedLayout {
  layout: PhoneLayout;
  scale: number;
  exact: boolean;
  regions: PhoneLayout["regions"];
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

/** Fuzzy-matches OCR text (the name line) against every echo's name/key. */
export function bestEcho(text: string): { echo: EchoEntry; score: number } | null {
  const index = getEchoIndex();
  const cand = norm(text.split(/[,)(\[\]|]/)[0]);
  if (!cand) return null;
  const exact = index.get(cand);
  if (exact) return { echo: exact, score: 1 };
  let best: { echo: EchoEntry; score: number } | null = null;
  for (const [key, echo] of index) {
    const score = similarity(cand, key);
    if (score >= 0.55 && (!best || score > best.score)) best = { echo, score };
  }
  if (best) return best;
  // the art often overlaps the end of a long name: accept a clean 8-char prefix
  if (cand.length >= 8) {
    for (const [key, echo] of index) {
      if (key.startsWith(cand.slice(0, 8))) return { echo, score: 0.5 };
    }
  }
  return null;
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

// ---------------------------------------------------------------- panel text

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
const ALIAS_KEY = new Map(ALIASES);
const escapeRegExp = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const ROW_RE = new RegExp(`^(.*?)(${ALIASES.map(([a]) => escapeRegExp(a)).join("|")})\\s+(\\d[\\d.,]*%?)\\s*$`);
const FLAT_OK = new Set([30, 40, 50, 60, 70, 100, 150, 320, 360, 390, 430, 470, 510, 540, 580, 2280]);

export type StatRow = [key: string, value: string];

/** One panel line -> [statKey, value] or null; rejects rows whose value is not stat-shaped. */
export function parseStatRow(line: string): StatRow | null {
  const m = ROW_RE.exec(line);
  if (!m) return null;
  const [, prefix, label, rawValue] = m;
  // more than icon garbage before the label = not a stat row
  if (prefix.replace(/[^A-Za-z]/g, "").length > 2) return null;
  let key = ALIAS_KEY.get(label)!;
  const value = rawValue.replace(/,/g, "");
  if (value.endsWith("%")) {
    if (!/^\d{1,2}(\.\d)?%$/.test(value)) return null;
  } else {
    if (!/^\d+$/.test(value) || !FLAT_OK.has(Number(value))) return null;
    if (key === "HP" || key === "ATK" || key === "DEF") key += "_FLAT";
  }
  return [key, value];
}

export interface ParsedPanel {
  cost: number | null;
  level: number | null;
  rows: StatRow[];
}

/** The detail panel's OCR text (or its lines) -> cost, +level and the stat rows in order. */
export function parsePanelText(text: string | string[]): ParsedPanel {
  const lines = (Array.isArray(text) ? text : text.split(/\r?\n/)).map((l) => l.trim()).filter(Boolean);
  let cost: number | null = null;
  let level: number | null = null;
  const rows: StatRow[] = [];
  for (const line of lines) {
    if (line.toLowerCase().startsWith("echo skill")) break;
    const costMatch = /COST\s*(\d)/i.exec(line);
    if (costMatch) {
      cost = Number(costMatch[1]);
      continue;
    }
    const levelMatch = /\+\s*(\d{1,2})\b/.exec(line);
    if (levelMatch && level === null && rows.length === 0) {
      level = Number(levelMatch[1]);
      continue;
    }
    const row = parseStatRow(line);
    if (row) rows.push(row);
  }
  return { cost, level, rows };
}

// ---------------------------------------------------------------- records

export interface OcrTexts {
  name: string;
  panel: string | string[];
  /** optional second OCR pass over the panel (different scaling); rows only it saw are added and flagged */
  panel2?: string | string[];
  chip: string;
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
}

/** Row 2 of the panel at +25 is fixed by cost. */
const FIXED_SECONDARY: Record<number, [string, number]> = { 4: ["ATK", 150], 3: ["ATK", 100], 1: ["HP", 2280] };

export interface RecordHints {
  /** set matched from the glyph next to "+25" (used when the chip is not readable) */
  setFromGlyph?: string | null;
  /** echo matched from the portrait (used when the name is not readable) */
  echoFromImage?: string | null;
}

/** Port of the validated Python pipeline: OCR texts (+ optional image-match hints) -> a flagged record. */
export function buildRecord(file: string, ocr: OcrTexts, hints: RecordHints = {}): ScanRecord {
  const flags: string[] = [];
  const panelLines = (Array.isArray(ocr.panel) ? ocr.panel : ocr.panel.split(/\r?\n/)).map((l) => l.trim()).filter(Boolean);
  let matched = bestEcho(ocr.name);
  if (!matched && panelLines.length) matched = bestEcho(panelLines[0]);
  let { cost, level, rows } = parsePanelText(panelLines);
  const second = ocr.panel2 ? parsePanelText(ocr.panel2) : null;
  if (second) {
    if (cost === null) cost = second.cost;
    if (level === null) level = second.level;
  }
  const registryCostEarly = matched?.echo.cost ?? null;
  const costForRows = cost ?? registryCostEarly;
  // the +25 panel always has the fixed secondary row (ATK 150 / ATK 100 / HP 2280) as row 2:
  // when OCR dropped it, the substats shift up by one — put it back
  const fixed = costForRows !== null ? FIXED_SECONDARY[costForRows] : undefined;
  if (fixed && rows.length >= 1) {
    const fixedRow: StatRow = [`${fixed[0]}_FLAT`, String(fixed[1])];
    const isFixed = (r: StatRow | undefined): boolean => !!r && r[0] === fixedRow[0] && r[1] === fixedRow[1];
    if (!isFixed(rows[1])) {
      const at = rows.findIndex((r, i) => i > 0 && isFixed(r));
      if (at > 1) rows.splice(at, 1);
      rows.splice(1, 0, fixedRow);
      flags.push(`fixed row ${fixed[0]} ${fixed[1]} was ${at > 1 ? "out of place" : "not read"} — restored (verify the substats)`);
    }
  }
  if (second && second.rows.length && JSON.stringify(second.rows) !== JSON.stringify(rows)) {
    // rows only the 2nd pass saw are added when they are legal rolls; disagreements count only for legal values
    const legalRoll = (key: string, value: string): boolean => {
      const legal = (subStatsTable as Record<string, number[]>)[key];
      const v = Number(value.replace("%", ""));
      return !!legal && legal.some((x) => Math.abs(x - v) < 0.01);
    };
    const byKey = (list: StatRow[]): Map<string, string[]> => {
      const m = new Map<string, string[]>();
      for (const [k, v] of list) m.set(k, [...(m.get(k) ?? []), v]);
      return m;
    };
    const d1 = byKey(rows);
    const d2 = byKey(second.rows);
    for (const [k, values] of d2) {
      const first = d1.get(k);
      const legalValues = values.filter((v) => legalRoll(k, v));
      if (!first) {
        if (!legalValues.length) continue;
        for (const v of legalValues) rows.push([k, v]);
        flags.push(`row ${k} ${legalValues.join("/")} added from 2nd OCR pass (verify)`);
      } else if (
        legalValues.length &&
        [...first].sort().join() !== [...legalValues].sort().join() &&
        legalValues.length <= first.length &&
        !legalValues.every((v) => first.includes(v))
      ) {
        flags.push(`OCR passes disagree on ${k}: ${first.join("/")} vs ${legalValues.join("/")}`);
      }
    }
  }
  if (!matched && hints.echoFromImage) {
    const fromImage = echoEntry(hints.echoFromImage);
    if (fromImage) {
      matched = { echo: fromImage, score: 0.6 };
      flags.push(`echo name unreadable (${JSON.stringify(ocr.name.trim())}); taken from the portrait: ${fromImage.name}`);
    }
  }
  if (!matched) flags.push(`echo name unreadable: ${JSON.stringify(ocr.name.trim())}`);
  else if (matched.score < 0.7) flags.push(`echo name fuzzy (${matched.score.toFixed(2)}): ${JSON.stringify(ocr.name.trim())} -> ${matched.echo.name}`);
  const echo = matched?.echo ?? null;
  const registryCost = echo?.cost ?? null;
  if (cost === null) {
    cost = registryCost;
    flags.push("COST not read, using the registry");
  } else if (registryCost && cost !== registryCost) {
    flags.push(`COST ${cost} read but the registry says ${registryCost}`);
    cost = registryCost;
  }
  // set: chip text, else glyph, else the echo's only set
  let set: string | null = null;
  const chip = bestSet(ocr.chip);
  if (chip && (!echo || echo.sets.includes(chip.set))) set = chip.set;
  else if (chip && echo) flags.push(`chip set ${chip.set} is not allowed for ${echo.name}; allowed ${echo.sets.join(", ")}`);
  if (!set && hints.setFromGlyph && (!echo || echo.sets.includes(hints.setFromGlyph))) set = hints.setFromGlyph;
  if (!set && echo && echo.sets.length === 1) set = echo.sets[0];
  if (!set) flags.push(`set unknown (chip ${JSON.stringify(ocr.chip.trim())}, allowed ${echo ? echo.sets.join(", ") : "?"})`);
  // main stat = row 1, checked against the +25 table value for the cost
  let main: StatRow | null = rows[0] ?? null;
  if (!main) flags.push("no stat rows read");
  else {
    const [key, value] = main;
    if (key.endsWith("_FLAT")) flags.push(`main stat read as flat ${key} ${value}`);
    const table = cost !== null ? ((statsTable as Record<number, Record<string, Record<number, number>>>)[cost] ?? {}) : {};
    const expect = table[key]?.[5];
    const v = Number(value.replace("%", ""));
    if (expect === undefined) flags.push(`main stat ${key} is not valid for cost ${cost}`);
    else if (Math.abs(v - expect) > 0.05 && !(key === "HealingBonus" && Math.abs(v - 26.4) < 0.05)) {
      flags.push(`main ${key} ${value} != +25 value ${expect} (under-leveled or misread)`);
    }
    main = [key, value];
  }
  if (rows.length >= 2 && cost !== null) {
    const [label2, value2] = rows[1];
    const fixed = FIXED_SECONDARY[cost];
    if (fixed && (label2 !== `${fixed[0]}_FLAT` || value2 !== String(fixed[1]))) {
      flags.push(`secondary row ${label2} ${value2} != expected ${fixed[0]} ${fixed[1]}`);
    }
  }
  const subs = rows.slice(2, 7);
  if (rows.length > 7) flags.push(`${rows.length} stat rows read (expected at most 7)`);
  if (subs.length < 5) flags.push(`only ${subs.length} substats read`);
  for (const [key, value] of subs) {
    const legal = (subStatsTable as Record<string, number[]>)[key];
    const v = Number(value.replace("%", ""));
    if (!legal) flags.push(`${key} cannot be a substat`);
    else if (!legal.some((x) => Math.abs(x - v) < 0.01)) flags.push(`${key} ${value} is not a legal roll`);
  }
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
    ocr: { name: ocr.name.trim(), chip: ocr.chip.trim(), panel: panelLines },
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
