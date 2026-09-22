/**
 * Turns the raw OCR text pulled from the name line and individually-
 * cropped stat rows (layout.ts's NAME_BLOCK / MAIN_STAT_ROW /
 * SECONDARY_STAT_ROW / SUBSTAT_ROWS, plus the SUBSTAT_BLOCK fallback) into
 * a ParsedEchoSlot candidate — the same shape CalculatorEchoParser.vue
 * already emits, so the result can be handed straight to
 * CalculatorEchoImporter.vue's existing mapParsedEchoes →
 * duplicate-review → save pipeline.
 *
 * No cost or level OCR: the app doesn't persist echo level (every scanned
 * echo is treated as max-level, so there's nothing to gain reading "+n"),
 * and cost is derived from the resolved echo's own class
 * (getCostByClass) — the same fallback CalculatorEchoParser.vue already
 * has for when its own cost OCR misses, just always taken here instead of
 * only as a fallback.
 *
 * Echo identification deliberately mirrors CalculatorEchoParser.vue's
 * proven approach instead of doing OCR-name-vs-everything matching alone:
 * narrow mainEchoesData by the already-matched set icon (matchSetFirst,
 * called by the caller/useEchoScanner.ts — this module stays string-only,
 * no image matching here), the same way that flow's `filteredEchoKeys`
 * narrowing does (minus its cost half, which this scanner doesn't read).
 * A set alone often narrows to one echo; when it narrows to several,
 * Levenshtein name-text matching breaks the tie within that pool instead
 * of guessing against the full ~150-echo list. See docs/scanner.md.
 */
import { mainEchoesData, getEchoData, getCostByClass, type Echo } from "../echoes/index";
import { statsTable, subStatsTable, verboseStatLabelMap } from "../echoes/stats";
import { getSubstatType, getSubstatValue } from "../echoes/parsedEchoMapping";
import { levenshteinSimilarity } from "./levenshtein";
import type { FieldConfidence, ParsedEchoSlot, ParsedSubstat } from "./types";

export const NAME_MATCH_THRESHOLD = 0.68;
/** Loose sanity floor for the "set already narrowed to one echo" case — just enough to catch a set icon that was clearly misread, not to require a strong text match. */
const NAME_SANITY_THRESHOLD = 0.4;
/** How many substats a max-level echo has — the app doesn't track echo level, so every scanned echo is assumed to be at this many. */
const EXPECTED_SUBSTAT_COUNT = 5;

type StatRow = { rawLabel: string; rawValue: string };
type ResolvedRow = { label: string; formatted: string; exact: boolean };

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
 * garbled prefix, most often OCR misreading the small stat-type icon
 * glyph that used to sit at the start of each row's crop as text (e.g.
 * "QQ HP 957" — layout.ts's stat-row crops now exclude that icon
 * entirely, but this stays robust to whatever noise still gets through)
 * or, in the SUBSTAT_BLOCK fallback path, a neighboring row's crop
 * overlap. The true label is always at the *end*, right before the
 * value, so stripping noise word-by-word from the front recovers it.
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

/** Same tolerance normalizeStatLabel uses, but a yes/no check — used by parseStatRow/splitStatBlock to decide whether a candidate row's label looks real enough to accept, or whether to keep scanning further lines. */
function isPlausibleLabel(rawLabel: string): boolean {
  const trimmed = rawLabel.trim();
  if (KNOWN_LABEL_WORDS.includes(trimmed) || trimmed === "DEF Y") return true;
  return normalizeStatLabel(trimmed) !== null;
}

