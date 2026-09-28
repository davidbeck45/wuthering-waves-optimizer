/**
 * Pure fuzzy-matching engine for the rotation builder's quick-add input and
 * "paste import" feature (Rotation Flow, ADR 0015).
 *
 * Given free-form pasted text (one action per line, optionally with a
 * trailing count suffix like "x2"), matches each line against a character's
 * real list of available actions. No Vue/DOM/Pinia — safe to unit test in
 * isolation and reuse from workers if needed later.
 */

export interface MatchableAction {
  key: string;
  label: string;
  /**
   * Attack type, e.g. "intro", "skill", "forteCircuit" (case-insensitive).
   * Used for bucketing *and* matching: typing a type alias ("int", "lib",
   * "forte") finds that type's attacks even when their labels don't say it.
   */
  group?: string;
}

export interface MatchCandidate {
  key: string;
  label: string;
  group?: string;
  score: number; // 0..1
  /** Whether the winning score came from the label text or the type alias. */
  matchedBy: "label" | "group";
}

export interface CandidateGroup {
  group: string | undefined;
  items: MatchCandidate[];
}

export type LineMatchStatus = "matched" | "ambiguous" | "unmatched";

export interface LineMatchResult {
  raw: string; // original pasted line, with only a trailing newline stripped
  text: string; // the line with any trailing count suffix stripped and trimmed
  count: number; // parsed count multiplier, default 1
  status: LineMatchStatus;
  // best-first. "matched" -> [top]. "ambiguous" -> the close cluster (2-3).
  // "unmatched" -> always empty (see matchActionLine for rationale).
  candidates: MatchCandidate[];
}

/** Candidates scoring below this are treated as unrelated noise. */
const UNMATCHED_SCORE_THRESHOLD = 0.35;
/** A candidate within this many points of the top score joins its "close cluster". */
const AMBIGUOUS_SCORE_WINDOW = 0.12;
/** Cluster members must also clear this absolute floor to count as a real contender. */
const AMBIGUOUS_SCORE_FLOOR = 0.5;
/** Ambiguous clusters are capped to this many candidates for display. */
const MAX_AMBIGUOUS_CANDIDATES = 3;

/** Type-alias scores: below exact (1.0) / prefix (0.85) label hits, above substring (0.6). */
const GROUP_EXACT_SCORE = 0.8;
const GROUP_PREFIX_SCORE = 0.7;
/** Minimum query length before a partial type alias ("in" -> "intro") counts. */
const GROUP_PREFIX_MIN_LENGTH = 2;

/**
 * Words players use for each attack type, keyed by the lowercased short
 * action-type key (`useCharacterActionList` emits "forteCircuit", etc.).
 * No single-letter aliases — they'd match nearly everything.
 */
const GROUP_ALIASES: Record<string, string[]> = {
  intro: ["intro", "intro skill", "qte"],
  outro: ["outro", "outro skill"],
  skill: ["skill", "resonance skill"],
  liberation: ["liberation", "resonance liberation", "lib", "ult"],
  fortecircuit: ["forte", "forte circuit", "fc"],
  basic: ["basic", "basic attack", "normal attack"],
  tunebreak: ["tune break", "tune"],
};

/** Every alias, longest first, paired with its group — for "<type> <text>" scoping. */
const ALIASES_LONGEST_FIRST: Array<{ alias: string; group: string }> = Object.entries(GROUP_ALIASES)
  .flatMap(([group, aliases]) => aliases.map((alias) => ({ alias, group })))
  .sort((a, b) => b.alias.length - a.alias.length);

/** Game order for bucketing ties (e.g. browse mode, where every score is 0). */
const GROUP_ORDER = ["intro", "basic", "skill", "fortecircuit", "liberation", "outro", "tunebreak"];

const GROUP_DISPLAY_LABELS: Record<string, string> = {
  basic: "Basic",
  skill: "Skill",
  fortecircuit: "Forte Circuit",
  liberation: "Liberation",
  intro: "Intro",
  outro: "Outro",
  tunebreak: "Tune Break",
};

function groupId(group: string | undefined): string {
  return (group ?? "").toLowerCase();
}

/** Display label for an action type key ("forteCircuit" -> "Forte Circuit"). */
export function formatActionGroup(group: string | undefined): string {
  if (!group) return "";
  return GROUP_DISPLAY_LABELS[groupId(group)] ?? group;
}

/** Matches a trailing count suffix like "x2", "×2", "*3" (case-insensitive, optional surrounding whitespace). */
const COUNT_SUFFIX_RE = /\s*[x×*]\s*(\d+)\s*$/i;

