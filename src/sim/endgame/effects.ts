// Wuthering Tools+ — Tower of Adversity floor effects: the small DSL a season's effects are hand-translated into
// (wuwa-tools/endgame/effects/s<NN>.json → the generated season file's `effects[].model`), and its translation into
// Riley31415/wuwa_calc Gear for the fork's enemy profile (vendor/wuwa_calc/src/shared/profile.ts).
//
// Pure over the engine modules handed in, like rileyRun.ts: the solver worker passes its `@skittle/*` imports, Node
// the fork's sources — nothing here imports the app's registries, so it is safe inside the worker.
//
//   res        enemy RES by attribute, ± percentage points — folded into the floor's RES table (toaData.ts), no Gear
//   dmgBonus   a flat DMG Bonus for the whole team, optionally by attribute or skill type          (team Gear)
//   buff       a timed buff on a trigger — on Intro, on inflicting a Negative Status / Electro Flare, on a Unison
//              Response, on an Echo Skill — for the one who triggered it or the whole team         (team Gear grants)
//   ramp       "N s after the battle starts the enemy takes x % more DMG, +y % every z s, up to w %" (enemy Gear)
//   unmodelled shown, never simulated
import type { RileyEngine } from "../engine/rileyRun";

/* eslint-disable @typescript-eslint/no-explicit-any */

export type Element = "Aero" | "Electro" | "Fusion" | "Glacio" | "Spectro" | "Havoc" | "Physical";
export const ELEMENTS: readonly Element[] = ["Aero", "Electro", "Fusion", "Glacio", "Spectro", "Havoc", "Physical"];

export type SkillType = "Basic" | "Heavy" | "Skill" | "Liberation" | "Intro" | "Outro" | "Echo";
export type BuffStat = "critDmg" | "critRate" | "totalDmg" | "dmgBonus" | "atk";
export type BuffTrigger = "intro" | "negativeStatus" | "electroFlare" | "unisonResponse" | "echoCast";

/** How closely the engine plays an effect: exactly as worded, an approximation (the note says how), or not at all. */
export type Fidelity = "exact" | "approx" | "none";

interface EffectBase {
  /** the chip's text */
  label: string;
  /** the chip's tooltip: what the engine does with it, or why it can't */
  note?: string;
  fidelity?: Fidelity;
}

export type FloorEffect =
  | (EffectBase & { kind: "res"; res: Partial<Record<Element, number>> })
  | (EffectBase & { kind: "dmgBonus"; value: number; elements?: Element[]; skills?: SkillType[] })
  | (EffectBase & {
      kind: "buff";
      on: BuffTrigger;
      /** the buff's lines: stat, value, optionally scoped to one attribute or skill type */
      stats: Array<{ stat: BuffStat; value: number; element?: Element; skill?: SkillType }>;
      seconds: number;
      target: "self" | "team";
      /** echoCast: one stack per member who has cast an Echo Skill, up to `max` */
      stacks?: { max: number; distinctMembers?: boolean };
      /** ends when its holder leaves the field */
      lostOnSwap?: boolean;
    })
  | (EffectBase & { kind: "ramp"; start: number; first: number; step: number; every: number; cap: number })
  | (EffectBase & { kind: "unmodelled" });

/** What one floor (one HP segment of it) asks the engine to fight — plain data, posted to the worker. */
export interface FloorProfileSpec {
  /** enemy level (its DEF) */
  level: number;
  /** final RES per attribute, % — the enemy's own plus the floor's */
  res: Record<Element, number>;
  /** the floor's effects with a Gear behind them (res and unmodelled ones are dropped before posting) */
  effects: FloorEffect[];
}

/** The fidelity an effect is shown with — `unmodelled` is always "none"; the rest default to "exact". */
export const fidelityOf = (e: FloorEffect): Fidelity => (e.kind === "unmodelled" ? "none" : e.fidelity ?? "exact");

/** Does the engine play this one through Gear (rather than the RES table, or not at all)? */
export const hasGear = (e: FloorEffect): boolean => e.kind === "dmgBonus" || e.kind === "buff" || e.kind === "ramp";

/** The RES table a set of `res` effects makes of an enemy's own: element → %. */
export function resTable(own: Partial<Record<Element, number>>, effects: readonly FloorEffect[], fallback = 10): Record<Element, number> {
  const out = {} as Record<Element, number>;
  for (const el of ELEMENTS) out[el] = own[el] ?? fallback;
  for (const e of effects) {
    if (e.kind !== "res") continue;
    for (const [el, v] of Object.entries(e.res) as Array<[Element, number]>) out[el] += v;
  }
  return out;
}

/** The DMG Taken a ramp holds at `seconds` into the fight, % (0 before it starts). */
export function rampAt(e: Extract<FloorEffect, { kind: "ramp" }>, seconds: number): number {
  if (seconds < e.start) return 0;
  return Math.min(e.cap, e.first + e.step * Math.floor((seconds - e.start) / e.every));
}

/** One deterministic signature per spec — the memo key of a profiled run, and of the Gear built for it. */
export function profileSignature(spec: FloorProfileSpec): string {
  const res = ELEMENTS.map((el) => spec.res[el]).join(",");
  const effects = spec.effects
    .filter(hasGear)
    .map((e) => JSON.stringify({ ...e, label: undefined, note: undefined, fidelity: undefined }))
    .join(";");
  return `L${spec.level}|R${res}|${effects}`;
}

/* ------------------------------------------------------------------------------------------- the Gear */

