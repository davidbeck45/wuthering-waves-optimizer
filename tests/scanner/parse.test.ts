import { describe, it, expect } from "vitest";
import {
  parseHeaderText,
  splitStatRows,
  matchEchoName,
  normalizeStatLabel,
  parseEchoCandidate,
} from "../../src/scanner/parse";
import { getEchoData } from "../../src/echoes/index";

// Ground-truth transcripts read directly off real 2880x1800 screenshots the
// user provided (~/Downloads/ScreenshotsEchoes), typed out as tesseract
// would plausibly return them (one line per detected text line). These
// exercise real, previously-unseen shapes: a main+percent stat, a flat
// fixed-secondary row, a stat name that repeats between a flat and percent
// substat on the same echo, a long label wrapping to two lines, and an
// echo below +25 that reveals fewer than 5 substats.

describe("parseHeaderText", () => {
  it("reads name, level, and cost from a clean header block", () => {
    const result = parseHeaderText("Thousand-Puppet Pavilion\n+25\nCOST 4");
    expect(result).toEqual({ name: "Thousand-Puppet Pavilion", level: 25, cost: 4 });
  });

  it("handles a colon in the echo name", () => {
    const result = parseHeaderText("Kernel Puppet: Reflection\n+25\nCOST 1");
    expect(result.name).toBe("Kernel Puppet: Reflection");
    expect(result.cost).toBe(1);
  });

  it("rejects an illegal cost (there is no cost-2 echo tier)", () => {
    const result = parseHeaderText("Some Echo\n+25\nCOST 2");
    expect(result.cost).toBeNull();
  });

  it("returns nulls for lines it can't parse instead of throwing", () => {
    const result = parseHeaderText("");
    expect(result).toEqual({ name: null, level: null, cost: null });
  });
});

describe("splitStatRows", () => {
  it("parses one label+value pair per line", () => {
    const rows = splitStatRows("Healing Bonus 26.4%\nATK 150\nDEF 40");
    expect(rows).toEqual([
      { rawLabel: "Healing Bonus", rawValue: "26.4%" },
      { rawLabel: "ATK", rawValue: "150" },
      { rawLabel: "DEF", rawValue: "40" },
    ]);
  });

  it("rejoins a label that wrapped onto a second line", () => {
    const rows = splitStatRows("Resonance Skill DMG\nBonus 10.9%");
    expect(rows).toEqual([{ rawLabel: "Resonance Skill DMG Bonus", rawValue: "10.9%" }]);
  });

  it("handles two wrapped rows back to back", () => {
    const rows = splitStatRows(
      "Resonance Liberation DMG\nBonus 10.9%\nResonance Skill DMG\nBonus 8.6%",
    );
    expect(rows).toEqual([
      { rawLabel: "Resonance Liberation DMG Bonus", rawValue: "10.9%" },
      { rawLabel: "Resonance Skill DMG Bonus", rawValue: "8.6%" },
    ]);
  });

  it("distinguishes a flat ATK row from a percent ATK row on the same echo", () => {
    const rows = splitStatRows("ATK 7.9%\nATK 50");
    expect(rows).toEqual([
      { rawLabel: "ATK", rawValue: "7.9%" },
      { rawLabel: "ATK", rawValue: "50" },
    ]);
  });

  it("ignores blank lines", () => {
    const rows = splitStatRows("ATK 150\n\n\nDEF 40");
    expect(rows).toHaveLength(2);
  });
});

describe("normalizeStatLabel", () => {
  it("passes through an exact label", () => {
    expect(normalizeStatLabel("Crit. DMG")).toBe("Crit. DMG");
  });

  it("recovers from a missing period (common OCR miss)", () => {
    expect(normalizeStatLabel("Crit DMG")).toBe("Crit. DMG");
  });

  it("returns null for nonsense text", () => {
    expect(normalizeStatLabel("zzz???")).toBeNull();
  });
});

describe("matchEchoName", () => {
  it("finds an exact match", () => {
    const match = matchEchoName("Thousand-Puppet Pavilion", 4);
    expect(match?.similarity).toBe(1);
    expect(getEchoData(match!.key).name).toBe("Thousand-Puppet Pavilion");
  });

  it("still finds the right echo through minor OCR noise", () => {
    const match = matchEchoName("Thousand Puppet Pavillon", 4); // missing hyphen, doubled L
    expect(match?.similarity).toBeGreaterThan(0.85);
    expect(getEchoData(match!.key).name).toBe("Thousand-Puppet Pavilion");
  });

  it("narrows candidates by cost hint", () => {
    const withHint = matchEchoName("Kernel Puppet: Reflection", 1);
    const withoutHint = matchEchoName("Kernel Puppet: Reflection", null);
    expect(getEchoData(withHint!.key).name).toBe("Kernel Puppet: Reflection");
    expect(getEchoData(withoutHint!.key).name).toBe("Kernel Puppet: Reflection");
  });
});

