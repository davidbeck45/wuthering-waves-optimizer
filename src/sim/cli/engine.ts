// Wuthering Tools+ CLI — the app's own engine, headless. Every number comes from the same functions
// the pages call (buildCharacterCalculationContext → calcDamages / calcCharacterRotationDamage /
// calcTeamRotationDamage / rankRoster), so the CLI's numbers are the site's numbers at this commit.
// Pure/async: no Vue, no stores; input is a parsed export (exportFile.ts).
import {
  buildCharacterCalculationContext,
  resolveTeamEnemyConfig,
  type TeamEnemyConfig,
} from "../../calculator/buildCharacterContext";
import { calcDamages } from "../../calculator/attacks";
import { calcCharacterRotationDamage } from "../../calculator/characterRotation";
import { calcRotationDps, calcTeamRotationDamage } from "../../calculator/teamRotation";
import { displayInt, displayPercentage } from "../../utils/numbers";
import { rankRoster, type RosterRanking } from "../myRankings/rankRoster";
import { resolveTeamCharacters, type SlotResolution } from "../teamContext/resolveTeam";
import type { ExportFile } from "./exportFile";

/** The stat cards of the calculator page, in its order; `selector` = the Cypress class the golden fixtures assert on. */
export const STAT_ROWS: ReadonlyArray<{ selector: string; key: string; label: string; kind: "int" | "pct100" | "pct" }> = [
  { selector: "stat-hp", key: "totalHp", label: "HP", kind: "int" },
  { selector: "stat-atk", key: "totalAtk", label: "ATK", kind: "int" },
  { selector: "stat-def", key: "totalDef", label: "DEF", kind: "int" },
  { selector: "stat-cr", key: "totalCritRate", label: "Crit Rate", kind: "pct100" },
  { selector: "stat-cd", key: "totalCritDMG", label: "Crit DMG", kind: "pct100" },
  { selector: "stat-er", key: "energyRegen", label: "Energy Regen", kind: "pct100" },
  { selector: "stat-basic", key: "basicAttackDMGBonus", label: "Basic Attack DMG Bonus", kind: "pct" },
  { selector: "stat-heavy", key: "heavyAttackDMGBonus", label: "Heavy Attack DMG Bonus", kind: "pct" },
  { selector: "stat-skill", key: "resonanceSkillDMGBonus", label: "Resonance Skill DMG Bonus", kind: "pct" },
  { selector: "stat-liberation", key: "resonanceLiberationDMGBonus", label: "Resonance Liberation DMG Bonus", kind: "pct" },
  { selector: "stat-glacio", key: "glacio", label: "Glacio DMG Bonus", kind: "pct" },
  { selector: "stat-fusion", key: "fusion", label: "Fusion DMG Bonus", kind: "pct" },
  { selector: "stat-electro", key: "electro", label: "Electro DMG Bonus", kind: "pct" },
  { selector: "stat-aero", key: "aero", label: "Aero DMG Bonus", kind: "pct" },
  { selector: "stat-spectro", key: "spectro", label: "Spectro DMG Bonus", kind: "pct" },
  { selector: "stat-havoc", key: "havoc", label: "Havoc DMG Bonus", kind: "pct" },
  { selector: "stat-healing", key: "healingBonus", label: "Healing Bonus", kind: "pct100" },
];

export interface StatRow {
  selector: string;
  key: string;
  label: string;
  value: number;
  /** formatted exactly as the page shows it */
  display: string;
}
export interface AttackRow {
  group: string;
  key: string | null;
  label: string;
  /** the page's damage-type tag for the row (Basic / Skill / Liberation …), where the engine sets one */
  type: string | null;
  /** hits folded into the numbers (rotation actions); null for the page's plain attack list */
  count: number | null;
  normal: number;
  avg: number;
  crit: number;
  /** healing / shield rows carry their amount here instead of damage */
  healing: number;
  shield: number;
}
export interface RotationRow {
  id: string;
  name: string;
  actions: number;
  duration: number | string | null;
  normal: number;
  avg: number;
  crit: number;
  healing: number;
  shield: number;
  /** average damage per second, when the rotation carries a duration */
  dps: number | null;
  /** one row per action, hit count folded in — what the page lists under the rotation */
  attacks: AttackRow[];
}
export interface CharacterCalc {
  id: string;
  name: string;
  level: string | number;
  weapon: string | null;
  refinement: number | null;
  sequence: number;
  enemy: TeamEnemyConfig;
  stats: StatRow[];
  attacks: AttackRow[];
  rotations: RotationRow[];
}
export interface TeamCalc {
  id: string | null;
  name: string;
  characterIds: Array<string | null>;
  actions: number;
  duration: number | string | null;
  enemy: TeamEnemyConfig;
  normal: number;
  avg: number;
  crit: number;
  healing: number;
  shield: number;
  dps: number | null;
  perCharacter: Record<string, { normal: number; avg: number; crit: number }>;
  /** auto = builds by name + team buffs from the real members; off = each character's own panel */
  buffMode: "auto" | "off";
  slots: SlotResolution[];
}

