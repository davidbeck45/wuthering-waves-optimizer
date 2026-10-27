// Wuthering Tools+ — the live account as an export file. The AI tools (src/sim/ai/tools) and the CLI
// engine wrappers (src/sim/cli/engine.ts) read an `ExportFile`; on the CLI that is a downloaded file,
// in the app it is this: the three persisted Pinia stores (character, inventory, teamRotations) the
// way Settings › Backup would write them, already parsed. JSON-cloned — Pinia hands out reactive
// proxies, which structuredClone rejects and which a tool must never be able to mutate.
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { getExportDataVersion } from "../../migrations";
import type { ExportFile } from "../cli/exportShape";

/** The slices of the three stores an export carries. */
export interface LiveStoresState {
  character: { characters?: Record<string, any> | null; activeCharacter?: string | null };
  inventory: { echoes?: any[] | null; equipped?: Record<string, any> | null; echoPresets?: any[] | null; equippedPresets?: Record<string, any> | null };
  teamRotations: { teams?: any[] | null };
}

/** A deep, plain copy (proxies and getters flattened, functions and undefined dropped). */
function plain<T>(value: T, fallback: T): T {
  if (value == null) return fallback;
  return JSON.parse(JSON.stringify(value)) as T;
}

/** Pure: an `ExportFile` from store-shaped state. */
export function exportFromState(state: LiveStoresState, meta: { version?: string | null; path?: string } = {}): ExportFile {
  return {
    path: meta.path ?? "<live>",
    version: meta.version ?? null,
    source: "WutheringTools",
    characters: plain(state.character.characters ?? {}, {}),
    activeCharacter: state.character.activeCharacter ? String(state.character.activeCharacter) : null,
    inventory: {
      echoes: plain(state.inventory.echoes ?? [], []),
      equipped: plain(state.inventory.equipped ?? {}, {}),
      echoPresets: plain(state.inventory.echoPresets ?? [], []),
      equippedPresets: plain(state.inventory.equippedPresets ?? {}, {}),
    },
    teams: plain(state.teamRotations.teams ?? [], []),
  };
}

function dataVersion(): string | null {
  try {
    return String(getExportDataVersion());
  } catch {
    return null; // storage unavailable: the version is informational only
  }
}

/** The account the app holds right now, as an export file (call it per question: it is a snapshot, not a view). */
export function exportFromStores(): ExportFile {
  const character = useCharacterStore() as unknown as LiveStoresState["character"];
  const inventory = useInventoryStore() as unknown as LiveStoresState["inventory"];
  const teamRotations = useTeamRotationsStore() as unknown as LiveStoresState["teamRotations"];
  return exportFromState({ character, inventory, teamRotations }, { version: dataVersion() });
}