describe("parseEchoCandidate (full real-footage transcripts)", () => {
  it("parses a maxed cost-4 echo with all 5 substats", () => {
    const result = parseEchoCandidate({
      headerText: "Thousand-Puppet Pavilion\n+25\nCOST 4",
      statsText: [
        "Healing Bonus 26.4%",
        "ATK 150",
        "DEF 40",
        "HP 8.6%",
        "Crit. DMG 16.2%",
        "Energy Regen 11.6%",
        "Resonance Skill DMG",
        "Bonus 10.9%",
      ].join("\n"),
      matchedSet: "LingeringTunes",
    });

    expect(getEchoData(result.slot.echo!).name).toBe("Thousand-Puppet Pavilion");
    expect(result.slot.cost).toBe(4);
    expect(result.level).toBe(25);
    expect(result.needsMainStatSelection).toBe(false);
    expect(result.slot.mainStatLabel).toBe("Healing Bonus");
    expect(result.slot.substats).toEqual([
      { subStat: "DEF", subStatValue: "40" },
      { subStat: "HP", subStatValue: "8.6%" },
      { subStat: "Crit. DMG", subStatValue: "16.2%" },
      { subStat: "Energy Regen", subStatValue: "11.6%" },
      { subStat: "Resonance Skill DMG Bonus", subStatValue: "10.9%" },
    ]);
  });

  it("parses a cost-1 echo with both a flat and percent ATK substat", () => {
    const result = parseEchoCandidate({
      headerText: "Kernel Puppet: Reflection\n+25\nCOST 1",
      statsText: [
        "ATK 18.0%",
        "HP 2280",
        "Crit. Rate 6.9%",
        "HP 7.9%",
        "Crit. DMG 19.8%",
        "ATK 7.9%",
        "ATK 50",
      ].join("\n"),
      matchedSet: null,
    });

    expect(getEchoData(result.slot.echo!).name).toBe("Kernel Puppet: Reflection");
    expect(result.slot.cost).toBe(1);
    expect(result.slot.mainStatLabel).toBe("ATK");
    expect(result.slot.substats).toEqual([
      { subStat: "Crit. Rate", subStatValue: "6.9%" },
      { subStat: "HP", subStatValue: "7.9%" },
      { subStat: "Crit. DMG", subStatValue: "19.8%" },
      { subStat: "ATK", subStatValue: "7.9%" },
      { subStat: "ATK", subStatValue: "50" },
    ]);
    // set icon wasn't matched in this transcript — should be flagged, not guessed.
    expect(result.confidence.set).toBe("low");
  });

  it("parses a below-max echo that only reveals 3 of 5 substats, without inventing the other two", () => {
    const result = parseEchoCandidate({
      headerText: "Viridblaze Saurian\n+15\nCOST 3",
      statsText: ["Electro DMG Bonus 20.4%", "ATK 68", "HP 470", "ATK 40", "ATK 9.4%"].join("\n"),
      matchedSet: null,
    });

    expect(result.level).toBe(15);
    expect(result.slot.cost).toBe(3);
    expect(result.slot.substats).toHaveLength(3);
    expect(result.slot.substats).toEqual([
      { subStat: "HP", subStatValue: "470" },
      { subStat: "ATK", subStatValue: "40" },
      { subStat: "ATK", subStatValue: "9.4%" },
    ]);
  });

  it("flags needsMainStatSelection for a freshly-acquired echo with no main stat yet", () => {
    const result = parseEchoCandidate({
      headerText: "Some Echo\n+0\nCOST 4",
      statsText: "",
      matchedSet: null,
    });
    expect(result.needsMainStatSelection).toBe(true);
  });

  it("snaps an off-roll-table OCR value to the nearest legal substat roll", () => {
    // 6.8% isn't a legal CritRate roll (table: 6.3, 6.9, 7.5, ...) — a
    // plausible single-digit OCR miss reading 6.9 as 6.8.
    const result = parseEchoCandidate({
      headerText: "Thousand-Puppet Pavilion\n+25\nCOST 4",
      statsText: ["Healing Bonus 26.4%", "ATK 150", "Crit. Rate 6.8%"].join("\n"),
      matchedSet: null,
    });
    expect(result.slot.substats[0]).toEqual({ subStat: "Crit. Rate", subStatValue: "6.9%" });
  });
});
