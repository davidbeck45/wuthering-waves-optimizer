// Wuthering Tools+ — `npm run cli -- trace <team>`: the Riley run seam headless (rileyNode.ts) on an export's
// account. <team> is one of his keys (t404), a saved team (name, id, 1-based index), or three names
// ("Shorekeeper,Lynae,Iuno"); a composition solves every loadout variant his list has and traces the best.
// Node-only (the CLI imports it lazily).
import type { ExportFile } from "../cli/exportFile";
import { findTeam, resolveCharacterKey } from "../cli/engine";
import { int, pct, table } from "../cli/format";
import { rileyHeadless } from "./rileyNode";
import { bestOf, type RunLite, type SubsMode } from "./rileyRun";

export interface TraceSummary {
  teamKey: string;
  rowKey: string;
  engine: RunLite["engine"];
  /** team DPS */
  total: number;
  seconds: number;
  sectionSeconds: number[];
  rows: number;
  hits: number;
  members: Array<Pick<RunLite["members"][number], "name" | "appKey" | "owned" | "sequence" | "weapon" | "refinement" | "echo" | "mainStats" | "spread" | "erRolls" | "dps" | "share">>;
  /** per member: need = max(bar, kit floor) in %, null where nothing asks for energy */
  needs: Record<string, { need: number | null; bar: number | null; minEr: number; constant: number }>;
  /** every variant solved for the composition */
  candidates: Array<{ teamKey: string; status: string; reason?: string; total: number | null }>;
  ms: { solve: number; trace: number };
}

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]/g, "");

export async function traceTeam(exp: ExportFile, team: string, subs: SubsMode): Promise<{ run: RunLite; summary: TraceSummary }> {
  const riley = await rileyHeadless(exp);
  let keys: string[];
  if (/^t\d+$/.test(team)) keys = [team];
  else if (/[,+]/.test(team)) {
    const everyone = riley.teams.flatMap((t) => t.members);
    const ids = team.split(/[,+]/).map((s) => s.trim()).filter(Boolean).map((name) => {
      const hit = everyone.find((m) => norm(m.appKey) === norm(name) || norm(m.name) === norm(name));
      return hit ? hit.appKey : resolveCharacterKey(name, exp.characters);
    });
    keys = riley.teamKeysFor(ids);
    if (!keys.length) throw new Error(`wuwa_calc has no team of ${ids.join(" + ")}`);
  } else {
    const saved = findTeam(team, exp.teams);
    keys = riley.teamKeysFor(saved.characterIds ?? []);
    if (!keys.length) throw new Error(`wuwa_calc has no team of ${saved.name}'s three (${(saved.characterIds ?? []).join(" + ")})`);
  }
  const t0 = performance.now();
  const solves = riley.solveMine(keys, { subs });
  const t1 = performance.now();
  const best = bestOf(solves);
  if (!best?.best) throw new Error(solves.map((s) => `${s.teamKey}: ${s.message ?? s.reason}`).join("; "));
  const run = riley.tracedRun(best.teamKey, best.best.picks, { subs });
  const t2 = performance.now();
  const summary: TraceSummary = {
    teamKey: run.teamKey,
    rowKey: run.rowKey,
    engine: run.engine,
    total: run.total,
    seconds: run.seconds,
    sectionSeconds: run.sectionSeconds,
    rows: run.rows.length,
    hits: run.hits.length,
    members: run.members.map(({ name, appKey, owned, sequence, weapon, refinement, echo, mainStats, spread, erRolls, dps, share }) => ({ name, appKey, owned, sequence, weapon, refinement, echo, mainStats, spread, erRolls, dps, share })),
    needs: Object.fromEntries(
      Object.entries(run.needs).map(([name, n]) => {
        const need = n.bar == null && !n.minEr ? null : Math.max(n.bar ?? 0, n.minEr);
        return [name, { need, bar: n.bar, minEr: n.minEr, constant: n.constant }];
      }),
    ),
    candidates: solves.map((s) => ({ teamKey: s.teamKey, status: s.status, ...(s.reason ? { reason: s.reason } : {}), total: s.best?.total ?? null })),
    ms: { solve: Math.round(t1 - t0), trace: Math.round(t2 - t1) },
  };
  return { run, summary };
}

export function printTrace(s: TraceSummary): void {
  const loops = s.sectionSeconds.slice(1);
  console.log(`${s.teamKey} ${s.members.map((m) => m.name).join(" · ")} — wuwa_calc ${s.engine.commit} · account ${s.engine.account || "(none)"} · substats ${s.engine.subs}`);
  console.log(
    `${int(s.total)} DPS over ${s.seconds.toFixed(1)} s (opener ${s.sectionSeconds[0]?.toFixed(1)} s + ${loops.length} loops of ${loops.map((x) => x.toFixed(1)).join(" / ")} s) · ${s.rows} rows · ${s.hits} hits · solve ${s.ms.solve} ms · trace ${s.ms.trace} ms\n`,
  );
  console.log(
    table([
      ["  Member", "S", "Weapon", "Echo", "Main stats", "Spread", "ER rolls", "DPS", "Share", "ER need", "Gear ER"],
      ...s.members.map((m) => {
        const n = s.needs[m.name];
        const need = !n || n.need == null ? "no gate" : `${pct(n.need)}${n.minEr > (n.bar ?? 0) ? ` (kit floor; loop ${n.bar == null ? "-" : pct(n.bar)})` : ""}`;
        return [`  ${m.name}${m.owned ? "" : " *"}`, `S${m.sequence}`, `${m.weapon} R${m.refinement}`, m.echo, m.mainStats, m.spread, m.erRolls == null ? "-" : String(m.erRolls), int(m.dps), pct(m.share * 100), need, n ? pct(n.constant) : "-"];
      }),
    ]),
  );
  if (s.members.some((m) => !m.owned)) console.log("\n* not on this account: runs at S0 with the signature at R1");
  if (s.candidates.length > 1) console.log(`\nVariants: ${s.candidates.map((c) => `${c.teamKey} ${c.total == null ? c.reason : int(c.total)}`).join(" · ")}`);
  console.log("\nER need = what this team's wuwa_calc loop asks each Liberation to be paid at (or the kit's own floor, if higher); gear ER = the constant ER the run's gear wears.");
}
