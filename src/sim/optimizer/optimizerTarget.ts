// Wuthering Tools+ — a saved optimizer target that still points at something (hunt round 1, 2026-11-06).
//
// A character keeps `optimizer.optimizationTarget` after the rotation it names is deleted or lost in an import: 6 of the
// 7 Rotation targets in David's export name a rotation that character no longer has, and 4 of those characters have no
// rotation at all. The setup screen read any string as "Target chosen" and Run scored nothing. Read here, such a target
// is simply unset, and the picker's default for a character with no target takes over: her first rotation, else an attack.

/* eslint-disable @typescript-eslint/no-explicit-any */

export function liveOptimizerTarget(target: unknown, rotations: readonly { id: string }[] | null | undefined): unknown {
  if (typeof target !== "string" || !target.startsWith("Rotation:")) return target ?? null;
  const id = target.slice("Rotation:".length);
  return (rotations ?? []).some((rotation) => rotation.id === id) ? target : null;
}
