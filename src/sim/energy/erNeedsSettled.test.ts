// Wuthering Tools+: ER needs read after the energy check timed out or a team failed are short. A result scored on them
// is fine for this tab but must not be kept: `erNeedsSettled` is how a page tells.
import { describe, expect, it } from "vitest";
import { erNeedsSettled } from "./energySubstats";

const energy = (busy: boolean, statuses: Array<string | null>) =>
  ({ busy: { value: busy }, savedTeams: { value: statuses.map((status) => ({ state: status ? { status } : null })) } }) as unknown as Parameters<typeof erNeedsSettled>[0];

describe("erNeedsSettled", () => {
  it("holds when every saved team was measured, and with no saved teams at all", () => {
    expect(erNeedsSettled(energy(false, ["ok", "ok"]))).toBe(true);
    expect(erNeedsSettled(energy(false, []))).toBe(true);
  });

  it("fails while the check is still running, or when a team failed or was never measured", () => {
    expect(erNeedsSettled(energy(true, ["ok"]))).toBe(false);
    expect(erNeedsSettled(energy(false, ["ok", "error"]))).toBe(false);
    expect(erNeedsSettled(energy(false, ["loading"]))).toBe(false);
    expect(erNeedsSettled(energy(false, [null]))).toBe(false);
  });
});
