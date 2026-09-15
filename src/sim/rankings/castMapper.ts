// Wuthering Tools+: maps wuwa_calc's EXECUTED casts (Riley's engine output) to
// this app's rotation actions. A faithful TypeScript port of
// ~/Projects/wuwa-tools/rotation-port/map_rotations.py (validated against the
// app's own damage engine); the matching cascade per cast is
//   override · exact MV (±0.06, tie-break by group / prefix hint / stage / name)
//   · aggregate (cast.mv × count == app row) · per-hit (cast == app row × N)
//   · ratio (a kit multiplier the app models as a buff) · tick (the app row is
//   an N-tick aggregate) · name-only · unmatched.
// Tune Breaks, 0-MV utility casts and cancelled echo forms are not actions in
// this app and are skipped (reported instead); a negative-status tick becomes
// the app's own per-tick negative-status action at the tick's stack count, and
// `enemyConfigOf` reads the team enemy settings a loop ran under (2026-09-14).

export interface AppRow {
  group: string;
  key: string;
  label: string | null;
  mv: number | null;
  echoKey?: string;
}

export interface EchoRows {
  name: string;
  rows: AppRow[];
}

export interface Cast {
  name: string;
  /** the kit's own motion value (Riley's `action.mv`) — what the app's rows carry. Never the run's value: a
   *  sequence's "+100% multiplier" or a buff on the next two casts doubles that, and read as hits it doubled
   *  Aemeath's Finale in every import until 2026-09-14; the app applies those through its own chains and buffs */
  mv: number | null;
  /** the value the run applied after those multipliers, for the record */
  mvRun?: number | null;
  count: number;
  cast: string | null;
  node: string | null;
  queued?: boolean;
  by?: string | null;
  /** the enemy debuffs the engine held while this cast ran, by stack count (a traced run's `heldEnemy`, parsed by
   *  `enemyStacksOf` / the exporter): Havoc Bane, Tune Strain - Interfered, Electro Rage, and the tick statuses */
  held?: EnemySeen;
}

/** stack counts read off a traced hit's `heldEnemy` roster ("Havoc Bane x9" → havocBane: 9) */
export type EnemySeen = Partial<Record<"havocBane" | "strain" | "electroRage" | "electroFlare" | "aeroErosion" | "glacioChafe" | "spectroFrazzle" | "fusionBurst" | "glacioBite", number>>;

export interface MappedAction {
  order: number;
  key: string;
  type: string;
  count: number;
  buffs: never[];
  excludeTeamBuffs: boolean;
  excludeWeaponBuffs: boolean;
  isDisabled: boolean;
  mainEcho?: string;
  mainEchoRank?: number;
  /** a negative-status tick: the stack count the tick ran at (the app's per-action `negativeStatusStacks`) */
  negativeStatusStacks?: number;
  /** an Electro Flare tick: the Electro Rage stacks held at that moment */
  electroRageStacks?: number;
}

/** the app's team enemy settings (`TeamEnemyConfig` stack fields) */
export type EnemyStacks = Record<"spectroFrazzleStacks" | "aeroErosionStacks" | "havocBaneStacks" | "fusionBurstStacks" | "electroFlareStacks" | "electroRageStacks" | "glacioChafeStacks" | "strainStacks", number>;

export interface MapReport {
  methods: Record<string, number>;
  unmatched: string[];
  review: string[];
  skipped: string[];
  status: string[];
  multipliers: string[];
}

export type Overrides = Record<string, string | null>;

