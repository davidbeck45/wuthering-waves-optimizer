/**
 * Turns the raw OCR text pulled from the header block and individually-
 * cropped stat rows (layout.ts's HEADER_BLOCK / MAIN_STAT_ROW /
 * SECONDARY_STAT_ROW / SUBSTAT_ROWS) into a ParsedEchoSlot candidate — the
 * same shape CalculatorEchoParser.vue already emits, so the result can be
 * handed straight to CalculatorEchoImporter.vue's existing
 * mapParsedEchoes → duplicate-review → save pipeline.
 *
 * Echo identification deliberately mirrors CalculatorEchoParser.vue's
 * proven approach instead of doing OCR-name-vs-everything matching alone:
 * narrow mainEchoesData by the already-matched set icon (matchSetFirst,
 * called by the caller/useEchoScanner.ts — this module stays string-only,
 * no image matching here) and by cost first, the same way that flow's
 * `filteredEchoKeys` narrowing does. Set+cost alone usually narrows to
 * exactly one echo (most sets have a single echo at a given cost tier) —
 * name-text Levenshtein matching only has to break a tie among the
 * (typically few) cost-1 echoes that share both a set and a cost, instead
 * of guessing against the full ~150-echo list. See docs/scanner.md.
 */
import { mainEchoesData, getCostByClass, type Echo } from "../echoes/index";
import { statsTable, subStatsTable, verboseStatLabelMap, flatBonusesByRankByType } from "../echoes/stats";
import { getSubstatType, getSubstatValue } from "../echoes/parsedEchoMapping";
import { levenshteinSimilarity } from "./levenshtein";
import type { FieldConfidence, ParsedEchoSlot, ParsedSubstat } from "./types";

export const NAME_MATCH_THRESHOLD = 0.68;
/** Loose sanity floor for the "set+cost already narrowed to one echo" case — just enough to catch a set icon that was clearly misread, not to require a strong text match. */
const NAME_SANITY_THRESHOLD = 0.4;

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

const KNOWN_LABEL_WORDS = ["ATK", "DEF", "HP"];

function bestKnownLabelMatch(text: string): { label: string; score: number } | null {
  const target = normalize(text);
  if (!target) return null;
  if (verboseStatLabelMap[text]) return { label: text, score: 1 };

  let best: { label: string; score: number } | null = null;
  for (const label of Object.keys(verboseStatLabelMap)) {
    const score = levenshteinSimilarity(target, normalize(label));
    if (!best || score > best.score) {
      best = { label, score };
    }
  }
  return best;
}

/**
 * Matches OCR'd label noise (missing/extra periods, spacing) against the
 * known display labels in verboseStatLabelMap, returning the exact
 * canonical label string mapParsedEchoes expects — or null if nothing is
 * close enough to trust.
 *
 * Tries the *whole* string first, then progressively drops leading words
 * and retries — real footage showed a row's label sometimes carries a
 * garbled prefix from OCR noise or a neighboring row's crop overlap (e.g.
 * "72 DdIIC ALAC DITO DOIIUS 4.4170" preceding a real "Crit. Rate 6.3%" —
 * see parseStatRow's doc comment), and the true label is always at the
 * *end*, right before the value. A whole-string match would score too low
 * to trust; stripping noise word-by-word from the front recovers it.
 */
export function normalizeStatLabel(rawLabel: string): string | null {
  const words = rawLabel.split(/\s+/).filter(Boolean);
  if (!words.length) return null;

  for (let start = 0; start < words.length; start++) {
    const candidate = words.slice(start).join(" ");
    const best = bestKnownLabelMatch(candidate);
    if (best && best.score >= 0.75) return best.label;
  }
  return null;
}

/** Same tolerance normalizeStatLabel uses, but a yes/no check — used by parseStatRow to decide whether a candidate row's label looks real enough to accept, or whether to keep scanning further lines. */
function isPlausibleLabel(rawLabel: string): boolean {
  const trimmed = rawLabel.trim();
  if (KNOWN_LABEL_WORDS.includes(trimmed) || trimmed === "DEF Y") return true;
  return normalizeStatLabel(trimmed) !== null;
}