/**
 * Resolves one individually-cropped stat row's OCR text to a {label,
 * value} pair. Mirrors CalculatorEchoParser.vue's per-row crops (5
 * separate substat crops there too) rather than asking tesseract to
 * segment a multi-line block itself.
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
 * never reached. This keeps scanning past a match whose label doesn't
 * actually look like a stat name (isPlausibleLabel), only falling back to
 * the first match found if nothing in the crop ever looks plausible.
 *
 * When a per-row crop still can't recover all 5 substats (most often a
 * wrap having shifted rows below it by an amount this fixed-position crop
 * didn't anticipate), parseEchoCandidate falls back to splitStatBlock
 * against a wider SUBSTAT_BLOCK crop instead of trusting an incomplete
 * per-row result.
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

/**
 * The fallback pass: extracts as many {label, value} rows as it can find
 * from one wide multi-line block (SUBSTAT_BLOCK), used only when the 5
 * individual per-row crops don't add up to all 5 substats. This is
 * essentially parseStatRow generalized to keep going after a match instead
 * of stopping at the first one — same plausibility gate, so a block that
 * happens to contain noise doesn't get an implausible "row" counted.
 */
export function splitStatBlock(rawText: string): StatRow[] {
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
      const row: StatRow = { rawLabel: match[1].trim(), rawValue: match[2].trim() };
      if (isPlausibleLabel(row.rawLabel)) {
        rows.push(row);
        pendingLabel = "";
        continue;
      }
      // Doesn't look real yet — could be noise ahead of the next line's
      // actual content (or a wrapped label's first line) — keep going.
      pendingLabel = candidate;
      continue;
    }
    pendingLabel = candidate;
  }
  return rows;
}

/**
 * NAME_BLOCK is a single line by design (WuWa shrinks the font for a long
 * name rather than wrapping it) and contains nothing else — unlike the
 * old multi-purpose header crop (name + level + cost), there's no other
 * line shape to distinguish this from, so any non-blank text here is the
 * name. No minimum-letter-count gate: that check (inherited from the old
 * header parser, which used it to tell a name line apart from a "+25" or
 * "COST 4" line) wrongly rejected legitimately short/accented names like
 * "Jué" (only 2 plain-ASCII letters).
 */
export function parseNameText(rawText: string): string | null {
  const line = rawText
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!line) return null;
  const cleaned = line.replace(/[|_]/g, "").trim();
  // Require at least one letter (any script) so pure OCR noise ("12",
  // stray punctuation) doesn't get treated as a name — but nothing
  // stricter than that, unlike the old 3-plain-ASCII-letter gate.
  return /\p{L}/u.test(cleaned) ? cleaned : null;
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

/** Kept as the fallback path for when set-based narrowing (see parseEchoCandidate) comes up empty — matches by name against every echo, unfiltered. */
export function matchEchoName(rawName: string): EchoNameMatch | null {
  return bestNameMatch(rawName, Object.values(mainEchoesData ?? {}));
}

function narrowEchoCandidates(matchedSet: string | null): Echo[] {
  const all = Object.values(mainEchoesData ?? {});
  if (!matchedSet) return all;
  return all.filter((echo) => echo.sets?.includes(matchedSet));
}

/**
 * Identifies the echo the same way CalculatorEchoParser.vue's flow does —
 * narrow by the matched set first, only fall back to full-list name
 * matching when that narrowing can't be trusted. See this module's top
 * doc comment.
 */