/** Riley's resonator names that don't simply lose their space to become this app's key. */
export const ALIAS: Record<string, string> = {
  Xuanling: "YangyangXuanling",
  "Electro Rover": "Roverelectrofemale",
  "Aero Rover": "RoverAeroFemale",
  "Spectro Rover": "RoverSpectroFemale",
  "Havoc Rover": "RoverHavocFemale",
  "Luuk Herssen": "LuukHerssen",
  "Xiangli Yao": "XiangliYao",
};
export const appKeyOf = (name: string): string => ALIAS[name] ?? name.replace(/ /g, "");
/** app character key -> Riley's resonator name (ALIAS inverted; both Rover genders are his one form) */
const RILEY_NAME: Record<string, string> = Object.fromEntries(Object.entries(ALIAS).map(([riley, app]) => [app, riley]));
for (const [riley, app] of Object.entries(ALIAS)) if (/female$/i.test(app)) RILEY_NAME[app.replace(/(f)emale$/i, (_, f) => (f === "F" ? "Male" : "male"))] = riley;
export const rileyNameOf = (appKey: string): string => RILEY_NAME[appKey] ?? appKey;

/** Hand-checked corrections (wuwa-tools/rotation-port/overrides.json); null drops the cast. */
export const OVERRIDES: Record<string, Overrides> = {
  // the Mech chain shares motion values with her own (Mech 2 = Charged I 92.83, Mech 4 = Aemeath 4, Mech Charged II = Aemeath Charged II)
  Aemeath: {
    "Basic - Mech 1": "BasicAttackMechStage1DMG", "Basic - Mech 2": "BasicAttackMechStage2DMG",
    "Basic - Mech 3": "BasicAttackMechStage3DMG", "Basic - Mech 4": "BasicAttackMechStage4DMG",
    "Heavy - Mech: Charged I": "HeavyAttackMechChargedIDMG", "Heavy - Mech: Charged II": "HeavyAttackMechChargedIIDMG",
    "Heavy - Aemeath: Charged I": "HeavyAttackAemeathChargedIDMG", "Heavy - Aemeath: Charged II": "HeavyAttackAemeathChargedIIDMG",
  },
  Brant: { "Forte - Returned from Ashes (S6 Blast)": "S6AlltheWorldsaCaptainsCarnevaleBlastDMG" },
  // Beneath the Sea = Flowing Suffocation × 4.7: wuwa_calc folds her S3 into the MV, the app applies it through the chain
  Cantarella: { "Basic - Dreamweaver": null, "Liberation - Beneath the Sea": "FlowingSuffocationDMG" },
  // × 2.75: Heart Sword Intent doubling + the chain's bonus, both kit buffs in the app
  Qingxiao: { "Forte Heavy - Heaven's Reckoning": "HeavenSReckoningEphemeralTranscendenceDMG" },
};

/** wuwa_calc casts named after an echo's passive rather than the echo: the app echo they belong to */
const ECHO_ALIASES: Record<string, string> = { coreofcollapse: "Reminiscence: Threnodian - Leviathan" };

const NODE_PREF: Record<string, string[]> = { Forte: ["forteCircuit"], Liberation: ["liberation"], Intro: ["intro"], Skill: ["skill", "forteCircuit"], Normal: ["basic", "forteCircuit"] };
const CAST_PREF: Record<string, string[]> = { Outro: ["outro"], Echo: ["echoAttacks"], TuneBreak: ["tuneBreak"], Intro: ["intro"], Liberation: ["liberation"], Skill: ["skill"], Basic: ["basic"], Heavy: ["basic", "forteCircuit"] };
const PREFIX_HINT: Array<[string, string]> = [
  ["Dodge Counter", "dodgecounter"], ["Mid-air", "midair"], ["Forte Heavy", "heavyattack"], ["Forte Basic", "basicattack"],
  ["Forte Mid-air", "midair"], ["Heavy", "heavyattack"], ["Basic", "basicattack"], ["Skill", "skill"], ["Liberation", "liberation"], ["Intro", "intro"], ["Outro", "outro"],
];
const STATUS_RE = /(^|: )(Glacio Chafe|Glacio Bite|Fusion Burst|Electro Flare|Electro Rage|Aero Erosion|Spectro Frazzle|Havoc Bane|Tune Rupture|Tune Strain|Tune Hack)( - \d+ Stacks?)?$/i;
/** a kit's own cast named after a status ("Forte - Seraphic Duet: Tune Rupture" is Aemeath's Forte damage, an app row)
 *  is not a status tick: only a bare status name ("Fusion Burst - 10 Stacks", "Glacio Bite - Fine Snow") is the enemy's */
