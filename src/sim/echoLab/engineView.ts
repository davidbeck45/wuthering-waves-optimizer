// Wuthering Tools+ Echo Lab — the "Engine view for this build" the v3 calculator shows under Echo Insights: one
// character's benchmark score, what one more roll of each substat is worth on their best rotation
// (`substatWeights`, the /my-rankings numbers), what each equipped echo's substats add (`equippedSubstatWorth`),
// and the echo to re-roll first — the best Transducer plan per Transducer over every full echo (`pickRerollFirst`,
// the re-roll tab's rule). One job, one character, all engine numbers.
// Pure/async, worker-safe.
import { SUBSTAT_LABELS, SUBSTAT_SHORT_LABELS, equippedSubstatWorth, substatWeights, type BuildScorer, type SubstatKey } from "../substats/substatWeights";
import { benchmarkScore } from "./benchmarkScore";
import { isCancelled, makePacer, prepareCharacter, scoreBuild, type LabSession, type RunControl } from "./core";
import { rerollAdvice, type LineAdvice, type LockPlan, type RerollAdviceResult } from "./rerollAdvice";
import { pickRerollFirst } from "./rerollPick";

export interface EngineViewOptions {
  /** also run the Transducer advice on every full echo and pick the one to re-roll first (default true; the costly
   * part — the calculator panel runs it as separate `reroll` jobs instead, so its first numbers show sooner) */
  reroll?: boolean;
}

export interface EngineSubstat {
  key: SubstatKey;
  label: string;
  short: string;
  /** relative gain of one expected roll on the best rotation */
  gain: number;
  perPoint: number;
  /** 1 = the best substat, 0 = does nothing */
  weight: number;
}

export interface EngineEchoWorth {
  slot: number;
  echoId: string | null;
  echo: string | null;
  set: string | null;
  cost: number | null;
  lines: number;
  /** what this echo's substats add to the best rotation, relative (the lowest is the one to re-roll first) */
  worth: number;
}

export interface EngineViewResult {
  characterId: string;
  name: string;
  rotationName: string;
  rotationSource: string;
  base: number;
  benchmark: { score: number | null; rawScore: number | null; D: number; B: number; R: number; P: number } | null;
  /** why there is no benchmark (fewer than five echoes, say) */
  benchmarkNote: string | null;
  /** every substat, best first */
  substats: EngineSubstat[];
  echoes: EngineEchoWorth[];
  rerollFirst: {
    slot: number;
    echoId: string | null;
    echo: string | null;
    worth: number;
    /** the line to re-roll first (rank 1 of the picked echo) */
    line: LineAdvice | null;
    lines: LineAdvice[];
    recommended: LockPlan | null;
  } | null;
  /** why there is no re-roll pick */
  rerollNote: string | null;
  scorings: number;
  ms: number;
}

const now = (): number => (typeof performance !== "undefined" ? performance.now() : Date.now());

export async function engineView(session: LabSession, characterId: string, options: EngineViewOptions = {}, control: RunControl = {}): Promise<EngineViewResult> {
  const started = now();
  const startScorings = session.scorings;
  const pace = makePacer(control);
  const lab = await prepareCharacter(session, characterId, pace);
  if (!lab) throw new Error(`${characterId} can't be scored: ${session.skipped.get(characterId) ?? "unknown"}`);
  const { characters, echoes } = session.account;

  const scorer: BuildScorer = async (chars, inventory) => {
    const avg = await scoreBuild(session, lab, chars, inventory);
    await pace();
    return { avg };
  };
  const baseline = { avg: lab.base };

  let benchmark: EngineViewResult["benchmark"] = null;
  let benchmarkNote: string | null = null;
  try {
    const b = await benchmarkScore(session, characterId, {}, control);
    benchmark = { score: b.score, rawScore: b.rawScore, D: b.D, B: b.B, R: b.R, P: b.P };
    if (b.score === null) benchmarkNote = "Substats do not move this rotation";
  } catch (err) {
    if (isCancelled(err)) throw err;
    benchmarkNote = err instanceof Error ? err.message : String(err);
  }

  const weights = await substatWeights(characterId, characters, echoes, scorer, { baseline });
  const substats: EngineSubstat[] = weights.weights.map((w) => ({
    key: w.key,
    label: SUBSTAT_LABELS[w.key],
    short: SUBSTAT_SHORT_LABELS[w.key],
    gain: w.gain,
    perPoint: w.perPoint,
    weight: w.weight,
  }));

  const worth = await equippedSubstatWorth(characterId, characters, echoes, scorer, { baseline });
  const echoWorth: EngineEchoWorth[] = worth.map((w) => ({
    slot: w.slot,
    echoId: w.echoId,
    echo: w.echo,
    set: w.set,
    cost: w.cost,
    lines: w.substats.length,
    worth: w.worth,
  }));

  let rerollFirst: EngineViewResult["rerollFirst"] = null;
  let rerollNote: string | null = null;
  const full = echoWorth.filter((e) => e.lines >= 5).sort((a, b) => a.worth - b.worth || a.slot - b.slot);
  if (!echoWorth.length) rerollNote = "No echoes equipped";
  else if (!full.length) rerollNote = "No echo has all five lines yet: finish tuning first";
  else if (options.reroll === false) rerollNote = null;
  else {
    // the same pick as the Echo Lab's re-roll tab: every full echo's advice, the best plan per Transducer
    const advices: RerollAdviceResult[] = [];
    for (const e of full) advices.push(await rerollAdvice(session, characterId, e.slot, {}, control));
    const pick = pickRerollFirst(advices);
    if (!pick) rerollNote = "No re-roll is expected to gain even 0.05 % on any echo";
    else {
      const first = pick.lines.find((l) => l.rank === 1) ?? null;
      rerollFirst = {
        slot: pick.slot,
        echoId: pick.echoId,
        echo: pick.echo,
        worth: full.find((e) => e.slot === pick.slot)?.worth ?? 0,
        line: first && first.advice === "reroll" ? first : null,
        lines: pick.lines,
        recommended: pick.recommended,
      };
    }
  }

  return {
    characterId: lab.id,
    name: lab.name,
    rotationName: lab.rotationName,
    rotationSource: lab.rotationSource,
    base: lab.base,
    benchmark,
    benchmarkNote,
    substats,
    echoes: echoWorth,
    rerollFirst,
    rerollNote,
    scorings: session.scorings - startScorings,
    ms: now() - started,
  };
}
