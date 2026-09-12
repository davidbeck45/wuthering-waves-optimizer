// Wuthering Tools+: the phone-screenshot echo parser, replayed over the OCR
// transcripts of 40 real Galaxy S26 Ultra screenshots (the Python pipeline
// that produced them was validated by hand, 40/40).
import { describe, expect, it } from "vitest";
import samples from "./__fixtures__/s26UltraOcrSamples.json";
import { echoSetLabelMap } from "../../echoes/stats";
import {
  bestEcho,
  bestSet,
  buildRecord,
  parsePanelText,
  parseStatRow,
  resolveLayout,
  toParsedEcho,
} from "./phoneEchoScan";

describe("phone echo scan: layouts", () => {
  it("resolves the S26 Ultra layout exactly and scales same-aspect phones", () => {
    const exact = resolveLayout(3120, 1440);
    expect(exact?.exact).toBe(true);
    expect(exact?.regions.panel).toEqual({ x: 2215, y: 150, width: 905, height: 1000 });
    const scaled = resolveLayout(2400, 1108);
    expect(scaled?.exact).toBe(false);
    expect(scaled?.regions.panel.x).toBe(Math.round(2215 * (2400 / 3120)));
    expect(resolveLayout(1920, 1080)).toBeNull();
  });
});

describe("phone echo scan: panel text", () => {
  it("parses stat rows and rejects non-stat lines", () => {
    expect(parseStatRow("%% Crit. DMG 44.0%")).toEqual(["CritDMG", "44.0%"]);
    expect(parseStatRow("N ATK 150")).toEqual(["ATK_FLAT", "150"]);
    expect(parseStatRow("Y HP 10.9%")).toEqual(["HP", "10.9%"]);
    expect(parseStatRow("¥ Heavy Attack DMG Bonus 8.6%")).toEqual(["HeavyAttackDMGBonus", "8.6%"]);
    expect(parseStatRow("Resonance Liberation 9.4%")).toEqual(["ResonanceLiberationDMGBonus", "9.4%"]);
    expect(parseStatRow("ATK 151")).toBeNull();
    expect(parseStatRow("Something Crit. Rate 8.1%")).toBeNull();
    expect(parseStatRow("COST 4")).toBeNull();
  });

  it("reads cost, level and stops at Echo Skill", () => {
    const parsed = parsePanelText(["Thousand-Puppet Pavilion", "+25", "COST 4", "Crit. DMG 44.0%", "ATK 150", "Crit. Rate 8.1%", "Echo Skill", "HP 10.9%"]);
    expect(parsed).toEqual({ cost: 4, level: 25, rows: [["CritDMG", "44.0%"], ["ATK_FLAT", "150"], ["CritRate", "8.1%"]] });
  });
});

describe("phone echo scan: registry matching", () => {
  it("matches noisy names and chip labels", () => {
    expect(bestEcho("Thousand-Puppetiy'g )")?.echo.key).toBe("ThousandPuppetPavilion");
    expect(bestEcho("zzzz")).toBeNull();
    expect(bestSet("l Song of Feathered Trace")?.set).toBe("SongofFeatheredTrace");
    expect(bestSet("Sort by Level")).toBeNull();
  });
});

describe("phone echo scan: the 40 recorded S26 Ultra screenshots", () => {
  const labelToSet = new Map(Object.entries(echoSetLabelMap).map(([key, label]) => [label, key]));

  it("reproduces the validated records", () => {
    let clean = 0;
    for (const sample of samples) {
      const record = buildRecord(sample.file, { name: sample.ocr.name, panel: sample.ocr.panel, chip: sample.ocr.chip });
      const wantSet = sample.expected.set ? labelToSet.get(sample.expected.set) : null;
      expect(record.echoName, sample.file).toBe(sample.expected.echo);
      expect(record.set, sample.file).toBe(wantSet);
      expect(record.cost, sample.file).toBe(sample.expected.cost);
      expect(record.main?.[0], sample.file).toBe(sample.expected.main);
      if (sample.expected.flags.some((f) => f.includes("2nd OCR pass"))) {
        // the fixture only carries the first OCR pass; the row the second pass added is missing here
        expect(sample.expected.subs.slice(0, record.subs.length), sample.file).toEqual(record.subs);
        expect(record.flags.join(" | "), sample.file).toMatch(/only \d substats read/);
        continue;
      }
      expect(record.subs, sample.file).toEqual(sample.expected.subs);
      if (!sample.expected.flags.length) {
        // the Python run also had a second panel pass that could supply COST; the fixture carries only the first
        const flags = record.flags.filter((f) => f !== "COST not read, using the registry");
        expect(flags, `${sample.file}: ${flags.join("; ")}`).toEqual([]);
        clean += 1;
      } else {
        expect(record.flags.length, sample.file).toBeGreaterThan(0);
      }
    }
    expect(clean).toBe(samples.filter((s) => !s.expected.flags.length).length);
  });

  it("emits the importer's shape with verbose labels", () => {
    const sample = samples[0];
    const parsed = toParsedEcho(buildRecord(sample.file, { name: sample.ocr.name, panel: sample.ocr.panel, chip: sample.ocr.chip }));
    expect(parsed.echo).toBe("ThousandPuppetPavilion");
    expect(parsed.set).toBe("SongofFeatheredTrace");
    expect(parsed.cost).toBe(4);
    expect(parsed.mainStatLabel).toBe("Crit. DMG");
    expect(parsed.substats[0]).toEqual({ subStat: "Crit. DMG", subStatValue: "19.8%" });
    expect(parsed.substats.map((s) => s.subStat)).toContain("Heavy Attack DMG Bonus");
  });

  it("flags illegal values instead of accepting them", () => {
    const record = buildRecord("x.jpg", {
      name: "Thousand-Puppet Pavilion",
      panel: ["+25", "COST 4", "Crit. DMG 40.0%", "ATK 150", "Crit. Rate 8.2%", "HP 10.9%", "ATK 8.6%", "DEF 8.1%"],
      chip: "Song of Feathered Trace",
    });
    expect(record.flags.join(" | ")).toMatch(/main CritDMG 40.0% != \+25 value 44/);
    expect(record.flags.join(" | ")).toMatch(/CritRate 8.2% is not a legal roll/);
    expect(record.flags.join(" | ")).toMatch(/only 4 substats/);
  });
});
