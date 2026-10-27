// Wuthering Tools+ — /weapons, "Weapon value": what each character's signature (and the alternatives) is worth on
// THIS account, for every set-up character at once. Batch 1 answered it for one featured weapon (convene's pull
// advisor) or one investment at a time (/account's plan); this runs the same maths across the roster:
//
//   signature   R1…R5 of `basic.signatureWeapon` — bracketed (passives at full stacks / stats only) when the
//               character does not hold it, one number per refinement when they do (src/sim/weapons/weaponLadder.ts,
//               the pull advisor's ladder, so both pages print the same figure for the same copy)
//   standard    each standard 5★ of their type at R1 (the Standard Weapon Convene list, data/pools.json), bracketed
//   four        the best 4★ of their type at R5 (every 4★ the registry lists, picked on the headline), bracketed
//   refine      the held weapon one refinement up when it is not the signature (the signature's own steps cover that)
//
// Every option is measured on the character's best rotation (the roster ranking's pick, the same as /my-rankings and
// /account) against their damage as it is, and again on their strongest team they can field through /account's team
// scorer (investPlan.ts `createTeamScorer`: resolveTeamCharacters → calcTeamRotationDamage), so a support's
// team-buff signature lifts the carry it buffs. A team figure for a weapon the character does not hold runs the
// headline (every passive at full stacks, `withWeaponAtFullStacks`); the stats-only floor is personal only. A
// teammate whose team-buff panel is set by hand for that team has it follow the weapon (teamPanels.ts), so a new
// support weapon's buff reaches the carry the way it would once ticked.
//
// Engine numbers only: a character, weapon or team that cannot be scored comes back with a status and no number.
// Pure / async (no Vue, no stores), time-sliced on the main thread like investPlan (a frame every ~12 ms of engine
// work) and cancellable — a worker would inline every lazy kit (src/sim/convene/advisorEngine.ts header).
import type { CharacterRotationInput } from "../../calculator/characterRotation";
import { RANKING_ENEMY, isSetUp, refinementOf, scoreRotation, withWeapon, type RosterRanking } from "../myRankings/rankRoster";
import { createTeamScorer, slicer, type TeamContext, type TeamImpact, type TeamScorer } from "../account/investPlan";
import { characterDisplayName, characterMeta, weaponMeta } from "../display/names";
import { getWeaponsByType } from "../../weapons/weapons";
import { scoreWeaponCopy, signatureWeaponOf, weaponLadder, weaponName, withWeaponAtFullStacks, type WeaponCopyScore } from "../weapons/weaponLadder";
import { standardWeaponKeys } from "./pools";
import { panelsFollowWeapon, type PanelFollow } from "./teamPanels";

/** bump when a row's shape or the scoring rules change (the cache drops older entries) */
export const WEAPON_VALUE_VERSION = 1;

export type OptionKind = "signature" | "refine" | "standard" | "four";

export interface ValueOption {
  /** `<kind>:<weaponKey>:R<n>`, stable across runs */
  id: string;
  kind: OptionKind;
  weaponKey: string;
  refinement: number;
  /** "Defier's Thorn R1" */
  label: string;
  /** own average damage per rotation: passives at full stacks for a weapon they don't hold, their own toggles for the held one */
  avgDamage: number;
  /** relative to the build as it is, e.g. 0.12 = +12 % */
  gain: number;
  /** a weapon they don't hold: its stats alone, every passive off; null for the held weapon */
  low: { avgDamage: number; gain: number } | null;
  /** the strongest team they can field, re-run with this weapon (null: see `teamNote`) */
  team: TeamImpact | null;
  teamNote: string | null;
  /** teammates whose hand-set team-buff panel was made to follow the weapon for `team` (teamPanels.ts): the old
   *  weapon's buffs off, this one's on — "assumes you tick it there" */
  panels: PanelFollow["adjusted"];
}

/** `swap`: they don't hold it (R1…R5); `held`: they hold it below R5; `maxed`: R5 held; `none`: the kit names no
 *  signature (the standard 5★ resonators, Rover); `not-in-app`: the kit names one the app has no data for yet */
export type SignatureStatus = "swap" | "held" | "maxed" | "none" | "not-in-app";

export interface CharacterWeaponValue {
  id: string;
  name: string;
  /** the weapon registry's bucket: Swords, Broadblades, Pistols, Gauntlets, Rectifiers */
  weaponType: string | null;
  /** `no-rotation`: nothing this build can score; `unknown-weapon`: the equipped weapon is not in the app (a base
   *  without its stats would inflate every gain); `error`: the engine threw (the message is in `note`) */
  status: "ok" | "no-rotation" | "unknown-weapon" | "error";
  note: string | null;
  current: {
    weaponKey: string | null;
    refinement: number;
    /** own average damage per rotation on `rotation` */
    avgDamage: number;
    /** the best rotation's stored name */
    rotation: string;
    /** damage per second when the rotation carries a duration */
    dps: number | null;
  };
  signature: { key: string | null; status: SignatureStatus; steps: ValueOption[] };
  /** the standard 5★ weapons of their type at R1, best headline first (the held one is `refine`'s business) */
  standard: ValueOption[];
  /** the best 4★ of their type at R5 */
  four: ValueOption | null;
  /** the held non-signature weapon one refinement up */
  refine: ValueOption | null;
  /** the team every team figure is measured on, as it is */
  team: { id: string; name: string; characterIds: string[]; base: number } | null;
  /** why there are no team figures (null when there are) */
  teamNote: string | null;
}

