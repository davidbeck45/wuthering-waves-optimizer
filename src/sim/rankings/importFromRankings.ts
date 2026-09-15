// Wuthering Tools+: "make all of the rotations importable" — turn the team a
// Rankings detail page shows (any team, any solver state, any picks) into a
// Team Rotation in this app, and optionally each member's steady-state loop
// into that character's saved rotations. Riley's engine runs in-page (traced)
// and castMapper.ts maps the executed casts onto this app's attack keys.
import { getCharByName } from "../../characters/characters";
import { mainEchoesData } from "../../echoes/index";
import { useCharacterStore } from "../../stores/character";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { randomString } from "../../utils/strings";
import {
  OVERRIDES,
  appKeyOf,
  appRowsOf,
  echoRowsOf,
  emptyReport,
  knownRatios,
  toActions,
  type AppRow,
  type Cast,
  type EchoRows,
  type MappedAction,
} from "./castMapper";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface RankingsMods {
  teamrun: any;
  solver: any;
  model: any;
  /** @skittle/engine/stats — CAST_NAME / NODE_NAME turn the engine's enum numbers into names */
  stats: any;
}

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
  characterRotationsSaved: string[];
  characterRotationsSkipped: string[];
  notPorted: string[];
  statuses: string[];
}

/** Riley's engine scores against a level-100 target with a flat 20% resistance. */
const ENEMY = {
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
  return out;
};

const investmentTag = (combo: any): string => `S${combo.sequence}R${combo.weapon?.refinement ?? 1}`;

