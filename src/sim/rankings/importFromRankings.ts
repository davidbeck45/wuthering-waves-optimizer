// Wuthering Tools+: "make all of the rotations importable" — turn the team a
// Rankings detail page shows (any team, any solver state, any picks) into a
// Team Rotation in this app, and optionally each member's steady-state loop
// into that character's saved rotations. Riley's engine runs in-page (traced)
// and castMapper.ts maps the executed casts onto this app's attack keys.
//
// Two halves (2026-09-14): `prepareTeamImport()` turns a traced run into plain
// data — name, actions, the enemy settings the run held, each member's loop —
// with no store or page in sight, so the headless CLI (`sync-teams`,
// syncTeamsHeadless.ts) shares it; `importTeamFromRankings()` is the browser
// path that resolves the run from the page model and writes the stores.
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { randomString } from "../../utils/strings";
import {
  OVERRIDES,
  appKeyOf,
  appRowsOf,
  attachRage,
  echoRowsOf,
  emptyReport,
  enemyConfigOf,
  enemyStacksOf,
  finishTicks,
  fusionBurstCapOf,
  handoffsOf,
  knownRatios,
  toActions,
  type AppRow,
  type Cast,
  type EchoRows,
  type EnemyStacks,
  type MapReport,
  type MappedAction,
  type TickState,
} from "./castMapper";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RankingsMods {
  teamrun: any;
  solver: any;
  model: any;
  /** @skittle/engine/stats — CAST_NAME / NODE_NAME turn the engine's enum numbers into names */
  stats: any;
}

/** The engine modules a prepared import needs — no page model, so the CLI hands in the fork's engine directly. */
export type EngineMods = Pick<RankingsMods, "teamrun" | "solver" | "stats">;

export interface ImportOptions {
  /** also append each member's loop to that character's saved rotations (characters set up in this app only) */
  characterRotations?: boolean;
  /** update this saved team in place — actions, enemy settings, and the name while it still reads as
   *  generated (`isGeneratedTeamName`) — instead of creating a new team ("Sync my teams", syncTeams.ts) */
  replaceTeamId?: string;
}

export interface ImportedAction {
  slot: number;
  key: string;
  count: number;
  mainEcho?: string;
  /** a negative-status tick's stack count */
  stacks?: number;
}

export interface PreparedMember {
  name: string;
  key: string;
  slot: number;
  sequence: number;
  refinement: number;
  weapon: string;
  /** the sequence levels at which this member's loadout switches to another declared loop (Riley's `rotationAt`) */
  loopChangesAt: number[];
  /** the first such level above the sequence this run used — null when no higher sequence changes the loop */
  nextLoopChange: number | null;
}

export type TeamAction = Record<string, unknown> & { slot: number; order: number; key: string; type: string; count: number; mainEcho?: string; negativeStatusStacks?: number };

export interface PreparedTeam {
  teamName: string;
  description: string;
  /** Riley's team DPR for the run */
  total: number;
  /** app character keys in slot order (main DPS first) */
  keys: string[];
  /** the interleaved steady-state loop, slot-indexed against `keys`, merged and ordered 1..n */
  actions: TeamAction[];
  /** Riley's target (level 100 / 20 % RES) plus the negative-status stacks the run held */
  enemyConfig: Record<string, unknown>;
  /** the stack fields the run set above zero */
  enemySeen: Partial<EnemyStacks>;
  /** who each member hands off to after their Outro (app keys) — what the team-buff derivation reads for
   *  "incoming Resonator" buffs (src/sim/teamContext) */
  handoffs: Record<string, string[]>;
  members: PreparedMember[];
  statuses: string[];
  notPorted: string[];
  /** each member's own loop as a character rotation (no actions when nothing mapped) */
  rotations: Array<{ name: string; key: string; rotationName: string; description: string; actions: MappedAction[] }>;
}

