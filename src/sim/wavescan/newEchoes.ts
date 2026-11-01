// Wuthering Tools+ — "add only new echoes" from a Wavescan file. Pure (no Vue, no stores): the review panel
// (WavescanNewEchoes.vue) feeds it Ryan's mapped scan rows and the inventory, and saves `toAdd` itself.
//
// Upstream's planner (`planWavescanEchoImport`) matches exact echo names. Since Ryan #594 the app lists Phantom skins
// ("Phantom: Sigillum") as their own echoes, while older inventories store them under the base echo, so a full scan
// re-adds every skin. Here an echo's identity is the app's duplicate rule (`getEchoIdentityKey`: echo, set, cost,
// rarity, main stat, the five substat type/value pairs in order) with the echo read as its base, both ways. Two looser
// passes then catch the same echo stored a little differently (README "WaveScan: add only new echoes").
import { mainEchoesData } from "../../echoes";
import { echoSetLabelMap, subStatLabelMap } from "../../echoes/stats";
import { getEchoIdentityKey } from "../../utils/echoIdentity";

/** Any inventory-shaped echo: Ryan's mapped scan rows and the stored inventory rows (loosely typed). */
export type EchoRow = Parameters<typeof getEchoIdentityKey>[0] & { echoId: string };

/**
 * How a scanned echo matched one you own:
 * - `exact`: the app's duplicate rule, with a Phantom skin read as its base echo;
 * - `order`: the same five substats with the same values, listed in another order (fully rolled echoes only);
 * - `rarity`: as `order`, but the inventory has another rarity (a typo: the rolls are the same; fully rolled only).
 */
export type MatchKind = "exact" | "order" | "rarity";

export interface OwnedMatch<S extends EchoRow, I extends EchoRow> {
  scanned: S;
  owned: I;
  kind: MatchKind;
  /** One side is the Phantom skin and the other the base echo. */
  skinDiffers: boolean;
}

export interface NewEchoesPlan<S extends EchoRow, I extends EchoRow> {
  /** Scanned echoes you don't have yet, in file order. */
  toAdd: S[];
  /** Scanned echoes matched to one inventory echo each (copies counted), in file order. */
  owned: OwnedMatch<S, I>[];
  /** Inventory echoes no scanned echo matched: fed, sold, or not scanned. Never deleted. */
  notInScan: I[];
}

type Registry = Record<string, { name: string; class: string }>;
const REGISTRY = mainEchoesData as unknown as Registry;
const SKIN_PREFIX = /^Phantom:\s*/i;
const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

let skinBases: Map<string, string> | null = null;

/**
 * Phantom skin key → its base echo key. The base is `Phantom<X>` → `<X>` when that echo exists with the same class;
 * else the one other echo of the same class whose name, without a "Word:" prefix, is the skin's name
 * ("Phantom: Kronaclaw" → "Reminiscence: Kronaclaw"). A skin with no such echo is its own base.
 */
function skinBaseMap(registry: Registry = REGISTRY): Map<string, string> {
  const map = new Map<string, string>();
  const plain = Object.entries(registry).filter(([, echo]) => !SKIN_PREFIX.test(echo.name));
  for (const [key, echo] of Object.entries(registry)) {
    if (!SKIN_PREFIX.test(echo.name)) continue;
    const stripped = key.replace(/^Phantom/, "");
    if (stripped !== key && registry[stripped] && registry[stripped].class === echo.class && !SKIN_PREFIX.test(registry[stripped].name)) {
      map.set(key, stripped);
      continue;
    }
    const wanted = norm(echo.name.replace(SKIN_PREFIX, ""));
    const byName = plain.filter(
      ([, other]) => other.class === echo.class && (norm(other.name) === wanted || norm(other.name.replace(/^[^:]+:\s*/, "")) === wanted),
    );
    if (byName.length === 1) map.set(key, byName[0]![0]);
  }
  return map;
}

