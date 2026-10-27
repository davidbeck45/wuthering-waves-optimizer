// Wuthering Tools+ — the energy check's words and numbers for the UI (chips, breakdown, page). Pure.
import { getCharacterRosterDisplayName } from "../../characters/characters";
import { showHave, showNeed, type EnergyStatus } from "./energyNeed";
import type { MeasureState } from "./useEnergyNeeds";
import { NOT_MEASURED_TEXT } from "./energyCheck";

export const pctText = (n: number | null | undefined, digits = 1): string => (n == null || !Number.isFinite(n) ? "—" : `${n.toFixed(digits)}%`);
export const haveText = (n: number | null | undefined): string => (n == null ? "—" : pctText(showHave(n)));
export const needText = (n: number | null | undefined): string => (n == null ? "—" : pctText(showNeed(n)));
export const intText = (n: number | null | undefined): string => (n == null || !Number.isFinite(n) ? "—" : Math.round(n).toLocaleString());
export const energyText = (n: number): string => (Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : n.toFixed(1));
export const nameOf = (id: string): string => getCharacterRosterDisplayName(id);

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

/** Why a team shows no numbers, for a chip's tooltip and the card's empty state. */
export function measureNote(state: MeasureState | null): string {
  if (!state) return "Not checked yet";
  if (state.status === "loading") return "Measuring with wuwa_calc…";
  if (state.status === "error") return `The engine failed: ${state.message}`;
  if (state.status === "notMeasured") return `Not measured: ${state.reason === "notInApp" ? state.message : NOT_MEASURED_TEXT[state.reason]}`;
  return "";
}

/** "S6 R5 · Everbright Polestar" for a member of his run. */
export const gearText = (m: { sequence: number; refinement: number; weapon: string; owned: boolean }): string =>
  `S${m.sequence} R${m.refinement} · ${m.weapon}${m.owned ? "" : " (not set up)"}`;

/** What a member's need is called: the loop's ("need") or the kit's own floor (Shorekeeper, Mornye: their kits turn
 *  Energy Regen into buffs, so wuwa_calc's loadout keeps a minimum above what the loop asks). */
export const needLabel = (m: { setBy?: "loop" | "kit" | null } | null | undefined): string => (m?.setBy === "kit" ? "kit floor" : "need");

/** His action names carry a parenthesised variant ("(S6)", "(Sky Over Water)"): kept, but trimmed for a chip. */
export const actionText = (name: string, max = 48): string => (name.length > max ? `${name.slice(0, max - 1)}…` : name);
