// Wuthering Tools+ — `npm run cli -- optimizer-bench`'s input and empty report: a bad --reps is refused by name instead
// of crashing inside the runner, and a filter that matches nothing says so instead of printing a NaN speedup.
import { describe, expect, it } from "vitest";
import type { ExportFile } from "../cli/exportFile";
import { printOptimizerBench, runOptimizerBench } from "./benchCli";

const empty = { path: "empty.json", characters: {}, inventory: { echoes: [] } } as unknown as ExportFile;

describe("optimizer-bench", () => {
  it.each([NaN, 0, -1, 2.5])("refuses --reps %s", async (reps) => {
    await expect(runOptimizerBench(empty, { reps })).rejects.toThrow("--reps must be a whole number, 1 or more");
  });

  it("says no case ran rather than a NaN speedup", async () => {
    const text = printOptimizerBench(await runOptimizerBench(empty, { reps: 1 }));
    expect(text).toContain("No cases ran");
    expect(text).not.toContain("NaN");
  });
});
