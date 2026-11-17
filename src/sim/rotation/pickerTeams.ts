// Wuthering Tools+ — the stock teams /rotation's picker lists: the compositions of the bundled wuwa_calc presets, one
// per three members, as THIS account fields them. The presets name a Rover by the female key (wuwa_calc has one Rover
// per element), so a male Rover's account read every Rover team under the other gender's name, portrait and address,
// and a team opened from such a tile was not recognised as the one he had saved (its pinned builds were not read).
// `teamPresetForAccount` puts each member under the key the account plays, as it does for the rankings, Teams › List
// Presets and the assistant (2026-11-09) — for every Rover element, also one the account has not set up yet
// (`accountKeyOf`). Pure: no Vue, no stores.
import type { TeamRotationPreset } from "../../teamRotations/presets";
import { teamLabel } from "../display/names";
import { teamPresetForAccount } from "../presets";

export interface PickerEntry {
  /** the composition, whoever sits where */
  id: string;
  title: string;
  subtitle: string;
  /** app character keys, the preset's slot order (its main DPS first) */
  chars: string[];
  badge?: string;
}

/** One entry per stock composition, in the presets' order, titled the way every plus page names a team (the main DPS,
 *  then the others: "Rover Electro · Mornye + Lynae"). A preset without three members is left out. */
export function stockEntries(presets: ReadonlyArray<TeamRotationPreset>, characters: Record<string, any> | null | undefined): PickerEntry[] {
  const seen = new Set<string>();
  const out: PickerEntry[] = [];
  for (const stock of presets) {
    const chars = (teamPresetForAccount(stock, characters).data?.characterIds ?? []) as Array<string | null>;
    if (chars.length !== 3 || chars.some((c) => !c)) continue;
    const ids = chars as string[];
    const id = [...ids].sort().join("+");
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, title: teamLabel(ids, ids[0]), subtitle: "", chars: ids });
  }
  return out;
}
