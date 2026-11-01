// Wuthering Tools+: the phone-screenshot echo scanner, replayed over the word
// boxes and row re-reads recorded from 75 real Galaxy S26 Ultra screenshots
// (the Python twin of this walk, wuwa-tools/echo-import/extract.py, reads the
// 198-shot "Wuwa Echos" album 198/198 against hand-verified records).
import { describe, expect, it } from "vitest";
import samples from "./__fixtures__/s26UltraScanSamples.json";
import { echoSetLabelMap } from "../../echoes/stats";
import {
  PHONE_LAYOUTS,
  bestEcho,
  bestSet,
  clusterRows,
  echoEntry,
  isTerminator,
  labelKey,
  legalValues,
  parseCost,
  pickLegal,
  readRegion,
  resolveLayout,
  scanEcho,
  toParsedEcho,
  valueCandidates,
  type BoxReader,
  type ScanInput,
  type Word,
} from "./phoneEchoScan";
import type { GlyphMatch } from "./setGlyph";

const TABLE = PHONE_LAYOUTS[0].table;
interface Sample {
  file: string;
  name: string;
  chip: string;
  costText: string;
  levelText: string;
  words: Word[];
  /** "r<row>.<label|value>.<variant key>" -> the text tesseract returned for that re-read */
  reads: Record<string, string>;
  expected: { echo: string; set: string | null; cost: number; main: string; mainValue: string; subs: Array<[string, string]>; flags: string[]; synthRows: number[] };
}
const SAMPLES = samples as unknown as Sample[];
const inputOf = (sample: Sample): ScanInput => ({ words: sample.words, name: sample.name, chip: sample.chip, costText: sample.costText, levelText: sample.levelText });
/** answers a re-read from what the Python walk recorded for the same row / kind / variant */
const readerFor =
  (sample: Sample): BoxReader =>
  async ({ kind, row, variant }) =>
    sample.reads[`r${row}.${kind}.${variant.key}`] ?? "";
const word = (x: number, y: number, text: string, width = 60, height = 28, conf = 90): Word => ({ x, y, width, height, conf, text });

describe("phone echo scan: layouts", () => {
  it("resolves the S26 Ultra layout exactly and scales same-aspect phones", () => {
    const exact = resolveLayout(3120, 1440);
    expect(exact?.exact).toBe(true);
    expect(exact?.regions.panel).toEqual({ x: 2215, y: 150, width: 905, height: 1000 });
    expect(exact?.table.firstRowCy).toBe(482);
    const scaled = resolveLayout(2400, 1108);
    expect(scaled?.exact).toBe(false);
    expect(scaled?.regions.panel.x).toBe(Math.round(2215 * (2400 / 3120)));
    expect(scaled?.table.pitch).toBeCloseTo(60 * (2400 / 3120));
    expect(resolveLayout(1920, 1080)).toBeNull();
  });

  it("maps a re-read request to the value or label column of its row", () => {
    const panel = PHONE_LAYOUTS[0].regions.panel;
    const value = readRegion(panel, TABLE, { kind: "value", row: 2, band: [580, 630], variant: { key: "g200/psm7", scale: 2, mode: "plain" } });
    expect(value).toEqual({ x: 2815, y: 730, width: 170, height: 50 });
    const label = readRegion(panel, TABLE, { kind: "label", row: 2, band: [580, 630], variant: { key: "g200", scale: 2, mode: "plain" } });
    expect(label).toEqual({ x: 2295, y: 730, width: 520, height: 50 });
  });
});

