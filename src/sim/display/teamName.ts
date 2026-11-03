// Wuthering Tools+ — one name per team on every plus page ("one team, one number", 2026-11-02).
//
// A saved team's stored name is data: a wuwa_calc import writes everything the run carries into it
// ("Aemeath · Mornye + Lynae · S6R5 DPS · S1R1/S6R1 team (wuwa_calc)", or the older "wuwa_calc Aemeath S6R5 DPS · …"),
// and the player may type anything. Wherever a plus page shows a team as a heading — the share sheet and the card it
// draws, the palette, Explain questions, the Energy check — it shows `teamTitle`: a generated name read down to its
// title (`parsePresetName`: "Aemeath · Mornye + Lynae", the very form `teamLabel` builds from keys), a typed name as
// typed. `teamTierLine` is the second line a generated name keeps ("main DPS S6R5 · supports S1R1 / S6R1"). The stored
// name stays in the data, in tooltips and in search keywords. Pure: no Vue, no stores.
import { parsePresetName, type PresetNameOptions } from "../presets/presetName";
import { teamLabel } from "./names";

/** A name wuwa_calc / this app's importer wrote (vs. one the player typed): `parsePresetName`'s reading. */
export const isGeneratedName = (name: string | null | undefined): boolean => parsePresetName(name ?? "").generated;

/** The team's heading: a generated name's title, a typed name as typed, else the members (`teamLabel`). */
export function teamTitle(name: string | null | undefined, characterIds: ReadonlyArray<string | null | undefined> = [], mainDps: string | null = null, options: PresetNameOptions = {}): string {
  const raw = String(name ?? "").trim();
  if (raw) {
    const parts = parsePresetName(raw, options);
    return parts.generated && parts.title ? parts.title : raw;
  }
  return teamLabel(characterIds, mainDps);
}

/** A generated team name's investment chips as one line ("main DPS S6R5 · supports S1R1 / S6R1"), with "wuwa_calc"
 *  when `withEngine`; null for a name the player typed. */
export function teamTierLine(name: string | null | undefined, withEngine = false): string | null {
  const parts = parsePresetName(name ?? "");
  if (!parts.generated) return null;
  const chips = parts.chips.filter((c) => c.kind !== "preset").map((c) => c.label);
  if (withEngine) chips.push("wuwa_calc");
  return chips.length ? chips.join(" · ") : null;
}