const KIT_RE = /^(Forte|Mid-air|Dodge Counter|Basic|Heavy|Skill|Liberation|Intro|Outro|Enhanced)\b/;
const isStatus = (name: string): boolean => STATUS_RE.test(name) && !KIT_RE.test(name);
/** a status tick the app has an action for: `ElementalEffect<Sub>` of type `negativeStatus`, per-tick stack count */
const TICK_RE = /^(Spectro Frazzle|Aero Erosion|Fusion Burst|Electro Flare|Glacio Chafe) - (\d+) Stacks?$/;
const TICK_SUB: Record<string, string> = { "Spectro Frazzle": "SpectroFrazzle", "Aero Erosion": "AeroErosion", "Fusion Burst": "FusionBurst", "Electro Flare": "ElectroFlare", "Glacio Chafe": "GlacioChafe" };
/** the app's stack→motion-value tables end at 13 (Aero Erosion at 12); Riley's engine climbs past that (Glacio Chafe / Electro Flare x16) */
const tickCap = (sub: string): number => (sub === "AeroErosion" ? 12 : 13);
const RAGE_RE = /^Electro Rage - (\d+) Stacks?$/;
/** the team-wide enemy settings the app holds, with the enemy panel's slider caps */
export const ENEMY_CAP: EnemyStacks = { spectroFrazzleStacks: 13, aeroErosionStacks: 12, havocBaneStacks: 9, fusionBurstStacks: 13, electroFlareStacks: 13, electroRageStacks: 13, glacioChafeStacks: 13, strainStacks: 9 };
const HELD_RE = /^(Havoc Bane|Tune Strain - Interfered|Electro Rage|Electro Flare|Aero Erosion|Glacio Chafe|Spectro Frazzle|Fusion Burst|Glacio Bite) x(\d+)/;
const HELD_KEY: Record<string, keyof EnemySeen> = { "Havoc Bane": "havocBane", "Tune Strain - Interfered": "strain", "Electro Rage": "electroRage", "Electro Flare": "electroFlare", "Aero Erosion": "aeroErosion", "Glacio Chafe": "glacioChafe", "Spectro Frazzle": "spectroFrazzle", "Fusion Burst": "fusionBurst", "Glacio Bite": "glacioBite" };

/** The enemy debuff stacks a traced hit ran under, off its `heldEnemy` roster (mirrors the exporter's `enemyOf`). */
export function enemyStacksOf(heldEnemy: Array<{ name: string }> | null | undefined): EnemySeen | undefined {
  let out: EnemySeen | undefined;
  for (const b of heldEnemy ?? []) {
    const m = HELD_RE.exec(b.name);
    if (m) (out ??= {})[HELD_KEY[m[1]]] = Number(m[2]);
  }
  return out;
}

/** The team-wide enemy settings one loop ran under (mirrors map_rotations.enemy_config_of): every tick status at the
 *  highest stack count its ticks reached in the loop, Electro Rage likewise (its own ticks, or the count held under an
 *  Electro Flare tick), and the debuffs the engine held rather than ticked — Havoc Bane, Tune Strain - Interfered — at
 *  the count in force on most of the loop's damage casts (ties to the higher count). Clamped to the panel's caps. */
