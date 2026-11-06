// Wuthering Tools+ CLI — commands registered onto the repo's `ww` program (cli/index.ts, `npm run cli`).
// Read an export file, run the app's engine, print JSON (or --pretty). See src/sim/README.md § CLI.
import type { Command } from "commander";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildSnapshot,
  calcCharacter,
  calcSubstatWeights,
  calcTeam,
  diffSnapshots,
  findTeam,
  rankExport,
  resolveCharacterKey,
  type CharacterCalc,
  type Snapshot,
  type TeamCalc,
  type WeightsCalc,
} from "./engine";
import { readExport, resolveExportPath, writeSyncedExport, type ExportFile } from "./exportFile";
import { accountStateOf, rileyAccountEntries, accountKeyOf, sequenceOf } from "../account/accountState";
import { buildRollsOf } from "../rankings/myBuilds";
import { SUBSTAT_ABBR } from "../substats/substatWeights";
import { dmg, int, pct, printJson, table, wantsPretty, type OutputOptions } from "./format";
import { anatomyCheck, anatomyReport, type AnatomyReport } from "../anatomy/anatomyCli";

interface CommonOptions extends OutputOptions {
  export?: string;
}

const AUTO_BUFFS_HELP = "compute teams with each character's own Team Buffs panel (the app's default) instead of buffs derived from the team's real members";

function withCommon(command: Command): Command {
  return command
    .option("-e, --export <file>", "export file (default: $WUWA_EXPORT, else the newest ~/Downloads/character_data_*.json)")
    .option("--pretty", "human-readable output (default on a terminal)")
    .option("--json", "JSON output (default when piped)");
}

function load(options: CommonOptions): ExportFile {
  return readExport(resolveExportPath(options.export));
}

function appCommit(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return null;
  }
}

/** The engine still has a stray console.log in a hot path (attacks.ts); keep stdout clean for JSON consumers. */
function quiet<T>(work: () => Promise<T>): Promise<T> {
  const original = console.log;
  console.log = process.env.WUWA_CLI_DEBUG ? (...args: unknown[]) => console.error(...args) : () => undefined;
  return work().finally(() => {
    console.log = original;
  });
}

