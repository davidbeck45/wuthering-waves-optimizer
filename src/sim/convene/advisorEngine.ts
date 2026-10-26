// Wuthering Tools+ — the pull advisor's damage side: for each featured item on a running banner, what the next copy
// (and each one after it, up to S6 / R5) does to the player's OWN build, scored by this app's engine on the character's
// best rotation — the same pieces /my-rankings uses (src/sim/myRankings/rankRoster.ts: `rotationCandidates`,
// `scoreRotation`, `withSequence`, `withWeapon`; enemy = RANKING_ENEMY, Riley's level-100 / 20 % RES target).
//
// A signature weapon the owner doesn't wield yet is bracketed the way upstream's weapon-impact preview does it
// (src/weapons/weaponImpact.ts): the headline is the weapon with every passive at full stacks (`weaponPassiveMode:
// "all-max"`), `low` the stats alone (`"all-off"`). A refinement of the weapon already wielded is one number: the
// player's own passive toggles apply to both sides.
//
// Never invents a number: an item the account can't score (not owned, no weapon equipped, not in the app) comes back
// with a status and no steps. A resonator the player doesn't own would need a hypothetical S0 build — out of scope.
//
// Runs on the main thread, yielding between scorings (every rotation candidate and every step), like /my-rankings: a
// worker bundle would inline every lazy character module and the wuwa_calc presets (2.6 MB, measured 2026-10-12)
// while the scoring itself is small — David's export, 3.7 Phase II: four targets in ~200 ms with no task over 50 ms
// (Long Tasks API, 2026-10-26). No Vue, no Pinia: the caller passes plain copies of the stores.
import { allCharactersList, getCharByName, getCharacterRosterDisplayName } from "../../characters/characters";
import { getWeaponsByType } from "../../weapons/weapons";
import {
  RANKING_ENEMY,
  isSetUp,
  refinementOf,
  rotationCandidates,
  scoreRotation,
  sequenceOf,
  withSequence,
  withWeapon,
} from "../myRankings/rankRoster";
import { calcCharacterRotationDamage, type CharacterRotationInput } from "../../calculator/characterRotation";
import type { AdviceDamage, AdviceTarget, DamageStep } from "./advisor";

export interface AdvisorInput {
  targets: readonly AdviceTarget[];
  /** the character store's `characters` (a plain copy) */
  characters: Record<string, any>;
  /** the inventory store's `echoes` (a plain copy) */
  echoes: any[];
}

export interface AdvisorDeps {
  // eslint-disable-next-line no-unused-vars -- the parameters of a function type
  onProgress?: (done: number, total: number, label: string) => void;
  /** pause between scorings so the page stays responsive (default true) */
  yieldToUi?: boolean;
  signal?: AbortSignal;
}

interface BestRotation {
  rotation: CharacterRotationInput;
  name: string;
  avgDamage: number;
}

const yieldNow = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 0));

const weaponNames = new Map<string, string>();
/** the app's display name for a weapon key */
export function weaponName(key: string): string {
  if (!weaponNames.size) {
    for (const type of ["Swords", "Broadblades", "Pistols", "Gauntlets", "Rectifiers"]) {
      const list = getWeaponsByType(type) as unknown as Record<string, Array<{ key: string; name: string }>>;
      for (const rows of Object.values(list ?? {})) for (const w of rows ?? []) weaponNames.set(w.key, w.name);
    }
  }
  return weaponNames.get(key) ?? key;
}

const signatureOf = new Map<string, string | null>();

/** a resonator's signature weapon key (its `basic.signatureWeapon`), null when it names none */
async function signatureWeaponOf(characterKey: string): Promise<string | null> {
  if (signatureOf.has(characterKey)) return signatureOf.get(characterKey)!;
  let sig: string | null = null;
  try {
    const data = (await getCharByName(characterKey)) as { basic?: { signatureWeapon?: string } } | null;
    sig = data?.basic?.signatureWeapon ?? null;
  } catch {
    sig = null;
  }
  signatureOf.set(characterKey, sig);
  return sig;
}

/**
 * The resonator whose signature this weapon is. Looks at the likeliest owners first (the resonators featured beside it,
 * then the account's characters) and only then walks the whole roster.
 */
export async function signatureOwner(weaponKey: string, hints: readonly string[] = []): Promise<string | null> {
  const seen = new Set<string>();
  const order = [...hints, ...allCharactersList.map((c) => c.key)];
  for (const key of order) {
    if (!key || seen.has(key) || /^rover/i.test(key)) continue;
    seen.add(key);
    if ((await signatureWeaponOf(key)) === weaponKey) return key;
  }
  return null;
}

async function bestRotationOf(id: string, characters: Record<string, any>, echoes: any[], pause: () => Promise<void>): Promise<BestRotation | null> {
  const candidates = await rotationCandidates(id, characters[id] ?? {});
  let best: BestRotation | null = null;
  for (const c of candidates) {
    await pause();
    try {
      const s = await scoreRotation(c.rotation, id, characters, RANKING_ENEMY, echoes);
      if (!best || s.avgDamage > best.avgDamage) best = { rotation: c.rotation, name: c.name, avgDamage: s.avgDamage };
    } catch {
      /* a rotation with actions this build can't resolve: skipped, as on /my-rankings */
    }
  }
  return best && best.avgDamage > 0 ? best : null;
}