const num = (value: unknown): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

export function sequenceOf(characterData: Record<string, any> | undefined): number {
  return Object.values(characterData?.resonanceChains ?? {}).filter((node: any) => node?.isEnabled).length;
}

function statRows(finalStats: Record<string, any>): StatRow[] {
  return STAT_ROWS.map(({ selector, key, label, kind }) => {
    const value = num(finalStats?.[key]);
    const display =
      kind === "int" ? displayInt(value) : kind === "pct100" ? displayPercentage(value * 100) : displayPercentage(value);
    return { selector, key, label, value, display };
  });
}

/** One processed attack (processAttacks output: the numbers sit under `damage`, calculateAttackDamage's result). */
function attackRow(group: string, attack: any, withCount: boolean): AttackRow | null {
  if (!attack || typeof attack !== "object" || attack.label == null) return null;
  const damage = attack.damage ?? {};
  return {
    group,
    key: attack.key ?? null,
    label: String(attack.label),
    type: attack.type ?? null,
    count: withCount ? Number(attack.count ?? 1) : null,
    normal: num(damage.totalDamage),
    avg: num(damage.avgDamage),
    crit: num(damage.critDamage),
    healing: num(damage.healAmount),
    shield: num(damage.shieldAmount),
  };
}

/** Every attack row of the calculator page, in its groups (basicAttacks, skillAttacks, …), minus the rotations block. */
function flattenAttacks(allDamages: Record<string, any> | undefined): AttackRow[] {
  const rows: AttackRow[] = [];
  for (const [group, value] of Object.entries(allDamages ?? {})) {
    if (group === "rotations") continue;
    const list: any[] | null = Array.isArray(value) ? value : Array.isArray(value?.attacks) ? value.attacks : null;
    if (!list) continue;
    for (const attack of list) {
      const row = attackRow(group, attack, false);
      if (row) rows.push(row);
    }
  }
  return rows;
}

/** A character key from the export: exact, case-insensitive, or a unique substring ("xuanling" → YangyangXuanling). */
export function resolveCharacterKey(input: string, characters: Record<string, any>): string {
  const keys = Object.keys(characters);
  if (keys.includes(input)) return input;
  const needle = input.toLowerCase().replace(/[^a-z0-9]/g, "");
  const exact = keys.filter((k) => k.toLowerCase() === needle);
  if (exact.length === 1) return exact[0];
  const partial = keys.filter((k) => k.toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`Ambiguous character "${input}": ${partial.sort().join(", ")}`);
  throw new Error(`No character "${input}" in this export. Set up: ${keys.sort().join(", ") || "(none)"}`);
}