/** The echo a key plays as: a Phantom skin's base echo, else the key itself. */
export function skinBaseOf(echoKey: string): string {
  skinBases ??= skinBaseMap();
  return skinBases.get(echoKey) ?? echoKey;
}

/** For tests: the skin map of a hand-made registry. */
export const skinBaseMapOf = (registry: Registry): Map<string, string> => skinBaseMap(registry);

const SLOTS = [1, 2, 3, 4, 5] as const;
const field = (echo: EchoRow, name: string): string => String((echo as Record<string, unknown>)[name] ?? "");
const pairsOf = (echo: EchoRow): string[] =>
  SLOTS.map((i) => `${field(echo, `echoSubStatsType${i}`)}=${field(echo, `echoSubStatsValue${i}`)}`);
const baseOf = (echo: EchoRow): string => skinBaseOf(String(echo.echo ?? ""));

// The loose passes only pair echoes with all five substats rolled: five equal values are the same echo in practice,
// but an unleveled or half-leveled echo with the same few rolls (or none) can be another copy, and a 4★ never has five
// substats, so a 5★ with no substats yet is not a 4★ "typo".
const fullyRolled = (echo: EchoRow): boolean => SLOTS.every((i) => field(echo, `echoSubStatsType${i}`) !== "");
const exactKey = (echo: EchoRow): string => getEchoIdentityKey({ ...echo, echo: baseOf(echo) });
const orderKey = (echo: EchoRow): string | null =>
  fullyRolled(echo)
    ? [baseOf(echo), field(echo, "echoSet"), field(echo, "type"), field(echo, "rank"), field(echo, "stat"), ...pairsOf(echo).sort()].join(":")
    : null;
const rarityKey = (echo: EchoRow): string | null =>
  fullyRolled(echo) ? [baseOf(echo), field(echo, "echoSet"), field(echo, "type"), field(echo, "stat"), ...pairsOf(echo).sort()].join(":") : null;

// Strictest first: a pass only sees what the earlier ones left on both sides. A null key never matches.
const PASSES: Array<[MatchKind, (echo: EchoRow) => string | null]> = [
  ["exact", exactKey],
  ["order", orderKey],
  ["rarity", rarityKey],
];

/**
 * Which scanned echoes are new. Copies are counted the way upstream's planner counts them (a multiset): two
 * identical scanned copies against one owned copy add one. Each pass pairs scanned and owned echoes by its key in
 * file / inventory order, then hands the unpaired ones to the next pass.
 */
export function planNewEchoes<S extends EchoRow, I extends EchoRow>(scanned: readonly S[], inventory: readonly I[]): NewEchoesPlan<S, I> {
  let pending = scanned.map((echo, index) => ({ echo, index }));
  let free = inventory.map((echo, index) => ({ echo, index }));
  const owned: Array<OwnedMatch<S, I> & { index: number }> = [];

  for (const [kind, keyOf] of PASSES) {
    if (!pending.length || !free.length) break;
    const pool = new Map<string, Array<{ echo: I; index: number }>>();
    for (const entry of free) {
      const key = keyOf(entry.echo);
      if (key === null) continue;
      const list = pool.get(key);
      if (list) list.push(entry);
      else pool.set(key, [entry]);
    }
    const taken = new Set<number>();
    const still: typeof pending = [];
    for (const entry of pending) {
      const key = keyOf(entry.echo);
      const match = key === null ? undefined : pool.get(key)?.shift();
      if (!match) {
        still.push(entry);
        continue;
      }
      taken.add(match.index);
      owned.push({ scanned: entry.echo, owned: match.echo, kind, skinDiffers: String(entry.echo.echo) !== String(match.echo.echo), index: entry.index });
    }
    pending = still;
    free = free.filter((entry) => !taken.has(entry.index));
  }

  owned.sort((a, b) => a.index - b.index);
  return {
    toAdd: pending.map((entry) => entry.echo),
    owned: owned.map(({ index: _index, ...match }) => match),
    notInScan: free.map((entry) => entry.echo),
  };
}

