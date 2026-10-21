/**
 * Resolves the optimizer's echo buff settings (set-bonus passives and main
 * echo buffs) for the v3 optimizer (issue #618).
 *
 * Each buff's setting comes from the first of:
 *   1. the optimizer's own saved setting (`optimizer.echoSetPassives[key]` /
 *      `optimizer.mainEchoBuffs[echo].buffs[key]`)
 *   2. the calculator's setting for the same buff (`echoSetPassives[key]` /
 *      `mainEcho.buffs[key]`, the latter only when `mainEcho.echo` is that echo)
 *   3. nothing: off, reported as "unset" so the UI can flag it
 *
 * It's a live fallback, not a copy: until the user changes a buff in the
 * optimizer, it follows the calculator. Classic's optimizer doesn't pass
 * `calculatorFallback`, so it only ever sees source 1.
 */
import type { MainEchoBuffState, MainEchoState, OptimizerMainEchoBuffEntry } from "../echoes/mainEchoBuffs";

export type OptimizerBuffEntry = { isEnabled?: boolean; stacks?: number };

export type OptimizerBuffSource = "optimizer" | "calculator" | "none";

/**
 * - `always`: an always-enabled buff; never needs the user's attention
 * - `unset`: nothing saved anywhere; off
 * - `zero-stacks`: enabled but a stacking buff at 0 stacks, so it adds nothing
 * - `on` / `off`: a real setting
 */
export type OptimizerBuffStatus = "always" | "unset" | "zero-stacks" | "on" | "off";

export interface ResolvedOptimizerBuff {
  source: OptimizerBuffSource;
  isEnabled: boolean;
  stacks: number;
  status: OptimizerBuffStatus;
  /** The optimizer has its own setting and it differs from the calculator's,
   *  so "Use calculator setting" would change something. */
  canUseCalculatorSetting: boolean;
}

export interface ResolveOptimizerBuffInput {
  optimizerEntry: OptimizerBuffEntry | undefined;
  calculatorEntry: OptimizerBuffEntry | undefined;
  hasStacks: boolean;
  alwaysEnabled: boolean;
  /** v3 only. When false, the calculator entry is ignored (classic behavior). */
  calculatorFallback: boolean;
}

function sameSetting(a: OptimizerBuffEntry, b: OptimizerBuffEntry, hasStacks: boolean): boolean {
  if ((a.isEnabled ?? false) !== (b.isEnabled ?? false)) return false;
  return !hasStacks || (a.stacks ?? 0) === (b.stacks ?? 0);
}

export function resolveOptimizerBuff(input: ResolveOptimizerBuffInput): ResolvedOptimizerBuff {
  const { optimizerEntry, hasStacks, alwaysEnabled, calculatorFallback } = input;
  const calculatorEntry = calculatorFallback ? input.calculatorEntry : undefined;

  let source: OptimizerBuffSource = "none";
  let entry: OptimizerBuffEntry | undefined;
  if (optimizerEntry) {
    source = "optimizer";
    entry = optimizerEntry;
  } else if (calculatorEntry) {
    source = "calculator";
    entry = calculatorEntry;
  }

  const isEnabled = alwaysEnabled || (entry?.isEnabled ?? false);
  const stacks = entry?.stacks ?? 0;

  let status: OptimizerBuffStatus;
  if (alwaysEnabled) status = "always";
  else if (source === "none") status = "unset";
  else if (!isEnabled) status = "off";
  else if (hasStacks && stacks <= 0) status = "zero-stacks";
  else status = "on";

  const canUseCalculatorSetting =
    !alwaysEnabled &&
    source === "optimizer" &&
    !!calculatorEntry &&
    !sameSetting(optimizerEntry!, calculatorEntry, hasStacks);

  return { source, isEnabled, stacks, status, canUseCalculatorSetting };
}

/** Statuses the optimizer warns about before a run. */
export function needsAttention(status: OptimizerBuffStatus): boolean {
  return status === "unset" || status === "zero-stacks";
}

function hasBuffMap(buffs: Record<string, MainEchoBuffState> | undefined): boolean {
  return Boolean(buffs && Object.keys(buffs).length > 0);
}

/**
 * One buff's saved setting from a main echo state, or undefined if nothing is
 * saved for it. Mirrors `isMainEchoBuffEnabled`/`getMainEchoBuffStacks`: a
 * state with no per-buff map is the legacy shape, whose single
 * `isEnabled`/`stacks` applies to every buff.
 */
export function getMainEchoBuffEntry(
  state: MainEchoState | OptimizerMainEchoBuffEntry | null | undefined,
  buffKey: string,
): OptimizerBuffEntry | undefined {
  if (!state) return undefined;
  if (hasBuffMap(state.buffs)) return state.buffs?.[buffKey];
  if (state.isEnabled === undefined && state.stacks === undefined) return undefined;
  return { isEnabled: state.isEnabled, stacks: state.stacks };
}

/** The calculator's setting for a main echo buff, only if that echo is the
 *  calculator's equipped main echo (it saves settings for that one only). */
export function getCalculatorMainEchoBuffEntry(
  mainEcho: MainEchoState | null | undefined,
  echoKey: string,
  buffKey: string,
): OptimizerBuffEntry | undefined {
  if (!mainEcho || mainEcho.echo !== echoKey) return undefined;
  return getMainEchoBuffEntry(mainEcho, buffKey);
}

/** One buff the optimizer setup lists, with its resolved setting. */
export interface OptimizerBuffItem {
  kind: "setPassive" | "mainEcho";
  key: string;
  /** Main echo buffs only. */
  echoKey?: string;
  hasStacks: boolean;
  maxStacks: number;
  alwaysEnabled: boolean;
  resolved: ResolvedOptimizerBuff;
}

export interface OptimizerBuffBulkUpdate {
  echoSetPassives?: Record<string, OptimizerBuffEntry>;
  mainEchoBuffs?: Record<string, { buffs: Record<string, OptimizerBuffEntry> }>;
}

/**
 * The `optimizer` patch for the buffs section's "Enable all" / "Max all",
 * matching those buttons elsewhere: "enable" turns every optional buff on and
 * keeps its current stacks; "max" also sets stacking buffs to their max.
 * Always-enabled buffs are left alone.
 */
export function buildOptimizerBuffBulkUpdate(
  items: OptimizerBuffItem[],
  mode: "enable" | "max",
): OptimizerBuffBulkUpdate {
  const update: OptimizerBuffBulkUpdate = {};
  for (const item of items) {
    if (item.alwaysEnabled) continue;
    const entry: OptimizerBuffEntry = { isEnabled: true };
    if (item.hasStacks) {
      entry.stacks = mode === "max" ? item.maxStacks : item.resolved.stacks;
    }
    if (item.kind === "setPassive") {
      update.echoSetPassives = { ...update.echoSetPassives, [item.key]: entry };
    } else if (item.echoKey) {
      const mainEchoBuffs = (update.mainEchoBuffs ??= {});
      mainEchoBuffs[item.echoKey] ??= { buffs: {} };
      mainEchoBuffs[item.echoKey].buffs[item.key] = entry;
    }
  }
  return update;
}