/**
 * Resolves one individually-cropped stat row's OCR text to a {label,
 * value} pair. Mirrors CalculatorEchoParser.vue's per-row crops (5
 * separate small OCR calls there too) rather than asking tesseract to
 * segment a multi-line block itself — segmenting a block turned out to be
 * the source of real missing-substat reports, since a merged/garbled row
 * boundary silently drops that row from the recognized text with no way to
 * recover it. An isolated crop can't lose a *different* row's text because
 * there isn't any in the crop.
 *
 * The crop is deliberately taller than one line (see SUBSTAT_ROWS in
 * layout.ts) so a wrapped label ("Resonance Skill DMG" / "Bonus 8.6%")
 * still resolves correctly, and so it tolerates the row shifting down a
 * bit when an *earlier* row wrapped (the panel reflows, so every row below
 * a wrap sits lower than this crop's fixed position assumes). That
 * overlap has a real cost though: a crop can end up containing noise or
 * even a neighboring row's actual text ahead of this row's own content
 * (confirmed from real footage — e.g. a crop reading "72 DdIIC ALAC DITO
 * DOIIUS 4.4170" *before* a legitimate "Crit. Rate 6.3%"). Accepting
 * whichever line happens to end in a number *first* was a real bug: that
 * garbled first line matches the same "label value" shape as real content,
 * so it won by being first, and the real row underneath it was silently
 * never reached. This now keeps scanning past a match whose label doesn't
 * actually look like a stat name (isPlausibleLabel), only falling back to
 * the first match found if nothing in the crop ever looks plausible.
 */