function resolveEcho(
  headerName: string | null,
  matchedSet: string | null,
): { echo: string | null; confidence: FieldConfidence } {
  const pool = narrowEchoCandidates(matchedSet);

  if (matchedSet && pool.length === 1) {
    const only = pool[0];
    const similarity = headerName ? levenshteinSimilarity(normalize(headerName), normalize(only.name)) : null;
    // No name text to sanity-check against, or it's at least a loose match: trust the set narrowing.
    const trusted = similarity === null || similarity >= NAME_SANITY_THRESHOLD;
    return { echo: only.key, confidence: trusted ? "high" : "low" };
  }

  if (matchedSet && pool.length > 1) {
    const match = headerName ? bestNameMatch(headerName, pool) : null;
    if (match && match.similarity >= NAME_MATCH_THRESHOLD) {
      return { echo: match.key, confidence: "high" };
    }
    return { echo: null, confidence: "low" };
  }

  // No set match at all — the set read was probably wrong. Fall back to
  // matching by name against every echo.
  const fallback = headerName ? matchEchoName(headerName) : null;
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
function resolveSubstatValue(rawLabel: string, rawValue: string): { formatted: string; exact: boolean } {
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

function resolveRow(row: StatRow): ResolvedRow {
  const label = normalizeStatLabel(row.rawLabel) ?? row.rawLabel;
  return { label, ...resolveSubstatValue(label, row.rawValue) };
}

export type ParseCandidateResult = {
  slot: ParsedEchoSlot;
  needsMainStatSelection: boolean;
  /** True when the per-row substat crops came up short and SUBSTAT_BLOCK's wider fallback pass was used instead. */
  usedSubstatBlockFallback: boolean;
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
  nameText: string;
  mainStatText: string;
  secondaryStatText: string;
  /** Up to 5, in panel order. A slot's text can be empty/unparseable when the per-row pass misses it — usedSubstatBlockFallback then reports whether substatBlockText recovered it. */
  substatTexts: string[];
  /** SUBSTAT_BLOCK's OCR text — only consulted if the per-row pass doesn't add up to EXPECTED_SUBSTAT_COUNT. Optional so callers that skip the fallback OCR call entirely (nothing to gain if the per-row pass already got everything) don't need to pass anything. */
  substatBlockText?: string;
  matchedSet: string | null;
}): ParseCandidateResult {
  const name = parseNameText(input.nameText);
  const { echo: resolvedEcho, confidence: nameConfidence } = resolveEcho(name, input.matchedSet);
  const cost = resolvedEcho ? getCostByClass(getEchoData(resolvedEcho).class) : null;

  const mainRow = parseStatRow(input.mainStatText);
  const mainStatLabel = mainRow ? (normalizeStatLabel(mainRow.rawLabel) ?? mainRow.rawLabel) : "";
  const mainStatLegal = Boolean(
    cost && mainStatLabel && statsTable[cost]?.[verboseStatLabelMap[mainStatLabel] ?? ""],
  );

  let resolvedSubstats: (ResolvedRow | null)[] = input.substatTexts.map((text) => {
    const row = parseStatRow(text);
    return row ? resolveRow(row) : null;
  });
  let usedSubstatBlockFallback = false;

  const perRowCount = resolvedSubstats.filter(Boolean).length;
  if (perRowCount < EXPECTED_SUBSTAT_COUNT && input.substatBlockText) {
    const blockRows = splitStatBlock(input.substatBlockText).slice(0, EXPECTED_SUBSTAT_COUNT);
    if (blockRows.length > perRowCount) {
      const blockResolved: (ResolvedRow | null)[] = blockRows.map(resolveRow);
      while (blockResolved.length < EXPECTED_SUBSTAT_COUNT) blockResolved.push(null);
      resolvedSubstats = blockResolved;
      usedSubstatBlockFallback = true;
    }
  }

  const substats: ParsedSubstat[] = resolvedSubstats.map((resolved) =>
    resolved ? { subStat: resolved.label, subStatValue: resolved.formatted } : { subStat: "", subStatValue: "" },
  );

  const substatConfidence: FieldConfidence[] = resolvedSubstats.map((resolved) => {
    if (!resolved) return "low"; // max level is assumed for every echo now, so a missing slot is a miss, not a legitimately-absent row
    const known = Boolean(verboseStatLabelMap[resolved.label] || ["ATK", "DEF", "HP"].includes(resolved.label));
    return known && resolved.exact ? "high" : "low";
  });

  const needsMainStatSelection = !mainRow || !mainStatLabel;
  const costConfidence: FieldConfidence = resolvedEcho ? nameConfidence : "low";

  return {
    slot: {
      cost,
      mainStatLabel,
      substats,
      echo: resolvedEcho,
      set: input.matchedSet,
    },
    needsMainStatSelection,
    usedSubstatBlockFallback,
    confidence: {
      name: resolvedEcho ? nameConfidence : "low",
      cost: costConfidence,
      mainStat: mainStatLegal ? "high" : "low",
      set: input.matchedSet ? "high" : "low",
      substats: substatConfidence,
    },
    rawHeaderText: input.nameText,
    rawStatsText: [input.mainStatText, input.secondaryStatText, ...input.substatTexts].join("\n---\n"),
  };
}