export interface ImportResult {
  teamId: string;
  teamName: string;
  actions: number;
  /** the actions written, slot-indexed against the team's characterIds */
  actionList: ImportedAction[];
  /** true when an existing team was updated in place */
  replaced: boolean;
  members: string[];
  memberDetails: PreparedMember[];
  enemyConfig: Record<string, unknown>;
  enemySeen: Partial<EnemyStacks>;
  characterRotationsSaved: string[];
  characterRotationsSkipped: string[];
  notPorted: string[];
  statuses: string[];
}

/** Riley's engine scores against a level-100 target with a flat 20% resistance. */
export const ENEMY = {
  enemyLevel: 100,
  enemyResist: 0.2,
  enemyType: "Calamity",
  enemyBrowserKey: null,
  spectroFrazzleStacks: 0,
  aeroErosionStacks: 0,
  havocBaneStacks: 0,
  fusionBurstStacks: 0,
  electroFlareStacks: 0,
  electroRageStacks: 0,
  glacioChafeStacks: 0,
  strainStacks: 0,
};

/** How the enemy panel names each stack field. */
export const STACK_LABEL: Record<keyof EnemyStacks, string> = {
  spectroFrazzleStacks: "Spectro Frazzle",
  aeroErosionStacks: "Aero Erosion",
  havocBaneStacks: "Havoc Bane",
  fusionBurstStacks: "Fusion Burst",
  electroFlareStacks: "Electro Flare",
  electroRageStacks: "Electro Rage",
  glacioChafeStacks: "Glacio Chafe",
  strainStacks: "Tune Strain",
};

interface Hit {
  member: string;
  enemy: boolean;
  cast: Cast;
}

const cleanAction = (a: MappedAction): Record<string, unknown> => {
  const out: Record<string, unknown> = { order: a.order, key: a.key, type: a.type, count: a.count, buffs: [], isDisabled: false };
  if (a.mainEcho) {
    out.mainEcho = a.mainEcho;
    out.mainEchoRank = a.mainEchoRank ?? 5;
  }
  if (a.negativeStatusStacks != null) out.negativeStatusStacks = a.negativeStatusStacks;
  if (a.electroRageStacks != null) out.electroRageStacks = a.electroRageStacks;
  if (a.buffs.length) out.buffs = a.buffs.map((b) => ({ ...b }));
  if (a.advancedConfig) out.advancedConfig = { buffs: Object.fromEntries(Object.entries(a.advancedConfig.buffs).map(([k, v]) => [k, { ...v }])) };
  return out;
};

/** the action-level multiplier a row carries, for its identity */
const multOf = (a: { buffs?: unknown }): string => JSON.stringify((Array.isArray(a.buffs) ? a.buffs : []).map((b: any) => [b.modifier, b.modifierValue]));

const investmentTag = (combo: any): string => `S${combo.sequence}R${combo.weapon?.refinement ?? 1}`;

/** A team name this importer (or the stock team presets) wrote, as opposed to one the player typed. */
export const isGeneratedTeamName = (name: string | null | undefined): boolean => /^wuwa_calc /.test(name ?? "") || /\(wuwa_calc t\d+\)/.test(name ?? "");

/** Two team actions that merge into one row: same slot, attack, main echo and (for a status tick) stack count. */
export const sameAction = (
  a: { slot: number; key: string; mainEcho?: string | null; negativeStatusStacks?: number | null; buffs?: unknown; advancedConfig?: unknown },
  b: { slot: number; key: string; mainEcho?: string | null; negativeStatusStacks?: number | null; buffs?: unknown; advancedConfig?: unknown },
): boolean =>
  a.slot === b.slot && a.key === b.key && (a.mainEcho ?? null) === (b.mainEcho ?? null) && (a.negativeStatusStacks ?? null) === (b.negativeStatusStacks ?? null)
  && multOf(a) === multOf(b) && Boolean(a.advancedConfig) === Boolean(b.advancedConfig);

