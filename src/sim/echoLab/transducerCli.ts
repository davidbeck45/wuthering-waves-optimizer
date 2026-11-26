// Wuthering Tools+ — `npm run cli -- transducers`: the Transducer ranking headless (the Echo Lab's Transducers tab).
// Every equipped five-line echo of every set-up character gets the re-roll advice the page asks for (rerollAdvice.ts),
// with each character's Energy Regen need from the energy check of the saved teams as a floor; the ranking, the
// "I have N Transducers" plan and the crit check come from transducerRank.ts, the same module the page reads.
// Node-only (the CLI imports it lazily).
import type { ExportFile } from "../cli/exportShape";
import { resolveCharacterKey } from "../cli/engine";
import { int, table } from "../cli/format";
import { characterName, echoName, statLabel } from "../ai/tools/shared";
import { gearRoleOf, type GearRole } from "../gearMap/gearMap";
import { KIT_INDEX_ENTRIES } from "../kits/load";
import { builtCharacterIds, createLabSession, echoLines, prepareCharacter, type LabAccount } from "./core";
import { showNeed } from "../energy/energyNeed";
import { DEFAULT_LOCK_COSTS, LOCK_COST_NOTE, rerollAdvice, type LockPlan, type LockSetPlan, type RerollAdviceResult } from "./rerollAdvice";
import { chanceOfAny, critKeepCheck, gainAfter, goodTry, spendPlan, transducerRows, type CritKeepCheck, type SpendPlan, type TransducerFilter, type TransducerRow, type TransducerSort } from "./transducerRank";

export interface TransducerCliOptions {
  /** one resonator (loose name) */
  resonator?: string;
  /** Transducers a try: 1, 2 or 3 */
  cost?: number;
  /** lines kept: 0 to 4 */
  keep?: number;
  /** Transducers in hand: adds the spend plan */
  have?: number;
  /** also supports and characters the app has no role for (rated on their own damage only) */
  everyone?: boolean;
  sort?: TransducerSort;
  /** read no Energy Regen needs (no floors) */
  noEr?: boolean;
  /** a re-rolled line cannot come back as the stat it was (the game does not say; the default lets it) */
  noRepeat?: boolean;
}

export interface TransducerEchoReport {
  resonator: string;
  characterId: string;
  role: GearRole;
  slot: number;
  echo: string | null;
  rotationDamage: number;
  lines: Array<{ stat: string; key: string; value: number; worthPct: number; freshPct: number; erFloor?: boolean }>;
  /** the best plan per Transducer, null when no re-roll is expected to pay */
  recommended: PlanReport | null;
  /** the best plan at each number of kept lines, 4 first */
  plans: PlanReport[];
}

export interface PlanReport {
  keep: string[];
  reroll: string[];
  linesKept: number;
  transducersPerTry: number;
  chanceToImprovePct: number;
  expectedGainPct: number;
  expectedDamage: number;
  gainPerTransducerPct: number;
  /** one try in ten gains at least this; null when fewer than one try in ten beats the echo */
  goodTryPct: number | null;
  /** expected gain keeping the best of 3 and of 5 tries with the same locks */
  after3TriesPct: number;
  after5TriesPct: number;
  best: { gainPct: number; lines: string[]; oneIn: number | null };
  method: LockSetPlan["method"];
}

export interface TransducerReport {
  export: string;
  rule: string;
  ms: number;
  /** equipped echoes read, and the ones left out with the reason */
  echoes: number;
  leftOut: Array<{ resonator: string; slot: number; echo: string | null; why: string }>;
  /** Energy Regen needs the advice respects, by resonator */
  erNeeds: Record<string, number>;
  erNote: string | null;
  filter: { resonator: string | null; cost: number | null; keep: number | null; everyone: boolean; sort: TransducerSort };
  /** supports and characters without a role, left out of the ranking unless `everyone` */
  supportsLeftOut: string[];
  /** how a re-rolled line's type is drawn: the game says only that locked substats are excluded */
  typeRule: string;
  ranking: Array<{ rank: number; pays: boolean; blocked: string | null; erUnknown: boolean; resonator: string; slot: number; echo: string | null; damagePerTransducer: number; plan: PlanReport | null }>;
  spend: null | {
    have: number;
    used: number;
    expectedDamage: number;
    steps: Array<{ resonator: string; slot: number; echo: string | null; keep: string[]; reroll: string[]; tries: number; transducers: number; expectedGainPct: number; expectedDamage: number; chanceOfAnyPct: number }>;
  };
  critCheck: {
    scope: string;
    echoes: number;
    paying: number;
    bothCritLines: { echoes: number; keepsExactlyBoth: number; keepsOneAndAnother: number; keepsLess: number; critOnlyShareOfBestPct: number; exceptions: CritException[] };
    oneCritLine: { echoes: number; keepsIt: number; exceptions: CritException[] };
    noCritLine: { echoes: number };
  };
  echoesDetail: TransducerEchoReport[];
}