export function enemyConfigOf(casts: Cast[]): EnemyStacks {
  const out: EnemyStacks = { spectroFrazzleStacks: 0, aeroErosionStacks: 0, havocBaneStacks: 0, fusionBurstStacks: 0, electroFlareStacks: 0, electroRageStacks: 0, glacioChafeStacks: 0, strainStacks: 0 };
  const held: Record<"havocBaneStacks" | "strainStacks", Map<number, number>> = { havocBaneStacks: new Map(), strainStacks: new Map() };
  for (const c of casts) {
    const nm = c.name;
    const n = c.count || 1;
    const enemy = c.held ?? {};
    const t = isStatus(nm) ? TICK_RE.exec(nm) : null;
    if (t) {
      const sub = TICK_SUB[t[1]];
      const key = (sub[0].toLowerCase() + sub.slice(1) + "Stacks") as keyof EnemyStacks;
      out[key] = Math.max(out[key], Number(t[2]));
      if (t[1] === "Electro Flare") out.electroRageStacks = Math.max(out.electroRageStacks, enemy.electroRage ?? 0);
      continue;
    }
    const r = isStatus(nm) ? RAGE_RE.exec(nm) : null;
    if (r) { out.electroRageStacks = Math.max(out.electroRageStacks, Number(r[1])); continue; }
    if (!c.mv) continue;
    held.havocBaneStacks.set(enemy.havocBane ?? 0, (held.havocBaneStacks.get(enemy.havocBane ?? 0) ?? 0) + n);
    held.strainStacks.set(enemy.strain ?? 0, (held.strainStacks.get(enemy.strain ?? 0) ?? 0) + n);
  }
  for (const key of ["havocBaneStacks", "strainStacks"] as const) {
    let best: [number, number] | null = null;
    for (const [stacks, hits] of held[key]) if (!best || hits > best[1] || (hits === best[1] && stacks > best[0])) best = [stacks, hits];
    if (best) out[key] = best[0];
  }
  for (const key of Object.keys(out) as Array<keyof EnemyStacks>) out[key] = Math.min(out[key], ENEMY_CAP[key]);
  return out;
}
const KEY_PREFIX_RE = /^(ResonanceSkill|ResonanceLiberation|ForteCircuit|BasicAttack|HeavyAttack|MidAirAttack|MidairAttack|DodgeCounter|IntroSkill|OutroSkill)/i;

export const norm = (s: string | null | undefined): string =>
  (s ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]/g, "");

export function stripPrefix(name: string): string {
  let n = name.replace(/^(Forte |Mid-air |Dodge Counter |Basic |Heavy |Skill |Liberation |Intro |Outro |Echo |Utility |Tune Break)[- ]*/, "");
  n = n.replace(/\((S\d|Charged|Hold|Follow-Up|Swap|Mid-Air|Cancelled|Enhanced|green|red|blue)\)/g, "");
  n = n.replace(/\s+x\d+$/, "");
  n = n.trim().replace(/\b(\d)$/, "Stage$1"); // "… 2" -> "… Stage2" like the app keys
  return n.trim();
}
const hitsSuffix = (name: string): number | null => {
  const m = /\s+x(\d+)$/.exec(name);
  return m ? Number(m[1]) : null;
};
const hintOf = (name: string): string | null => {
  for (const [pre, h] of PREFIX_HINT) if (name.startsWith(`${pre} `) || name.startsWith(`${pre}:`)) return h;
  return null;
};

/** Python difflib's SequenceMatcher.ratio() (Ratcliff/Obershelp): 2 × matched / total. */
export function ratio(a: string, b: string): number {
  if (!a.length && !b.length) return 1;
  const matches = (x: string, y: string): number => {
    if (!x.length || !y.length) return 0;
    let bi = 0, bj = 0, best = 0;
    for (let i = 0; i < x.length; i++) {
      for (let j = 0; j < y.length; j++) {
        let k = 0;
        while (i + k < x.length && j + k < y.length && x[i + k] === y[j + k]) k++;
        if (k > best) { best = k; bi = i; bj = j; }
      }
    }
    if (!best) return 0;
    return best + matches(x.slice(0, bi), y.slice(0, bj)) + matches(x.slice(bi + best), y.slice(bj + best));
  };
  return (2 * matches(a, b)) / (a.length + b.length);
}

/** '37.88%*4+117.83%*3' -> 505.01 (null when the expression has no percent terms or is not a sum of them) */
export function mvOf(expr: unknown): number | null {
  if (!expr) return null;
  let total = 0;
  for (const term of String(expr).replace(/\s/g, "").split("+")) {
    if (!term) continue;
    const m = /^([\d.]+)%(?:\*(\d+))?$/.exec(term);
    if (m) total += Number(m[1]) * Number(m[2] ?? 1);
    else if (/^[\d.]+(\*\d+)?$/.test(term)) continue; // flat term
    else return null;
  }
  return total ? Math.round(total * 100) / 100 : null;
}

