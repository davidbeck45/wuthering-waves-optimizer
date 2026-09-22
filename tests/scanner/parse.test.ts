import { describe, it, expect } from "vitest";
import {
  parseHeaderText,
  parseStatRow,
  matchEchoName,
  normalizeStatLabel,
  parseEchoCandidate,
} from "../../src/scanner/parse";
import { getEchoData } from "../../src/echoes/index";

// Ground-truth transcripts read directly off real 2880x1800 screenshots the
// user provided (~/Downloads/ScreenshotsEchoes), typed out as tesseract
// would plausibly return them per individually-cropped row (one OCR call
// per row, mirroring CalculatorEchoParser.vue's Discord-bot-image approach
// — see layout.ts/parse.ts's doc comments for why). Real set memberships
// below were checked against src/echoes/index.ts, not invented:
//  - Thousand-Puppet Pavilion: cost 4 (Calamity), sets: [SongofFeatheredTrace]
//    — the only cost-4 echo in that set, so set+cost alone narrows to it.
//  - Kernel Puppet: Reflection: cost 1 (Common), sets: [HeartofEvilsPurge]
//    — one of ~4 cost-1 echoes sharing that set, so name text still has to
//    break the tie among that (much smaller) pool.
//  - Viridblaze Saurian: cost 3 (Elite), sets: [MoonlitClouds, MoltenRift]

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

