// Wuthering Tools+ numbers log — making an entry: the signature of each build a ranking scored (signature.ts says what
// its parts are) and the entry itself. This is the recorder's side of the log: it reads the engine's own helpers
// (`sequenceOf`, `refinementOf`), so only recordRanking.ts imports it, and that module loads after a ranking has run.
// The pages that show the log import log.ts, compare.ts and view.ts, which stay free of the engine. Pure.
import { hashText, scoredCharacters } from "../echoLab/fingerprint";
import { stableStringify } from "../myRankings/rankingCache";
import { refinementOf, sequenceOf, type RosterRanking } from "../myRankings/rankRoster";
import type { CharacterFigure, LogEntry, TeamFigure } from "./log";
import type { BuildSig } from "./signature";

/* eslint-disable @typescript-eslint/no-explicit-any */

const WEAPON_FIELDS = ["weapon", "weapons", "weaponPassives"];
const CHAIN_FIELDS = ["resonanceChains"];
const LEVEL_FIELDS = ["characterLevel", "talents"];
const ECHO_FIELDS = ["echoes", "mainEcho", "echoSetBonus", "echoSetPassives", "echoPresetId"];
/** the build list is read through a team's pins only (`rec`); the rest is bookkeeping */
const OTHER_SKIPS = new Set([...WEAPON_FIELDS, ...CHAIN_FIELDS, ...LEVEL_FIELDS, ...ECHO_FIELDS, "builds", "activeBuildId"]);
/** never read by a score, wherever they sit */
const BOOKKEEPING = new Set(["createdAt", "updatedAt", "notes", "buildStatus", "buildComplete"]);

/** 8 base-36 characters of cyrb53 over the key-sorted JSON: enough to tell two states of one build apart */
const short = (value: unknown): string => hashText(stableStringify(value)).padStart(8, "0").slice(-8);

function withoutBookkeeping(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(withoutBookkeeping);
  if (!value || typeof value !== "object") return value;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) if (!BOOKKEEPING.has(k)) out[k] = withoutBookkeeping(v);
  return out;
}

/** The inventory's echoes by id, without the id itself: the same echo under a new id (a re-import) is the same echo. */
export function echoIndex(echoes: readonly any[] | null | undefined): Map<string, unknown> {
  const out = new Map<string, unknown>();
  for (const e of echoes ?? []) if (e?.echoId) out.set(String(e.echoId), withoutId(e));
  return out;
}

const withoutId = (echo: Record<string, unknown>): Record<string, unknown> => Object.fromEntries(Object.entries(echo).filter(([k]) => k !== "echoId"));

/** The five slots as scored: the inventory's echo where a slot points at one, else what the slot itself holds. */
function wornEchoes(slots: Record<string, any> | null | undefined, index: ReadonlyMap<string, unknown>): unknown[] {
  return Object.keys(slots ?? {})
    .sort()
    .map((slot) => {
      const worn = slots?.[slot];
      const id = worn?.echoId;
      if (id && index.has(String(id))) return index.get(String(id));
      return worn && typeof worn === "object" ? withoutId(worn) : null;
    });
}

const pick = (record: Record<string, any>, fields: readonly string[]): Record<string, unknown> => Object.fromEntries(fields.filter((f) => f in record).map((f) => [f, record[f]]));

/** The signature of one character as a ranking scored them. `index` is `echoIndex(inventory echoes)`. */
export function buildSignature(characterData: Record<string, any> | null | undefined, index: ReadonlyMap<string, unknown>): BuildSig {
  const scored = (scoredCharacters({ c: characterData ?? {} }) as { c: Record<string, any> }).c ?? {};
  const record = withoutBookkeeping(scored) as Record<string, any>;
  // a saved build's name is what the player calls it, never scored: a rename is not a change of the build (2026-11-23)
  if (Array.isArray(record.builds)) record.builds = (record.builds as Array<Record<string, any>>).map((b) => (b && typeof b === "object" ? Object.fromEntries(Object.entries(b).filter(([k]) => k !== "name")) : b));
  const weapon: string | null = record.weapon ? String(record.weapon) : null;
  const rest = Object.fromEntries(Object.entries(record).filter(([k]) => !OTHER_SKIPS.has(k)));
  const builds = Array.isArray(record.builds) ? (record.builds as Array<Record<string, any>>) : [];
  return {
    weapon,
    refinement: refinementOf(record),
    sequence: sequenceOf(record),
    // only the equipped weapon's own settings: the levels of weapons left in the bag move nothing
    hw: short({ weapon, settings: weapon ? (record.weapons?.[weapon] ?? null) : null, passives: record.weaponPassives ?? null }),
    hs: short(pick(record, CHAIN_FIELDS)),
    hl: short(pick(record, LEVEL_FIELDS)),
    he: short({ ...pick(record, ECHO_FIELDS), echoes: wornEchoes(record.echoes, index) }),
    ho: short(rest),
    rec: short({ record, worn: wornEchoes(record.echoes, index), builds: builds.map((b) => wornEchoes(b?.echoes, index)) }),
  };
}

/** A saved team as the ranking reads it: who, which builds are pinned, the rotation and its timing. Its name, notes and
 *  its own enemy are not read (the ranking scores every team at one enemy). */
export function teamDefinitionHash(team: Record<string, any> | null | undefined): string {
  if (!team) return "";
  return short(withoutBookkeeping({ characterIds: team.characterIds ?? [], buildIds: team.buildIds ?? [], actions: team.actions ?? [], duration: team.duration ?? null, handoffs: team.handoffs ?? null }));
}

/** A saved team's last Sync my teams rewrite (importFromRankings.ts writes `syncedAt`), for "What moved". */
const syncedAt = (team: Record<string, any> | null | undefined): { synced?: number } => {
  const at = Number(team?.syncedAt);
  return Number.isFinite(at) && at > 0 ? { synced: at } : {};
};

export interface RankedAccount {
  characters: Record<string, any>;
  echoes: readonly any[];
  teams: readonly any[];
}

/** One entry from a finished ranking and the account it scored. Null for a ranking that did not fully score. */
export function entryFromRanking(ranking: RosterRanking, account: RankedAccount, meta: { at: number; build: string; autoTeamBuffs: boolean }): LogEntry | null {
  if (!ranking || ranking.incomplete || !Array.isArray(ranking.characters) || !Array.isArray(ranking.teams)) return null;
  const index = echoIndex(account.echoes);
  const savedTeams = new Map((account.teams ?? []).map((t) => [String(t?.id), t]));
  const characters: CharacterFigure[] = ranking.characters.map((c) => ({
    id: c.id,
    rotation: c.best?.name ?? null,
    damage: Math.round(c.best?.avgDamage ?? 0),
    sig: buildSignature(account.characters?.[c.id], index),
  }));
  const teams: TeamFigure[] = ranking.teams
    .filter((t) => !t.unarmed.length) // "fieldable", as /account lists them
    .map((t) => ({
      id: t.id,
      name: t.name,
      source: t.source,
      members: [...t.characterIds],
      damage: Math.round(t.avgDamage),
      def: t.source === "yours" ? teamDefinitionHash(savedTeams.get(t.id)) : "",
      ...syncedAt(t.source === "yours" ? savedTeams.get(t.id) : null),
    }));
  return { at: meta.at, build: meta.build, autoTeamBuffs: meta.autoTeamBuffs, characters, teams };
}