export interface WeaponValueResult {
  v: number;
  rows: CharacterWeaponValue[];
  /** characters in the data with no weapon equipped — listed greyed as "not set up" */
  notSetUp: string[];
  errors: string[];
  computedAt: string;
  cancelled: boolean;
}

export interface WeaponValueProgress {
  done: number;
  total: number;
  /** the character being scored */
  label: string;
}

export interface WeaponValueOptions {
  /** team buffs from the real members (src/sim/teamContext) — the ranking's own setting; default true */
  autoTeamBuffs?: boolean;
  /** before each character, and after it with the finished row */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (progress: WeaponValueProgress, row?: CharacterWeaponValue) => void;
  /** give the browser a frame every ~12 ms of engine work; default true */
  yieldToUi?: boolean;
  /** set `cancelled` to stop between two scorings (the rows so far are returned) */
  signal?: { cancelled: boolean };
  /** score only these characters (default: every set-up character the ranking scored) */
  ids?: readonly string[];
  /** the standard 5★ pool (default: data/pools.json's Standard Weapon Convene list) */
  standardPool?: readonly string[];
  /** the signature lookup (default: the kit's `basic.signatureWeapon`) — tests pass a stub */
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  signatureOf?: (characterId: string) => Promise<string | null>;
}

/** "Sword" (the roster's weapon type) → "Swords" (the weapon registry's bucket) */
export const weaponBucket = (type: string | null | undefined): string | null => (type ? (type.endsWith("s") ? type : `${type}s`) : null);

/** Every weapon key of a registry bucket and rarity (5: five-stars, 4: four-stars). */
export function weaponsOfType(bucket: string, rarity: 4 | 5): string[] {
  const list = getWeaponsByType(bucket) as unknown as Record<string, Array<{ key: string }> | undefined>;
  return (list?.[rarity === 5 ? "five" : "four"] ?? []).map((w) => w.key);
}

const optionId = (kind: OptionKind, key: string, r: number): string => `${kind}:${key}:R${r}`;

/**
 * Weapon value for a scored roster. `ranking` must come from the same `characters` / `inventoryEchoes` / `teams`
 * (the page keys both by the ranking fingerprint). Rows follow the ranking's order (strongest first).
 */