describe("phone echo scan: labels, values, rows", () => {
  it("matches labels whitespace- and punctuation-insensitively, after icon junk", () => {
    expect(labelKey("W ATK")).toBe("ATK");
    expect(labelKey("EnergyRegen")).toBe("EnergyRegen");
    expect(labelKey("Energy Regen.")).toBe("EnergyRegen");
    expect(labelKey("¥ Heavy AttackDMGBonus .")).toBe("HeavyAttackDMGBonus");
    expect(labelKey("Resonance Liberation")).toBe("ResonanceLiberationDMGBonus");
    expect(labelKey("* DMG Bonus")).toBeNull();
    expect(labelKey("Echo Skill")).toBeNull();
    expect(isTerminator("ho Skill")).toBe(true);
    expect(isTerminator("Resonance Skill DMG")).toBe(false);
  });

  it("reads values as legal rolls only, repairing a dropped decimal point", () => {
    expect(valueCandidates("108%")).toEqual([
      { num: 108, pct: true },
      { num: 10.8, pct: true },
    ]);
    expect(pickLegal("8.6%", legalValues("BasicAttackDMGBonus", "sub", 3))).toEqual(["BasicAttackDMGBonus", "8.6%"]);
    expect(pickLegal("LX)", legalValues("BasicAttackDMGBonus", "sub", 3))).toBeNull();
    expect(pickLegal("108%", legalValues("EnergyRegen", "sub", 1))).toEqual(["EnergyRegen", "10.8%"]);
    expect(pickLegal("50", legalValues("ATK", "sub", 1))).toEqual(["ATK_FLAT", "50"]);
    expect(pickLegal("9.4%", legalValues("HP", "sub", 1))).toEqual(["HP", "9.4%"]);
    expect(pickLegal("2280", legalValues("HP", "secondary", 1))).toEqual(["HP_FLAT", "2280"]);
    expect(pickLegal("30.0%", legalValues("ATK", "main", 3))).toEqual(["ATK", "30.0%"]);
    expect(pickLegal("26.4%", legalValues("HealingBonus", "main", 4))).toEqual(["HealingBonus", "26.4%"]);
    expect(pickLegal("8.2%", legalValues("CritRate", "sub", 4))).toBeNull();
    expect(parseCost("COSI 3")).toBe(3);
    expect(parseCost("COST 1")).toBe(1);
  });

  it("clusters words into rows with the label on the left and the value column on the right", () => {
    const rows = clusterRows(
      [word(640, 468, "30.0%"), word(35, 466, "W", 30), word(88, 468, "ATK"), word(88, 528, "ATK"), word(660, 528, "100"), word(88, 588, "Crit."), word(150, 588, "Rate"), word(640, 590, "9.3%")],
      TABLE,
    );
    expect(rows.map((r) => [r.label, r.value, Math.round(r.cy)])).toEqual([
      ["ATK", "30.0%", 481],
      ["ATK", "100", 542],
      ["Crit. Rate", "9.3%", 603],
    ]);
  });
});

describe("phone echo scan: registry matching", () => {
  it("matches noisy names, skins and chip labels", () => {
    expect(bestEcho("Thousand-Puppetiy'g )")?.echo.key).toBe("ThousandPuppetPavilion");
    expect(bestEcho("Phantom: Impermanenc,g’tl_eron")?.echo.name).toBe("Impermanence Heron");
    expect(bestEcho(["Phantom: Dreamig 4/", "Phantom: Dreamlesdg\\e—t { //"], 4)?.echo.name).toBe("Dreamless");
    expect(bestEcho(["Phantom: Nightmare( A yvyéss", "Phantom: Nightmare Cpohaléss"], 4)?.echo.name).toBe("Nightmare: Crownless");
    expect(bestEcho("zzzz")).toBeNull();
    expect(bestSet("l Song of Feathered Trace")?.set).toBe("SongofFeatheredTrace");
    expect(bestSet("Sort by Level")).toBeNull();
  });
});

describe("phone echo scan: 75 recorded S26 Ultra screenshots", () => {
  const labelToSet = new Map(Object.entries(echoSetLabelMap).map(([key, label]) => [label, key]));

  it("reproduces the verified records, synthesizing the rows the block pass dropped", async () => {
    let synthesized = 0;
    for (const sample of SAMPLES) {
      const record = await scanEcho(sample.file, inputOf(sample), readerFor(sample), TABLE);
      expect(record.echoName, sample.file).toBe(sample.expected.echo);
      expect(record.set, sample.file).toBe(sample.expected.set ? labelToSet.get(sample.expected.set) : null);
      expect(record.cost, sample.file).toBe(sample.expected.cost);
      expect(record.main?.[0], sample.file).toBe(sample.expected.main);
      expect(record.main?.[1], sample.file).toBe(sample.expected.mainValue);
      expect(record.subs, sample.file).toEqual(sample.expected.subs);
      const synth = record.rows.filter((r) => r.source === "synth").map((r) => r.i);
      expect(synth, sample.file).toEqual(sample.expected.synthRows);
      synthesized += synth.length;
      if (!sample.expected.flags.length) expect(record.flags, `${sample.file}: ${record.flags.join("; ")}`).toEqual([]);
      else expect(record.flags.length, sample.file).toBeGreaterThan(0);
    }
    expect(synthesized).toBeGreaterThan(0);
  });

  it("emits the importer's shape with verbose labels", async () => {
    const sample = SAMPLES[0];
    const parsed = toParsedEcho(await scanEcho(sample.file, inputOf(sample), readerFor(sample), TABLE));
    expect(parsed.echo).toBe("ThousandPuppetPavilion");
    expect(parsed.set).toBe("SongofFeatheredTrace");
    expect(parsed.cost).toBe(4);
    expect(parsed.mainStatLabel).toBe("Crit. DMG");
    expect(parsed.substats[0]).toEqual({ subStat: "Crit. DMG", subStatValue: "19.8%" });
    expect(parsed.substats.map((s) => s.subStat)).toContain("Heavy Attack DMG Bonus");
  });

  it("flags what it cannot read instead of guessing", async () => {
    const sample = SAMPLES[0];
    const words = sample.words.map((w) => (w.text === "44.0%" ? { ...w, text: "40.0%" } : w));
    const silent: BoxReader = async () => "";
    const record = await scanEcho(sample.file, { ...inputOf(sample), words, costText: "", levelText: "+20" }, silent, TABLE);
    expect(record.flags.join(" | ")).toMatch(/row 0 CritDMG: value unreadable/);
    expect(record.flags.join(" | ")).toMatch(/main stat not read/);
    expect(record.cost).toBe(4);
    expect(record.subs.length).toBe(5);
  });
});