describe("parseStatRow", () => {
  it("parses a single-line label+value crop", () => {
    expect(parseStatRow("Healing Bonus 26.4%")).toEqual({
      rawLabel: "Healing Bonus",
      rawValue: "26.4%",
    });
  });

  it("rejoins a label that wrapped onto a second line within the same row's (taller) crop", () => {
    expect(parseStatRow("Resonance Skill DMG\nBonus 10.9%")).toEqual({
      rawLabel: "Resonance Skill DMG Bonus",
      rawValue: "10.9%",
    });
  });

  it("stops at the first complete match and ignores a neighboring row that leaked into the overlap", () => {
    // SUBSTAT_ROWS crops are deliberately taller than one line to catch a
    // wrap — for a single-line row, that overlap can catch the *next*
    // row's text too. Only the first row belongs to this crop's own slot.
    expect(parseStatRow("ATK 150\nDEF 40")).toEqual({ rawLabel: "ATK", rawValue: "150" });
  });

  it("distinguishes a flat ATK row from a percent ATK row", () => {
    expect(parseStatRow("ATK 7.9%")).toEqual({ rawLabel: "ATK", rawValue: "7.9%" });
    expect(parseStatRow("ATK 50")).toEqual({ rawLabel: "ATK", rawValue: "50" });
  });

  it("returns null for a blank or unparseable crop (an absent row on a below-+25 echo)", () => {
    expect(parseStatRow("")).toBeNull();
    expect(parseStatRow("   \n  ")).toBeNull();
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

  it("matches an accented echo name when OCR reads the accent as a plain letter (regression: 'Jué' scanned as 'Unknown echo')", () => {
    // Jué is a real 4-cost echo (src/echoes/index.ts). Stripping accents
    // outright instead of transliterating them shrank the stored name's
    // normalized form to 2 chars while a plain-ASCII OCR read normalized to
    // 3, pushing similarity below threshold for a match that should have
    // been exact.
    const match = matchEchoName("Jue", 4);
    expect(match?.similarity).toBe(1);
    expect(getEchoData(match!.key).name).toBe("Jué");
  });

  it("still matches the accented spelling itself", () => {
    const match = matchEchoName("Jué", 4);
    expect(match?.similarity).toBe(1);
    expect(getEchoData(match!.key).name).toBe("Jué");
  });
});

describe("parseEchoCandidate (full real-footage transcripts, per individually-cropped row)", () => {
  it("parses a maxed cost-4 echo with all 5 substats", () => {
    const result = parseEchoCandidate({
      headerText: "Thousand-Puppet Pavilion\n+25\nCOST 4",
      mainStatText: "Healing Bonus 26.4%",
      secondaryStatText: "ATK 150",
      substatTexts: [
        "DEF 40",
        "HP 8.6%",
        "Crit. DMG 16.2%",
        "Energy Regen 11.6%",
        "Resonance Skill DMG\nBonus 10.9%",
      ],
      matchedSet: "SongofFeatheredTrace",
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

  it("resolves the echo from set+cost alone (single-candidate pool), even with no usable name text", () => {
    // SongofFeatheredTrace has exactly one cost-4 echo — Thousand-Puppet
    // Pavilion — so this should resolve confidently without ever needing
    // to read the name, mirroring CalculatorEchoParser.vue's filteredEchoKeys
    // narrowing (which the same way often gets down to one candidate).
    const result = parseEchoCandidate({
      headerText: "\n+25\nCOST 4", // name line missing/unreadable
      mainStatText: "Healing Bonus 26.4%",
      secondaryStatText: "ATK 150",
      substatTexts: ["", "", "", "", ""],
      matchedSet: "SongofFeatheredTrace",
    });
    expect(getEchoData(result.slot.echo!).name).toBe("Thousand-Puppet Pavilion");
    expect(result.confidence.name).toBe("high");
  });

  it("flags low confidence (but still takes the single-candidate guess) when the name text actively disagrees with a confident set+cost narrowing", () => {
    // A single-candidate pool is trusted unless the name OCR clearly read
    // something else entirely — that's a sign the set icon itself was
    // probably misread, not that the name should override a bad set match
    // silently.
    const result = parseEchoCandidate({
      headerText: "Completely Different Name\n+25\nCOST 4",
      mainStatText: "Healing Bonus 26.4%",
      secondaryStatText: "ATK 150",
      substatTexts: ["", "", "", "", ""],
      matchedSet: "SongofFeatheredTrace",
    });
    expect(getEchoData(result.slot.echo!).name).toBe("Thousand-Puppet Pavilion");
    expect(result.confidence.name).toBe("low");
  });

  it("narrows by set+cost to a small pool, then breaks the tie by name (multi-candidate case)", () => {
    // HeartofEvilsPurge has several cost-1 echoes — set+cost alone isn't
    // enough here, so name matching (against just that narrowed pool) has
    // to pick the right one.
    const result = parseEchoCandidate({
      headerText: "Kernel Puppet: Reflection\n+25\nCOST 1",
      mainStatText: "ATK 18.0%",
      secondaryStatText: "HP 2280",
      substatTexts: ["Crit. Rate 6.9%", "HP 7.9%", "Crit. DMG 19.8%", "ATK 7.9%", "ATK 50"],
      matchedSet: "HeartofEvilsPurge",
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
  });

  it("falls back to name-only matching against the full cost tier when the set read matches nothing at that cost", () => {
    // A wrong/misread set combined with the real cost narrows to an empty
    // pool — the set was probably misread, so fall back to matching by
    // name (still narrowed by cost) instead of giving up.
    const result = parseEchoCandidate({
      headerText: "Kernel Puppet: Reflection\n+25\nCOST 1",
      mainStatText: "ATK 18.0%",
      secondaryStatText: "HP 2280",
      substatTexts: ["Crit. Rate 6.9%", "HP 7.9%", "Crit. DMG 19.8%", "ATK 7.9%", "ATK 50"],
      matchedSet: "ShadowofShatteredDreams", // cost-4-only set — no cost-1 echoes exist in it
    });
    expect(getEchoData(result.slot.echo!).name).toBe("Kernel Puppet: Reflection");
  });

  it("infers cost from the fixed secondary row's flat value when the small COST text fails to OCR", () => {
    // flatBonusesByRankByType[4][5] === 150 — unique to cost 4 at rank 5.
    const result = parseEchoCandidate({
      headerText: "Thousand-Puppet Pavilion\n+25", // no COST line at all
      mainStatText: "Healing Bonus 26.4%",
      secondaryStatText: "ATK 150",
      substatTexts: ["", "", "", "", ""],
      matchedSet: "SongofFeatheredTrace",
    });
    expect(result.slot.cost).toBe(4);
    // Inferred, not read directly — still worth a second look.
    expect(result.confidence.cost).toBe("low");
  });

  it("parses a below-max echo that only reveals 3 of 5 substats, without inventing the other two", () => {
    const result = parseEchoCandidate({
      headerText: "Viridblaze Saurian\n+15\nCOST 3",
      mainStatText: "Electro DMG Bonus 20.4%",
      secondaryStatText: "ATK 68",
      substatTexts: ["HP 470", "ATK 40", "ATK 9.4%", "", ""],
      matchedSet: "MoonlitClouds",
    });

    expect(getEchoData(result.slot.echo!).name).toBe("Viridblaze Saurian");
    expect(result.level).toBe(15);
    expect(result.slot.cost).toBe(3);
    expect(result.slot.substats).toEqual([
      { subStat: "HP", subStatValue: "470" },
      { subStat: "ATK", subStatValue: "40" },
      { subStat: "ATK", subStatValue: "9.4%" },
      { subStat: "", subStatValue: "" },
      { subStat: "", subStatValue: "" },
    ]);
    // Absent trailing rows aren't a problem to flag — they're legitimately empty.
    expect(result.confidence.substats.slice(3)).toEqual(["high", "high"]);
  });

  it("flags needsMainStatSelection for a freshly-acquired echo with no main stat yet", () => {
    const result = parseEchoCandidate({
      headerText: "Some Echo\n+0\nCOST 4",
      mainStatText: "",
      secondaryStatText: "",
      substatTexts: ["", "", "", "", ""],
      matchedSet: null,
    });
    expect(result.needsMainStatSelection).toBe(true);
  });

  it("does not flag a legal roll as low-confidence just because OCR added a trailing .0 (regression: 'Crit. DMG 21%' reported as questionable)", () => {
    // subStatsTable.CritDMG's top roll is exactly 21 — OCR reading "21.0%"
    // reformats to "21%" (same number, different string), which a
    // string-equality confidence check flagged as "changed" even though
    // the value was always exactly correct.
    const result = parseEchoCandidate({
      headerText: "Thousand-Puppet Pavilion\n+25\nCOST 4",
      mainStatText: "Healing Bonus 26.4%",
      secondaryStatText: "ATK 150",
      substatTexts: ["Crit. DMG 21.0%", "", "", "", ""],
      matchedSet: "SongofFeatheredTrace",
    });
    expect(result.slot.substats[0]).toEqual({ subStat: "Crit. DMG", subStatValue: "21%" });
    expect(result.confidence.substats[0]).toBe("high");
  });

  it("snaps an off-roll-table OCR value to the nearest legal substat roll", () => {
    // 6.8% isn't a legal CritRate roll (table: 6.3, 6.9, 7.5, ...) — a
    // plausible single-digit OCR miss reading 6.9 as 6.8.
    const result = parseEchoCandidate({
      headerText: "Thousand-Puppet Pavilion\n+25\nCOST 4",
      mainStatText: "Healing Bonus 26.4%",
      secondaryStatText: "ATK 150",
      substatTexts: ["Crit. Rate 6.8%", "", "", "", ""],
      matchedSet: "SongofFeatheredTrace",
    });
    expect(result.slot.substats[0]).toEqual({ subStat: "Crit. Rate", subStatValue: "6.9%" });
    // Unlike the .0-formatting case above, this one really was off — flag it.
    expect(result.confidence.substats[0]).toBe("low");
  });
});
