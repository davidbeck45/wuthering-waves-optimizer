// Wuthering Tools+ — `npm run cli -- optimizer-bench`: the optimizer before and after track "optimizer-speed" on an
// export, case by case (the CLI imports it lazily; Node-only). Read-only: the export is never written.
import type { ExportFile } from "../cli/exportFile";
import { int, table } from "../cli/format";
import { benchCharacters, casesFor, edgeCases, medianOf, prepareCase, runCase, STANDARD_SPECS, type BenchCase, type BenchSource, type CaseRun } from "./optimizerBench";

export interface BenchCliOptions {
  reps?: number;
  /** only cases whose name contains this (case-insensitive) */
  only?: string;
  onCase?: (run: CaseRun, done: number, total: number) => void;
}

export interface BenchReport {
  export: string;
  reps: number;
  runs: CaseRun[];
  skipped: string[];
  totals: { beforeMs: number; afterMs: number; speedup: number; same: number; cases: number };
}

export async function runOptimizerBench(exp: ExportFile, opts: BenchCliOptions = {}): Promise<BenchReport> {
  const source: BenchSource = { characters: benchCharacters(exp.characters), echoes: exp.inventory.echoes ?? [] };
  const reps = Math.max(1, Math.floor(opts.reps ?? 3));
  let cases: BenchCase[] = [];
  for (const spec of STANDARD_SPECS) if (source.characters[spec.characterId]) cases.push(...(await casesFor(spec, source)));
  cases.push(...edgeCases(cases));
  if (opts.only) cases = cases.filter((c) => c.name.toLowerCase().includes(opts.only!.toLowerCase()));
  const runs: CaseRun[] = [];
  const skipped: string[] = [];
  for (const c of cases) {
    const prepared = await prepareCase(c, source);
    if (!prepared) {
      skipped.push(`${c.name}: no rotation to score`);
      continue;
    }
    const run = await runCase(prepared, reps);
    runs.push(run);
    opts.onCase?.(run, runs.length + skipped.length, cases.length);
  }
  const beforeMs = runs.reduce((n, r) => n + medianOf(r.before.ms), 0);
  const afterMs = runs.reduce((n, r) => n + medianOf(r.after.ms), 0);
  return { export: exp.path, reps, runs, skipped, totals: { beforeMs, afterMs, speedup: afterMs > 0 ? beforeMs / afterMs : NaN, same: runs.filter((r) => r.same).length, cases: runs.length } };
}

const ms = (x: number): string => (x >= 10_000 ? `${(x / 1000).toFixed(1)} s` : `${Math.round(x)} ms`);

export function printOptimizerBench(report: BenchReport): string {
  const rows: string[][] = [["Case", "Pool", "Loadouts", "Before", "gen", "score", "After", "Speedup", "Scored after", "Bounds", "Same"]];
  for (const r of report.runs) {
    const before = medianOf(r.before.ms);
    const after = medianOf(r.after.ms);
    rows.push([
      r.name,
      String(r.pool),
      int(r.generated),
      ms(before),
      ms(r.before.generationMs),
      ms(r.before.scoringMs),
      ms(after),
      after > 0 ? `${(before / after).toFixed(2)}×` : "-",
      `${int(r.after.scored)} (${int(r.after.pruned)} skipped)`,
      int(r.after.bounds),
      r.same ? "yes" : `NO: ${r.diff}`,
    ]);
  }
  const t = report.totals;
  const lines = [
    `${report.export}`,
    `Before = the optimizer loop before the speedups, after = now; wall time, median of ${report.reps} runs each, one thread. "Same" = the same top 5 (echo ids, order, score and energy regen to the last bit).`,
    "",
    table(rows),
    "",
    `${t.cases} cases, ${t.same} the same · total ${ms(t.beforeMs)} before, ${ms(t.afterMs)} after: ${t.speedup.toFixed(2)}× faster overall`,
  ];
  for (const s of report.skipped) lines.push(`skipped: ${s}`);
  return lines.join("\n");
}