/** the steady-state loop a Rotation presses, as the sequence of cast names (groups unfolded) */
const loopSequence = (rotation: any): string => {
  const out: string[] = [];
  const add = (a: any): void => { if (a?.actions?.length) a.actions.forEach(add); else out.push(String(a?.name ?? "")); };
  for (const a of rotation?.intro?.body ?? rotation?.opener?.body ?? []) add(a);
  return out.join("|");
};

/** The sequence levels at which a loadout's steady-state loop changes (Riley's `Loadout.rotationAt`): a level whose
 *  loop presses a different sequence of casts than the one below it. A level that only changes an opener or
 *  start-of-combat chain (Aemeath S1, Xuanling S1, Hiyuki S2) is not a loop change — the breakpoints table lists
 *  those separately. A loadout with one loop at every level gives []. */
export function loopChangesAt(loadout: any): number[] {
  const out: number[] = [];
  let prev: any = null;
  for (let n = 0; n <= 6; n++) {
    let r: any = null;
    try {
      r = loadout?.rotationAt?.(n) ?? null;
    } catch {
      r = null;
    }
    if (n > 0 && prev !== null && r !== null && r !== prev && loopSequence(r) !== loopSequence(prev)) out.push(n);
    prev = r;
  }
  return out;
}

const stacksLabel = (seen: Partial<EnemyStacks>): string =>
  (Object.keys(STACK_LABEL) as Array<keyof EnemyStacks>).filter((k) => seen[k]).map((k) => `${STACK_LABEL[k]} ${seen[k]}`).join(", ");

/** A traced run (`runTeam(..., true)`) as plain import data: the interleaved loop mapped onto this app's attack keys,
 *  the enemy settings the run held, each member's own loop. Nothing here touches a store or the page. */
