// Wuthering Tools+: the brief's bar charts (ladderChart.ts) read the ladder's own rows: the scale starts at zero, the
// labels are the tables' figures, the biggest step is the largest gain, and the marks land where the account is.
import { describe, expect, it } from "vitest";
import kitsFile from "./data/kits.json";
import { dpsText, ladderSteps, rankSteps, signedPercent, weaponSteps, type KitsFile } from "./kits";
import { barSpeech, barWidth, costWidths, rankChart, sameWeaponName, sequenceChart, weaponChart } from "./ladderChart";

const seq = (dps: number[], from = 0) => ladderSteps({ seq: dps.map((d, i) => ({ level: from + i, dps: d, own: 0 })) });

describe("ladder charts", () => {
  it("bars start at zero and scale to the largest figure", () => {
    expect(barWidth(50, 100)).toBe(0.5);
    expect(barWidth(100, 100)).toBe(1);
    expect(barWidth(0, 100)).toBe(0);
    expect(barWidth(-5, 100)).toBe(0);
    expect(barWidth(5, 0)).toBe(0);
    expect(barWidth(Number.NaN, 100)).toBe(0);
  });

  it("the sequence chart: one bar per row, the table's figure as its label, the gain over the level below, the biggest step", () => {
    const steps = seq([100_000, 110_000, 110_000, 165_000, 160_000, 170_000, 200_000]);
    const chart = sequenceChart(steps, 3);
    expect(chart.bars).toHaveLength(7);
    expect(chart.bars.map((b) => b.valueText)).toEqual(steps.map((s) => dpsText(s.dps)));
    expect(chart.bars[0]!.note).toBe("the start");
    expect(chart.bars[1]!.note).toBe("+10.0% over S0");
    expect(chart.bars[2]!.note).toBe("no change over S1");
    expect(chart.bars[3]!.note).toBe(`${signedPercent(0.5)} over S2`);
    expect(chart.bars[6]!.width).toBe(1);
    expect(chart.bars[0]!.width).toBe(0.5);
    expect(chart.biggest).toEqual({ from: 2, to: 3, step: 0.5 });
    expect(chart.biggestText).toBe("The biggest step is S2 to S3: +50.0% team DPS over S2.");
    expect(chart.bars[3]!.marks).toEqual(["you", "biggest"]);
    // a level that lowers team DPS is marked, not hidden
    expect(chart.lower).toEqual([4]);
    expect(chart.bars[4]!.marks).toContain("lower");
    expect(barSpeech(chart.bars[3]!)).toBe("S3: 165K team DPS, +50.0% over S2, you are here, biggest step");
  });

  it("a ladder that starts above S0 names the level below it, and an unowned resonator has no mark", () => {
    const chart = sequenceChart(seq([80_000, 80_000], 2), null);
    expect(chart.bars.map((b) => b.label)).toEqual(["S2", "S3"]);
    expect(chart.bars[1]!.note).toBe("no change over S2");
    expect(chart.biggest).toBeNull();
    expect(chart.biggestText).toBe("No sequence here adds team DPS.");
    expect(chart.bars.flatMap((b) => b.marks)).toEqual([]);
    expect(sequenceChart([], 0).bars).toEqual([]);
  });

  it("the weapon chart: best first, each against the held weapon, held and owned marked by name", () => {
    const weapons = weaponSteps({
      weapons: [
        { weapon: "Held Blade", kind: "Limited", rank: 1, dps: 100_000 },
        { weapon: "Other Blade", kind: "Standard", rank: 1, dps: 90_000 },
        { weapon: "Better Blade", kind: "Limited", rank: 1, dps: 120_000 },
      ],
    });
    const bars = weaponChart(weapons, { weapon: "Held Blade", rank: 1 }, "Other Blade");
    expect(bars.map((b) => b.label)).toEqual(["Better Blade R1", "Held Blade R1", "Other Blade R1"]);
    expect(bars[0]!.note).toBe("+20.0% against Held Blade");
    expect(bars[1]!.note).toBe("the weapon the rest of this section holds");
    expect(bars[1]!.marks).toEqual(["held"]);
    expect(bars[2]!.note).toBe("-10.0% against Held Blade");
    expect(bars[2]!.marks).toEqual(["you"]);
    expect(bars[0]!.width).toBe(1);
    // the ladder holds a weapon the list does not carry (Buling's Variation): each against the best
    const loose = weaponChart(weapons, { weapon: "Not Listed", rank: 1 }, null);
    expect(loose.map((b) => b.note)).toEqual(["the best here", "-16.7% against the best here", "-25.0% against the best here"]);
    expect(loose.flatMap((b) => b.marks)).toEqual([]);
    expect(sameWeaponName("Defier's Thorn", "Defier’s Thorn")).toBe(true);
    expect(sameWeaponName("Defier's Thorn", null)).toBe(false);
  });

  it("the rank chart: the gain per rank over the rank below, the account's rank marked", () => {
    const bars = rankChart(rankSteps({ ranks: [1, 2, 3].map((rank) => ({ rank, dps: 100_000 + (rank - 1) * 10_000, own: 0 })) }), 2);
    expect(bars.map((b) => b.note)).toEqual(["the start", "+10.0% over R1", "+9.1% over R2"]);
    expect(bars[1]!.marks).toEqual(["you"]);
  });

  it("the Team Cost bars: the best team of each cost against the largest; a cost with no team draws nothing", () => {
    expect(costWidths([
      { cost: "s0r1", teams: [{ dps: 50 }] },
      { cost: "s6r5", teams: [{ dps: 100 }] },
      { cost: "x", teams: [] },
    ])).toEqual({ s0r1: 0.5, s6r5: 1, x: 0 });
  });

  it("every shipped ladder draws: as many sequence bars as rows, widths in 0..1, the largest at 1", () => {
    const file = kitsFile as unknown as KitsFile;
    let drawn = 0;
    for (const kit of Object.values(file.kits)) {
      if (!kit.ladder) continue;
      const steps = ladderSteps(kit.ladder);
      const chart = sequenceChart(steps, null);
      expect(chart.bars).toHaveLength(kit.ladder.seq.length);
      for (const b of chart.bars) expect(b.width).toBeGreaterThanOrEqual(0), expect(b.width).toBeLessThanOrEqual(1);
      expect(Math.max(...chart.bars.map((b) => b.width))).toBe(1);
      const w = weaponChart(weaponSteps(kit.ladder), kit.ladder.held, null);
      expect(w.filter((b) => b.marks.includes("held")).length).toBeLessThanOrEqual(1);
      drawn += 1;
    }
    expect(drawn).toBeGreaterThan(40);
  });
});

describe("the sequence strip", () => {
  it("marks the levels that change the loop and the ones the account has, and opens on the next change", async () => {
    const { sequenceStrip } = await import("./ladderChart");
    const rows = [1, 2, 3, 4, 5, 6].map((level) => ({ level, kind: level === 2 ? "loop" : level === 4 ? "order" : null }));
    const owned = sequenceStrip(rows, 3);
    expect(owned.steps.map((s) => s.have)).toEqual([true, true, true, false, false, false]);
    expect(owned.steps.filter((s) => s.current).map((s) => s.level)).toEqual([3]);
    expect(owned.steps.filter((s) => s.kind).map((s) => s.level)).toEqual([2, 4]);
    expect(owned.first).toBe(4);
    expect(sequenceStrip(rows, 6).first).toBe(2);
    expect(sequenceStrip(rows, null).first).toBe(2);
    expect(sequenceStrip(rows, null).steps.some((s) => s.have || s.current)).toBe(false);
    expect(sequenceStrip(rows.map((r) => ({ level: r.level })), 0).first).toBe(1);
  });
});
