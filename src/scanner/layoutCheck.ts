/**
 * Whether the scanner's crops are landing on the Echo panel, judged by what
 * they read rather than by the capture's size — and, when contentRect.ts
 * couldn't confirm a title bar from pixels alone, which of its geometric
 * guesses is the right one. See docs/scanner.md's "Checking by result, not
 * by size".
 *
 * A real panel's fixed secondary stat is always one of three known values
 * (inferCostFromSecondaryStat), and its name usually resolves, so a read
 * that shows either is strong evidence the crops are in the right place.
 * Pure: the composable feeds it each candidate's reads.
 */
import { inferCostFromSecondaryStat } from "./parse";

export function readsAsPanel(secondaryText: string, nameResolved: boolean): boolean {
  return nameResolved || inferCostFromSecondaryStat(secondaryText) !== null;
}

/**
 * - `confirmed`: the current layout read as a panel; stop checking.
 * - `adopt`: the current layout didn't, but alternate `index` did — switch to it; stop checking.
 * - `pending`: nothing read as a panel yet; keep checking.
 * - `mismatch`: `maxCandidates` candidates in a row read as neither; stop checking.
 * - `settled`: a previous verdict already ended the check.
 */
export type LayoutVerdict =
  | { kind: "confirmed" }
  | { kind: "adopt"; index: number }
  | { kind: "pending" }
  | { kind: "mismatch" }
  | { kind: "settled" };

export function createLayoutCheck(maxCandidates: number) {
  let failures = 0;
  let settled = false;

  return {
    /** True once the check has ended — callers can skip grabbing alternate crops. */
    get settled() {
      return settled;
    },
    /**
     * One candidate's result: whether the current layout read as a panel,
     * and the same for each alternate tried on that frame (empty if none).
     * The current layout wins whenever it passes, so a session that works
     * today never switches.
     */
    observe(current: boolean, alternates: readonly boolean[] = []): LayoutVerdict {
      if (settled) return { kind: "settled" };
      if (current) {
        settled = true;
        return { kind: "confirmed" };
      }
      const index = alternates.indexOf(true);
      if (index !== -1) {
        settled = true;
        return { kind: "adopt", index };
      }
      failures++;
      if (failures < maxCandidates) return { kind: "pending" };
      settled = true;
      return { kind: "mismatch" };
    },
  };
}

export type LayoutCheck = ReturnType<typeof createLayoutCheck>;
