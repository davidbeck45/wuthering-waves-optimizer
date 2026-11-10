// Wuthering Tools+ — the energy check's words and numbers for the UI (chips, breakdown, page). Pure.
import { characterShortName } from "../display/names";
import { showHave, showNeed, type EnergyStatus } from "./energyNeed";
import type { MeasureState } from "./useEnergyNeeds";
import { NOT_MEASURED_TEXT } from "./energyCheck";

export const pctText = (n: number | null | undefined, digits = 1): string => (n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`);
export const haveText = (n: number | null | undefined): string => (n == null ? "—" : pctText(showHave(n)));
export const needText = (n: number | null | undefined): string => (n == null ? "—" : pctText(showNeed(n)));
export const intText = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString());
export const energyText = (n: number): string => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1));
/** one name per character on every energy surface ("Xuanling", not "Yangyang: Xuanling" beside it): display/names.ts */
export const nameOf = (id: string): string => characterShortName(id);

export const STATUS_LABEL: Record<EnergyStatus, string> = {
  short: "Short",
  tight: "Tight",
  ok: "OK",
  noGate: "No energy gate",
  unknown: "Not set up",
};

/** One line for a member's state: "short 4.4 % · 1 roll", "tight · +3.2 %", "ok · +9.7 %". */
export function statusDetail(c: { status: EnergyStatus; short: number; rolls: number; margin: number | null }): string {
  if (c.status === "short") return `short ${c.short.toFixed(1)}% · ${c.rolls} roll${c.rolls === 1 ? "" : "s"}`;
  if (c.status === "tight" || c.status === "ok") return `${STATUS_LABEL[c.status].toLowerCase()} · +${(c.margin ?? 0).toFixed(1)}%`;
  return STATUS_LABEL[c.status].toLowerCase();
}

/** Who the team's wuwa_calc figure did not run on their own echoes, for the line that says "on your echoes": a member
 *  with none runs ChemX32 (his standard spread). "" when every member ran their own. */
export function stockSpreadNote(members: ReadonlyArray<{ appKey: string; spread: string }> | undefined): string {
  const stock = (members ?? []).filter((m) => m.spread !== "My build").map((m) => nameOf(m.appKey));
  if (!stock.length) return "";
  return ` (${stock.join(" and ")} ${stock.length === 1 ? "has" : "have"} none: ChemX32 stands in)`;
}

/** Why a team shows no numbers, for a chip's tooltip and the card's empty state. */
export function measureNote(state: MeasureState | null): string {
  if (!state) return "Not checked yet";
  if (state.status === "loading") return "Measuring with wuwa_calc…";
  if (state.status === "error") return `The engine failed: ${state.message}`;
  if (state.status === "notMeasured") return `Not measured: ${state.reason === "notInApp" ? state.message : NOT_MEASURED_TEXT[state.reason]}`;
  return "";
}

/** Said where an all-clear would stand when no member has a build of their own to compare. */
export const NO_BUILD_TEXT = "no build to check";

/** A summary tile on /energy: the count and who, or the all-clear, which reaches only as far as what was measured. With
 *  nothing measured there is no figure: "0, every Liberation paid" read as a pass while the engine had failed. The same
 *  with no build to compare: after Settings › Delete the leftover teams read "0, every Liberation paid" for nine
 *  members who had no build (2026-11-08 hunt, M2). Members without one are counted beside an all-clear. */
export function kpiReading(names: readonly string[], clear: string, s: { teams: number; measured: number; members?: number; built?: number }, busy: boolean, name: (id: string) => string = nameOf): { value: string; sub: string } {
  if (!s.measured) return { value: "—", sub: busy ? "measuring…" : "no team measured" };
  if (names.length) return { value: String(names.length), sub: names.map(name).join(", ") };
  const unbuilt = s.members != null && s.built != null ? s.members - s.built : 0;
  if (unbuilt > 0 && !s.built) return { value: "—", sub: NO_BUILD_TEXT };
  const reach = s.measured < s.teams ? `${clear} in the ${s.measured === 1 ? "1 team" : `${s.measured} teams`} measured` : clear;
  return { value: "0", sub: unbuilt > 0 ? `${reach}, ${unbuilt === 1 ? "1 member has" : `${unbuilt} members have`} no build` : reach };
}

/** Why the account tile has no check to show when saved teams exist: an engine that failed is not a team it can't read. */
export function unmeasuredDetail(states: ReadonlyArray<MeasureState | null | undefined>): string {
  return states.some((s) => s?.status === "error") ? "the check could not run: open it to try again" : "none of your saved teams is one of wuwa_calc's compositions";
}

/** "S6 R5 · Everbright Polestar" for a member of his run. */
export const gearText = (m: { sequence: number; refinement: number; weapon: string; owned: boolean }): string =>
  `S${m.sequence} R${m.refinement} · ${m.weapon}${m.owned ? "" : " (not set up)"}`;

/** What a member's need is called: the loop's ("need") or the kit's own floor (Shorekeeper, Mornye: their kits turn
 *  Energy Regen into buffs, so wuwa_calc's loadout keeps a minimum above what the loop asks). */
export const needLabel = (m: { setBy?: "loop" | "kit" | null } | null | undefined): string => (m?.setBy === "kit" ? "kit floor" : "need");

/** His action names carry a parenthesised variant ("(S6)", "(Sky Over Water)"): kept, but trimmed for a chip. */
export const actionText = (name: string, max = 48): string => (name.length > max ? `${name.slice(0, max - 1)}…` : name);