export function parseStatRow(rawText: string): StatRow | null {
  const lines = rawText
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const valuePattern = /^(.*?)\s+([+-]?\d+(?:\.\d+)?%?)$/;
  let pendingLabel = "";
  let firstMatch: StatRow | null = null;

  for (const line of lines) {
    const candidate = pendingLabel ? `${pendingLabel} ${line}` : line;
    const match = candidate.match(valuePattern);
    if (match) {
      const row: StatRow = { rawLabel: match[1].trim(), rawValue: match[2].trim() };
      if (!firstMatch) firstMatch = row;
      if (isPlausibleLabel(row.rawLabel)) return row;
      // Doesn't look like a real stat label yet — keep the whole matched
      // text (garbage included) and keep scanning; the real label may
      // still be further down, with this noise as its leading prefix.
      pendingLabel = candidate;
      continue;
    }
    // No trailing number yet — could be a wrapped label continuation.
    pendingLabel = candidate;
  }
  // Nothing in the crop ever looked like a real label — the first numeric
  // match is still a better answer than nothing (matches prior behavior),
  // just one that'll correctly come back low-confidence downstream.
  return firstMatch;
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

/**
 * The fixed secondary-stat row's flat value is unique per cost tier —
 * *not* just at rank 5 (checked: cost 1's {296,516,957,2280}, cost 3's
 * {31,44,63,100}, and cost 4's {46,68,92,150} never collide with each
 * other at any rank) — a useful fallback signal for cost when the small
 * "COST n" text itself misreads, since the secondary row is a much larger,
 * easier-to-OCR crop. Checking every rank, not just 5, matters: echoes
 * aren't all 5-star (confirmed from real footage — a cost-1 echo whose
 * secondary row read HP 957, the rank-4 value, not rank-5's 2280; checking
 * only rank 5 came back empty on a perfectly legible crop).
 */
function inferCostFromSecondaryValue(rawValue: string | null): number | null {
  if (!rawValue) return null;
  const numeric = getSubstatValue(rawValue);
  if (numeric === null) return null;
  for (const cost of [1, 3, 4]) {
    const byRank = flatBonusesByRankByType[cost];
    if (byRank && Object.values(byRank).includes(numeric)) return cost;
  }
  return null;
}

export type EchoNameMatch = { key: string; name: string; similarity: number };

function bestNameMatch(rawName: string, pool: Echo[]): EchoNameMatch | null {
  const target = normalize(rawName);
  if (!target) return null;
  let best: EchoNameMatch | null = null;
  for (const echo of pool) {
    const similarity = levenshteinSimilarity(target, normalize(echo.name));
    if (!best || similarity > best.similarity) {
      best = { key: echo.key, name: echo.name, similarity };
    }
  }
  return best;
}

/** `costHint` narrows the candidate pool when the cost was already read — much better match quality on a name OCR miss. Kept as the fallback path for when set+cost narrowing (see parseEchoCandidate) comes up empty. */
export function matchEchoName(rawName: string, costHint: number | null): EchoNameMatch | null {
  const pool = Object.values(mainEchoesData ?? {}).filter(
    (echo) => !costHint || getCostByClass(echo.class) === costHint,
  );
  return bestNameMatch(rawName, pool);
}

function narrowEchoCandidates(matchedSet: string | null, cost: number | null): Echo[] {
  let pool = Object.values(mainEchoesData ?? {});
  if (matchedSet) pool = pool.filter((echo) => echo.sets?.includes(matchedSet));
  if (cost) pool = pool.filter((echo) => getCostByClass(echo.class) === cost);
  return pool;
}

/**
 * Identifies the echo the same way CalculatorEchoParser.vue's flow does —
 * narrow by set+cost first, only fall back to full-list name matching when
 * that narrowing can't be trusted. See this module's top doc comment.
 */
function resolveEcho(
  headerName: string | null,
  matchedSet: string | null,
  cost: number | null,
): { echo: string | null; confidence: FieldConfidence } {
  const pool = narrowEchoCandidates(matchedSet, cost);

  if (pool.length === 1) {
    const only = pool[0];
    const similarity = headerName ? levenshteinSimilarity(normalize(headerName), normalize(only.name)) : null;
    // No name text to sanity-check against, or it's at least a loose match: trust the set+cost narrowing.
    const trusted = similarity === null || similarity >= NAME_SANITY_THRESHOLD;
    return { echo: only.key, confidence: trusted ? "high" : "low" };
  }

  if (pool.length > 1) {
    const match = headerName ? bestNameMatch(headerName, pool) : null;
    if (match && match.similarity >= NAME_MATCH_THRESHOLD) {
      return { echo: match.key, confidence: "high" };
    }
    return { echo: null, confidence: "low" };
  }

  // Set (or the set+cost combination) didn't narrow to anything — the set
  // read was probably wrong. Fall back to matching by name against every
  // echo at this cost, same as before set-based narrowing existed.
  const fallback = headerName ? matchEchoName(headerName, cost) : null;
  if (fallback && fallback.similarity >= NAME_MATCH_THRESHOLD) {
    return { echo: fallback.key, confidence: "high" };
  }
  return { echo: null, confidence: "low" };
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
  mainStatText: string;
  secondaryStatText: string;
  /** Up to 5, in panel order. A slot's text can be empty/unparseable — that's how an echo below +25 with fewer revealed substats is represented. */
  substatTexts: string[];
  matchedSet: string | null;
}): ParseCandidateResult {
  const header = parseHeaderText(input.headerText);
  const secondaryRow = parseStatRow(input.secondaryStatText);
  const cost = header.cost ?? inferCostFromSecondaryValue(secondaryRow?.rawValue ?? null);
  const costConfidence: FieldConfidence = header.cost ? "high" : cost ? "low" : "low";

  const { echo: resolvedEcho, confidence: nameConfidence } = resolveEcho(header.name, input.matchedSet, cost);

  const mainRow = parseStatRow(input.mainStatText);
  const mainStatLabel = mainRow ? (normalizeStatLabel(mainRow.rawLabel) ?? mainRow.rawLabel) : "";
  const mainStatLegal = Boolean(
    cost && mainStatLabel && statsTable[cost]?.[verboseStatLabelMap[mainStatLabel] ?? ""],
  );

  const resolvedSubstats = input.substatTexts.map((text) => {
    const row = parseStatRow(text);
    if (!row) return null;
    const label = normalizeStatLabel(row.rawLabel) ?? row.rawLabel;
    return { label, ...resolveSubstatValue(label, row.rawValue) };
  });

  const substats: ParsedSubstat[] = resolvedSubstats.map((resolved) =>
    resolved ? { subStat: resolved.label, subStatValue: resolved.formatted } : { subStat: "", subStatValue: "" },
  );

  const substatConfidence: FieldConfidence[] = resolvedSubstats.map((resolved) => {
    if (!resolved) return "high"; // legitimately absent (below-+25 echo) — nothing to flag
    const known = Boolean(
      verboseStatLabelMap[resolved.label] || ["ATK", "DEF", "HP"].includes(resolved.label),
    );
    return known && resolved.exact ? "high" : "low";
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
      name: resolvedEcho ? nameConfidence : "low",
      cost: costConfidence,
      mainStat: mainStatLegal ? "high" : "low",
      set: input.matchedSet ? "high" : "low",
      substats: substatConfidence,
    },
    rawHeaderText: input.headerText,
    rawStatsText: [input.mainStatText, input.secondaryStatText, ...input.substatTexts].join("\n---\n"),
  };
}
