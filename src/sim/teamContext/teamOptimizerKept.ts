// Wuthering Tools+ — Ryan's Optimize team does not lose its work silently when the page is left (hunt 2, phone flows L2).
//
// Optimize team is a view inside /teams with no history entry, and its state lives in the component: Back, a tap on
// another page or "Back to team" threw the result away, and a search in flight was stopped, with no word either way.
// This is the rule Build my team and Whole account follow (`keptReview`, README "Phone flows"):
//   - a result outlives leaving. It is kept in this page's memory, tied to the team, to the account as the search read
//     it (`accountFingerprint`: characters, echoes, who wears what, teams) and to the team-buff switch it was scored
//     under. Opening Optimize team on that team again shows it, with a line that says so. Anything the result read
//     having changed, a Save, "Edit & run again" or a new search puts it down;
//   - a search stopped by leaving says so on the way back, once, as the echo check on /account does. It cannot go on
//     without the page: its workers belong to the component.
// Memory only: a reload costs a re-run, as it does for a Build my team review.
import { onScopeDispose, ref, watch, type Ref } from "vue";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import { accountFingerprint, type BuildTeamStores } from "../buildTeam/apply";
import { onSavedResultsCleared } from "../persist/savedResults";
import { autoTeamBuffs } from "./autoTeamBuffs";

export type OptimizerKeptNote = { kind: "kept" | "stopped"; at: number };

/** The parts of his composable's state a result is made of, held as they are. */
export interface OptimizerState {
  teamId: Ref<string>;
  phase: Ref<string>;
  damageType: Ref<any>;
  results: Ref<any[]>;
  isProven: Ref<boolean>;
  totalEvaluated: Ref<number>;
  elapsedMs: Ref<number>;
  plansCompared: Ref<number>;
  plansSearched: Ref<number>;
  linkTeamBuffs: Ref<boolean>;
  searchAllPlans: Ref<boolean>;
  /** per slot, what the player set on the setup screen */
  choices: Record<number, any>;
  tickedOffers: Record<number, string[]>;
}

interface Kept {
  teamId: string;
  /** the account as the search read it */
  on: string;
  /** the team-buff switch it was scored under */
  auto: boolean;
  /** when the search ended */
  at: number;
  damageType: any;
  results: any[];
  isProven: boolean;
  totalEvaluated: number;
  elapsedMs: number;
  plansCompared: number;
  plansSearched: number;
  linkTeamBuffs: boolean;
  searchAllPlans: boolean;
  choices: Record<number, any>;
  tickedOffers: Record<number, string[]>;
}

let kept: Kept | null = null;
let stopped: { teamId: string; at: number } | null = null;

const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value ?? null)) as T;

/** For tests and Settings › Clear saved results: nothing kept. */
export function clearKeptOptimizer(): void {
  kept = null;
  stopped = null;
}
onSavedResultsCleared(clearKeptOptimizer);

/** Called once in his composable's setup. `restore()` goes at the end of his `initialize()`; leaving is seen here. */
export function optimizerMemory(state: OptimizerState) {
  const note = ref<OptimizerKeptNote | null>(null);
  // the stores of this app instance, taken while its Pinia is the active one
  const stores = { character: useCharacterStore(), team: useTeamRotationsStore(), inventory: useInventoryStore() } as unknown as BuildTeamStores;
  const fingerprint = (): string => accountFingerprint(stores);
  /** what the result on screen was scored on: set when a search starts, or when a kept result is shown */
  let ran: { on: string; auto: boolean; at: number } | null = null;

  watch(state.phase, (phase) => {
    if (phase === "running") {
      note.value = null; // a new search: the line about the last one has been read
      ran = { on: fingerprint(), auto: autoTeamBuffs.value, at: 0 };
    } else if (phase === "results" && ran && !ran.at) {
      ran.at = Date.now();
    } else if (phase === "setup" && note.value?.kind === "kept") {
      note.value = null; // "Edit & run again": the kept result is put down
    }
  }, { flush: "sync" });

  /** Shows the kept result of this team again when everything it read is as it was. True when it did: the caller then
   *  goes to the results instead of the setup screen. Also raises the "stopped when you left" line, once. */
  function restore(): boolean {
    const teamId = state.teamId.value;
    if (stopped?.teamId === teamId) note.value = { kind: "stopped", at: stopped.at };
    stopped = null;
    const k = kept;
    if (!k || k.teamId !== teamId) return false;
    if (k.on !== fingerprint() || k.auto !== autoTeamBuffs.value) {
      kept = null; // the account or the switch moved: its figures are of another account
      return false;
    }
    state.damageType.value = k.damageType;
    state.linkTeamBuffs.value = k.linkTeamBuffs;
    state.searchAllPlans.value = k.searchAllPlans;
    for (const [slot, choice] of Object.entries(k.choices)) if (state.choices[Number(slot)]) Object.assign(state.choices[Number(slot)], plain(choice));
    for (const [slot, ticked] of Object.entries(k.tickedOffers)) state.tickedOffers[Number(slot)] = [...ticked];
    state.isProven.value = k.isProven;
    state.totalEvaluated.value = k.totalEvaluated;
    state.elapsedMs.value = k.elapsedMs;
    state.plansCompared.value = k.plansCompared;
    state.plansSearched.value = k.plansSearched;
    state.results.value = k.results;
    ran = { on: k.on, auto: k.auto, at: k.at };
    note.value = { kind: "kept", at: k.at };
    return true;
  }

  /** The page is left (another page, Back, "Back to team"). */
  function leave(): void {
    const teamId = state.teamId.value;
    if (state.phase.value === "running") {
      stopped = { teamId, at: Date.now() };
      if (kept?.teamId === teamId) kept = null;
      return;
    }
    if (state.phase.value === "results" && state.results.value.length && ran && ran.on === fingerprint() && ran.auto === autoTeamBuffs.value) {
      kept = {
        teamId,
        on: ran.on,
        auto: ran.auto,
        at: ran.at || Date.now(),
        damageType: state.damageType.value,
        results: state.results.value,
        isProven: state.isProven.value,
        totalEvaluated: state.totalEvaluated.value,
        elapsedMs: state.elapsedMs.value,
        plansCompared: state.plansCompared.value,
        plansSearched: state.plansSearched.value,
        linkTeamBuffs: state.linkTeamBuffs.value,
        searchAllPlans: state.searchAllPlans.value,
        choices: plain(state.choices),
        tickedOffers: plain(state.tickedOffers),
      };
      return;
    }
    // on the setup screen, or the account moved under the result (a Save): nothing of this team to show again
    if (kept?.teamId === teamId) kept = null;
  }
  onScopeDispose(leave);

  return { note, restore, leave };
}

/** The line for the note, said in the page's own words. */
export function keptNoteText(note: OptimizerKeptNote, now = Date.now()): string {
  if (note.kind === "stopped") return "Your last search here stopped when you left this page: it runs only while this page is open. Run it again for its result.";
  const minutes = Math.max(0, Math.round((now - note.at) / 60_000));
  const when = minutes < 1 ? "a moment ago" : minutes === 1 ? "1 minute ago" : minutes < 60 ? `${minutes} minutes ago` : `at ${new Date(note.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  return `This is the result of your last search here, from ${when}. Nothing it read has changed since, so it still stands. "Edit & run again" searches afresh.`;
}
