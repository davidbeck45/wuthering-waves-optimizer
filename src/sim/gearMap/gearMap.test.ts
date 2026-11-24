// Wuthering Tools+ — the Gear map's model on the public Echo Lab fixture: real verdicts and quick roll ratings, the
// same inputs the inventory's chips read. The agreement test fails the day a cell says something its echo's
// inventory chip or Echo Lab's "How good is this roll" would not.
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "../echoLab/__fixtures__/echoLabAccount.json";
import { bestOwners, type BestOwnerResult, type EchoVerdict, type LabCharacterSummary } from "../echoLab/bestOwner";
import { createLabSession, type LabAccount } from "../echoLab/core";
import { qualityTarget, ratingOf } from "../echoLab/echoLabView";
import { rollRatings, type RollRating } from "../echoLab/rollRatings";
import { chipFor, rollTone, type ChipRating } from "../inventoryQuality/inventoryQuality";
import { GEAR_BANDS, cellLabel, gearProgress, gearRows, gearSummary, sortGearRows, summaryLine, type GearInput, type GearRow } from "./gearMap";

const account = fixture as unknown as LabAccount;
const quiet = { yieldMs: 0 };

let result: BestOwnerResult;
let verdicts: Map<string, EchoVerdict>;
let labCharacters: Map<string, LabCharacterSummary>;
let targets: Map<string, { characterId: string; slot: number }>;
let ratings: Map<string, RollRating>;

beforeAll(async () => {
  const session = createLabSession(account);
  result = await bestOwners(session, {}, quiet);
  verdicts = new Map(result.echoes.map((r) => [r.echoId, r]));
  labCharacters = new Map(result.characters.map((c) => [c.id, c]));
  targets = new Map();
  for (const r of result.echoes) {
    const t = r.lines ? qualityTarget(r, result.characters) : null;
    if (t) targets.set(r.echoId, t);
  }
  ratings = new Map((await rollRatings(session, [...targets].map(([echoId, t]) => ({ echoId, ...t })), {}, quiet)).ratings.map((r) => [r.echoId, r]));
}, 120_000);

const chipRating = (id: string): ChipRating | null | undefined => {
  if (!targets.has(id)) return null;
  const r = ratings.get(id);
  return r ? { percentile: r.percentile, lines: r.lines, level: r.level, characterId: r.characterId, slot: r.slot, worn: r.worn, exact: false } : undefined;
};

const input = (over: Partial<GearInput> = {}): GearInput => ({
  characters: [...labCharacters.values()].map((c) => ({ id: c.id, name: c.name })),
  verdicts,
  labCharacters,
  judged: true,
  stale: false,
  targets,
  ratingFor: chipRating,
  ...over,
});

describe("Gear map rows", () => {
  it("one row per character, five cells in slot order, the echoes the character wears", () => {
    const rows = gearRows(input());
    expect(rows.length).toBe(labCharacters.size);
    for (const r of rows) {
      expect(r.cells.map((c) => c.slot)).toEqual([0, 1, 2, 3, 4]);
      const lab = labCharacters.get(r.id)!;
      r.cells.forEach((c, i) => {
        if (lab.slots[i]?.echoId) expect(c.echoId).toBe(lab.slots[i]!.echoId);
      });
    }
  });

  it("every cell says what the inventory chip says for that echo, and uses Echo Lab's band words (agreement)", () => {
    let compared = 0;
    for (const r of gearRows(input())) {
      for (const c of r.cells) {
        if (!c.echoId || !verdicts.has(c.echoId)) continue;
        // exactly the inputs InventoryQualityChip.vue hands chipFor
        const inventory = chipFor({ row: verdicts.get(c.echoId), judged: true, stale: false, rating: chipRating(c.echoId), rateable: targets.has(c.echoId) });
        expect(c.chip).toEqual(inventory);
        if (inventory.roll) {
          const p = ratings.get(c.echoId)!.percentile;
          expect(c.step).toBe(rollTone(p));
          expect(c.words).toBe(ratingOf(p).band);
          expect(GEAR_BANDS.find((b) => b.step === c.step)!.words).toBe(ratingOf(p).band);
          compared += 1;
        }
      }
    }
    expect(compared).toBeGreaterThan(5);
  });

  it("a character with no echoes gets five empty cells; one the pass leaves out shows what it wears from the verdicts", () => {
    const rows = gearRows(input({ characters: [{ id: "NoOne", name: "No One" }] }));
    expect(rows[0].cells.every((c) => c.step === "empty" && c.letter === "")).toBe(true);
    expect(rows[0].worn).toBe(0);
    expect(rows[0].weakest).toBeNull();
    // drop a character from the pass: its echoes still come from who wears them now
    const [first] = labCharacters.values();
    const without = new Map(labCharacters);
    without.delete(first.id);
    const row = gearRows(input({ characters: [{ id: first.id, name: first.name }], labCharacters: without }))[0];
    const worn = first.slots.filter((s) => s?.echoId && verdicts.get(s.echoId)?.wornBy.some((w) => w.characterId === first.id && !w.stale && !w.build));
    expect(row.worn).toBe(worn.length);
  });

  it("an echo with no lines says no roll yet, never a band", () => {
    const rows = gearRows(input());
    const noLines = rows.flatMap((r) => r.cells).filter((c) => c.echoId && verdicts.get(c.echoId)?.lines === 0);
    for (const c of noLines) {
      expect(c.step).toBe("none");
      expect(c.chip.roll).toBeNull();
    }
    // a synthetic one: an equipped echo's lines taken away
    const [first] = labCharacters.values();
    const id = first.slots.find((s) => s?.echoId)!.echoId!;
    const bare = new Map(verdicts);
    bare.set(id, { ...verdicts.get(id)!, lines: 0, subs: [] });
    const t = new Map(targets);
    t.delete(id);
    const cell = gearRows(input({ verdicts: bare, targets: t, ratingFor: (e) => (e === id ? null : chipRating(e)) })).flatMap((r) => r.cells).find((c) => c.echoId === id)!;
    expect(cell.step).toBe("none");
    expect(cell.words).toMatch(/No roll yet/);
  });
});