/** A team name this importer (or the stock team presets) wrote, as opposed to one the player typed. */
export const isGeneratedTeamName = (name: string | null | undefined): boolean => /^wuwa_calc /.test(name ?? "") || /\(wuwa_calc t\d+\)/.test(name ?? "");

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
    by: h.triggeredBy?.name ?? null,
  });
  const sections: Hit[][] = (traced.rotationLines as any[][]).map((lines) =>
    lines.flatMap((line) => mods.teamrun.hitsOf(line) as any[]).map((h) => ({ member: h.member, enemy: h.slot !== h.member, cast: toCast(h) })),
  );
  const loop = sections[sections.length - 1] ?? [];

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

  const teamActions: Array<Record<string, unknown> & { slot: number; key: string; count: number; mainEcho?: string }> = [];
  const notPorted = new Set<string>();
  const statuses = new Set<string>();
  for (const h of loop) {
    if (h.enemy) continue;
    const report = emptyReport();
    const acts = toActions([h.cast], rowsByKey.get(appKeyOf(h.member))!, echoRows, OVERRIDES[h.member] ?? {}, report, ratiosByName.get(h.member));
    for (const u of report.unmatched) notPorted.add(`${h.member}: ${u.replace(/ \(.*\)$/, "")}`);
    for (const s of report.status) statuses.add(s.replace(/^\d+x /, ""));
    for (const a of acts) teamActions.push({ slot: slotOf(h.member), ...cleanAction(a) } as never);
  }
  const merged: typeof teamActions = [];
  for (const a of teamActions) {
    const last = merged[merged.length - 1];
    if (last && last.slot === a.slot && last.key === a.key && last.mainEcho === a.mainEcho) last.count += a.count;
    else merged.push({ ...a });
  }
  merged.forEach((a, i) => (a.order = i + 1));

  const tags = members.map((_, i) => investmentTag(combos[i]));
  const dpsTag = tags[mainIndex];
  const otherTags = [...new Set(tags.filter((_, i) => i !== mainIndex))];
  const tag = otherTags.every((t) => t === dpsTag) ? dpsTag : `${dpsTag} DPS · ${otherTags.join("/")} team`;
  const ordered = slotOrder.map((i) => names[i]);
  const teamName = `wuwa_calc ${ordered[0]} ${tag} · ${ordered.slice(1).join(" + ")}`;
  const spec = slotOrder
    .map((i) => `${names[i]} ${tags[i]} ${combos[i].weapon?.name ?? ""}, ${mods.solver.echoLabel(members[i].loadout, combos[i].echo)}, ${combos[i].mainstat?.name ?? ""}`)
    .join("; ");
  let description = `Imported from the Team Rankings page (Riley31415/wuwa_calc): ${Math.round(traced.total).toLocaleString()} team DPR against a level 100 target with 20% RES. Slots: ${spec}. One steady-state loop, the three rotations interleaved as the engine ran them. Negative-status damage and Tune Breaks are not actions here — set them in the team's enemy settings.`;
  if (statuses.size) description += ` Negative-status damage seen: ${[...statuses].join(", ")}.`;
  if (notPorted.size) description += ` Not ported (no matching action in this app): ${[...notPorted].join(", ")}.`;

  const teamStore = useTeamRotationsStore();
  let team: { id: string; name: string };
  let written: typeof merged = merged;
  if (options.replaceTeamId) {
    const existing = (teamStore.teams as any[]).find((t) => t.id === options.replaceTeamId);
    if (!existing) throw new Error("The team to update no longer exists.");
    // the saved team keeps its slot order: re-point every action at the slot that character holds there
    const slotIn = slotOrder.map((i) => (existing.characterIds as Array<string | null>).indexOf(keys[i]));
    if (slotIn.some((s) => s < 0)) throw new Error(`${existing.name} does not hold the same three characters as the rankings row.`);
    written = merged.map((a) => ({ ...a, slot: slotIn[a.slot] }));
    teamStore.setTeamActions(existing.id, written.map((a) => ({ ...a, id: randomString(12) })));
    teamStore.setTeamEnemyConfig(existing.id, { ...ENEMY });
    if (isGeneratedTeamName(existing.name)) teamStore.renameTeam(existing.id, teamName);
    team = existing;
  } else {
    team = teamStore.importTeam({
      name: teamName,
      characterIds: slotOrder.map((i) => keys[i]),
      buildIds: [null, null, null],
      actions: merged,
      duration: null,
      enemyConfig: { ...ENEMY },
      description,
    });
  }

  const saved: string[] = [];
  const skipped: string[] = [];
  if (options.characterRotations) {
    const characterStore = useCharacterStore();
    for (let i = 0; i < members.length; i++) {
      const name = names[i];
      const k = keys[i];
      const existing = (characterStore.characters as Record<string, any>)[k];
      if (!existing) {
        skipped.push(name);
        continue;
      }
      const casts: Cast[] = [];
      for (const h of loop) {
        if (h.member !== name || h.enemy) continue;
        const last = casts[casts.length - 1];
        if (last && last.name === h.cast.name) last.count += 1;
        else casts.push({ ...h.cast, count: 1 });
      }
      const report = emptyReport();
      const actions = toActions(casts, rowsByKey.get(k)!, echoRows, OVERRIDES[name] ?? {}, report, ratiosByName.get(name));
      if (!actions.length) {
        skipped.push(name);
        continue;
      }
      const others = names.filter((n) => n !== name);
      const rotationName = `${name} ${tags[i]} ${combos[i].weapon?.name ?? ""} · ${others.join(" + ")} · ${tag} (wuwa_calc)`;
      const rotation = {
        id: randomString(),
        name: rotationName,
        description: `Steady-state loop from the Team Rankings page (Riley31415/wuwa_calc): ${tags[i]}, ${combos[i].weapon?.name ?? ""}, ${mods.solver.echoLabel(members[i].loadout, combos[i].echo)}, main stats ${combos[i].mainstat?.name ?? ""}; team ${ordered.join(" + ")}, ${Math.round(traced.total).toLocaleString()} team DPR.${report.unmatched.length ? ` Not ported: ${report.unmatched.map((u) => u.replace(/ \(.*\)$/, "")).join(", ")}.` : ""}`,
        duration: null,
        order: (existing.rotations ?? []).length,
        actions: actions.map((a) => ({ ...cleanAction(a), id: randomString() })),
      };
      characterStore.setCharacterRotations(k, [...(existing.rotations ?? []), rotation]);
      saved.push(name);
    }
  }

  return {
    teamId: team.id,
    teamName,
    actions: merged.length,
    actionList: written.map((a) => ({ slot: a.slot, key: a.key, count: a.count, ...(a.mainEcho ? { mainEcho: a.mainEcho } : {}) })),
    replaced: Boolean(options.replaceTeamId),
    members: ordered,
    characterRotationsSaved: saved,
    characterRotationsSkipped: skipped,
    notPorted: [...notPorted],
    statuses: [...statuses],
  };
}