describe("phone echo scan: the set without a Sonata filter (the icon next to +25)", () => {
  const labelToSet = new Map(Object.entries(echoSetLabelMap).map(([key, label]) => [label, key]));
  const glyph = (set: string, confident = true, runnerUp: string | null = "RiteofGildedRevelation"): GlyphMatch => ({
    set,
    score: confident ? 0.9 : 0.6,
    runnerUp,
    runnerUpScore: runnerUp ? 0.5 : null,
    margin: 0.4,
    ring: 0.02,
    confident,
    ranked: [[set, 0.9]],
  });
  // the first recorded shot: Thousand-Puppet Pavilion, Song of Feathered Trace (its sets: Song of Feathered Trace, Flower of Tinged Yearning)
  const sample = SAMPLES[0];
  const noChip = (s: Sample): ScanInput => ({ ...inputOf(s), chip: "" });

  it("replays all 75 recorded shots with the chip blanked: the icon gives the set, nothing else changes", async () => {
    let fromIcon = 0;
    for (const s of SAMPLES) {
      const expectedSet = s.expected.set ? (labelToSet.get(s.expected.set) ?? null) : null;
      const record = await scanEcho(s.file, noChip(s), readerFor(s), TABLE, { glyph: expectedSet ? glyph(expectedSet) : null });
      expect(record.set, s.file).toBe(expectedSet);
      expect(record.subs, s.file).toEqual(s.expected.subs);
      if (record.setSource === "icon") fromIcon += 1;
      if (!s.expected.flags.length) expect(record.flags, `${s.file}: ${record.flags.join("; ")}`).toEqual([]);
    }
    expect(fromIcon).toBeGreaterThan(50);
  });

  it("takes a sure icon without a note, and an unsure one with a note to check it", async () => {
    const sure = await scanEcho(sample.file, noChip(sample), readerFor(sample), TABLE, { glyph: glyph("SongofFeatheredTrace") });
    expect(sure).toMatchObject({ set: "SongofFeatheredTrace", setSource: "icon" });
    expect(sure.flags).toEqual([]);
    const unsure = await scanEcho(sample.file, noChip(sample), readerFor(sample), TABLE, { glyph: glyph("FlowerofTingedYearning", false, "SongofFeatheredTrace") });
    expect(unsure).toMatchObject({ set: "FlowerofTingedYearning", setSource: "icon" });
    expect(unsure.flags).toEqual(["Set read from the icon next to +25, but not sure: Flower of Tinged Yearning (next best: Song of Feathered Trace). Check the set."]);
  });

  it("keeps the chip's set and flags a sure icon that disagrees with it", async () => {
    const agree = await scanEcho(sample.file, inputOf(sample), readerFor(sample), TABLE, { glyph: glyph("SongofFeatheredTrace") });
    expect(agree).toMatchObject({ set: "SongofFeatheredTrace", setSource: "chip", flags: [] });
    const disagree = await scanEcho(sample.file, inputOf(sample), readerFor(sample), TABLE, { glyph: glyph("FlowerofTingedYearning") });
    expect(disagree).toMatchObject({ set: "SongofFeatheredTrace", setSource: "chip" });
    expect(disagree.flags).toEqual(["The Sonata filter says Song of Feathered Trace, but the set icon next to +25 looks like Flower of Tinged Yearning. Check the set."]);
    // an unsure icon never argues with the chip
    const unsure = await scanEcho(sample.file, inputOf(sample), readerFor(sample), TABLE, { glyph: glyph("FlowerofTingedYearning", false) });
    expect(unsure.flags).toEqual([]);
  });

  it("ignores an icon match the echo can't roll, and says the set is unknown", async () => {
    const record = await scanEcho(sample.file, noChip(sample), readerFor(sample), TABLE, { glyph: glyph("HavocEclipse") });
    expect(record.set).toBeNull();
    expect(record.setSource).toBeNull();
    expect(record.flags.join(" | ")).toMatch(/set unknown \(no Sonata filter and no readable set icon; allowed Song of Feathered Trace, Flower of Tinged Yearning\)/);
    const none = await scanEcho(sample.file, noChip(sample), readerFor(sample), TABLE);
    expect(none.set).toBeNull();
  });

  it("uses an echo's only set without the icon", async () => {
    const single = SAMPLES.find((s) => {
      const key = bestEcho(s.expected.echo)?.echo.key;
      return key && (echoEntry(key)?.sets.length ?? 0) === 1;
    });
    expect(single).toBeDefined();
    const record = await scanEcho(single!.file, noChip(single!), readerFor(single!), TABLE);
    expect(record.setSource).toBe("only set");
    expect(record.set).toBe(labelToSet.get(single!.expected.set ?? ""));
  });
});
