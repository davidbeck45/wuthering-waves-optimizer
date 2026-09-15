// Wuthering Tools+ CLI — commands registered onto the repo's `ww` program (cli/index.ts, `npm run cli`).
// Read an export file, run the app's engine, print JSON (or --pretty). See src/sim/README.md § CLI.
import type { Command } from "commander";
import { execSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import {
  buildSnapshot,
  calcCharacter,
  calcTeam,
  diffSnapshots,
  findTeam,
  rankExport,
  resolveCharacterKey,
  type CharacterCalc,
  type Snapshot,
  type TeamCalc,
} from "./engine";
import { readExport, resolveExportPath, writeSyncedExport, type ExportFile } from "./exportFile";
import { accountStateOf, rileyAccountEntries, accountKeyOf, sequenceOf } from "../account/accountState";
import { buildRollsOf } from "../rankings/myBuilds";
import { int, pct, printJson, table, wantsPretty, type OutputOptions } from "./format";

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
            ...calc.rotations.map((r) => [`  ${r.name}`, String(r.actions), int(r.normal), int(r.avg), int(r.crit), r.dps == null ? "-" : int(r.dps)]),
          ])
        : "  (none)",
    );
  }
  if (options.attacks) {
    console.log("\nAttacks");
    console.log(
      table([["  Group", "Attack", "Normal", "Average", "Crit"], ...calc.attacks.map((a) => [`  ${a.group}`, a.label, int(a.normal), int(a.avg), int(a.crit)])]),
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
        int(t.normal),
        int(t.avg),
        int(t.crit),
        t.dps == null ? "-" : int(t.dps),
      ]),
    ]),
  );
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
      let out: string | null = null;
      if (!options.dryRun) {
        // idempotent: syncing a `_synced` file again writes the same name, and ~/Downloads' newest export stays one file
        out = options.out ?? path.replace(/(_synced)?\.json$/i, "") + "_synced.json";
        writeSyncedExport(path, out, result.teams, options.rotations ? result.characters : null);
      }
      const r = result.report;
      if (!wantsPretty(options)) return printJson({ export: path, out, account: result.account, subs: result.subs, seconds: result.seconds, report: r });
      console.log(`${path}\naccount ${result.account} · ${r.updated} updated · ${r.unchanged} unchanged · ${r.skipped} left alone${r.failed ? ` · ${r.failed} failed` : ""} · ${result.seconds.toFixed(1)} s (${result.subs} substats)\n`);
      console.log(
        table([
          ["  Team", "Status", "Riley DPR", "What moved"],
          ...r.teams.map((t) => {
            const moves = [
              ...t.deltas.slice(0, 4).map((d) => `${d.characterId ?? "?"} ${d.key}${d.stacks != null ? `@${d.stacks}` : ""} ${d.from}→${d.to}`),
              ...(t.deltas.length > 4 ? [`+${t.deltas.length - 4} more`] : []),
              ...t.enemyDeltas.map((e) => `enemy ${e.label} ${e.from}→${e.to}`),
              ...t.members.filter((m) => m.nextLoopChange).map((m) => `${m.name} S${m.sequence}→S${m.nextLoopChange} switches loop`),
            ];
            return [`  ${t.newName ?? t.name}`, t.status, t.total == null ? "-" : int(t.total), t.reason ?? moves.join("; ")];
          }),
        ]),
      );
      if (out) console.log(`\nwrote ${out} — Settings › Import replaces the whole app database with it; the source export is untouched.`);
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