export function sim(castName: string, row: AppRow): number {
  const core = norm(stripPrefix(castName));
  const key = row.key.replace(/(DMG|Healing|Shield)$/, "");
  return Math.max(ratio(core, norm(stripPrefix(row.label ?? ""))), ratio(core, norm(key)), ratio(core, norm(key.replace(KEY_PREFIX_RE, ""))));
}

const stageOf = (cast: Cast): string | null => {
  const m = /\s(\d)$/.exec(cast.name.split("(")[0].trim());
  return m && (cast.cast === "Basic" || cast.cast === "Heavy" || cast.cast === null) ? m[1] : null;
};

type Score = [boolean, boolean, boolean, boolean, number];
// eslint-disable-next-line no-unused-vars -- the parameter of a function type
function rankRows(cast: Cast, cands: AppRow[]): { ordered: AppRow[]; score: (r: AppRow) => Score } {
  const pref = NODE_PREF[cast.node ?? ""] ?? CAST_PREF[cast.cast ?? ""] ?? [];
  const hint = hintOf(cast.name);
  const stage = stageOf(cast);
  const score = (r: AppRow): Score => {
    const k = norm(r.key);
    const stageOk = stage !== null && new RegExp(`stage${stage}(?!\\d)`).test(k);
    const stageBad = stage !== null && /stage\d/.test(k) && !stageOk;
    return [pref.includes(r.group), stageOk, !stageBad, hint !== null && k.includes(hint), sim(cast.name, r)];
  };
  const cmp = (x: Score, y: Score): number => {
    for (let i = 0; i < 5; i++) {
      const a = Number(x[i]), b = Number(y[i]);
      if (a !== b) return b - a;
    }
    return 0;
  };
  const ordered = [...cands].sort((a, b) => cmp(score(a), score(b)));
  return { ordered, score };
}
const sameScore = (a: Score, b: Score): boolean => a.every((v, i) => v === b[i]);

export function matchCast(cast: Cast, rows: AppRow[], overrides: Overrides): [AppRow | null, string, number] {
  const { name, mv: want, count } = cast;
  if (name in overrides) {
    const key = overrides[name];
    if (key === null) return [null, "override-drop", 0];
    const hit = rows.find((r) => r.key === key) ?? null;
    return hit ? [hit, "override", count] : [null, `override key ${key} missing`, 0];
  }
  if (!want) return [null, "no-mv", 0];
  const tol = 0.06;
  // 1. exact
  let cands = rows.filter((r) => r.mv && Math.abs(r.mv - want) < tol);
  if (cands.length) {
    const { ordered, score } = rankRows(cast, cands);
    if (cands.length === 1) return [ordered[0], "mv", count];
    return [ordered[0], sameScore(score(ordered[0]), score(ordered[1])) ? "mv-ambiguous" : "mv+name", count];
  }
  // 2. aggregate: the app row already holds all `count` ticks
  if (count > 1) {
    cands = rows.filter((r) => r.mv && Math.abs(r.mv - want * count) < tol * count);
    if (cands.length) return [rankRows(cast, cands).ordered[0], "aggregate", 1];
  }
  // 3. per-hit: the app row is one hit, the cast is N hits
  const nHint = hitsSuffix(name);
  for (const r of rows) {
    if (!r.mv || r.mv > want + tol) continue;
    const q = want / r.mv;
    const n = Math.round(q);
    // an echo with a single damage row (Hecate's Crescent Servants) needs no name resemblance
    if (Math.abs(q - n) < 0.01 && n >= 2 && n <= 40 && (nHint === null || n % nHint === 0 || nHint % n === 0) && (sim(name, r) >= 0.5 || rows.filter((x) => x.mv).length === 1)) {
      return [r, `per-hit×${n}`, count * n];
    }
  }
  // 4. ratio: same action, a multiplier the app models elsewhere
  const stage = stageOf(cast);
  const hint = hintOf(name);
  const named = rows.filter((r) => r.mv && (sim(name, r) >= 0.55 || (stage && new RegExp(`stage${stage}(?!\\d)`).test(norm(r.key)) && (hint === null || norm(r.key).includes(hint)))));
  const ordered = named.length ? rankRows(cast, named).ordered : [];
  for (const r of ordered.slice(0, 3)) {
    const q = want / (r.mv as number);
    if (q >= 1.05 && q <= 10) return [r, `mv×${q.toFixed(2)}`, count];
  }
  // 4b. fraction: the app row is an N-tick aggregate and this cast is ONE tick
  const fractionCands = rows.filter((r) => r.mv && sim(name, r) >= 0.6).sort((a, b) => sim(name, b) - sim(name, a)).slice(0, 3);
  for (const r of fractionCands) {
    const n = (r.mv as number) / want;
    if (Math.abs(n - Math.round(n)) < 0.02 && Math.round(n) >= 2 && Math.round(n) <= 40) return [r, `tick/${Math.round(n)}`, count];
  }
  // 5. name only
  const scored = rows.filter((r) => r.mv).sort((a, b) => sim(name, b) - sim(name, a));
  if (scored.length && sim(name, scored[0]) >= 0.7) return [scored[0], "name-only", count];
  return [null, "unmatched", 0];
}

