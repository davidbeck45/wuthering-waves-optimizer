// Wuthering Tools+ — which stat floor rows are floors. "Add stat" makes a row reading "Choose a stat" / "Minimum
// value", and a row left like that is saved with the setup (`{ stat: null, minValue: null }`). Upstream handed it to
// the run, where `meetsMinStatThreshold(finalStats[null], null)` is false for every loadout: David's Camellya had one,
// so her Optimizer returned nothing while the bar read "1 stat floor", and Optimize team refused every team she was in.
// A row is a floor once it names a stat and a number. The saved rows are left alone: this only decides what a run
// applies and what the page counts.

/* eslint-disable @typescript-eslint/no-explicit-any */

/** True when the row names a stat and a minimum that reads as a number. */
export function isStatFloor(row: any): boolean {
  if (!row || typeof row !== "object") return false;
  if (typeof row.stat !== "string" || row.stat === "") return false;
  if (row.minValue === null || row.minValue === undefined || row.minValue === "") return false;
  return Number.isFinite(Number(row.minValue));
}

/** The rows a run applies and the page counts, in their order. Anything that is not a list is no floors. */
export function appliedStatFloors<T>(rows: readonly T[] | null | undefined): T[] {
  return Array.isArray(rows) ? rows.filter(isStatFloor) : [];
}