export async function calcCharacter(
  id: string,
  exp: ExportFile,
  options: { attacks?: boolean; rotations?: boolean } = {},
): Promise<CharacterCalc> {
  const characters = exp.characters;
  const data = characters[id];
  if (!data) throw new Error(`Character ${id} is not set up in this export`);
  const enemy = resolveTeamEnemyConfig(data);
  const echoes = exp.inventory.echoes;
  const built = await buildCharacterCalculationContext(id, characters, enemy, echoes);
  const weapon: string | null = data.weapon ?? null;
  const result: CharacterCalc = {
    id,
    name: built.chosenChar?.basic?.name ?? id,
    level: built.characterLevel,
    weapon,
    refinement: weapon ? Number(data.weapons?.[weapon]?.refinement ?? 1) : null,
    sequence: sequenceOf(data),
    enemy,
    stats: statRows(built.finalStats),
    attacks: [],
    rotations: [],
  };
  if (options.attacks !== false) result.attacks = flattenAttacks(calcDamages(built.context));
  if (options.rotations !== false) {
    for (const rotation of (data.rotations ?? []) as any[]) {
      const res = await calcCharacterRotationDamage(
        {
          id: rotation.id,
          name: rotation.name,
          description: rotation.description ?? null,
          duration: rotation.duration ?? null,
          mainEcho: rotation.echo ?? null,
          mainEchoRank: rotation.echoRank ?? null,
          actions: rotation.actions ?? [],
        },
        null,
        id,
        characters,
        enemy,
        echoes,
      );
      const agg = res.damageAggregation;
      result.rotations.push({
        id: rotation.id,
        name: rotation.name,
        actions: (rotation.actions ?? []).length,
        duration: rotation.duration ?? null,
        normal: num(agg.normalDamage),
        avg: num(agg.avgDamage),
        crit: num(agg.critDamage),
        healing: num(agg.healing),
        shield: num(agg.shield),
        dps: rotation.duration ? calcRotationDps(agg, rotation.duration).avg : null,
        attacks: (res.attacks ?? []).map((a: any) => attackRow("rotation", a, true)).filter((r): r is AttackRow => r !== null),
      });
    }
  }
  return result;
}

/** A team from the export by id, name (exact, then case-insensitive, then unique substring) or 1-based index. */
export function findTeam(input: string, teams: any[]): any {
  const byId = teams.find((t) => t.id === input);
  if (byId) return byId;
  const index = Number(input);
  if (Number.isInteger(index) && index >= 1 && index <= teams.length) return teams[index - 1];
  const exact = teams.filter((t) => t.name === input);
  if (exact.length === 1) return exact[0];
  const needle = input.toLowerCase();
  const ci = teams.filter((t) => String(t.name ?? "").toLowerCase() === needle);
  if (ci.length === 1) return ci[0];
  const partial = teams.filter((t) => String(t.name ?? "").toLowerCase().includes(needle));
  if (partial.length === 1) return partial[0];
  if (partial.length > 1) throw new Error(`Ambiguous team "${input}": ${partial.map((t) => t.name).join(" | ")}`);
  throw new Error(`No team "${input}" in this export (${teams.length} teams; \`ww team\` lists them)`);
}

export async function calcTeam(team: any, exp: ExportFile, options: { autoBuffs?: boolean } = {}): Promise<TeamCalc> {
  const enemy = resolveTeamEnemyConfig(team.enemyConfig ?? {});
  const resolution = await resolveTeamCharacters(
    { characterIds: team.characterIds ?? [], buildIds: team.buildIds, enemyConfig: team.enemyConfig },
    exp.characters,
    exp.inventory.echoes,
    { auto: options.autoBuffs ?? true, enemyConfig: enemy },
  );
  const res = await calcTeamRotationDamage(
    {
      name: team.name,
      characterIds: team.characterIds ?? [],
      buildIds: resolution.auto ? resolution.buildIds : team.buildIds,
      actions: team.actions ?? [],
      duration: team.duration ?? null,
    },
    resolution.characters,
    enemy,
    exp.inventory.echoes,
  );
  const perCharacter: TeamCalc["perCharacter"] = {};
  for (const [id, r] of Object.entries(res.perCharacter)) {
    perCharacter[id] = {
      normal: num(r.damageAggregation.normalDamage),
      avg: num(r.damageAggregation.avgDamage),
      crit: num(r.damageAggregation.critDamage),
    };
  }
  return {
    id: team.id ?? null,
    name: team.name ?? "(unnamed team)",
    characterIds: team.characterIds ?? [],
    actions: (team.actions ?? []).length,
    duration: team.duration ?? null,
    enemy,
    normal: num(res.total.normalDamage),
    avg: num(res.total.avgDamage),
    crit: num(res.total.critDamage),
    healing: num(res.total.healing),
    shield: num(res.total.shield),
    dps: team.duration ? res.dps.avg : null,
    perCharacter,
    buffMode: resolution.auto ? "auto" : "off",
    slots: resolution.slots,
  };
}