export async function prepareTeamImport(mods: EngineMods, traced: any): Promise<PreparedTeam> {
  const members: any[] = traced.members;
  const combos: any[] = traced.combo;
  const names: string[] = members.map((m) => m.name);
  const keys = names.map(appKeyOf);

  const rowsByKey = new Map<string, AppRow[]>();
  for (const k of new Set(keys)) {
    let data: Record<string, unknown> | null = null;
    try {
      data = (await getCharByName(k)) as Record<string, unknown>;
    } catch {
      data = null;
    }
    if (!data) throw new Error(`${names[keys.indexOf(k)]} is not in this app yet, so this team can't be imported.`);
    rowsByKey.set(k, appRowsOf(data));
  }
  const echoRows: Record<string, EchoRows> = echoRowsOf(mainEchoesData as never);
  const CAST: Record<number, string> = mods.stats.CAST_NAME;
  const NODE: Record<number, string> = mods.stats.NODE_NAME;
  const toCast = (h: any): Cast => ({
    name: h.action.name,
    // the kit's own motion value, not the run's (see castMapper.ts `Cast.mv`)
    mv: h.action.mv,
    mvRun: h.mv,
    count: 1,
    cast: CAST[h.action.cast] ?? null,
    node: NODE[h.action.node] ?? null,
    queued: !!h.queued,
    triggered: !!h.triggered,
    by: h.triggeredBy?.name ?? null,
    held: enemyStacksOf(h.heldEnemy),
  });
  const sections: Hit[][] = (traced.rotationLines as any[][]).map((lines) =>
    lines.flatMap((line) => mods.teamrun.hitsOf(line) as any[]).map((h) => ({ member: h.member, enemy: h.slot !== h.member, cast: toCast(h) })),
  );
  const lastSection = sections[sections.length - 1] ?? [];
  // per-hit mapping below: give each Flare tick its Rage count first (attachRage works on a whole loop)
  const raged = attachRage(lastSection.map((h) => h.cast));
  const loop: Hit[] = lastSection.map((h, i) => ({ ...h, cast: raged[i] }));

  // kit multipliers per member, pooled over every cast of this run (what map_rotations does per resonator)
  const ratiosByName = new Map<string, Set<number>>();
  for (const name of names) {
    const casts = sections.flat().filter((h) => h.member === name && !h.enemy).map((h) => h.cast);
    ratiosByName.set(name, knownRatios(casts, rowsByKey.get(appKeyOf(name))!, OVERRIDES[name] ?? {}));
  }

  // slot 0 is the carry, like the curated presets
  const mainIndex = Math.max(0, members.findIndex((m) => m.mainDps));
  const slotOrder = [mainIndex, ...members.map((_, i) => i).filter((i) => i !== mainIndex)];
  const slotOf = (name: string): number => slotOrder.indexOf(names.indexOf(name));

  // one hit at a time so the slots interleave as the engine ran them; one report + tick state per member across
  // those calls, so a row that stands for N ticks is settled once the whole loop has been seen (finishTicks)
  const raw: Array<{ slot: number; action: MappedAction }> = [];
  const reports = new Map<string, { report: MapReport; ticks: TickState }>();
  const fbCap = fusionBurstCapOf(loop.map((h) => h.cast));
  for (const h of loop) {
    if (h.enemy) continue;
    const r = reports.get(h.member) ?? { report: emptyReport(), ticks: new Map() };
    reports.set(h.member, r);
    const acts = toActions([h.cast], rowsByKey.get(appKeyOf(h.member))!, echoRows, OVERRIDES[h.member] ?? {}, r.report, ratiosByName.get(h.member), r.ticks, fbCap);
    for (const a of acts) raw.push({ slot: slotOf(h.member), action: a });
  }
  const notPorted = new Set<string>();
  const statuses = new Set<string>();
  for (const [member, r] of reports) {
    finishTicks(r.ticks, r.report);
    for (const u of r.report.unmatched) notPorted.add(`${member}: ${u.replace(/ \(.*\)$/, "")}`);
    for (const s of r.report.status) statuses.add(s.replace(/^\d+x /, ""));
  }
  const teamActions: TeamAction[] = raw.map(({ slot, action }) => ({ slot, ...cleanAction(action) }) as TeamAction);
  const merged: TeamAction[] = [];
  for (const a of teamActions) {
    const last = merged[merged.length - 1];
    if (last && sameAction(last, a)) last.count += a.count;
    else merged.push({ ...a });
  }
  merged.forEach((a, i) => (a.order = i + 1));

  // the enemy settings the loop ran under: every member's casts in execution order, with the debuffs held
  const enemyStacks = enemyConfigOf(loop.filter((h) => !h.enemy).map((h) => h.cast));
  const enemySeen: Partial<EnemyStacks> = {};
  for (const k of Object.keys(enemyStacks) as Array<keyof EnemyStacks>) if (enemyStacks[k]) enemySeen[k] = enemyStacks[k];
  const enemyConfig = { ...ENEMY, ...enemyStacks };
  const handoffs = handoffsOf(loop);

  const tags = members.map((_, i) => investmentTag(combos[i]));
  const dpsTag = tags[mainIndex];
  const otherTags = [...new Set(tags.filter((_, i) => i !== mainIndex))];
  const tag = otherTags.every((t) => t === dpsTag) ? dpsTag : `${dpsTag} DPS · ${otherTags.join("/")} team`;
  const ordered = slotOrder.map((i) => names[i]);
  const teamName = `wuwa_calc ${ordered[0]} ${tag} · ${ordered.slice(1).join(" + ")}`;
  const spec = slotOrder
    .map((i) => `${names[i]} ${tags[i]} ${combos[i].weapon?.name ?? ""}, ${mods.solver.echoLabel(members[i].loadout, combos[i].echo)}, ${combos[i].mainstat?.name ?? ""}`)
    .join("; ");
  let description = `Imported from the Team Rankings page (Riley31415/wuwa_calc): ${Math.round(traced.total).toLocaleString()} team DPR against a level 100 target with 20% RES. Slots: ${spec}. One steady-state loop, the three rotations interleaved as the engine ran them. Tune Breaks are not actions here.`;
  if (Object.keys(enemySeen).length) description += ` Enemy settings from the run: ${stacksLabel(enemySeen)}.`;
  if (statuses.size) description += ` Negative-status ticks in the loop (pressed as negative-status actions at the tick's stack count): ${[...statuses].join(", ")}.`;
  if (notPorted.size) description += ` Not ported (no matching action in this app): ${[...notPorted].join(", ")}.`;

  const memberDetails: PreparedMember[] = members.map((m, i) => {
    const changes = loopChangesAt(m.loadout);
    const sequence = Number(combos[i].sequence ?? 0);
    return {
      name: names[i],
      key: keys[i],
      slot: slotOf(names[i]),
      sequence,
      refinement: Number(combos[i].weapon?.refinement ?? 1),
      weapon: String(combos[i].weapon?.name ?? ""),
      loopChangesAt: changes,
      nextLoopChange: changes.find((n) => n > sequence) ?? null,
    };
  });

  const rotations: PreparedTeam["rotations"] = [];
  for (let i = 0; i < members.length; i++) {
    const name = names[i];
    const k = keys[i];
    const casts: Cast[] = [];
    for (const h of loop) {
      if (h.member !== name || h.enemy) continue;
      const last = casts[casts.length - 1];
      if (last && last.name === h.cast.name) last.count += 1;
      else casts.push({ ...h.cast, count: 1 });
    }
    const report = emptyReport();
    const actions = toActions(casts, rowsByKey.get(k)!, echoRows, OVERRIDES[name] ?? {}, report, ratiosByName.get(name));
    const others = names.filter((n) => n !== name);
    rotations.push({
      name,
      key: k,
      rotationName: `${name} ${tags[i]} ${combos[i].weapon?.name ?? ""} · ${others.join(" + ")} · ${tag} (wuwa_calc)`,
      description: `Steady-state loop from the Team Rankings page (Riley31415/wuwa_calc): ${tags[i]}, ${combos[i].weapon?.name ?? ""}, ${mods.solver.echoLabel(members[i].loadout, combos[i].echo)}, main stats ${combos[i].mainstat?.name ?? ""}; team ${ordered.join(" + ")}, ${Math.round(traced.total).toLocaleString()} team DPR.${report.unmatched.length ? ` Not ported: ${report.unmatched.map((u) => u.replace(/ \(.*\)$/, "")).join(", ")}.` : ""}`,
      actions,
    });
  }

  return {
    teamName,
    description,
    total: Number(traced.total ?? 0),
    keys: slotOrder.map((i) => keys[i]),
    actions: merged,
    enemyConfig,
    enemySeen,
    handoffs,
    members: memberDetails,
    statuses: [...statuses],
    notPorted: [...notPorted],
    rotations,
  };
}