interface CritException {
  resonator: string;
  slot: number;
  echo: string | null;
  bestKeeps: string[];
  bestGainPct: number;
  critOnlyGainPct: number | null;
}

const r2 = (n: number): number => Math.round(n * 100) / 100;
const pct2 = (rel: number): number => Math.round(rel * 1e4) / 100;

const lineText = (l: { key: string; value: number }): string => `${statLabel(l.key) ?? l.key} ${r2(l.value)}`;

const goodTryOf = (plan: LockPlan): number | null => {
  const good = goodTry(plan);
  return good == null ? null : pct2(good);
};

export function planReport(advice: RerollAdviceResult, plan: LockPlan): PlanReport {
  const byField = new Map(advice.lines.map((l) => [l.field, l]));
  const words = (fields: number[]): string[] => fields.map((f) => byField.get(f)).filter((l): l is NonNullable<typeof l> => Boolean(l)).map(lineText);
  return {
    keep: words(plan.lockedFields),
    reroll: words(plan.rerolledFields),
    linesKept: plan.locks,
    transducersPerTry: plan.cost,
    chanceToImprovePct: pct2(plan.pImprove),
    expectedGainPct: pct2(plan.expectedGain),
    expectedDamage: Math.round(plan.expectedGain * advice.base),
    gainPerTransducerPct: pct2(plan.gainPerTransducer),
    goodTryPct: goodTryOf(plan),
    after3TriesPct: pct2(gainAfter(plan, 3)),
    after5TriesPct: pct2(gainAfter(plan, 5)),
    best: { gainPct: pct2(plan.top.gain), lines: plan.top.lines.map(lineText), oneIn: plan.top.chance > 0 ? Math.round(1 / plan.top.chance) : null },
    method: plan.method,
  };
}

const roleOf = (id: string): GearRole => gearRoleOf(id, KIT_INDEX_ENTRIES);

/** Every character's ER need from the energy check of the saved teams, as the page's `erNeedsOf` rounds them. */
async function erNeedsOfExport(exp: ExportFile): Promise<{ needs: Record<string, number>; note: string | null }> {
  try {
    const { energyReport } = await import("../energy/energyCli");
    const report = await energyReport(exp, { auto: true });
    const needs: Record<string, number> = {};
    for (const f of [...report.floors].sort((a, b) => a.characterId.localeCompare(b.characterId))) needs[f.characterId] = Math.round(f.need * 100) / 100;
    return { needs, note: null };
  } catch (err) {
    return { needs: {}, note: `Energy Regen needs could not be read (${err instanceof Error ? err.message : String(err)}): no Energy Regen line is protected in this run.` };
  }
}

