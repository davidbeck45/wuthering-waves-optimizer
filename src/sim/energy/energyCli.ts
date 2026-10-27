// Wuthering Tools+ — `npm run cli -- er [--team <t>] [--all]`: the energy check headless. Every saved team (or one, or
// with --all every composition the account can field) measured with Riley's engine at the export's account
// (rileyNode.ts), each member's ER need beside the ER their build has in the app, the worst need per character (the
// floor substat weights respect), crit overcap. Node-only (the CLI imports it lazily).
import type { ExportFile } from "../cli/exportFile";
import { findTeam } from "../cli/engine";
import { int, pct, table } from "../cli/format";
import { rileyHeadless, type HeadlessRiley } from "../engine/rileyNode";
import {
  characterFloors,
  energySummary,
  isFreeCharacter,
  measureComposition,
  measureKeys,
  memberChecks,
  NOT_MEASURED_TEXT,
  scanCandidates,
  teamHaves,
  type CharacterFloor,
  type EnergyEngine,
  type EnergySummary,
  type MemberCheck,
  type TeamMeasure,
} from "./energyCheck";
import { menuEnergyRegen } from "./energyHave";
import { showHave, showNeed } from "./energyNeed";
import { getCharacterRosterDisplayName } from "../../characters/characters";

const nameOf = (id: string): string => getCharacterRosterDisplayName(id) || id;

/** The headless seam as an `EnergyEngine` (its calls are synchronous; the interface is the browser's). */
export const engineOfHeadless = (riley: HeadlessRiley): EnergyEngine => ({
  commit: riley.engine.commit,
  teamKeysFor: async (ids) => riley.teamKeysFor(ids),
  solveMine: async (keys) => riley.solveMine(keys),
  tracedRun: async (key, picks) => riley.tracedRun(key, picks),
});

export interface EnergyTeamReport {
  id: string;
  name: string;
  /** "saved" — a team of the export; "scan" — a composition --all found */
  source: "saved" | "scan";
  characterIds: string[];
  measure: TeamMeasure;
  checks: MemberCheck[] | null;
}

export interface EnergyReport {
  export: string;
  commit: string;
  account: string;
  teams: EnergyTeamReport[];
  /** the worst need per character across the saved teams */
  floors: CharacterFloor[];
  summary: EnergySummary;
  ms: number;
}

export async function energyReport(exp: ExportFile, options: { team?: string; all?: boolean; auto?: boolean } = {}): Promise<EnergyReport> {
  const t0 = performance.now();
  const riley = await rileyHeadless(exp);
  const engine = engineOfHeadless(riley);
  const auto = options.auto ?? true;
  const saved = (options.team ? [findTeam(options.team, exp.teams)] : exp.teams).filter((t: any) => (t.characterIds ?? []).filter(Boolean).length > 0);
  const teams: EnergyTeamReport[] = [];
  for (const t of saved) {
    const ids = (t.characterIds ?? []).filter(Boolean) as string[];
    const measure = await measureComposition(engine, ids);
    const checks = measure.status === "ok" ? memberChecks(measure.energy, await teamHaves(t, exp.characters, exp.inventory.echoes, { auto }), ids) : null;
    teams.push({ id: String(t.id), name: String(t.name ?? "team"), source: "saved", characterIds: ids, measure, checks });
  }
  if (options.all) {
    riley.solveMine([]); // registers the account, so the candidates read its ownership
    const seen = new Set(teams.map((t) => [...t.characterIds].sort().join("+")));
    const haves = new Map<string, number | null>();
    const haveOf = async (id: string): Promise<number | null> => {
      if (!haves.has(id)) haves.set(id, await menuEnergyRegen(id, exp.characters, exp.inventory.echoes).catch(() => null));
      return haves.get(id) ?? null;
    };
    for (const c of scanCandidates(riley.teams, riley.account, riley.blocked, isFreeCharacter)) {
      if (seen.has(c.key)) continue;
      const measure = await measureKeys(engine, c.teamKeys);
      if (measure.status === "ok" && !measure.energy.members.every((m) => m.owned)) continue; // the fork says not fieldable after all
      let checks: MemberCheck[] | null = null;
      if (measure.status === "ok") {
        const h: Record<string, number | null> = {};
        for (const id of c.characterIds) h[id] = await haveOf(id);
        checks = memberChecks(measure.energy, h, c.characterIds);
      }
      teams.push({ id: c.key, name: c.characterIds.join(" + "), source: "scan", characterIds: c.characterIds, measure, checks });
    }
  }
  const savedTeams = teams.filter((t) => t.source === "saved");
  const floors = [...characterFloors(savedTeams.map((t) => ({ id: t.id, name: t.name, characterIds: t.characterIds, energy: t.measure.status === "ok" ? t.measure.energy : null }))).values()].sort((a, b) => b.need - a.need);
  return {
    export: exp.path,
    commit: riley.engine.commit,
    account: riley.account?.key ?? "",
    teams,
    floors,
    // the account's count reads the saved teams, as the app's does (--all lists the other compositions beside it)
    summary: energySummary(savedTeams),
    ms: Math.round(performance.now() - t0),
  };
}