/** A prepared team's actions re-pointed at the slots an existing team holds those characters in; null when the
 *  existing team does not hold the same three characters. */
export function reslotActions(prepared: PreparedTeam, characterIds: Array<string | null>): TeamAction[] | null {
  const slotIn = prepared.keys.map((k) => characterIds.indexOf(k));
  if (slotIn.some((s) => s < 0)) return null;
  return prepared.actions.map((a) => ({ ...a, slot: slotIn[a.slot] }));
}

/** The report's view of written actions: slot, attack, count, main echo, a tick's stack count. */
export const toImportedActions = (actions: TeamAction[]): ImportedAction[] =>
  actions.map((a) => ({
    slot: a.slot,
    key: a.key,
    count: a.count,
    ...(a.mainEcho ? { mainEcho: a.mainEcho } : {}),
    ...(a.negativeStatusStacks != null ? { stacks: a.negativeStatusStacks } : {}),
  }));

/** The character rotation record a prepared member loop becomes (ids fresh, order after the existing ones). */
export const toCharacterRotation = (r: PreparedTeam["rotations"][number], order: number): Record<string, unknown> => ({
  id: randomString(),
  name: r.rotationName,
  description: r.description,
  duration: null,
  order,
  actions: r.actions.map((a) => ({ ...cleanAction(a), id: randomString() })),
});

