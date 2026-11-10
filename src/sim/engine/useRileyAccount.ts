// Wuthering Tools+ — the player's account for the Riley run seam, from the stores: the same Account State and
// "My build" rolls RankingsView.vue registers on /rankings, as one reactive `RileyAccount` (rileyAccount.ts).
// Pass `account.value` with every `rileyClient()` call; its keys change only when the account does.
import { computed, type ComputedRef } from "vue";
import { storeToRefs } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { autoTeamBuffs } from "../teamContext/autoTeamBuffs";
import { rileyAccountForTeam, rileyAccountOf, savedTeamOf, type PinnedTeam } from "./rileyAccount";
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

/* eslint-disable no-unused-vars -- the parameters of an interface's method types */
export interface RileyTeamAccounts {
  /** the account on every character's active build (`useRileyAccount`): what a team nobody saved runs at */
  base: ComputedRef<RileyAccount>;
  /** the account a saved team runs at: its members on the builds it pins (`rileyAccountForTeam`) */
  ofTeam(team: PinnedTeam | null | undefined): RileyAccount;
  /** the account of the saved team with these three, any order; `base` when nobody saved them */
  ofComposition(characterIds: ReadonlyArray<string | null | undefined>): RileyAccount;
  /** changes when any saved team's account does (a pin moved, a pinned build's echoes or weapon changed) */
  key: ComputedRef<string>;
}
/* eslint-enable no-unused-vars */

/** Each saved team's own account beside the base one, from the same stores. A saved team pins the builds it runs, and
 *  Teams, /account and /my-rankings score it on those — so the wuwa_calc pages ask at `ofTeam` / `ofComposition`
 *  wherever they show a saved team, and at `base` for every other composition. */
export function useRileyTeamAccounts(): RileyTeamAccounts {
  const characterStore = useCharacterStore();
  const inventoryStore = useInventoryStore();
  const teamStore = useTeamRotationsStore();
  const { characters } = storeToRefs(characterStore) as unknown as { characters: { value: Record<string, Record<string, any>> } };
  const { teams } = storeToRefs(teamStore) as unknown as { teams: { value: Array<Record<string, any>> } };
  const base = useRileyAccount();
  /** per saved team (by its place in the list: two teams may share an id-less record), worked out once per change */
  const accounts = computed(() => {
    const inventory = { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} };
    const list = teams.value ?? [];
    return list.map((t) => rileyAccountForTeam(t, characters.value ?? {}, inventory, list, { auto: autoTeamBuffs.value, base: base.value }));
  });
  const ofTeam = (team: PinnedTeam | null | undefined): RileyAccount => {
    const list = teams.value ?? [];
    const i = team ? list.findIndex((t) => t === team || (t?.id != null && t.id === (team as { id?: unknown }).id)) : -1;
    if (i >= 0) return accounts.value[i] ?? base.value;
    if (!team) return base.value;
    return rileyAccountForTeam(team, characters.value ?? {}, { echoes: inventoryStore.echoes ?? [], equipped: inventoryStore.equipped ?? {} }, list, { auto: autoTeamBuffs.value, base: base.value });
  };
  return {
    base,
    ofTeam,
    ofComposition: (characterIds) => {
      const team = savedTeamOf(teams.value ?? [], characterIds);
      return team ? ofTeam(team) : base.value;
    },
    key: computed(() => accounts.value.map((a) => `${a.key}.${a.buildsKey}`).join(",")),
  };
}
