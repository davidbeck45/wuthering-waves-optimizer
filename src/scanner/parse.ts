/**
 * Turns the raw OCR text pulled from the header block and stats block
 * (layout.ts's HEADER_BLOCK / STATS_BLOCK) into a ParsedEchoSlot candidate —
 * the same shape CalculatorEchoParser.vue already emits, so the result can
 * be handed straight to CalculatorEchoImporter.vue's existing
 * mapParsedEchoes → duplicate-review → save pipeline.
 *
 * Deliberately does NOT do image-based echo/set matching here — the set
 * icon is matched via the existing echoParser.worker.ts (matchSetFirst) by
 * the caller (useEchoScanner.ts), which passes the resolved set key in.
 * Keeping this module string-only makes it trivial to unit test against
 * real OCR output from the provided screenshots without a canvas/worker.
 */
import { mainEchoesData, getEchoData, getCostByClass } from "../echoes/index";
import { statsTable, subStatsTable, verboseStatLabelMap } from "../echoes/stats";
import { getSubstatType, getSubstatValue } from "../echoes/parsedEchoMapping";
import { levenshteinSimilarity } from "./levenshtein";
import type { FieldConfidence, ParsedEchoSlot, ParsedSubstat } from "./types";

export const NAME_MATCH_THRESHOLD = 0.68;

type StatRow = { rawLabel: string; rawValue: string };

/** Legal WuWa echo costs (there is no cost-2 tier). */
const LEGAL_COSTS = new Set([1, 3, 4]);

/**
 * Lowercases, transliterates accented Latin letters to their base form
 * (é→e, ü→u, …), then strips anything left that isn't alphanumeric.
 *
 * The transliteration step matters: stripping accents outright (dropping
 * "é" instead of collapsing it to "e") silently loses a whole letter from
 * an echo name like "Jué", shrinking its normalized form to "ju" (2 chars)
 * while OCR reading the same glyph as a plain "e" (a common, often-correct
 * simplification for an English-trained model) normalizes to "jue" (3
 * chars) — a spurious mismatch caused entirely by this function being
 * asymmetric, not by OCR actually getting anything wrong. Confirmed via a
 * real "Jué" (4-cost) scan that came back "Unknown echo". Same technique
 * `slugify` already uses in `src/utils/strings.ts`.
 */
function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "") // combining diacritical marks
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

/**
 * Matches OCR'd label noise (missing/extra periods, spacing) against the
 * known display labels in verboseStatLabelMap, returning the exact
 * canonical label string mapParsedEchoes expects — or null if nothing is
 * close enough to trust.
 */
export function normalizeStatLabel(rawLabel: string): string | null {
  const target = normalize(rawLabel);
  if (!target) return null;
  if (verboseStatLabelMap[rawLabel]) return rawLabel;

  let best: { label: string; score: number } | null = null;
  for (const label of Object.keys(verboseStatLabelMap)) {
    const score = levenshteinSimilarity(target, normalize(label));
    if (!best || score > best.score) {
      best = { label, score };
    }
  }
  return best && best.score >= 0.75 ? best.label : null;
}

/**
 * Splits a multi-line stats-block OCR result into ordered {label, value}
 * rows, reassembling labels that wrapped onto a second line (e.g.
 * "Resonance Skill DMG" / "Bonus 8.6%" — confirmed happening in real
 * footage for the two longest substat labels).
 */
export function splitStatRows(rawText: string): StatRow[] {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const valuePattern = /^(.*?)\s+([+-]?\d+(?:\.\d+)?%?)$/;
  const rows: StatRow[] = [];
  let pendingLabel = "";

  for (const line of lines) {
    const candidate = pendingLabel ? `${pendingLabel} ${line}` : line;
    const match = candidate.match(valuePattern);
    if (match) {
      rows.push({ rawLabel: match[1].trim(), rawValue: match[2].trim() });
      pendingLabel = "";
    } else {
      // No trailing number yet — could be a wrapped label continuation.
      pendingLabel = candidate;
    }
  }

  return rows;
}

export function parseHeaderText(rawText: string): {
  name: string | null;
  level: number | null;
  cost: number | null;
} {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  let cost: number | null = null;
  let level: number | null = null;
  let name: string | null = null;

  for (const line of lines) {
    const costMatch = line.match(/COST\s*(\d+)/i);
    if (costMatch) {
      const parsedCost = parseInt(costMatch[1], 10);
      if (LEGAL_COSTS.has(parsedCost)) cost = parsedCost;
      continue;
    }
    const levelMatch = line.match(/\+\s*(\d{1,2})\b/);
    if (levelMatch) {
      const parsedLevel = parseInt(levelMatch[1], 10);
      if (parsedLevel >= 0 && parsedLevel <= 25) level = parsedLevel;
      continue;
    }
    if (!name && /[a-zA-Z]{3,}/.test(line)) {
      name = line.replace(/[|_]/g, "").trim();
    }
  }

  return { name, level, cost };
}

export type EchoNameMatch = { key: string; name: string; similarity: number };