/** Multipliers this kit folds into its MVs, from casts whose name match is strong (pass every loop's casts at once). */
export function knownRatios(casts: Cast[], rows: AppRow[], overrides: Overrides): Set<number> {
  const strong = new Map<number, number>();
  const names = new Map<number, Set<string>>();
  for (const c of casts) {
    if (!c.mv || isStatus(c.name) || c.name.startsWith("Echo - ")) continue;
    const [hit, how] = matchCast(c, rows, overrides);
    if (hit && how.startsWith("mv×")) {
      const r = Math.round(Number(how.slice(3)) * 100) / 100;
      if (!names.has(r)) names.set(r, new Set());
      names.get(r)!.add(c.name);
      if (sim(c.name, hit) >= 0.75) strong.set(r, (strong.get(r) ?? 0) + 1);
    }
  }
  const out = new Set<number>();
  for (const [r, set] of names) if ((strong.get(r) ?? 0) >= 1 || set.size >= 2) out.add(r);
  return out;
}

function matchWithRatios(cast: Cast, rows: AppRow[], ratios: Set<number>): [AppRow | null, string | null] {
  const want = cast.mv as number;
  const cands: Array<[AppRow, number]> = [];
  for (const r of rows) {
    if (!r.mv) continue;
    for (const k of ratios) if (Math.abs(r.mv * k - want) < 0.02 * want) cands.push([r, k]);
  }
  if (!cands.length) return [null, null];
  const { ordered } = rankRows(cast, cands.map(([r]) => r));
  const k = cands.find(([r]) => r === ordered[0])![1];
  return [ordered[0], `mv×${k.toFixed(2)}`];
}

/** The app echo an "Echo - X" cast belongs to: by the queuing gear's name (the echo itself) or the cast name. */
export function findEcho(name: string, by: string | null | undefined, echoRows: Record<string, EchoRows>): string | null {
  const base = stripPrefix(name);
  const cands = [by ?? "", (by ?? "").split(":")[0], base, base.split(":")[0], base.replace(/\s*(Outro|Swap)$/, "")];
  const keys = new Map<string, string>();
  for (const [k, v] of Object.entries(echoRows)) keys.set(norm(v.name), k);
  for (const k of Object.keys(echoRows)) keys.set(norm(k), k);
  for (const c of cands) {
    let n = norm(c);
    if (!n) continue;
    if (ECHO_ALIASES[n]) n = norm(ECHO_ALIASES[n]);
    const exact = keys.get(n);
    if (exact) return exact;
    const close = new Set<string>();
    for (const [nk, k] of keys) if (n === nk || n.endsWith(nk) || nk.endsWith(n) || (n.length >= 8 && nk.startsWith(n))) close.add(k);
    if (close.size === 1) return [...close][0];
    let best: [string, number] | null = null;
    for (const [nk, k] of keys) {
      const r = ratio(n, nk);
      if (r >= 0.85 && (!best || r > best[1])) best = [k, r];
    }
    if (best) return best[0];
  }
  return null;
}

