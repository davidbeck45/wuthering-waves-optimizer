// Wuthering Tools+ — the player's account for the Riley run seam, from the stores: the same Account State and
// "My build" rolls RankingsView.vue registers on /rankings, as one reactive `RileyAccount` (rileyAccount.ts).
// Pass `account.value` with every `rileyClient()` call; its keys change only when the account does.
import { computed, type ComputedRef } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { rileyAccountOf } from "./rileyAccount";
import type { RileyAccount } from "./rileyRun";

export function useRileyAccount(): ComputedRef<RileyAccount> {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, unknown>> } };
  const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, unknown>> } };
  return computed(() =>
    rileyAccountOf(characters.value ?? {}, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, teams.value ?? []),
  );
}