/** `costHint` narrows the candidate pool when the cost was already read — much better match quality on a name OCR miss. */
export function matchEchoName(
  rawName: string,
  costHint: number | null,
): EchoNameMatch | null {
  const target = normalize(rawName);
  if (!target) return null;

  let best: EchoNameMatch | null = null;
  for (const echo of Object.values(mainEchoesData ?? {})) {
    if (costHint && getCostByClass(echo.class) !== costHint) continue;
    const similarity = levenshteinSimilarity(target, normalize(echo.name));
    if (!best || similarity > best.similarity) {
      best = { key: echo.key, name: echo.name, similarity };
    }
  }
  return best;
}

/**
 * Snaps a raw OCR'd value to the nearest legal roll for its stat.
 *
 * `exact` reflects whether the *number* OCR read already equalled a legal
 * roll (diff 0), not whether the formatted string round-trips unchanged —
 * comparing formatted strings was a real bug: OCR reading "21.0%" for a
 * Crit DMG roll of 21 (a legal, correct roll — subStatsTable.CritDMG ends
 * at 21) reformats to "21%", which is a different STRING from "21.0%" even
 * though it's the same, exactly-correct NUMBER. That was flagging
 * objectively-correct values as low-confidence "questionable" — the value
 * was always right, only the trailing ".0" changed. Confirmed via a real
 * "Crit. DMG 21%" scan reported as looking questionable despite being correct.
 */
function resolveSubstatValue(
  rawLabel: string,
  rawValue: string,
): { formatted: string; exact: boolean } {
  const canonicalKey = getSubstatType({ subStat: rawLabel, subStatValue: rawValue });
  const numericValue = getSubstatValue(rawValue);
  if (!canonicalKey || numericValue === null) {
    return { formatted: rawValue, exact: false };
  }

  const legalRolls = subStatsTable[canonicalKey];
  if (!legalRolls?.length) {
    return { formatted: rawValue, exact: false };
  }

  let nearest = legalRolls[0];
  let smallestDiff = Math.abs(legalRolls[0] - numericValue);
  for (const roll of legalRolls) {
    const diff = Math.abs(roll - numericValue);
    if (diff < smallestDiff) {
      nearest = roll;
      smallestDiff = diff;
    }
  }
  const formatted = rawValue.includes("%") ? `${nearest}%` : `${nearest}`;
  return { formatted, exact: smallestDiff < 1e-9 };
}

export type ParseCandidateResult = {
  slot: ParsedEchoSlot;
  level: number | null;
  needsMainStatSelection: boolean;
  confidence: {
    name: FieldConfidence;
    cost: FieldConfidence;
    mainStat: FieldConfidence;
    set: FieldConfidence;
    substats: FieldConfidence[];
  };
  /** Raw OCR text, kept only for surfacing in the review UI's diagnostics when something's low-confidence — not used for parsing itself. */
  rawHeaderText: string;
  rawStatsText: string;
};

export function parseEchoCandidate(input: {
  headerText: string;
  statsText: string;
  matchedSet: string | null;
}): ParseCandidateResult {
  const header = parseHeaderText(input.headerText);
  const rows = splitStatRows(input.statsText);

  const nameMatch = header.name ? matchEchoName(header.name, header.cost) : null;
  const resolvedEcho = nameMatch && nameMatch.similarity >= NAME_MATCH_THRESHOLD ? nameMatch.key : null;

  let cost = header.cost;
  if (!cost && resolvedEcho) {
    cost = getCostByClass(getEchoData(resolvedEcho).class);
  }

  // Row 0 = main stat, row 1 = fixed secondary (not persisted — getEchoStats
  // derives it from cost+rank), rows 2-6 = up to 5 substats.
  const mainRow = rows[0] ?? null;
  const substatRows = rows.slice(2, 7);

  const mainStatLabel = mainRow ? (normalizeStatLabel(mainRow.rawLabel) ?? mainRow.rawLabel) : "";
  const mainStatLegal = Boolean(
    cost && mainStatLabel && statsTable[cost]?.[verboseStatLabelMap[mainStatLabel] ?? ""],
  );

  const resolvedSubstats = substatRows.map((row) => {
    const label = normalizeStatLabel(row.rawLabel) ?? row.rawLabel;
    return { label, ...resolveSubstatValue(label, row.rawValue) };
  });

  const substats: ParsedSubstat[] = resolvedSubstats.map(({ label, formatted }) => ({
    subStat: label,
    subStatValue: formatted,
  }));

  const substatConfidence: FieldConfidence[] = resolvedSubstats.map(({ label, exact }) => {
    const known = Boolean(verboseStatLabelMap[label] || ["ATK", "DEF", "HP"].includes(label));
    return known && exact ? "high" : "low";
  });

  const needsMainStatSelection = !mainRow || !mainStatLabel;

  return {
    slot: {
      cost,
      mainStatLabel,
      substats,
      echo: resolvedEcho,
      set: input.matchedSet,
    },
    level: header.level,
    needsMainStatSelection,
    confidence: {
      name: resolvedEcho ? "high" : "low",
      cost: header.cost ? "high" : "low",
      mainStat: mainStatLegal ? "high" : "low",
      set: input.matchedSet ? "high" : "low",
      substats: substatConfidence,
    },
    rawHeaderText: input.headerText,
    rawStatsText: input.statsText,
  };
}