/** Owned matches that upstream's exact-name import would add a second time (a skin stored the other way, or a close match). */
export const secondCopiesUpstreamWouldAdd = (owned: ReadonlyArray<OwnedMatch<EchoRow, EchoRow>>): number =>
  owned.filter((match) => match.kind !== "exact" || match.skinDiffers).length;

// ── display ────────────────────────────────────────────────────────────────────────────────────

export const echoName = (key: string): string => REGISTRY[key]?.name ?? key;
export const isSkin = (key: string): boolean => skinBaseOf(key) !== key;
export const setName = (key: unknown): string => echoSetLabelMap[String(key ?? "")] ?? String(key ?? "");

// The long bonus names, shortened so five substats fit two lines of a phone card (the game's own words, minus
// "Resonance" and "Bonus"); everything else is the app's label.
const SHORT_LABELS: Record<string, string> = {
  BasicAttackDMGBonus: "Basic Attack DMG",
  HeavyAttackDMGBonus: "Heavy Attack DMG",
  ResonanceSkillDMGBonus: "Skill DMG",
  ResonanceLiberationDMGBonus: "Liberation DMG",
};

/** "Crit DMG" for a main stat or substat key ("ATK%" → "ATK": the value carries the %). */
export function statName(key: unknown): string {
  const k = String(key ?? "");
  const label = SHORT_LABELS[k] ?? subStatLabelMap[k] ?? k;
  return label.replace(/%$/, "");
}

/** The substats as labelled values: `{ label: "Crit Rate", value: "8.1%" }`, `{ label: "ATK", value: "40" }`. */
export function substatsOf(echo: EchoRow): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  for (const i of SLOTS) {
    const type = field(echo, `echoSubStatsType${i}`);
    const value = field(echo, `echoSubStatsValue${i}`);
    if (!type) continue;
    out.push({ label: statName(type), value: type.endsWith("_FLAT") ? value : `${value}%` });
  }
  return out;
}

/** Why an owned match isn't exact, in a sentence; null for an exact match of the same name. */
export function matchNote(match: OwnedMatch<EchoRow, EchoRow>): string | null {
  const parts: string[] = [];
  if (match.skinDiffers) {
    parts.push(
      isSkin(String(match.scanned.echo))
        ? "Scanned as the Phantom skin; your inventory has it under the base echo."
        : "Your inventory has it as the Phantom skin.",
    );
  }
  if (match.kind === "order") parts.push("Your inventory lists the same substats in another order.");
  if (match.kind === "rarity") {
    parts.push(`Same rolls, but your inventory says ${field(match.owned, "rank")}★ and the scan says ${field(match.scanned, "rank")}★.`);
  }
  return parts.length ? parts.join(" ") : null;
}

/** One row of the review lists. */
export interface ReviewRow {
  key: string;
  echo: EchoRow;
  /** why a match isn't exact, or null */
  note: string | null;
  /** who wears it, in a sentence, or null */
  worn: string | null;
}

export interface EchoGroup<T> {
  /** The base echo's key (a skin's rows sit under it). */
  base: string;
  name: string;
  cost: number;
  items: T[];
}

/** Rows grouped under their base echo, highest cost first, then by name; rows keep their order. */
export function groupByBaseEcho<T>(items: readonly T[], echoOf: (item: T) => EchoRow): EchoGroup<T>[] {
  const groups = new Map<string, EchoGroup<T>>();
  for (const item of items) {
    const echo = echoOf(item);
    const base = baseOf(echo);
    let group = groups.get(base);
    if (!group) {
      group = { base, name: echoName(base), cost: Number(echo.type) || 0, items: [] };
      groups.set(base, group);
    }
    group.items.push(item);
  }
  return [...groups.values()].sort((a, b) => b.cost - a.cost || a.name.localeCompare(b.name));
}