export function rankExport(exp: ExportFile, options: { investment?: boolean; autoBuffs?: boolean } = {}): Promise<RosterRanking> {
  return rankRoster(exp.characters, exp.inventory.echoes, exp.teams, { investment: options.investment, autoTeamBuffs: options.autoBuffs ?? true, yieldToUi: false });
}

// ── Snapshots: every number that matters, for diffing across upstream syncs ─────────────────────
export interface SnapshotCharacter {
  weapon: string | null;
  sequence: number;
  stats: Record<string, number>;
  rotations: Record<string, { normal: number; avg: number; crit: number }>;
}
export interface SnapshotTeam {
  characterIds: Array<string | null>;
  normal: number;
  avg: number;
  crit: number;
}
export interface Snapshot {
  generatedAt: string;
  export: string;
  appCommit: string | null;
  characters: Record<string, SnapshotCharacter>;
  teams: Record<string, SnapshotTeam>;
  errors: Record<string, string>;
}

export async function buildSnapshot(exp: ExportFile, appCommit: string | null, options: { autoBuffs?: boolean } = {}): Promise<Snapshot> {
  const snapshot: Snapshot = {
    generatedAt: new Date().toISOString(),
    export: exp.path,
    appCommit,
    characters: {},
    teams: {},
    errors: {},
  };
  for (const id of Object.keys(exp.characters).sort()) {
    try {
      const calc = await calcCharacter(id, exp, { attacks: false });
      const rotations: SnapshotCharacter["rotations"] = {};
      for (const r of calc.rotations) rotations[r.name] = { normal: r.normal, avg: r.avg, crit: r.crit };
      snapshot.characters[id] = {
        weapon: calc.weapon,
        sequence: calc.sequence,
        stats: Object.fromEntries(calc.stats.map((s) => [s.key, s.value])),
        rotations,
      };
    } catch (e) {
      snapshot.errors[`characters.${id}`] = e instanceof Error ? e.message : String(e);
    }
  }
  const seen = new Map<string, number>();
  for (const team of exp.teams) {
    const base = String(team.name ?? team.id ?? "team");
    const n = (seen.get(base) ?? 0) + 1;
    seen.set(base, n);
    const label = n === 1 ? base : `${base} (${n})`;
    try {
      const calc = await calcTeam(team, exp, options);
      snapshot.teams[label] = { characterIds: calc.characterIds, normal: calc.normal, avg: calc.avg, crit: calc.crit };
    } catch (e) {
      snapshot.errors[`teams.${label}`] = e instanceof Error ? e.message : String(e);
    }
  }
  return snapshot;
}

export interface DiffEntry {
  path: string;
  before: number | null;
  after: number | null;
  /** relative change, e.g. 0.05 for +5 %; null when one side is missing or before is 0 */
  deltaPct: number | null;
}

function numbersOf(value: unknown, prefix: string, out: Map<string, number>): void {
  if (typeof value === "number") {
    out.set(prefix, value);
  } else if (value && typeof value === "object" && !Array.isArray(value)) {
    for (const [k, v] of Object.entries(value)) numbersOf(v, prefix ? `${prefix}.${k}` : k, out);
  }
}

/** Every number that moved between two snapshots (relative change above `tolerancePct` percent), plus added/removed entries. */
export function diffSnapshots(before: Snapshot, after: Snapshot, tolerancePct = 0.01): DiffEntry[] {
  const a = new Map<string, number>();
  const b = new Map<string, number>();
  numbersOf({ characters: before.characters, teams: before.teams }, "", a);
  numbersOf({ characters: after.characters, teams: after.teams }, "", b);
  const entries: DiffEntry[] = [];
  for (const path of new Set([...a.keys(), ...b.keys()])) {
    const x = a.get(path);
    const y = b.get(path);
    if (x === undefined || y === undefined) {
      entries.push({ path, before: x ?? null, after: y ?? null, deltaPct: null });
      continue;
    }
    if (x === y) continue;
    const deltaPct = x === 0 ? null : (y - x) / Math.abs(x);
    if (deltaPct !== null && Math.abs(deltaPct) * 100 <= tolerancePct) continue;
    entries.push({ path, before: x, after: y, deltaPct });
  }
  return entries.sort((p, q) => p.path.localeCompare(q.path));
}