export const emptyReport = (): MapReport => ({ methods: {}, unmatched: [], review: [], skipped: [], status: [], multipliers: [] });

/** Executed casts -> app rotation actions (order 1..n). Mirrors map_rotations.to_actions. */
export function toActions(casts: Cast[], rows: AppRow[], echoRows: Record<string, EchoRows>, overrides: Overrides, report: MapReport, ratios?: Set<number>): MappedAction[] {
  const actions: MappedAction[] = [];
  let order = 0;
  const kitRatios = ratios ?? knownRatios(casts, rows, overrides);
  const ticks = new Map<string, { ticks: number; n: number; action: MappedAction }>();
  const bump = (how: string): void => {
    const m = how.startsWith("mv×") ? "ratio" : how.startsWith("tick/") ? "tick" : how.startsWith("per-hit") ? "per-hit" : how;
    report.methods[m] = (report.methods[m] ?? 0) + 1;
  };
  for (const c of casts) {
    const nm = c.name;
    if (nm === "Tune Break" || c.cast === "TuneBreak") { report.skipped.push("Tune Break (enemy row)"); continue; }
    if (isStatus(nm)) {
      report.status.push(`${c.count}x ${nm}`);
      const t = TICK_RE.exec(nm);
      if (!t) continue; // Electro Rage ticks, bare status names: nothing to press in the app
      const sub = TICK_SUB[t[1]];
      const stacks = Math.min(Number(t[2]), tickCap(sub));
      // a kit that converts the status has its own row for the tick (Hiyuki's Glacio Bite DMG, a forte row that reads
      // the stack count the same way); everyone else presses the app's generic negative-status action
      const own = rows.find((r) => r.key === `ElementalEffect${sub === "GlacioChafe" ? "GlacioBite" : sub}`) ?? null;
      order += 1;
      const a: MappedAction = { order, key: own?.key ?? `ElementalEffect${sub}`, type: own?.group ?? "negativeStatus", count: c.count, buffs: [], excludeTeamBuffs: false, excludeWeaponBuffs: false, isDisabled: false, negativeStatusStacks: stacks };
      if (sub === "ElectroFlare") a.electroRageStacks = Math.min(c.held?.electroRage ?? 0, 13);
      bump("status");
      actions.push(a);
      continue;
    }
    if (!c.mv) { report.skipped.push(`${nm} (0 MV)`); continue; }
    if (nm.includes("(Cancelled)") || nm === "Echo - Stay tuned" || nm.startsWith("Utility - ")) { report.skipped.push(nm); continue; }
    let hit: AppRow | null = null;
    let how = "";
    let count = c.count;
    if (c.cast === "Echo" || nm.startsWith("Echo - ")) {
      const ekey = findEcho(nm, c.by, echoRows);
      if (ekey) {
        [hit, how, count] = matchCast(c, echoRows[ekey].rows, overrides);
        if (hit) hit = { ...hit, echoKey: ekey };
      } else if (nm.startsWith("Echo - ")) {
        report.unmatched.push(`${nm} (echo not found in app registry)`);
        bump("unmatched");
        continue;
      }
      // else: the resonator's own cast that wuwa_calc types as an Echo cast (Lucilla's "Forte Echo - Oblivion") — the kit's rows
    }
    if (hit === null) {
      [hit, how, count] = matchCast(c, rows, overrides);
      if (kitRatios.size && (hit === null || how === "name-only" || how === "mv-ambiguous" || (how.startsWith("mv×") && !kitRatios.has(Math.round(Number(how.slice(3)) * 100) / 100) && sim(nm, hit) < 0.75))) {
        const [h2, how2] = matchWithRatios(c, rows, kitRatios);
        if (h2 !== null && how2 !== null) { hit = h2; how = how2; count = c.count; }
      }
    }
    bump(how);
    if (how === "override-drop") continue;
    if (hit === null) { report.unmatched.push(`${nm} (mv ${c.mv}, ${c.cast}/${c.node}, ${how})`); continue; }
    if (how === "name-only" || how === "mv-ambiguous" || (how.startsWith("mv×") && sim(nm, hit) < 0.75)) report.review.push(`${nm} -> ${hit.key} [${how}]`);
    if (how.startsWith("mv×")) report.multipliers.push(`${nm} = ${hit.key} × ${how.slice(3)}`);
    // a hand-mapped cast whose MV the kit multiplies
    if (how === "override" && hit.mv && c.mv && Math.abs(c.mv / hit.mv - 1) > 0.01) report.multipliers.push(`${nm} = ${hit.key} × ${(c.mv / hit.mv).toFixed(2)}`);
    if (how.startsWith("tick/")) {
      const n = Number(how.split("/")[1]);
      const slot = ticks.get(hit.key);
      if (slot) { slot.ticks += count; continue; }
      order += 1;
      const a: MappedAction = { order, key: hit.key, type: hit.group, count: 1, buffs: [], excludeTeamBuffs: false, excludeWeaponBuffs: false, isDisabled: false };
      ticks.set(hit.key, { ticks: count, n, action: a });
      actions.push(a);
      continue;
    }
    order += 1;
    const a: MappedAction = { order, key: hit.key, type: hit.group, count, buffs: [], excludeTeamBuffs: false, excludeWeaponBuffs: false, isDisabled: false };
    if (hit.echoKey) { a.mainEcho = hit.echoKey; a.mainEchoRank = 5; }
    actions.push(a);
  }
  for (const [key, t] of ticks) {
    t.action.count = Math.max(1, Math.round(t.ticks / t.n));
    report.skipped.push(`${t.ticks} ticks of ${key} -> ${t.action.count}x the app's ${t.n}-hit row`);
  }
  return actions;
}