export async function transducerReport(exp: ExportFile, options: TransducerCliOptions = {}): Promise<TransducerReport> {
  const started = performance.now();
  const account = JSON.parse(JSON.stringify({ characters: exp.characters ?? {}, echoes: exp.inventory.echoes ?? [], equipped: exp.inventory.equipped ?? {}, teams: exp.teams ?? [] })) as LabAccount;
  const session = createLabSession(account);
  const only = options.resonator ? resolveCharacterKey(options.resonator, exp.characters) : null;
  const { needs, note } = options.noEr ? { needs: {}, note: "Energy Regen needs were not read (--no-er): no Energy Regen line is protected in this run." } : await erNeedsOfExport(exp);
  const advices: RerollAdviceResult[] = [];
  const leftOut: TransducerReport["leftOut"] = [];
  let worn = 0;
  for (const id of builtCharacterIds(account)) {
    if (only && id !== only) continue;
    const lab = await prepareCharacter(session, id);
    if (!lab) {
      leftOut.push({ resonator: characterName(id), slot: 0, echo: null, why: session.skipped.get(id) ?? "cannot be scored" });
      continue;
    }
    for (const s of lab.slots) {
      if (!s) continue;
      worn += 1;
      const lines = echoLines(s.record).length;
      if (lines < 5) {
        leftOut.push({ resonator: characterName(id), slot: s.slot + 1, echo: echoName(s.species), why: `${lines} of 5 substat lines: only a fully tuned echo can be re-rolled` });
        continue;
      }
      if (s.record?.rank != null && Number(s.record.rank) !== 5) {
        leftOut.push({ resonator: characterName(id), slot: s.slot + 1, echo: echoName(s.species), why: "not a 5-star echo: only those can be re-rolled" });
        continue;
      }
      advices.push(await rerollAdvice(session, id, s.slot, { ...(needs[id] != null ? { erNeed: needs[id] } : {}), ...(options.noRepeat ? { canRepeat: false } : {}) }, { yieldMs: 0 }));
    }
  }
  const sort = options.sort ?? "damage";
  const dealers = new Set(advices.map((a) => a.characterId).filter((id) => roleOf(id) === "dealer"));
  const everyone = Boolean(options.everyone || only);
  const filter: TransducerFilter = { characterId: only, characterIds: everyone ? null : dealers, cost: options.cost ?? null, keep: options.keep ?? null };
  const rows = transducerRows(advices, filter, sort);
  const have = options.have != null && Number.isFinite(options.have) && options.have > 0 ? Math.floor(options.have) : null;
  const spend: SpendPlan | null = have ? spendPlan(advices, have, filter, sort === "percent" ? "percent" : "damage") : null;
  const check: CritKeepCheck = critKeepCheck(advices, { characterId: only, characterIds: everyone ? null : dealers });
  const exception = (x: CritKeepCheck["both"]["exceptions"][number]): CritException => ({
    resonator: characterName(x.advice.characterId),
    slot: x.advice.slot + 1,
    echo: echoName(x.advice.echo),
    bestKeeps: x.kept.map((k) => statLabel(k) ?? k),
    bestGainPct: pct2(x.best.expectedGain),
    critOnlyGainPct: x.critPlan ? pct2(x.critPlan.expectedGain) : null,
  });
  const rowOut = (row: TransducerRow): TransducerReport["ranking"][number] => ({
    rank: row.rank,
    pays: row.pays,
    blocked: row.blocked,
    erUnknown: row.erUnknown,
    resonator: characterName(row.advice.characterId),
    slot: row.advice.slot + 1,
    echo: echoName(row.advice.echo),
    damagePerTransducer: Math.round(row.damagePerTransducer),
    plan: row.plan ? planReport(row.advice, row.plan) : null,
  });
  return {
    export: exp.path,
    rule: `A try costs ${DEFAULT_LOCK_COSTS[0]} Transducer with up to two lines kept, ${DEFAULT_LOCK_COSTS[3]} with three, ${DEFAULT_LOCK_COSTS[4]} with four (${LOCK_COST_NOTE}); you may keep the old lines, the Transducers are spent either way; only fully tuned 5-star echoes.`,
    ms: Math.round(performance.now() - started),
    echoes: worn,
    leftOut,
    erNeeds: Object.fromEntries(Object.entries(needs).map(([id, need]) => [characterName(id), need])),
    erNote: note,
    filter: { resonator: only ? characterName(only) : null, cost: options.cost ?? null, keep: options.keep ?? null, everyone, sort },
    typeRule: options.noRepeat
      ? "A re-rolled line takes a stat the echo did not hold before the re-roll (--no-repeat). The game says only that locked substats are excluded."
      : "A re-rolled line takes any stat the kept lines do not hold, so it may come back as the stat it was: the game says only that locked substats are excluded (--no-repeat reads it the other way).",
    supportsLeftOut: everyone ? [] : [...new Set(advices.filter((a) => !dealers.has(a.characterId)).map((a) => characterName(a.characterId)))].sort(),
    ranking: rows.map(rowOut),
    spend: spend
      ? {
          have: spend.budget,
          used: spend.used,
          expectedDamage: Math.round(spend.expectedDamage),
          steps: spend.steps.map((s) => {
            const p = planReport(s.advice, s.plan);
            return {
              resonator: characterName(s.advice.characterId),
              slot: s.advice.slot + 1,
              echo: echoName(s.advice.echo),
              keep: p.keep,
              reroll: p.reroll,
              tries: s.tries,
              transducers: s.transducers,
              expectedGainPct: pct2(s.expectedGain),
              expectedDamage: Math.round(s.expectedDamage),
              chanceOfAnyPct: pct2(chanceOfAny(s.plan, s.tries)),
            };
          }),
        }
      : null,
    critCheck: {
      scope: everyone ? "every set-up resonator" : "damage dealers",
      echoes: check.echoes,
      paying: check.paying,
      bothCritLines: {
        echoes: check.both.echoes,
        keepsExactlyBoth: check.both.keepsBoth,
        keepsOneAndAnother: check.both.keepsOneAndOther,
        keepsLess: check.both.keepsLess,
        critOnlyShareOfBestPct: pct2(check.both.shareOfBest),
        exceptions: check.both.exceptions.map(exception),
      },
      oneCritLine: { echoes: check.one.echoes, keepsIt: check.one.keepsCrit, exceptions: check.one.exceptions.map(exception) },
      noCritLine: { echoes: check.none.echoes },
    },
    echoesDetail: advices
      .filter((a) => everyone || dealers.has(a.characterId))
      .map((a) => ({
        resonator: characterName(a.characterId),
        characterId: a.characterId,
        role: roleOf(a.characterId),
        slot: a.slot + 1,
        echo: echoName(a.echo),
        rotationDamage: Math.round(a.base),
        lines: a.lines.map((l) => ({ stat: statLabel(l.key) ?? l.key, key: l.key, value: l.value, worthPct: pct2(l.worth), freshPct: pct2(l.freshWorth), ...(l.erFloor ? { erFloor: true } : {}) })),
        recommended: a.recommended ? planReport(a, a.recommended) : null,
        plans: a.plans.map((p) => planReport(a, p)),
      })),
  };
}