type Action = (...args: any[]) => Promise<void>;
function guarded(action: Action): Action {
  return async (...args) => {
    try {
      await action(...args);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Error: ${message}`);
      process.exit(1);
    }
  };
}

function printAnatomy(r: AnatomyReport): void {
  const share = (v: number): string => pct(v * 100);
  console.log(`${r.character} on ${r.rotation}`);
  console.log(`Average ${dmg(r.model.average)} per rotation, enemy level ${r.enemy.level}, ${pct(r.enemy.resistance * 100, 0)} RES`);
  console.log("\nBy skill type");
  console.log(table(r.model.byType.map((t) => [`  ${t.label}`, dmg(t.average), share(t.share)])));
  console.log("\nBy attack");
  console.log(table(r.model.byAttack.map((t) => [`  ${t.label}`, `x${t.times}`, dmg(t.average), share(t.share)])));
  console.log(`\nOne hit: ${r.hit.label} (${r.hit.typeLabel}), ${r.hit.times} in this rotation, ${share(r.hit.share)} of it`);
  console.log(table(r.hit.factors.map((f) => [`  ${f.label}`, f.value, f.detail ?? ""])));
  if (r.hit.neutral.length) console.log(`  At x1 on this hit: ${r.hit.neutral.map((f) => f.label).join(", ")}`);
  console.log(`  Non-crit ${dmg(r.hit.nonCrit)}  crit ${dmg(r.hit.crit)}  average ${dmg(r.hit.average)}`);
  if (r.hit.critFactor) console.log(`  Crit Rate ${pct(r.hit.critFactor.rate * 100)}, Crit DMG ${pct(r.hit.critFactor.damage * 100)}: x ${r.hit.critFactor.times.toFixed(3)} on average`);
  console.log(r.hit.note ?? "  Reconciled: the factors multiply back to the calculator's own figure");
  console.log("\nWhat moves this number most");
  console.log(table(r.moves.rows.map((m) => [`  ${m.label}`, m.step, `hit ${pct(m.hitGain * 100, 2)}`, `rotation ${pct(m.rotationGain * 100, 2)}`])));
  if (r.moves.flat.length) console.log(`  No effect on this hit: ${r.moves.flat.map((m) => m.label).join(", ")}`);
}

function printCharacter(calc: CharacterCalc, options: { attacks: boolean; rotations: boolean }): void {
  console.log(
    `${calc.name} (${calc.id})  Lv ${calc.level}  S${calc.sequence}  ${calc.weapon ?? "no weapon"}${calc.refinement ? ` R${calc.refinement}` : ""}  enemy Lv ${calc.enemy.enemyLevel} / ${pct(calc.enemy.enemyResist * 100, 0)} RES`,
  );
  console.log("\nStats");
  console.log(table(calc.stats.map((s) => [`  ${s.label}`, s.display])));
  if (options.rotations) {
    console.log("\nSaved rotations");
    console.log(
      calc.rotations.length
        ? table([
            ["  Rotation", "Actions", "Normal", "Average", "Crit", "Avg DPS"],
            ...calc.rotations.map((r) => [`  ${r.name}`, String(r.actions), dmg(r.normal), dmg(r.avg), dmg(r.crit), dmg(r.dps)]),
          ])
        : "  (none)",
    );
  }
  if (options.attacks) {
    console.log("\nAttacks");
    console.log(
      table([["  Group", "Attack", "Normal", "Average", "Crit"], ...calc.attacks.map((a) => [`  ${a.group}`, a.label, dmg(a.normal), dmg(a.avg), dmg(a.crit)])]),
    );
  }
}

function printSlots(team: TeamCalc): void {
  console.log(`\n${team.name} — team buffs ${team.buffMode === "auto" ? "from the team's members" : "as set on each character"}`);
  for (const s of team.slots) {
    const build = `build ${s.buildName ? `"${s.buildName}"` : "(active)"}${s.buildSource === "active" ? "" : ` [${s.buildSource}]`}`;
    const buffs =
      s.buffSource === "panel"
        ? `their own panel names ${s.teammates.join(" + ")}: kept, ${s.enabled.length} enabled`
        : s.buffSource === "derived"
          ? `derived from ${s.teammates.join(" + ") || "nobody"}: ${s.enabled.length} enabled`
          : "as stored";
    const skipped = s.skipped.length ? `; not owned: ${s.skipped.map((k) => `${k.key} (${k.from} ${k.reason})`).join(", ")}` : "";
    console.log(`  ${s.characterId}: ${build}; ${buffs}${skipped}`);
  }
}

function printTeams(teams: TeamCalc[]): void {
  console.log(
    table([
      ["  Team", "Members", "Actions", "Normal", "Average", "Crit", "Avg DPS"],
      ...teams.map((t) => [
        `  ${t.name}`,
        t.characterIds.filter(Boolean).join(" + "),
        String(t.actions),
        dmg(t.normal),
        dmg(t.avg),
        dmg(t.crit),
        dmg(t.dps),
      ]),
    ]),
  );
}

const signedPct = (g: number, digits = 2): string => `${g >= 0 ? "+" : ""}${(g * 100).toFixed(digits)}%`;
const rollText = (value: number, flat: boolean): string => (flat ? String(Math.round(value)) : `${value.toFixed(1)}%`);

function printWeights(w: WeightsCalc): void {
  const build = `${w.name} (${w.id})  S${w.sequence}  ${w.weapon ?? "no weapon"}${w.refinement ? ` R${w.refinement}` : ""}`;
  const target =
    w.target.kind === "team"
      ? `team "${w.target.name}" (${w.target.members.filter(Boolean).join(" + ")}; buffs ${w.target.buffMode === "auto" ? "from the members" : "as set on each character"})`
      : `rotation "${w.target.name}" (${w.target.source === "yours" ? "your rotation" : w.target.source === "curated" ? "curated preset" : "wuwa_calc"})`;
  console.log(`${build}\non ${target}  enemy Lv ${w.enemy.enemyLevel} / ${pct(w.enemy.enemyResist * 100, 0)} RES`);
  console.log(`baseline ${int(w.baseline)} average damage${w.baselineTeam != null ? ` (team ${int(w.baselineTeam)})` : ""}\n`);
  const team = w.baselineTeam != null;
  console.log(
    table([
      ["  Substat", "Expected roll", "Gain", "Median roll", "Gain", "Best roll", "Gain", "+1 tier", "Gain", ...(team ? ["Team"] : []), "Weight"],
      ...w.weights.map((s) => [
        `  ${s.label}`,
        rollText(s.roll, s.flat),
        signedPct(s.gain),
        rollText(s.medianRoll, s.flat),
        signedPct(s.medianGain),
        rollText(s.maxRoll, s.flat),
        signedPct(s.maxGain),
        rollText(s.step, s.flat),
        signedPct(s.stepGain),
        ...(team ? [signedPct(s.extraGain.team ?? 0)] : []),
        String(Math.round(s.weight * 100)),
      ]),
    ]),
  );
  console.log(
    "\nOne more line of the substat on an equipped echo, and what it adds to the baseline. Expected roll = the average roll, every tier weighted by how often" +
      "\nit drops (not always a tier the game can show); median roll = the middle tier, a real one; best roll = the top tier; +1 tier = one tier step, what an" +
      `\nexisting line gains from rolling one tier higher.${team ? " Team = the expected roll's gain on the team total." : ""} Weight = the expected gain next to the best substat's (100).`,
  );
  const top = w.weights.filter((s) => s.weight >= 0.5).map((s) => s.label);
  console.log(`\nLook for: ${top.join(", ") || "(nothing moves this number)"}`);
  const er = w.weights.find((s) => s.key === "EnergyRegen");
  if (er && Math.abs(er.gain) < 0.0005) console.log("Energy Regen reads 0 here: the damage engine has no energy model. `er` measures the ER each saved team needs (wuwa_calc's loop); the app's substat weights count ER up to it.");
  if (w.echoes) {
    console.log("\nEquipped echoes — what each one's substats add over that echo without any (lowest = re-roll first)");
    console.log(
      table([
        ["  Slot", "Echo", "Cost", "Main", "Substats", "Worth"],
        ...w.echoes.map((e) => [
          `  ${e.slot + 1}`,
          e.echo ?? "-",
          e.cost == null ? "-" : String(e.cost),
          e.main ?? "-",
          e.substats.map((x) => `${SUBSTAT_ABBR[x.key] ?? x.key} ${x.value}`).join(" · ") || "(none)",
          signedPct(e.worth),
        ]),
      ]),
    );
  }
}

export function registerPlusCommands(program: Command): void {
  withCommon(
    program.command("inspect").description("Summarise an export file: data version, characters, builds, echoes, teams (Wuthering Tools+)"),
  ).action(
    guarded(async (options: CommonOptions) => {
      const exp = load(options);
      const characters = Object.entries(exp.characters).map(([id, c]: [string, any]) => ({
        id,
        weapon: c.weapon ?? null,
        builds: (c.builds ?? []).length,
        rotations: (c.rotations ?? []).length,
        sequence: sequenceOf(c),
      }));
      const summary = {
        file: exp.path,
        version: exp.version,
        source: exp.source,
        activeCharacter: exp.activeCharacter,
        characters: characters.length,
        echoes: exp.inventory.echoes.length,
        equippedEchoes: Object.keys(exp.inventory.equipped).length,
        teams: exp.teams.length,
        rotations: characters.reduce((n, c) => n + c.rotations, 0),
        roster: characters,
      };
      if (!wantsPretty(options)) return printJson(summary);
      console.log(`${summary.file}\nexport v${summary.version} (${summary.source})  characters ${summary.characters}  echoes ${summary.echoes} (${summary.equippedEchoes} equipped)  rotations ${summary.rotations}  teams ${summary.teams}\n`);
      console.log(table([["  Character", "S", "Weapon", "Builds", "Rotations"], ...characters.map((c) => [`  ${c.id}`, `S${c.sequence}`, c.weapon ?? "-", String(c.builds), String(c.rotations)])]));
    }),
  );

  withCommon(
    program
      .command("state")
      .description("The Account State: every character's sequence, weapon and refinement, builds, teams (Wuthering Tools+)")
      .option("--riley", "print the account as wuwa_calc's solver takes it: entries (resonator name → sequence, weapon, refine, owned) and builds (each character's equipped substat rolls, the \"My build\" spreads)"),
  ).action(
    guarded(async (options: CommonOptions & { riley?: boolean }) => {
      const exp = load(options);
      const state = accountStateOf(exp.characters, exp.inventory, exp.teams);
      const entries = rileyAccountEntries(state);
      const key = accountKeyOf(entries);
      if (options.riley) return printJson({ key, entries, builds: buildRollsOf(exp.characters, exp.inventory.echoes) });
      const payload = { file: exp.path, version: exp.version, appCommit: appCommit(), accountKey: key, ...state };
      if (!wantsPretty(options)) return printJson(payload);
      const s = state.summary;
      console.log(`${exp.path}\naccount ${key}  characters ${s.characters} (${s.owned} set up, ${s.s6} at S6)  echoes ${state.echoes.total} (${state.echoes.equipped} equipped)  teams ${s.teams} (${s.teamsFieldable} fieldable)  rotations ${s.rotations}\n`);
      const rows = Object.values(state.characters).sort((a, b) => Number(b.owned) - Number(a.owned) || b.sequence - a.sequence || a.key.localeCompare(b.key));
      console.log(
        table([
          ["  Character", "Owned", "S", "Weapon", "R", "Build", "Builds", "Rotations"],
          ...rows.map((c) => [`  ${c.key}`, c.owned ? "yes" : "-", `S${c.sequence}`, c.weapon ?? "-", c.weapon ? `R${c.refinement}` : "-", c.build?.name ?? "-", String(c.builds.length), String(c.rotations)]),
        ]),
      );
      if (state.teams.length) {
        console.log("\nTeams");
        console.log(table([["  Team", "Members", "Actions", "Fieldable"], ...state.teams.map((t) => [`  ${t.name}`, t.characterIds.filter(Boolean).join(" + "), String(t.actions), t.fieldable ? "yes" : "-"])]));
      }
      // member loops from a /rankings import with no rotation time (sync-teams fills the ones a synced team can time)
      const { planRotationDurations } = await import("../rankings/rotationDurations");
      const loops = planRotationDurations(exp.characters, exp.teams);
      if (loops.fills.length || loops.gaps.length) {
        console.log("\nMember loops with no rotation time (the calculator shows no DPS for them, or frame data's own length)");
        console.log(table([["  Character", "Rotation", "sync-teams fills"], ...[...loops.fills, ...loops.gaps].map((l) => [`  ${l.characterId}`, l.name, "to" in l ? `${l.to}s` : "-"])]));
      }
    }),
  );

  withCommon(
    program
      .command("trace <team>")
      .description("Riley's traced team run at your account's own state (the Riley run seam): members, DPS, seconds, energy needs — <team> is a wuwa_calc key (t404), a saved team, or three names (Shorekeeper,Lynae,Iuno) (Wuthering Tools+)")
      .option("--subs <mode>", "the substat spread: mine (your equipped echoes, ChemX32 where none), standard (ChemX32), high (High Invest)", "mine")
      .option("--full", "print the whole RunLite (rows, hits, buffs) as JSON"),
  ).action(
    guarded(async (team: string, options: CommonOptions & { subs: string; full?: boolean }) => {
      if (!["standard", "high", "mine"].includes(options.subs)) throw new Error("--subs must be mine, standard or high");
      const exp = load(options);
      const { traceTeam, printTrace } = await import("../engine/traceCli");
      const result = await traceTeam(exp, team, options.subs as "standard" | "high" | "mine");
      if (options.full) return printJson(result.run);
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...result.summary });
      printTrace(result.summary);
    }),
  );

  withCommon(
    program
      .command("toa")
      .description("The ToA clear check (the /endgame page) at your account: this season's timed Tower of Adversity floors with the best teams' kill times and crests, then a Vigor-legal plan for all 12 stages (Wuthering Tools+)")
      .option("--limit <n>", "teams to time on every floor (the saved ones always, then by DPS)", "30"),
  ).action(
    guarded(async (options: CommonOptions & { limit: string }) => {
      const exp = load(options);
      const { toaCheck, printToa } = await import("../endgame/toaCli");
      const { season, result } = await toaCheck(exp, { limit: Number(options.limit) || 30 });
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...result });
      printToa(season, result);
    }),
  );

  withCommon(
    program
      .command("er")
      .description("Energy check: each member's ER need in your saved teams (Riley's wuwa_calc loop at your account) beside the ER their build has, the ER floor per character, crit overcap (Wuthering Tools+)")
      .option("--team <team>", "one saved team (name, id or 1-based index)")
      .option("--all", "also every other composition your account can field (~0.1 s each)")
      .option("--no-auto-buffs", "read each team member's active build (the default picks the build the team runs, as the team editor does)"),
  ).action(
    guarded(async (options: CommonOptions & { team?: string; all?: boolean; autoBuffs: boolean }) => {
      const exp = load(options);
      const { energyReport, printEnergy } = await import("../energy/energyCli");
      const report = await quiet(() => energyReport(exp, { team: options.team, all: options.all, auto: options.autoBuffs }));
      if (!wantsPretty(options)) return printJson(report);
      printEnergy(report);
    }),
  );

  withCommon(
    program
      .command("optimizer-bench")
      .description("The echo optimizer before and after its exact speedups, on the export's characters: wall time (median of --reps runs each way), loadouts scored, and a check that both return the same top 5 to the last digit — read-only (Wuthering Tools+)")
      .option("--reps <n>", "runs per side (median)", "3")
      .option("--only <text>", "only cases whose name contains this"),
  ).action(
    guarded(async (options: CommonOptions & { reps?: string; only?: string }) => {
      const exp = load(options);
      const { runOptimizerBench, printOptimizerBench } = await import("../optimizer/benchCli");
      const pretty = wantsPretty(options);
      const report = await quiet(() =>
        runOptimizerBench(exp, {
          reps: Number(options.reps ?? 3),
          only: options.only,
          onCase: (run, done, total) => process.stderr.write(`${done}/${total} ${run.name}: ${run.same ? "same" : `DIFFERENT (${run.diff})`}\n`),
        }),
      );
      if (!pretty) return printJson(report);
      console.log(printOptimizerBench(report));
    }),
  );

  withCommon(
    program
      .command("build-team <team>")
      .description("Build it for me, headless: re-gear a team from the export's echo inventory with no echo used twice, from wuwa_calc's pick at your account (sets, main echo, main stats, ER floor) — prints, never writes. <team> is a saved team or three names (Wuthering Tools+)")
      .option("--any-set", "ignore the plan's sets")
      .option("--any-main-stat", "ignore the plan's main stats per cost")
      .option("--keep-main-echo", "keep each member's current main echo")
      .option("--take-from-others", "also use echoes worn by characters outside the team")
      .option("--one-order", "only the priority order (no permutations)")
      .option("--er <floors>", 'ER floors in %, e.g. "Mornye=260,Lynae=none"')
      .option("--order <names>", "priority, first served first, e.g. Aemeath,Lynae,Mornye")
      .option("--only <name>", "re-gear this member alone, teammates keep their echoes (/account's \"Check my echoes\" run)")
      .option("--no-auto-buffs", "team buffs from each character's own Team Buffs panel (upstream's behaviour)"),
  ).action(
    guarded(async (team: string, options: CommonOptions & { anySet?: boolean; anyMainStat?: boolean; keepMainEcho?: boolean; takeFromOthers?: boolean; oneOrder?: boolean; er?: string; order?: string; only?: string; autoBuffs?: boolean }) => {
      const exp = load(options);
      const { runBuildTeam, printBuildTeam } = await import("../buildTeam/buildTeamCli");
      const out = await quiet(() =>
        runBuildTeam(exp, team, {
          useSets: !options.anySet,
          useMainStats: !options.anyMainStat,
          keepMainEcho: !!options.keepMainEcho,
          takeFromOthers: !!options.takeFromOthers,
          tryAllOrders: !options.oneOrder,
          er: options.er,
          order: options.order,
          only: options.only,
          autoBuffs: options.autoBuffs !== false,
        }),
      );
      if (!wantsPretty(options)) {
        const { result, plans } = out;
        return printJson({
          export: exp.path,
          teamName: out.team.name,
          riley: plans.riley ? { teamKey: plans.riley.teamKey, dpsMine: plans.dpsMine, dpsHigh: plans.dpsHigh } : { note: plans.rileyNote },
          plans: plans.plans,
          ...result,
          members: result.members.map((m) => ({ ...m, draft: undefined, after: m.after ? { ...m.after, picks: m.after.picks.map((p) => ({ echoId: p.echo.echoId, echo: p.echo.echo, set: p.echo.echoSet, cost: p.echo.type, main: p.echo.stat, source: p.source, wornBy: p.wornBy, sharedWith: p.sharedWith })) } : null })),
        });
      }
      console.log(printBuildTeam(out));
    }),
  );

  withCommon(
    program
      .command("build-account")
      .description("Whole account, headless: gear several teams from the export's echo inventory with no echo worn twice across them — greedy in priority order, then a local search over the echoes two members compete for — prints, never writes (Wuthering Tools+)")
      .option("--teams <list>", 'comma-separated, first = highest priority: a row number of --list, a team name, or "A+B+C" (default: your saved teams, then presets, strongest first, no two sharing a member, at most 4)')
      .option("--weights <list>", 'how much each team matters, in --teams order, e.g. "1,0.8,0.6" (default 1, 0.8, 0.6, 0.4, then 0.2)')
      .option("--budget <seconds>", "time budget for the local search (default 60)")
      .option("--list", "only list the teams the account can field, with the default choice")
      .option("--any-set", "ignore the plans' sets")
      .option("--any-main-stat", "ignore the plans' main stats per cost")
      .option("--keep-main-echo", "keep each member's current main echo")
      .option("--no-auto-buffs", "team buffs from each character's own Team Buffs panel (upstream's behaviour)"),
  ).action(
    guarded(async (options: CommonOptions & { teams?: string; weights?: string; budget?: string; list?: boolean; anySet?: boolean; anyMainStat?: boolean; keepMainEcho?: boolean; autoBuffs?: boolean }) => {
      // "--budget abc" read as NaN, and a NaN budget never ends the local search
      const budget = options.budget != null ? Number(options.budget) : undefined;
      if (budget !== undefined && !(Number.isFinite(budget) && budget >= 0)) throw new Error("--budget must be a number of seconds, 0 or more");
      const exp = load(options);
      const { runBuildAccount, printBuildAccount, jsonOf } = await import("../buildTeam/account/buildAccountCli");
      const out = await quiet(() =>
        runBuildAccount(exp, {
          teams: options.teams,
          weights: options.weights,
          budget,
          list: !!options.list,
          useSets: !options.anySet,
          useMainStats: !options.anyMainStat,
          keepMainEcho: !!options.keepMainEcho,
          autoBuffs: options.autoBuffs !== false,
          log: (line) => process.stderr.write(`${line}\n`),
        }),
      );
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...(jsonOf(out) as object) });
      console.log(printBuildAccount(out));
    }),
  );

  withCommon(
    program
      .command("calc <character>")
      .description("Stats, every attack's damage and each saved rotation for one character, from the app's own engine")
      .option("--no-attacks", "skip the per-attack table")
      .option("--no-rotations", "skip the saved rotations"),
  ).action(
    guarded(async (character: string, options: CommonOptions & { attacks: boolean; rotations: boolean }) => {
      const exp = load(options);
      const id = resolveCharacterKey(character, exp.characters);
      const calc = await quiet(() => calcCharacter(id, exp, { attacks: options.attacks, rotations: options.rotations }));
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...calc });
      printCharacter(calc, options);
    }),
  );

  withCommon(
    program
      .command("weights <character>")
      .description("Substat weights: what one more roll of each substat is worth on this character's build, scored on their best rotation (Wuthering Tools+)")
      .option("--rotation <name>", "score on this rotation (your own, a curated preset or a wuwa_calc loop, by name) instead of the best-scoring one")
      .option("--team <team>", "score on this team's rotation (name, id or 1-based index) with buffs from the team's real members; the team total rides along")
      .option("--echoes", "also what each equipped echo's substats are worth — which one to re-roll first")
      .option("--no-auto-buffs", AUTO_BUFFS_HELP),
  ).action(
    guarded(async (character: string, options: CommonOptions & { rotation?: string; team?: string; echoes?: boolean; autoBuffs: boolean }) => {
      const exp = load(options);
      const id = resolveCharacterKey(character, exp.characters);
      const calc = await quiet(() => calcSubstatWeights(id, exp, { rotation: options.rotation, team: options.team, echoes: options.echoes, autoBuffs: options.autoBuffs }));
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...calc });
      printWeights(calc);
    }),
  );

  withCommon(
    program
      .command("anatomy [character]")
      .description("Why this number: a rotation by attack and skill type, one hit as the factors of the formula, and what moves it most (Wuthering Tools+). Without a character, with --check: every hit of every rotation on the export, and what reconciles")
      .option("--rotation <name>", "this rotation (by name) instead of the best-scoring one")
      .option("--hit <name>", "this hit (key or label) instead of the biggest one")
      .option("--check", "open every hit of every rotation of every set-up character and count what reconciles"),
  ).action(
    guarded(async (character: string | undefined, options: CommonOptions & { rotation?: string; hit?: string; check?: boolean }) => {
      const exp = load(options);
      if (options.check || !character) {
        const check = await quiet(() => anatomyCheck(exp));
        if (!wantsPretty(options)) return printJson({ export: exp.path, ...check });
        console.log(`${check.characters} characters, ${check.rotations} rotations, ${check.hits} hits: ${Object.entries(check.byKind).map(([k, n]) => `${n} ${k}`).join(", ")}`);
        console.log(`Hits that don't reconcile: ${check.unreconciled.length}. Rotations whose lines don't add up: ${check.rotationsOff.length}.`);
        console.log(`Steps run on the best rotations' hits: ${check.steps}. Steps that lowered a hit: ${check.stepsDown.length}.`);
        for (const d of check.stepsDown.slice(0, 20)) console.log(`  ${d.character}  ${d.key}  ${d.step}  ${pct(d.gain * 100, 2)}`);
        for (const u of check.unreconciled.slice(0, 40)) console.log(`  ${u.character}  ${u.key}  ${u.kind}  base ${u.base}  crit ${u.crit}  (${u.rotation})`);
        for (const r of check.rotationsOff.slice(0, 20)) console.log(`  ${r.character}  lines off  (${r.rotation})`);
        return;
      }
      const id = resolveCharacterKey(character, exp.characters);
      const report = await quiet(() => anatomyReport(id, exp, { rotation: options.rotation, hit: options.hit }));
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...report });
      printAnatomy(report);
    }),
  );

  withCommon(
    program
      .command("team [team]")
      .description("Team-rotation damage and DPS for one team (name, id or 1-based index), or every team")
      .option("--no-auto-buffs", AUTO_BUFFS_HELP),
  ).action(
    guarded(async (team: string | undefined, options: CommonOptions & { autoBuffs: boolean }) => {
      const exp = load(options);
      const targets = team ? [findTeam(team, exp.teams)] : exp.teams;
      const results: TeamCalc[] = [];
      for (const t of targets) results.push(await quiet(() => calcTeam(t, exp, { autoBuffs: options.autoBuffs })));
      if (!wantsPretty(options)) return printJson({ export: exp.path, teams: results });
      printTeams(results);
      if (team) for (const t of results) printSlots(t);
    }),
  );

  withCommon(
    program
      .command("rank")
      .description("Rank your roster and teams with the app's engine (the /my-rankings page, headless)")
      .option("--investment", "also estimate the next sequence node and R5 for each character (slower)")
      .option("--no-auto-buffs", AUTO_BUFFS_HELP),
  ).action(
    guarded(async (options: CommonOptions & { investment?: boolean; autoBuffs: boolean }) => {
      const exp = load(options);
      const ranking = await quiet(() => rankExport(exp, { investment: options.investment, autoBuffs: options.autoBuffs }));
      if (!wantsPretty(options)) return printJson({ export: exp.path, ...ranking });
      console.log(`Enemy Lv ${ranking.enemy.enemyLevel} / ${pct(ranking.enemy.enemyResist * 100, 0)} RES\n\nCharacters`);
      console.log(
        table([
          ["  #", "Character", "S", "Weapon", "Best rotation", "Source", "Average", "Avg DPS"],
          ...ranking.characters.map((c, i) => [
            `  ${i + 1}`,
            c.name,
            `S${c.sequence}`,
            c.weapon ? `${c.weapon} R${c.refinement}` : "-",
            c.best?.name ?? "-",
            c.best?.source ?? "-",
            int(c.best?.avgDamage),
            c.best?.dps == null ? "-" : int(c.best.dps),
          ]),
        ]),
      );
      console.log(`\nTeams${ranking.teamsSkipped ? ` (${ranking.teamsSkipped} skipped: members not set up)` : ""}`);
      console.log(
        ranking.teams.length
          ? table([
              ["  #", "Team", "Members", "Source", "Average", "Avg DPS"],
              ...ranking.teams.map((t, i) => [`  ${i + 1}`, t.name, t.characterIds.join(" + "), t.source, int(t.avgDamage), t.dps == null ? "-" : int(t.dps)]),
            ])
          : "  (none)",
      );
    }),
  );

  withCommon(
    program
      .command("snapshot")
      .description("Every character's stats and saved rotations plus every team, as JSON — `ww diff` two of them after an upstream sync")
      .option("-o, --out <file>", "write the snapshot to a file instead of stdout")
      .option("--no-auto-buffs", AUTO_BUFFS_HELP),
  ).action(
    guarded(async (options: CommonOptions & { out?: string; autoBuffs: boolean }) => {
      const exp = load(options);
      const snapshot = await quiet(() => buildSnapshot(exp, appCommit(), { autoBuffs: options.autoBuffs }));
      const errors = Object.keys(snapshot.errors).length;
      if (options.out) {
        writeFileSync(options.out, JSON.stringify(snapshot, null, 2) + "\n");
        console.error(
          `wrote ${options.out}: ${Object.keys(snapshot.characters).length} characters, ${Object.keys(snapshot.teams).length} teams${errors ? `, ${errors} errors` : ""} (app ${snapshot.appCommit ?? "?"})`,
        );
        return;
      }
      printJson(snapshot);
    }),
  );

  withCommon(
    program
      .command("sync-teams")
      .description("Sync my teams, headless: re-import every wuwa_calc team at your account's own state and write a new export to import (Wuthering Tools+)")
      .option("-o, --out <file>", "where to write the synced export (default: the source file with a _synced suffix, next to it)")
      .option("--dry-run", "report only; write nothing")
      .option("--subs <mode>", "the substat spread every row runs: standard (ChemX32), high (Riley's High Invest), mine (your equipped echoes)", "standard")
      .option("--rotations", "also append each member's loop to that character's saved rotations"),
  ).action(
    guarded(async (options: CommonOptions & { out?: string; dryRun?: boolean; subs: string; rotations?: boolean }) => {
      if (!["standard", "high", "mine"].includes(options.subs)) throw new Error("--subs must be standard, high or mine");
      const path = resolveExportPath(options.export);
      const exp = readExport(path);
      const { syncTeamsHeadless } = await import("../rankings/syncTeamsHeadless");
      const result = await quiet(() => syncTeamsHeadless(exp, { subs: options.subs as "standard" | "high" | "mine", rotations: options.rotations }));
      // member loops saved before loops carried a rotation time get the synced team's (rotationDurations.ts)
      const { applyRotationDurations, planRotationDurations } = await import("../rankings/rotationDurations");
      const loopTimes = planRotationDurations(result.characters, result.teams);
      applyRotationDurations(result.characters, loopTimes.fills);
      let out: string | null = null;
      if (!options.dryRun) {
        // the default lands next to the source as `<name>_synced.json`; syncing that file again (it is then the newest
        // download) writes over it through a temp file — the source of a sync is only ever protected when it is not
        // itself a synced copy
        out = options.out ?? path.replace(/(_synced)?\.json$/i, "") + "_synced.json";
        writeSyncedExport(path, out, result.teams, options.rotations || loopTimes.fills.length ? result.characters : null, { allowSelf: /_synced\.json$/i.test(path) });
      }
      const r = result.report;
      if (!wantsPretty(options)) return printJson({ export: path, out, account: result.account, subs: result.subs, seconds: result.seconds, report: r, loopTimes });
      console.log(`${path}\naccount ${result.account} · ${r.updated} updated · ${r.unchanged} unchanged · ${r.skipped} left alone${r.failed ? ` · ${r.failed} failed` : ""} · ${result.seconds.toFixed(1)} s (${result.subs} substats)\n`);
      console.log(
        table([
          ["  Team", "Status", "Riley DPS", "What moved"],
          ...r.teams.map((t) => {
            const moves = [
              ...t.deltas.slice(0, 4).map((d) => `${d.characterId ?? "?"} ${d.key}${d.stacks != null ? `@${d.stacks}` : ""} ${d.from}→${d.to}`),
              ...(t.deltas.length > 4 ? [`+${t.deltas.length - 4} more`] : []),
              ...t.enemyDeltas.map((e) => `enemy ${e.label} ${e.from}→${e.to}`),
              ...(t.durationDelta ? [`rotation time ${t.durationDelta.from ?? "none"}→${t.durationDelta.to}s`] : []),
              ...t.members.filter((m) => m.nextLoopChange).map((m) => `${m.name} S${m.sequence}→S${m.nextLoopChange} switches loop`),
            ];
            return [`  ${t.newName ?? t.name}`, t.status, t.total == null ? "-" : int(t.total), t.reason ?? moves.join("; ")];
          }),
        ]),
      );
      for (const f of loopTimes.fills) console.log(`  rotation time ${f.to}s → ${f.characterId}'s "${f.name}" (from ${f.teamName})`);
      if (loopTimes.gaps.length) console.log(`  ${loopTimes.gaps.length} member loop(s) still without a rotation time, no one synced team of the same three at the same tier to take it from: ${loopTimes.gaps.map((g) => `${g.characterId} "${g.name}"`).join("; ")}`);
      if (out) console.log(`\nwrote ${out} — Settings › Import replaces the whole app database with it; the source export is untouched.`);
    }),
  );

  withCommon(
    program
      .command("ask <question>")
      .description(
        "Ask the in-app assistant (Claude) about the export, with the app's engine as its tools — calls the paid Anthropic API " +
          "(credentials: ANTHROPIC_API_KEY or `ant auth login`) (Wuthering Tools+)",
      )
      .option("--model <model>", "claude-opus-5-5 (default), claude-sonnet-5-5 or claude-haiku-5-5")
      .option("--effort <effort>", "low | medium (default) | high | xhigh | max")
      .option("--max-rounds <n>", "tool rounds before Claude must answer (default 6)")
      .option("--budget <usd>", "stop before the next request once the answer has cost this much (default 0.50)")
      .option("--no-auto-buffs", AUTO_BUFFS_HELP),
  ).action(
    guarded(async (question: string, options: CommonOptions & { model?: string; effort?: string; maxRounds?: string; budget?: string; autoBuffs: boolean }) => {
      const exp = load(options);
      const { runAsk } = await import("../ai/cliAsk");
      const { headlessRiley } = await import("./aiRiley");
      const pretty = wantsPretty(options);
      const { result, model, effort, tools } = await quiet(() =>
        runAsk(question, exp, {
          model: options.model,
          effort: options.effort,
          maxRounds: options.maxRounds != null ? Number(options.maxRounds) : undefined,
          budgetUsd: options.budget != null ? Number(options.budget) : undefined,
          autoBuffs: options.autoBuffs,
          riley: headlessRiley,
          stream: pretty,
          out: (text) => process.stdout.write(text),
          err: (text) => process.stderr.write(text),
        }),
      );
      if (!pretty) printJson({ export: exp.path, model, effort, status: result.status, text: result.text, tools, usage: result.usage, refusal: result.refusal ?? null, error: result.error ?? null });
      if (result.status === "error" || result.status === "refusal") process.exitCode = 1;
    }),
  );

  withCommon(
    program
      .command("tool <name> [input]")
      .description(
        "Run one of the in-app assistant's tools on the export, without Claude (free, no API call): <name> is the tool " +
          "(energy_check, team_rotation, toa_check, echo_lab, …), [input] its JSON input (default {}). Prints the tool's " +
          "result as Claude would read it (Wuthering Tools+)",
      )
      .option("--no-auto-buffs", AUTO_BUFFS_HELP),
  ).action(
    guarded(async (name: string, input: string | undefined, options: CommonOptions & { autoBuffs: boolean }) => {
      const exp = load(options);
      const { runTool, AI_TOOLS } = await import("../ai/tools/index");
      const { headlessRiley } = await import("./aiRiley");
      let parsed: unknown;
      try {
        parsed = JSON.parse(input ?? "{}");
      } catch {
        throw new Error(`[input] must be JSON, e.g. '{"team": "1"}'`);
      }
      if (!AI_TOOLS.some((t) => t.name === name)) throw new Error(`No tool "${name}". Tools: ${AI_TOOLS.map((t) => t.name).join(", ")}`);
      const r = await quiet(() => runTool(name, parsed, { exp, now: new Date(), autoBuffs: options.autoBuffs, riley: headlessRiley, storage: null }));
      const result = JSON.parse(r.content) as unknown;
      if (!wantsPretty(options)) printJson({ tool: name, ok: r.ok, ms: r.ms, chars: r.content.length, result });
      else console.log(`${name} · ${r.ok ? "ok" : "error"} · ${r.ms} ms · ${r.content.length} chars\n${JSON.stringify(result, null, 2)}`);
      if (!r.ok) process.exitCode = 1;
    }),
  );

  program
    .command("diff <before> <after>")
    .description("Compare two snapshots and print every number that moved")
    .option("--tolerance <percent>", "ignore relative changes at or below this many percent", "0.01")
    .option("--pretty", "human-readable output (default on a terminal)")
    .option("--json", "JSON output (default when piped)")
    .action(
      guarded(async (before: string, after: string, options: OutputOptions & { tolerance: string }) => {
        const a = JSON.parse(readFileSync(before, "utf8")) as Snapshot;
        const b = JSON.parse(readFileSync(after, "utf8")) as Snapshot;
        const changes = diffSnapshots(a, b, Number(options.tolerance));
        if (!wantsPretty(options)) return printJson({ before: { file: before, appCommit: a.appCommit }, after: { file: after, appCommit: b.appCommit }, changes });
        console.log(`${before} (app ${a.appCommit ?? "?"}) → ${after} (app ${b.appCommit ?? "?"}): ${changes.length} change${changes.length === 1 ? "" : "s"}`);
        if (changes.length) {
          console.log(
            table([
              ["  Path", "Before", "After", "Change"],
              ...changes.map((c) => [
                `  ${c.path}`,
                c.before == null ? "(added)" : fmtNumber(c.before),
                c.after == null ? "(removed)" : fmtNumber(c.after),
                c.deltaPct == null ? "" : `${c.deltaPct > 0 ? "+" : ""}${(c.deltaPct * 100).toFixed(2)}%`,
              ]),
            ]),
          );
        }
        if (changes.length) process.exitCode = 2;
      }),
    );
}

function fmtNumber(n: number): string {
  return Number.isInteger(n) || Math.abs(n) >= 100 ? int(n) : n.toFixed(4);
}