function empty(target: AdviceTarget, status: AdviceDamage["status"], extra: Partial<AdviceDamage> = {}): AdviceDamage {
  return { targetId: target.id, status, characterKey: null, characterName: null, current: null, baseDamage: null, rotation: null, steps: [], note: null, ...extra };
}

/** score every target; the order of the result follows `targets` */
export async function scoreAdvisorTargets(input: AdvisorInput, deps: AdvisorDeps = {}): Promise<AdviceDamage[]> {
  const { targets, characters, echoes } = input;
  const pause = deps.yieldToUi !== false ? yieldNow : () => Promise.resolve();
  const best = new Map<string, Promise<BestRotation | null>>();
  const bestFor = (id: string) => {
    let p = best.get(id);
    if (!p) best.set(id, (p = bestRotationOf(id, characters, echoes, pause)));
    return p;
  };
  const featuredResonators = targets.filter((t) => t.kind === "resonator" && t.item.key).map((t) => t.item.key!);
  const accountKeys = Object.keys(characters ?? {});
  const out: AdviceDamage[] = [];
  let done = 0;
  for (const target of targets) {
    if (deps.signal?.aborted) throw new Error("aborted");
    deps.onProgress?.(done, targets.length, target.item.name);
    try {
      out.push(target.kind === "resonator" ? await scoreResonator(target) : await scoreWeapon(target));
    } catch (error) {
      out.push(empty(target, "error", { note: error instanceof Error ? error.message : String(error) }));
    }
    done += 1;
    await pause();
  }
  deps.onProgress?.(done, targets.length, "done");
  return out;

  async function scoreResonator(target: AdviceTarget): Promise<AdviceDamage> {
    const key = target.item.key;
    if (!key) return empty(target, "not-in-app");
    const name = getCharacterRosterDisplayName(key);
    const data = characters[key];
    if (!data) return empty(target, "not-owned", { characterKey: key, characterName: name });
    if (!isSetUp(data)) return empty(target, "not-set-up", { characterKey: key, characterName: name });
    const seq = sequenceOf(data);
    if (seq >= 6) return empty(target, "maxed", { characterKey: key, characterName: name, current: "S6" });
    const rot = await bestFor(key);
    if (!rot) return empty(target, "error", { characterKey: key, characterName: name, current: `S${seq}`, note: "no rotation this build can score" });
    const steps: DamageStep[] = [];
    for (let s = seq + 1; s <= 6; s++) {
      await pause();
      const hypo = await withSequence(key, data, s);
      const scored = await scoreRotation(rot.rotation, key, { ...characters, [key]: hypo }, RANKING_ENEMY, echoes);
      steps.push({ label: `S${s}`, copies: s - seq, avgDamage: scored.avgDamage, gain: scored.avgDamage / rot.avgDamage - 1 });
    }
    return { targetId: target.id, status: "ok", characterKey: key, characterName: name, current: `S${seq}`, baseDamage: rot.avgDamage, rotation: rot.name, steps, note: null };
  }

  async function scoreWeapon(target: AdviceTarget): Promise<AdviceDamage> {
    const key = target.item.key;
    if (!key) return empty(target, "not-in-app");
    const owner = await signatureOwner(key, [...featuredResonators, ...accountKeys]);
    if (!owner) return empty(target, "no-owner");
    const name = getCharacterRosterDisplayName(owner);
    const data = characters[owner];
    if (!data) return empty(target, "not-owned", { characterKey: owner, characterName: name });
    if (!isSetUp(data)) return empty(target, "not-set-up", { characterKey: owner, characterName: name });
    const wielding = data.weapon === key;
    const refine = wielding ? refinementOf(data) : 0;
    const current = `${weaponName(data.weapon)} R${refinementOf(data)}`;
    if (refine >= 5) return empty(target, "maxed", { characterKey: owner, characterName: name, current });
    const rot = await bestFor(owner);
    if (!rot) return empty(target, "error", { characterKey: owner, characterName: name, current, note: "no rotation this build can score" });
    const steps: DamageStep[] = [];
    for (let r = refine + 1; r <= 5; r++) {
      await pause();
      const hypo = { ...characters, [owner]: withWeapon(data, key, r) };
      if (wielding) {
        const scored = await scoreRotation(rot.rotation, owner, hypo, RANKING_ENEMY, echoes);
        steps.push({ label: `R${r}`, copies: r - refine, avgDamage: scored.avgDamage, gain: scored.avgDamage / rot.avgDamage - 1 });
        continue;
      }
      const run = async (mode: "all-max" | "all-off") =>
        (await calcCharacterRotationDamage(rot.rotation, null, owner, hypo, RANKING_ENEMY, echoes, null, { weaponPassiveMode: mode })).damageAggregation.avgDamage ?? 0;
      const high = await run("all-max");
      const low = await run("all-off");
      steps.push({
        label: `${weaponName(key)} R${r}`,
        copies: r - refine,
        avgDamage: high,
        gain: high / rot.avgDamage - 1,
        low: { avgDamage: low, gain: low / rot.avgDamage - 1 },
      });
    }
    return { targetId: target.id, status: "ok", characterKey: owner, characterName: name, current, baseDamage: rot.avgDamage, rotation: rot.name, steps, note: wielding ? null : `swaps out ${current}` };
  }
}