/** The sentence for "a good try": what the best one in ten gains, or that fewer than one in ten beat the echo at all. */
export const goodTryText = (pct: number | null): string =>
  pct == null ? "fewer than one try in ten beats the lines it has" : `a good try (one in ten) gains ${signed(pct)} or more`;
const signed = (n: number, digits = 2): string => `${n >= 0 ? "+" : ""}${n.toFixed(digits)}%`;
const whole = (n: number): string => `${Math.round(n)}%`;
const s = (n: number, word: string): string => `${n} ${word}${n === 1 ? "" : "s"}`;

export function printTransducers(r: TransducerReport, top = 25): void {
  const f = r.filter;
  const scope = [f.resonator ?? (f.everyone ? "every set-up resonator" : "damage dealers"), f.cost ? `${s(f.cost, "Transducer")} a try` : null, f.keep != null ? `${s(f.keep, "line")} kept` : null].filter(Boolean).join(" · ");
  console.log(`Transducer ranking — ${scope} · ${r.ranking.length} echoes · ${(r.ms / 1000).toFixed(1)} s`);
  console.log(r.rule);
  if (r.erNote) console.log(r.erNote);
  const paying = r.ranking.filter((x) => x.pays);
  const first = paying[0];
  console.log("");
  if (!first || !first.plan) {
    console.log("No re-roll is expected to pay under this filter: keep the Transducers.");
  } else {
    const p = first.plan;
    console.log(`Best use of ${s(p.transducersPerTry, "Transducer")}: ${first.resonator}, slot ${first.slot} (${first.echo ?? "echo"})`);
    console.log(`  keep     ${p.keep.join(" + ") || "nothing"}`);
    console.log(`  re-roll  ${p.reroll.join(", ")}`);
    console.log(`  one try: ${whole(p.chanceToImprovePct)} chance to beat the lines it has · expected ${signed(p.expectedGainPct)} of ${first.resonator}'s rotation (${int(p.expectedDamage)} damage)`);
    console.log(`  ${goodTryText(p.goodTryPct)} · the best it can roll: ${signed(p.best.gainPct)} (${p.best.lines.join(", ")}${p.best.oneIn ? `; 1 try in ${int(p.best.oneIn)}` : ""})`);
    console.log(`  the same locks again: ${signed(p.after3TriesPct)} expected after 3 tries, ${signed(p.after5TriesPct)} after 5`);
  }
  console.log("");
  const shown = r.ranking.slice(0, top);
  console.log(
    table([
      ["  #", "Resonator", "Echo (slot)", "Keep", "Re-roll", "Cost", "Chance", "One try", "Damage / Transducer", "Good try"],
      ...shown.map((x) => {
        const p = x.plan;
        if (!p) return [`  -`, x.resonator, `${x.echo ?? "?"} (${x.slot})`, "-", "-", "-", "-", "-", "-", "no plan under this filter"];
        return [
          `  ${x.pays ? x.rank : "-"}`,
          x.resonator,
          `${x.echo ?? "?"} (${x.slot})`,
          p.keep.join(" + ") || "nothing",
          `${p.reroll.join(", ")}${x.erUnknown ? " *" : ""}`,
          String(p.transducersPerTry),
          whole(p.chanceToImprovePct),
          signed(p.expectedGainPct),
          int(x.damagePerTransducer),
          x.blocked === "erFloor" ? "needs its Energy Regen line: not advised" : x.pays ? (p.goodTryPct == null ? "under 1 in 10 beat it" : signed(p.goodTryPct)) : "not worth a Transducer",
        ];
      }),
    ]),
  );
  if (r.ranking.length > shown.length) console.log(`  … ${r.ranking.length - shown.length} more (--top ${r.ranking.length})`);
  console.log(`  ${paying.length} of ${r.ranking.length} echoes have a plan that pays (an expected gain of 0.05 % or more).`);
  if (r.supportsLeftOut.length) console.log(`  Left out: ${r.supportsLeftOut.join(", ")} (supports are rated on their own damage only; --everyone lists them).`);
  if (r.leftOut.length) console.log(`  Not re-rollable: ${r.leftOut.map((x) => `${x.resonator} slot ${x.slot} (${x.why})`).join("; ")}`);

  if (r.spend) {
    console.log("");
    console.log(`With ${s(r.spend.have, "Transducer")}: ${r.spend.steps.length ? `spend ${r.spend.used}, expected ${int(r.spend.expectedDamage)} damage per rotation in all` : "nothing is expected to pay"}`);
    if (r.spend.steps.length) {
      console.log(
        table([
          ["  Resonator", "Echo (slot)", "Keep", "Tries", "Transducers", "Chance of a better echo", "Expected"],
          ...r.spend.steps.map((x) => [`  ${x.resonator}`, `${x.echo ?? "?"} (${x.slot})`, x.keep.join(" + ") || "nothing", String(x.tries), String(x.transducers), whole(x.chanceOfAnyPct), `${signed(x.expectedGainPct)} (${int(x.expectedDamage)})`]),
        ]),
      );
      console.log("  Tries on one echo keep the same locks. After a re-roll you keep, update the echo and read the ranking again.");
    }
  }

  const c = r.critCheck;
  console.log("");
  console.log(`"Keep Crit Rate + Crit DMG, re-roll the rest" against every other way to lock (${c.scope}; 1 Transducer a try; ${c.paying} of ${c.echoes} echoes have a plan that pays):`);
  const b = c.bothCritLines;
  if (b.echoes) {
    console.log(`  ${b.echoes} with both crit lines: keeping exactly the two is the best plan on ${b.keepsExactlyBoth}; on ${b.keepsOneAndAnother} one crit line and another stat is better; on ${b.keepsLess} fewer lines are kept.`);
    console.log(`    Always keeping exactly the two would give ${whole(b.critOnlyShareOfBestPct)} of the best plans' expected gain on these echoes.`);
    for (const x of b.exceptions.slice(0, 6)) console.log(`    ${x.resonator} slot ${x.slot} (${x.echo ?? "?"}): keep ${x.bestKeeps.join(" + ") || "nothing"} ${signed(x.bestGainPct)} against ${x.critOnlyGainPct == null ? "-" : signed(x.critOnlyGainPct)} for the two crit lines`);
  } else console.log("  No echo with both crit lines has a one-Transducer plan that pays.");
  const o = c.oneCritLine;
  if (o.echoes) {
    console.log(`  ${o.echoes} with one crit line: the best plan keeps it on ${o.keepsIt}.`);
    for (const x of o.exceptions.slice(0, 4)) console.log(`    ${x.resonator} slot ${x.slot} (${x.echo ?? "?"}): keep ${x.bestKeeps.join(" + ") || "nothing"} ${signed(x.bestGainPct)} against ${x.critOnlyGainPct == null ? "-" : signed(x.critOnlyGainPct)} for the crit line alone`);
  }
  if (c.noCritLine.echoes) console.log(`  ${c.noCritLine.echoes} with no crit line.`);
  const erList = Object.entries(r.erNeeds);
  if (erList.length) console.log(`\nEnergy Regen needs respected (from your saved teams): ${erList.map(([name, need]) => `${name} ${showNeed(need).toFixed(1)}%`).join(", ")}.`);
  const unknown = [...new Set(r.ranking.filter((x) => x.pays && x.erUnknown).map((x) => x.resonator))];
  if (unknown.length) console.log(`* re-rolls an Energy Regen line of a resonator in no saved team (${unknown.join(", ")}): the app knows no Energy Regen need for them, so check that the build can lose it.`);
  console.log(r.typeRule);
  console.log("Gains are a share of that resonator's own rotation damage (their best rotation, the ranking enemy). Type odds are assumed even: the game publishes only the value odds.");
}
