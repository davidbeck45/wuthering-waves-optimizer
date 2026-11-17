// Wuthering Tools+ Echo Lab — the one line the calculator's Engine view shows while it is closed. Since Ryan's roll
// table (#693) the Echo Insights panel is taller than a 900 px screen with his content alone, and the open view put
// another 400 px (900 on a phone at 130 % text) above his table. So the view is a bar that says its two findings,
// the benchmark and the echo to re-roll first, and opens to the rest. Pure: the component hands in what it has.
import { pct } from "./echoLabView";

export interface EngineSummaryInput {
  /** why there is nothing to show ("Equip a weapon to see the engine view."), else null */
  error: string | null;
  /** the first numbers are in */
  ready: boolean;
  /** the benchmark score (1 = 100 %), null when the build has none */
  score: number | null;
  /** the build has less Energy Regen than its teams need */
  erShort: boolean;
  /** the re-roll jobs, one per echo with five lines */
  reroll: { running: boolean; done: number; total: number };
  /** the name of the echo to re-roll first, null when no re-roll is worth a Transducer */
  pick: string | null;
  /** echoes of the build with all five lines: with none there is nothing to re-roll yet */
  fullEchoes: number;
}

export interface EngineSummaryPart {
  key: "status" | "benchmark" | "er" | "reroll";
  /** plain text before the figure */
  label: string;
  /** the figure or name, printed strong */
  value: string;
  /** plain text after it */
  note: string;
  /** printed as a warning */
  warn: boolean;
}

const part = (key: EngineSummaryPart["key"], label: string, value = "", note = "", warn = false): EngineSummaryPart => ({ key, label, value, note, warn });

/** What the closed Engine view says, part by part (the component prints them on one wrapping line). */
export function engineSummary(input: EngineSummaryInput): EngineSummaryPart[] {
  if (input.error) return [part("status", input.error)];
  if (!input.ready) return [part("status", "Scoring this build on its best rotation…")];
  const parts: EngineSummaryPart[] = [];
  // a bare percentage says nothing: the scale goes with it
  if (input.score !== null) parts.push(part("benchmark", "Benchmark", pct(input.score, 0), "(100 % = a realistic spread)"));
  else parts.push(part("benchmark", "No benchmark for this build"));
  if (input.erShort) parts.push(part("er", "Energy Regen", "short", "", true));
  const { running, done, total } = input.reroll;
  if (running) parts.push(part("reroll", "Re-roll first:", "", `simulating echo ${Math.min(done + 1, total)} of ${total}`));
  else if (input.pick !== null) parts.push(part("reroll", "Re-roll first:", input.pick));
  else if (input.fullEchoes === 0) parts.push(part("reroll", "Re-roll first:", "", "no echo has all five lines yet"));
  else parts.push(part("reroll", "Re-roll first:", "", "no re-roll is worth a Transducer"));
  return parts;
}