/** The fork's `EnemyProfile` for a spec. One Gear set per signature and engine instance: the engine caches a
 *  slot's constant stats across runs by Gear id, so the same spec must come back as the very same Gear. */
const BUILT = new WeakMap<object, Map<string, any>>();

export function engineProfileOf(E: RileyEngine, spec: FloorProfileSpec): any {
  const F = E.floor;
  if (!F) throw new Error("this engine was loaded without the floor modules (rileyRun.ts `RileyEngine.floor`)");
  let memo = BUILT.get(F.profile);
  if (!memo) BUILT.set(F.profile, (memo = new Map()));
  const sig = profileSignature(spec);
  const hit = memo.get(sig);
  if (hit) return hit;

  const { Stat, Attribute, Type, Cast, BuffTarget } = E.stats;
  const { Gear, Buff, Debuff } = F.gear;
  const C = F.context;
  // his `const enum`s must exist as runtime objects (esbuild / Oxc emit them per file); a build that inlined them away
  // would hand the Gear `undefined` tags and quietly time the wrong fight — fail loudly instead (the card shows "—")
  const num = (v: unknown, what: string): number => {
    if (typeof v !== "number") throw new Error(`wuwa_calc's ${what} is missing at runtime in this build`);
    return v;
  };
  const attrOf = (el: Element): number => num(Attribute?.[el], `Attribute.${el}`);
  const typeOf = (s: SkillType): number => num(Type?.[s], `Type.${s}`);
  const STAT: Record<BuffStat, number> = {
    critDmg: num(Stat?.CritDmg, "Stat.CritDmg"),
    critRate: num(Stat?.CritRate, "Stat.CritRate"),
    totalDmg: num(Stat?.TotalDmg, "Stat.TotalDmg"),
    dmgBonus: num(Stat?.DmgBonus, "Stat.DmgBonus"),
    atk: num(Stat?.BonusAtk, "Stat.BonusAtk"),
  };
  num(Stat?.DamageTaken, "Stat.DamageTaken");
  num(Cast?.Intro, "Cast.Intro");
  num(Cast?.Echo, "Cast.Echo");
  num(BuffTarget?.Team, "BuffTarget.Team");
  num(BuffTarget?.Self, "BuffTarget.Self");
  const lineOf = (l: { stat: BuffStat; value: number; element?: Element; skill?: SkillType }): any[] => {
    const tag = l.element ? attrOf(l.element) : l.skill ? typeOf(l.skill) : undefined;
    return tag === undefined ? [STAT[l.stat], l.value] : [STAT[l.stat], l.value, tag];
  };

  const teamGear: any[] = [];
  const enemyGear: any[] = [];
  for (const e of spec.effects) {
    if (e.kind === "dmgBonus") {
      const tags: Array<number | undefined> = e.elements?.length ? e.elements.map(attrOf) : e.skills?.length ? e.skills.map(typeOf) : [undefined];
      const stats = tags.map((t) => (t === undefined ? [Stat.DmgBonus, e.value] : [Stat.DmgBonus, e.value, t]));
      teamGear.push(new Gear({ name: `Floor: ${e.label}`, stats }));
    } else if (e.kind === "ramp") {
      enemyGear.push(new Debuff({ name: `Floor: ${e.label}`, applyStats: () => {
        const v = rampAt(e, C.currentFrame() / 60);
        if (v > 0) C.addStat(Stat.DamageTaken, v);
      } }));
    } else if (e.kind === "buff") {
      const buff = new Buff({
        name: `Floor: ${e.label}`,
        duration: Math.round(e.seconds * 60),
        maxStacks: e.stacks?.max ?? 1,
        perStack: !!e.stacks,
        lostOnSwap: !!e.lostOnSwap,
        stats: e.stats.map(lineOf),
      });
      const to = e.target === "team" ? BuffTarget.Team : BuffTarget.Self;
      if (e.on === "echoCast" && e.stacks?.distinctMembers) {
        // "the same Resonator cannot trigger this effect multiple times": a mark per member, a stack per mark
        const mark = new Buff({});
        teamGear.push(new Gear({ name: `Floor: ${e.label}`, updateBuffs: () => {
          if (!C.casting(Cast.Echo) || C.isHeld(mark)) return;
          C.applyCurrent(mark, 1);
          if (to === BuffTarget.Team) C.applyTeam(buff, 1);
          else C.applyCurrent(buff, 1);
        } }));
        continue;
      }
      const on =
        e.on === "intro" ? C.onCast(Cast.Intro)
        : e.on === "echoCast" ? C.onCast(Cast.Echo)
        : e.on === "electroFlare" ? C.onInflict(F.status.ELECTRO_FLARE)
        : e.on === "unisonResponse" ? F.unison.unisonResponse
        : C.inflicting(F.status.inflictedNegativeStatus);
      teamGear.push(new Gear({ name: `Floor: ${e.label}`, grants: [{ on, buff, to }] }));
    }
  }
  const profile = { level: spec.level, res: { ...spec.res }, enemyGear, teamGear };
  memo.set(sig, profile);
  return profile;
}

/** Run `fn` with the floor's enemy profile set, and always put the engine's own enemy back. */
export function withFloorProfile<T>(E: RileyEngine, spec: FloorProfileSpec | null, fn: () => T): T {
  const F = E.floor;
  if (!spec) return fn();
  if (!F) throw new Error("this engine was loaded without the floor modules (rileyRun.ts `RileyEngine.floor`)");
  F.profile.setEnemyProfile(engineProfileOf(E, spec));
  try {
    return fn();
  } finally {
    F.profile.setEnemyProfile(null);
  }
}