/**
 * Splits a raw pasted line into its action text and count multiplier.
 * "Heavy Attack x2" -> { text: "Heavy Attack", count: 2 }
 * "Heavy Attack" -> { text: "Heavy Attack", count: 1 }
 */
export function parseActionLine(rawLine: string): { text: string; count: number } {
  const trimmed = rawLine.trim();
  const match = trimmed.match(COUNT_SUFFIX_RE);

  if (!match) {
    return { text: trimmed, count: 1 };
  }

  const parsedCount = parseInt(match[1], 10);
  const text = trimmed.slice(0, match.index).trim();
  const count = Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 1;

  return { text, count };
}

/** Lowercases, collapses all non-alphanumeric runs to single spaces, and trims. */
export function normalize(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Builds the multiset (frequency map) of adjacent-character bigrams for a string. */
function bigramCounts(input: string): Map<string, number> {
  const counts = new Map<string, number>();

  for (let i = 0; i < input.length - 1; i++) {
    const bigram = input.slice(i, i + 2);
    counts.set(bigram, (counts.get(bigram) ?? 0) + 1);
  }

  return counts;
}

/**
 * Sørensen–Dice coefficient over adjacent-character bigram multisets.
 * Uses a frequency-map intersection so repeated bigrams are counted correctly
 * (not a plain set intersection). Returns 0 if either string has fewer than
 * 2 characters, since there are no bigrams to compare.
 */
function bigramDiceCoefficient(a: string, b: string): number {
  if (a.length < 2 || b.length < 2) {
    return 0;
  }

  const countsA = bigramCounts(a);
  const countsB = bigramCounts(b);

  let overlap = 0;
  for (const [bigram, countA] of countsA) {
    const countB = countsB.get(bigram);
    if (countB) {
      overlap += Math.min(countA, countB);
    }
  }

  const totalBigrams = (a.length - 1) + (b.length - 1);
  if (totalBigrams === 0) {
    return 0;
  }

  return (2 * overlap) / totalBigrams;
}

/**
 * Scores a raw query against a raw label, 0..1. See module docs / spec for
 * the tier breakdown: exact (1.0) > prefix (0.85) > all-tokens-present
 * (0.72) > substring (0.6) > bigram Dice fallback (scaled by 0.55).
 */
function scoreMatch(query: string, label: string): number {
  const normalizedQuery = normalize(query);
  const normalizedLabel = normalize(label);

  if (!normalizedQuery) {
    return 0;
  }

  if (normalizedQuery === normalizedLabel) {
    return 1.0;
  }

  if (normalizedLabel.startsWith(normalizedQuery)) {
    return 0.85;
  }

  const queryTokens = normalizedQuery.split(" ").filter(Boolean);
  const labelTokens = new Set(normalizedLabel.split(" ").filter(Boolean));
  if (queryTokens.length > 0 && queryTokens.every((token) => labelTokens.has(token))) {
    return 0.72;
  }

  if (normalizedLabel.includes(normalizedQuery)) {
    return 0.6;
  }

  return bigramDiceCoefficient(normalizedQuery, normalizedLabel) * 0.55;
}

/**
 * Scores a query against an action's type aliases: exact alias -> 0.8,
 * a partial alias ("int" for "intro") -> 0.7, otherwise 0.
 */
function scoreGroupMatch(query: string, group: string | undefined): number {
  const aliases = GROUP_ALIASES[groupId(group)];
  const normalizedQuery = normalize(query);
  if (!aliases || !normalizedQuery) {
    return 0;
  }

  if (aliases.includes(normalizedQuery)) {
    return GROUP_EXACT_SCORE;
  }

  if (
    normalizedQuery.length >= GROUP_PREFIX_MIN_LENGTH &&
    aliases.some((alias) => alias.startsWith(normalizedQuery))
  ) {
    return GROUP_PREFIX_SCORE;
  }

  return 0;
}

/**
 * Splits a "<type alias> <text>" query (e.g. "lib horizon", "skill: anchors")
 * into the aliased group and the remaining text. The longest alias wins, so
 * "intro skill foo" scopes to intro with "foo" rather than "skill foo".
 * Returns null when the query doesn't start with an alias or has no rest.
 */
function splitTypePrefix(query: string): { group: string; rest: string } | null {
  const normalizedQuery = normalize(query);
  for (const { alias, group } of ALIASES_LONGEST_FIRST) {
    if (normalizedQuery.startsWith(alias + " ")) {
      const rest = normalizedQuery.slice(alias.length + 1).trim();
      if (rest) {
        return { group, rest };
      }
    }
  }
  return null;
}

/**
 * Scores `query` against every provided action's label and type and returns
 * all of them, sorted best-first. Never drops any input action — callers
 * filter by score/threshold as needed. Ties preserve input order (stable sort).
 */
export function rankActionMatches(query: string, actions: MatchableAction[]): MatchCandidate[] {
  const typePrefix = splitTypePrefix(query);

  return actions
    .map((action, index) => {
      let labelScore = scoreMatch(query, action.label);
      if (typePrefix && typePrefix.group === groupId(action.group)) {
        const scopedScore = scoreMatch(typePrefix.rest, action.label);
        if (scopedScore > 0) {
          labelScore = Math.max(labelScore, Math.min(1, scopedScore * 0.95 + 0.05));
        }
      }
      const groupScore = scoreGroupMatch(query, action.group);
      const matchedBy: MatchCandidate["matchedBy"] = groupScore > labelScore ? "group" : "label";

      return {
        candidate: {
          key: action.key,
          label: action.label,
          group: action.group,
          score: Math.max(labelScore, groupScore),
          matchedBy,
        },
        index,
      };
    })
    .sort((a, b) => {
      const scoreDiff = b.candidate.score - a.candidate.score;
      if (scoreDiff !== 0) {
        return scoreDiff;
      }
      return a.index - b.index; // stable: preserve input order on ties
    })
    .map((entry) => entry.candidate);
}

/**
 * Buckets ranked candidates by action type. Buckets are ordered by their best
 * score (ties fall back to game order: intro, basic, skill, forte circuit,
 * liberation, outro, tune break); items keep their incoming (ranked) order.
 * `perGroup` caps each bucket and `total` caps the whole list, filled
 * bucket-by-bucket in display order.
 */
export function groupCandidates(
  candidates: MatchCandidate[],
  { perGroup = Infinity, total = Infinity }: { perGroup?: number; total?: number } = {},
): CandidateGroup[] {
  const byGroup = new Map<string, CandidateGroup>();
  for (const candidate of candidates) {
    const id = groupId(candidate.group);
    let bucket = byGroup.get(id);
    if (!bucket) {
      bucket = { group: candidate.group, items: [] };
      byGroup.set(id, bucket);
    }
    bucket.items.push(candidate);
  }

  const orderOf = (group: string | undefined) => {
    const index = GROUP_ORDER.indexOf(groupId(group));
    return index === -1 ? GROUP_ORDER.length : index;
  };
  const bestScore = (bucket: CandidateGroup) => Math.max(...bucket.items.map((c) => c.score));

  const ordered = [...byGroup.values()].sort(
    (a, b) => bestScore(b) - bestScore(a) || orderOf(a.group) - orderOf(b.group),
  );

  const out: CandidateGroup[] = [];
  let remaining = total;
  for (const bucket of ordered) {
    if (remaining <= 0) break;
    const items = bucket.items.slice(0, Math.min(perGroup, remaining));
    remaining -= items.length;
    out.push({ group: bucket.group, items });
  }
  return out;
}

/**
 * Parses and matches a single pasted line against the given actions.
 *
 * Classification:
 * - Zero actions, or the top score is below the unmatched threshold ->
 *   "unmatched" with no candidates (low-confidence junk isn't worth showing).
 * - Otherwise, candidates within AMBIGUOUS_SCORE_WINDOW of the top score
 *   (and at/above AMBIGUOUS_SCORE_FLOOR) form a "close cluster". If that
 *   cluster has 2+ members -> "ambiguous", capped at the top 3.
 * - Otherwise -> "matched", with just the top candidate.
 */
export function matchActionLine(rawLine: string, actions: MatchableAction[]): LineMatchResult {
  const raw = rawLine.replace(/(\r\n|\r|\n)$/, "");
  const { text, count } = parseActionLine(raw);
  const ranked = rankActionMatches(text, actions);
  const top = ranked[0];

  if (!top || top.score < UNMATCHED_SCORE_THRESHOLD) {
    return { raw, text, count, status: "unmatched", candidates: [] };
  }

  const closeCluster = ranked.filter(
    (candidate) =>
      candidate.score >= top.score - AMBIGUOUS_SCORE_WINDOW && candidate.score >= AMBIGUOUS_SCORE_FLOOR,
  );

  if (closeCluster.length >= 2) {
    return {
      raw,
      text,
      count,
      status: "ambiguous",
      candidates: closeCluster.slice(0, MAX_AMBIGUOUS_CANDIDATES),
    };
  }

  return { raw, text, count, status: "matched", candidates: [top] };
}

/**
 * Splits pasted multi-line text into per-line match results. Blank lines
 * (empty after trim) are skipped entirely and never appear in the output.
 */
export function matchActionLines(text: string, actions: MatchableAction[]): LineMatchResult[] {
  return text
    .split("\n")
    .filter((line) => line.trim().length > 0)
    .map((line) => matchActionLine(line, actions));
}