/** The browser path: resolve the run from the page model, prepare it, write the stores. */
export async function importTeamFromRankings(mods: RankingsMods, key: string, options: ImportOptions = {}): Promise<ImportResult> {
  let run = mods.model.results.get(key);
  if (!run) {
    // a row the table solved but never ran (Sync my teams): run it traced here, as the detail page would
    const row = mods.model.rowFromKey(key);
    if (!row) throw new Error("This team has not been run yet — open its detail page first.");
    run = mods.teamrun.runTeam(row.teamKey, row.members, row.combo, true);
    mods.model.results.set(key, run);
  }
  const traced = run.rotationLines ? run : mods.teamrun.runTeam(run.teamKey, run.members, run.combo, true);
  const prepared = await prepareTeamImport(mods, traced);

  // the stores load here, not at the top: they pull lodash through a CJS named import that tsx cannot resolve,
  // and the headless CLI shares this module for `prepareTeamImport` (syncTeamsHeadless.ts)
  const [{ useTeamRotationsStore }, { useCharacterStore }] = await Promise.all([import("../../stores/teamRotations"), import("../../stores/character")]);
  const teamStore = useTeamRotationsStore();
  let team: { id: string; name: string };
  let written: TeamAction[] = prepared.actions;
  if (options.replaceTeamId) {
    const existing = (teamStore.teams as any[]).find((t) => t.id === options.replaceTeamId);
    if (!existing) throw new Error("The team to update no longer exists.");
    // the saved team keeps its slot order: re-point every action at the slot that character holds there
    const reslotted = reslotActions(prepared, existing.characterIds as Array<string | null>);
    if (!reslotted) throw new Error(`${existing.name} does not hold the same three characters as the rankings row.`);
    written = reslotted;
    teamStore.setTeamActions(existing.id, written.map((a) => ({ ...a, id: randomString(12) })));
    teamStore.setTeamEnemyConfig(existing.id, { ...prepared.enemyConfig });
    if (isGeneratedTeamName(existing.name)) teamStore.renameTeam(existing.id, prepared.teamName);
    // the store has no setters for these; the record is the store's own reactive object
    existing.description = prepared.description;
    existing.handoffs = prepared.handoffs;
    team = existing;
  } else {
    team = teamStore.importTeam({
      name: prepared.teamName,
      characterIds: prepared.keys,
      buildIds: [null, null, null],
      actions: prepared.actions,
      duration: null,
      enemyConfig: { ...prepared.enemyConfig },
      description: prepared.description,
      handoffs: prepared.handoffs,
    });
  }

  const saved: string[] = [];
  const skipped: string[] = [];
  if (options.characterRotations) {
    const characterStore = useCharacterStore();
    for (const r of prepared.rotations) {
      const existing = (characterStore.characters as Record<string, any>)[r.key];
      if (!existing || !r.actions.length) {
        skipped.push(r.name);
        continue;
      }
      characterStore.setCharacterRotations(r.key, [...(existing.rotations ?? []), toCharacterRotation(r, (existing.rotations ?? []).length)]);
      saved.push(r.name);
    }
  }

  return {
    teamId: team.id,
    teamName: prepared.teamName,
    actions: prepared.actions.length,
    actionList: toImportedActions(written),
    replaced: Boolean(options.replaceTeamId),
    members: prepared.members.slice().sort((a, b) => a.slot - b.slot).map((m) => m.name),
    memberDetails: prepared.members,
    enemyConfig: prepared.enemyConfig,
    enemySeen: prepared.enemySeen,
    characterRotationsSaved: saved,
    characterRotationsSkipped: skipped,
    notPorted: prepared.notPorted,
    statuses: prepared.statuses,
  };
}