const BAND_TEXT: Record<string, string> = { short: "SHORT", tight: "tight", ok: "ok", noGate: "no gate", unknown: "not set up" };

export function printEnergy(r: EnergyReport): void {
  console.log(`Energy check — wuwa_calc ${r.commit} at your account (${r.account || "none"}), your own echoes · ${r.teams.length} teams · ${(r.ms / 1000).toFixed(1)} s\n`);
  const rows: string[][] = [["  Team", "Member", "ER have", "ER need", "Set by", "Status", "Short", "Crit ≥100 %", "DPS"]];
  for (const t of r.teams) {
    if (t.measure.status !== "ok" || !t.checks) {
      rows.push([`  ${t.name}`, "-", "-", "-", "-", `not measured: ${t.measure.status === "notMeasured" ? NOT_MEASURED_TEXT[t.measure.reason] : ""}`, "", "", ""]);
      continue;
    }
    t.checks.forEach((c, i) => {
      const m = c.member;
      const setBy = m.setBy === "kit" ? `kit floor (loop ${m.bar == null ? "-" : pct(m.bar)})` : m.setBy === "loop" ? `${t.measure.status === "ok" ? t.measure.energy.teamKey : ""} loop` : "-";
      rows.push([
        i === 0 ? `  ${t.name}` : "",
        `${m.name}${m.owned ? "" : " *"}`,
        c.have == null ? "-" : pct(showHave(c.have)),
        c.need == null ? "-" : pct(showNeed(c.need)),
        setBy,
        BAND_TEXT[c.status] ?? c.status,
        c.short > 0 ? `${c.short.toFixed(1)} pts (${c.rolls} roll${c.rolls === 1 ? "" : "s"})` : "",
        m.overcap && m.overcap.share > 0.0005 ? `${pct(m.overcap.share * 100, 0)} of dmg${m.overcap.top[0] ? ` (${m.overcap.top[0].action.replace(/ \(.*\)$/, "")} ${pct(m.overcap.top[0].critRate)})` : ""}` : "",
        i === 0 && t.measure.status === "ok" ? int(t.measure.energy.total) : "",
      ]);
    });
  }
  console.log(table(rows));
  if (r.floors.length) {
    console.log("\nER floor per character (the highest need among your saved teams — what substat weights count ER up to)");
    console.log(table([["  Character", "Need", "Team"], ...r.floors.map((f) => [`  ${nameOf(f.characterId)}`, pct(showNeed(f.need)), f.team.name])]));
  }
  const s = r.summary;
  console.log(`\n${s.shortCharacters.length} character${s.shortCharacters.length === 1 ? "" : "s"} short on ER${s.shortCharacters.length ? ` (${s.shortCharacters.map(nameOf).join(", ")})` : ""} · ${s.overcapCharacters.length} overcapping crit${s.overcapCharacters.length ? ` (${s.overcapCharacters.map(nameOf).join(", ")})` : ""}`);
  console.log("ER need = the constant ER at which every Liberation of this team's wuwa_calc loop is paid on time (or the kit's own floor, if higher).");
  console.log("ER have = the character screen's ER of the build the team runs (equipment + permanent bonuses; fight buffs are inside the need). * = not on this account (runs S0 R1).");
}