export async function weaponValue(
  characters: Record<string, any>,
  inventoryEchoes: any[],
  teams: any[],
  ranking: Pick<RosterRanking, "characters" | "teams">,
  options: WeaponValueOptions = {},
): Promise<WeaponValueResult> {
  const auto = options.autoTeamBuffs ?? true;
  const pause = slicer(options.yieldToUi !== false);
  const cancelled = (): boolean => Boolean(options.signal?.cancelled);
  const enemy = RANKING_ENEMY;
  const errors: string[] = [];
  const signatureOf = options.signatureOf ?? signatureWeaponOf;
  const standardPool = options.standardPool ?? standardWeaponKeys();
  const only = options.ids ? new Set(options.ids) : null;
  const ranks = ranking.characters.filter((c) => characters[c.id] && isSetUp(characters[c.id]) && (!only || only.has(c.id)));
  const notSetUp = Object.keys(characters ?? {})
    .filter((id) => !isSetUp(characters[id]) && characterMeta(id) && (!only || only.has(id)))
    .sort((a, b) => characterDisplayName(a).localeCompare(characterDisplayName(b)));
  const scorer: TeamScorer = await createTeamScorer(characters, inventoryEchoes, teams, ranking.teams, { autoTeamBuffs: auto, enemy, errors });
  const rows: CharacterWeaponValue[] = [];

  let done = 0;
  for (const rank of ranks) {
    if (cancelled()) break;
    const id = rank.id;
    const name = characterDisplayName(id) || rank.name;
    options.onProgress?.({ done, total: ranks.length, label: name });
    const row = await scoreCharacter(id, name, rank.bestRotation, rank.best?.dps ?? null);
    rows.push(row);
    done += 1;
    options.onProgress?.({ done, total: ranks.length, label: name }, row);
    await pause();
  }
  return { v: WEAPON_VALUE_VERSION, rows, notSetUp, errors, computedAt: new Date().toISOString(), cancelled: cancelled() };

  async function scoreCharacter(id: string, name: string, rotation: CharacterRotationInput | null, dps: number | null): Promise<CharacterWeaponValue> {
    const data = characters[id] ?? {};
    const held: string | null = data.weapon ?? null;
    const refinement = refinementOf(data);
    const bucket = weaponBucket(characterMeta(id)?.weapon);
    const row: CharacterWeaponValue = {
      id,
      name,
      weaponType: bucket,
      status: "ok",
      note: null,
      current: { weaponKey: held, refinement, avgDamage: 0, rotation: rotation?.name ?? "", dps },
      signature: { key: null, status: "none", steps: [] },
      standard: [],
      four: null,
      refine: null,
      team: null,
      teamNote: null,
    };
    if (!rotation) return { ...row, status: "no-rotation", note: "no rotation this build can score" };
    if (held && !weaponMeta(held)) return { ...row, status: "unknown-weapon", note: `the equipped weapon (${held}) is not in the app` };
    try {
      const base = (await scoreRotation(rotation, id, characters, enemy, inventoryEchoes)).avgDamage;
      row.current.avgDamage = base;
      await pause();
      if (!(base > 0)) return { ...row, status: "no-rotation", note: "the best rotation scores no damage on this build" };

      const ctx: TeamContext | null = await scorer.teamFor(id);
      const block = ctx ? await scorer.buildBlock(ctx, id) : null;
      if (ctx) row.team = { id: ctx.rank.id, name: ctx.rank.name, characterIds: ctx.rank.characterIds, base: ctx.base };
      row.teamNote = !ctx ? "not in a team you can field" : block;

      /** one option: its own figure (already scored) and the team re-run with the weapon in hand */
      const option = async (kind: OptionKind, key: string, r: number, own: WeaponCopyScore, label: string): Promise<ValueOption> => {
        let team: TeamImpact | null = null;
        let teamNote: string | null = row.teamNote;
        let panels: PanelFollow["adjusted"] = [];
        if (ctx && !block) {
          const armed = key === held ? withWeapon(data, key, r) : await withWeaponAtFullStacks(id, data, key, r);
          const follow = await panelsFollowWeapon(ctx.candidate.team, characters, { ...characters, [id]: armed }, id, inventoryEchoes, enemy);
          const result = await scorer.impact(ctx, null, follow.characters, inventoryEchoes);
          team = result.team;
          teamNote = result.note;
          panels = follow.adjusted;
          await pause();
        }
        return { id: optionId(kind, key, r), kind, weaponKey: key, refinement: r, label, avgDamage: own.avgDamage, gain: own.gain, low: own.low ?? null, team, teamNote, panels };
      };

      // the signature: R1…R5 (or the held one's next refinements)
      const sig = await signatureOf(id);
      row.signature.key = sig;
      if (!sig) row.signature.status = "none";
      else if (!weaponMeta(sig)) row.signature.status = "not-in-app";
      else if (held === sig && refinement >= 5) row.signature.status = "maxed";
      else {
        row.signature.status = held === sig ? "held" : "swap";
        for (const step of await weaponLadder(rotation, id, characters, inventoryEchoes, sig, base, pause, enemy)) {
          if (cancelled()) break;
          row.signature.steps.push(await option("signature", sig, step.refinement, step, `${weaponName(sig)} R${step.refinement}`));
        }
      }

      // the standard 5★ weapons of their type, at R1
      for (const key of standardPool) {
        if (cancelled()) break;
        if (key === held || key === sig || weaponMeta(key)?.type !== bucket) continue;
        await pause();
        const own = await scoreWeaponCopy(rotation, id, characters, inventoryEchoes, key, 1, base, enemy);
        row.standard.push(await option("standard", key, 1, own, `${weaponName(key)} R1`));
      }
      row.standard.sort((a, b) => b.gain - a.gain || a.weaponKey.localeCompare(b.weaponKey));

      // the best 4★ at R5: every four-star of the type on the headline, then the winner bracketed and teamed
      if (bucket && !cancelled()) {
        let best: { key: string; avg: number } | null = null;
        for (const key of weaponsOfType(bucket, 4)) {
          if (cancelled()) break;
          if (key === held) continue;
          await pause();
          const armed = await withWeaponAtFullStacks(id, data, key, 5);
          const avg = (await scoreRotation(rotation, id, { ...characters, [id]: armed }, enemy, inventoryEchoes)).avgDamage;
          if (!best || avg > best.avg || (avg === best.avg && key < best.key)) best = { key, avg };
        }
        if (best && !cancelled()) {
          const own = await scoreWeaponCopy(rotation, id, characters, inventoryEchoes, best.key, 5, base, enemy);
          row.four = await option("four", best.key, 5, own, `${weaponName(best.key)} R5`);
        }
      }

      // the held weapon one refinement up (not the signature: its own steps cover it)
      if (held && held !== sig && refinement < 5 && !cancelled()) {
        await pause();
        const own = await scoreWeaponCopy(rotation, id, characters, inventoryEchoes, held, refinement + 1, base, enemy);
        row.refine = await option("refine", held, refinement + 1, own, `${weaponName(held)} R${refinement + 1}`);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${name}: ${message}`);
      return { ...row, status: "error", note: message };
    }
    return row;
  }
}