// ------------------------------------------------------------- app rows from this app's data

const GROUPS: Record<string, string> = { basicAttacks: "basic", skillAttacks: "skill", liberationAttacks: "liberation", forteCircuitAttacks: "forteCircuit", introAttacks: "intro", outroAttacks: "outro", tuneBreakAttacks: "tuneBreak" };

/** The attack rows of one character, from `getCharByName()`'s data (same walk as the tool's dump). */
export function appRowsOf(charData: Record<string, unknown>): AppRow[] {
  const rows: AppRow[] = [];
  const walk = (node: unknown, group: string): void => {
    if (Array.isArray(node)) { node.forEach((x) => walk(x, group)); return; }
    if (node && typeof node === "object") {
      const n = node as Record<string, unknown>;
      if (typeof n.key === "string" && (n.talents || typeof n.talent === "string")) {
        const lv10 = (n.talents as Record<string, unknown> | undefined)?.["10"] ?? n.talent ?? null;
        rows.push({ group, key: n.key, label: (n.label as string | undefined) ?? (n.name as string | undefined) ?? null, mv: mvOf(lv10) });
        return;
      }
      for (const v of Object.values(n)) walk(v, group);
    }
  };
  for (const [prop, group] of Object.entries(GROUPS)) if (charData[prop]) walk(charData[prop], group);
  return rows;
}

/** Every echo's action rows, from `mainEchoesData`. */
export function echoRowsOf(mainEchoes: Record<string, { name: string; actions?: Array<Record<string, unknown>> }>): Record<string, EchoRows> {
  const out: Record<string, EchoRows> = {};
  for (const [key, e] of Object.entries(mainEchoes)) {
    out[key] = {
      name: e.name,
      rows: (e.actions ?? []).map((a) => {
        const talents = a.talents as Record<string, unknown> | undefined;
        return { group: "echoAttacks", key: String(a.key), label: (a.label as string | undefined) ?? null, mv: mvOf(talents?.["10"] ?? talents?.["5"] ?? null), echoKey: key };
      }),
    };
  }
  return out;
}