describe("Gear map summary, sort and the half-computed guard", () => {
  it("counts the bands, names the five weakest lowest first", () => {
    const rows = gearRows(input());
    const s = gearSummary(rows);
    const cells = rows.flatMap((r) => r.cells).filter((c) => c.percentile !== null);
    expect(s.rated).toBe(cells.length);
    expect(Object.values(s.counts).reduce((a, b) => a + b, 0)).toBe(s.rated);
    expect(s.low).toBe(s.counts.poor + s.counts.below);
    const lowest = cells.map((c) => c.percentile!).sort((a, b) => a - b).slice(0, 5);
    expect(s.weakest.map((w) => w.cell.percentile)).toEqual(lowest);
    expect(summaryLine(s)).toMatch(new RegExp(`^${s.low} of your ${s.equipped} equipped echoes (is|are) in the lowest two bands`));
  });

  it("sorts roster order or weakest first (unrated rows last, ties in roster order)", () => {
    const mk = (id: string, weakest: number | null): GearRow => ({ id, name: id, cells: [], worn: 0, weakest });
    const rows = [mk("a", 0.5), mk("b", null), mk("c", 0.1), mk("d", 0.5)];
    expect(sortGearRows(rows, "roster").map((r) => r.id)).toEqual(["a", "b", "c", "d"]);
    expect(sortGearRows(rows, "weakest").map((r) => r.id)).toEqual(["c", "a", "d", "b"]);
  });

  it("is never whole while a rating is still coming, or before Echo Lab has judged", () => {
    const full = gearRows(input());
    expect(gearProgress(full, true).whole).toBe(true);
    const missing = [...ratings.keys()][0];
    const half = gearRows(input({ ratingFor: (e) => (e === missing ? undefined : chipRating(e)) }));
    const p = gearProgress(half, true);
    if (half.some((r) => r.cells.some((c) => c.echoId === missing))) {
      expect(p.whole).toBe(false);
      expect(p.rated).toBe(p.rateable - 1);
    }
    expect(gearProgress(full, false).whole).toBe(false);
    // before the pass: every chip is loading, nothing claims a band
    const loading = gearRows(input({ judged: false, verdicts: new Map(), labCharacters: new Map() }));
    expect(loading.flatMap((r) => r.cells).every((c) => c.step === "empty")).toBe(true);
  });

  it("reads a cell for a screen reader", () => {
    const rows = gearRows(input());
    const c = rows.flatMap((r) => r.cells).find((x) => x.chip.roll)!;
    expect(cellLabel("Aemeath", c)).toMatch(new RegExp(`^Aemeath, slot ${c.slot + 1}, .*${c.words}, ${c.chip.roll!.text}, Echo Lab: ${c.chip.verdictLabel}$`));
    expect(cellLabel("Aemeath", { ...c, step: "empty" })).toBe(`Aemeath, slot ${c.slot + 1}, empty`);
  });
});
