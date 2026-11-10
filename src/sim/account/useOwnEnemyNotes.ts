// Wuthering Tools+: /account's team figures beside Teams'. /account scores every team at one enemy; Teams scores a saved
// team at the enemy saved with it. Where the two differ, the team's row says what Teams' enemy has (display/ownEnemy.ts).
import { computed } from "vue";
import { getActivePinia, storeToRefs } from "pinia";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { ownEnemyNote } from "../display/ownEnemy";

// eslint-disable-next-line no-unused-vars -- the parameter of a function type
export type OwnEnemyNoteOf = (team: { id: string; source?: string }) => string | null;

/** The note for a ranked team: only a team the player saved has an enemy of its own (a stock team is scored at the
 *  rankings' enemy on every page). */
export function useOwnEnemyNotes(): OwnEnemyNoteOf {
  if (!getActivePinia()) return () => null; // no stores (a bare component test): no saved teams to read
  const { teams } = storeToRefs(useTeamRotationsStore()) as unknown as { teams: { value: Array<{ id?: unknown; enemyConfig?: Record<string, unknown> | null }> } };
  const notes = computed(() => new Map((teams.value ?? []).map((t) => [String(t.id), ownEnemyNote(t.enemyConfig)])));
  return (team) => (team.source === "yours" ? (notes.value.get(String(team.id)) ?? null) : null);
}
