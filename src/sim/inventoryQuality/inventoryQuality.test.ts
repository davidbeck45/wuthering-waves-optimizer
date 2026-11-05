// Wuthering Tools+ — Echo Lab in Ryan's inventory: the chip's view model, the plus sort ("Best rolls first", "Feed
// first"), the "Feed candidates" filter and the bar's status line (inventoryQuality.ts), plus the one rule both the
// chips and Echo Lab's detail rate an echo on (qualityTarget) and the `?echo=` filter the chips link to. Real verdicts
// and quick ratings of the public Echo Lab fixture; no Vue, no stores.
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "../echoLab/__fixtures__/echoLabAccount.json";
import { bestOwners, type BestOwnerResult, type EchoVerdict } from "../echoLab/bestOwner";
import { createLabSession, type LabAccount } from "../echoLab/core";
import { DEFAULT_FILTERS, activeFilterCount, applyFilters, qualityTarget } from "../echoLab/echoLabView";
import { rollRatings, type RollRating } from "../echoLab/rollRatings";
import {
  INVENTORY_SORTS,
  NO_CHIP,
  applyInventoryView,
  barStatus,
  chipFor,
  feedCount,
  isInventorySort,
  rollText,
  rollTone,
  type ChipRating,
  type QualityLookup,
} from "./inventoryQuality";

const account = fixture as unknown as LabAccount;
const quiet = { yieldMs: 0 };

let result: BestOwnerResult;
let rows: Map<string, EchoVerdict>;
let ratings: Map<string, RollRating>;

beforeAll(async () => {
  const session = createLabSession(account);
  result = await bestOwners(session, {}, quiet);
  rows = new Map(result.echoes.map((r) => [r.echoId, r]));
  const items = result.echoes.flatMap((r) => {
    const t = r.lines ? qualityTarget(r, result.characters) : null;
    return t ? [{ echoId: r.echoId, ...t }] : [];
  });
  ratings = new Map((await rollRatings(session, items, {}, quiet)).ratings.map((r) => [r.echoId, r]));
}, 120_000);

const chipRating = (id: string, exact = false): ChipRating => {
  const r = ratings.get(id)!;
  return { percentile: r.percentile, lines: r.lines, level: r.level, characterId: r.characterId, slot: r.slot, worn: r.worn, exact };
};

/** the lookups the composable hands the sort: verdicts of the fixture's pass, quick ratings (missing ones unrated) */
const lookup = (skipRatings: string[] = []): QualityLookup => ({
  verdict: (id) => rows.get(id)?.verdict ?? null,
  percentile: (id) => (skipRatings.includes(id) ? null : ratings.get(id)?.percentile ?? null),
});

describe("Where an echo is rated (qualityTarget)", () => {
  it("rates an echo where a built character wears it, else on its best owner's slot, else nowhere", () => {
    expect(qualityTarget(rows.get("xtbwqikno2")!, result.characters)).toEqual({ characterId: "Cartethyia", slot: 0 });
    // worn by Augusta through a stale map entry only: rated on its best owner
    const stale = rows.get("labstale001")!;
    expect(stale.wornBy[0]).toMatchObject({ characterId: "Augusta", stale: true });
    expect(qualityTarget(stale, result.characters)).toEqual({ characterId: stale.best!.characterId, slot: stale.best!.slot });
    expect(qualityTarget(rows.get("labnoslot01")!, result.characters)).toBeNull();
    // a Map of the pass's characters gives the same answer as the list
    const byId = new Map(result.characters.map((c) => [c.id, c]));
    for (const r of result.echoes) expect(qualityTarget(r, byId)).toEqual(qualityTarget(r, result.characters));
  });

  it("filters Echo Lab's verdict list to the one echo a chip links to", () => {
    const one = applyFilters(result.echoes, { ...DEFAULT_FILTERS, echo: "qy27jq1l5x" });
    expect(one.map((r) => r.echoId)).toEqual(["qy27jq1l5x"]);
    expect(activeFilterCount({ ...DEFAULT_FILTERS, echo: "qy27jq1l5x" })).toBe(1);
    expect(applyFilters(result.echoes, DEFAULT_FILTERS)).toHaveLength(result.echoes.length);
  });
});

describe("The chip", () => {
  it("says Echo Lab is still judging before the first pass is in", () => {
    const chip = chipFor({ row: undefined, judged: false, rating: undefined, rateable: false });
    expect(chip.state).toBe("loading");
    expect(chip.aria).toMatch(/judging/);
  });

  it("shows nothing for an echo the pass did not judge", () => {
    expect(chipFor({ row: undefined, judged: true, rating: undefined, rateable: false })).toEqual(NO_CHIP);
    const incomplete = { ...rows.get("xtbwqikno2")!, main: null };
    expect(chipFor({ row: incomplete, judged: true, rating: null, rateable: false })).toEqual(NO_CHIP);
  });

  it("gives the verdict, why, and the roll in plain words, with the whole story in the hover text", () => {
    const chip = chipFor({ row: rows.get("xtbwqikno2")!, judged: true, rating: chipRating("xtbwqikno2"), rateable: true });
    expect(chip).toMatchObject({ state: "ready", verdict: "keep", verdictLabel: "Keep", reason: "Worn", rollPending: false });
    expect(chip.roll!.text).toMatch(/^Top \d+% roll$/);
    expect(chip.roll!.exact).toBe(false);
    expect(chip.title).toContain("where it sits on Cartethyia");
    expect(chip.title).toContain("(a quick estimate)");
    expect(chip.title).toContain("Tap for the details in Echo Lab.");
    expect(chip.aria).toBe(`Echo Lab: Keep, ${chip.roll!.text}, ${chip.reason}. Open in Echo Lab`);
    // Echo Lab's exact figure, once its detail ran: no "quick estimate"
    expect(chipFor({ row: rows.get("xtbwqikno2")!, judged: true, rating: chipRating("xtbwqikno2", true), rateable: true }).title).not.toContain("quick estimate");
  });

  it("names the slot an unworn echo is rated in, and the level of a partial echo", () => {
    const chip = chipFor({ row: rows.get("labtune0003")!, judged: true, rating: chipRating("labtune0003"), rateable: true });
    expect(chip.roll!.text).toMatch(/ roll at \+15$/);
    expect(chip.title).toContain("in Galbrena's slot 3");
    expect(chip.title).toContain("+15 echoes of its kind");
  });

  it("says the roll is on its way, or why there is none", () => {
    expect(chipFor({ row: rows.get("8l5japds6n")!, judged: true, rating: undefined, rateable: true })).toMatchObject({ state: "ready", roll: null, rollPending: true });
    const noSlot = chipFor({ row: rows.get("labnoslot01")!, judged: true, rating: null, rateable: false });
    expect(noSlot).toMatchObject({ verdict: "feed", roll: null, rollPending: false });
    expect(noSlot.title).toContain("No built character can slot it");
  });

  it("puts a roll still being rated in the chip's name, as it shows it, and not on a chip that shows no such words", () => {
    const pending = chipFor({ row: rows.get("xtbwqikno2")!, judged: true, rating: undefined, rateable: true });
    expect(pending.rollPending).toBe(true);
    expect(pending.aria).toBe(`Echo Lab: Keep, rating roll…, ${pending.reason}. Open in Echo Lab`);
    // a re-judged chip with no rating held over shows no "rating roll…", so its name must not say it either
    const stale = chipFor({ row: rows.get("xtbwqikno2")!, judged: false, stale: true, rating: undefined, rateable: true });
    expect(stale.rollPending).toBe(false);
    expect(stale.aria).not.toContain("rating roll");
  });

  it("says so when Echo Lab could not rate the roll, instead of saying nothing", () => {
    const chip = chipFor({ row: rows.get("xtbwqikno2")!, judged: true, rating: null, rateable: true });
    expect(chip.roll).toBeNull();
    expect(chip.rollPending).toBe(false);
    expect(chip.title).toContain("could not rate this roll");
  });

  it("keeps the last verdict, marked as updating, while Echo Lab judges again", () => {
    const chip = chipFor({ row: rows.get("labdeadwp01")!, judged: false, stale: true, rating: chipRating("labdeadwp01"), rateable: true });
    expect(chip).toMatchObject({ state: "stale", verdict: "feed", rollPending: false });
    expect(chip.title).toMatch(/^Updating:/);
    expect(chip.aria).toContain("(updating)");
    // an echo added since the last pass waits for the new one
    expect(chipFor({ row: undefined, judged: false, stale: true, rating: undefined, rateable: false }).state).toBe("loading");
  });

  it("words the roll plainly: never Top 0 %, the bottom half as Bottom, colours by Echo Lab's bands", () => {
    expect(rollText(0.999, 5)).toBe("Top 1% roll");
    expect(rollText(0.88, 5)).toBe("Top 12% roll");
    expect(rollText(0.5, 5)).toBe("Top 50% roll");
    expect(rollText(0.3, 4)).toBe("Bottom 30% roll at +20");
    expect(rollText(0.001, 5)).toBe("Bottom 1% roll");
    expect([0.95, 0.75, 0.5, 0.2, 0.05].map(rollTone)).toEqual(["great", "good", "average", "below", "poor"]);
  });
});

describe("The plus sort and the Feed candidates filter", () => {
  const list = (): Array<{ echoId: string }> => result.echoes.map((r) => ({ echoId: r.echoId }));

  it("leaves Ryan's list as it came in Inventory order", () => {
    const l = list();
    expect(applyInventoryView(l, { sort: "default", feedOnly: false }, lookup())).toEqual(l);
    expect(INVENTORY_SORTS.map((s) => s.value)).toEqual(["default", "best-rolls", "feed-first"]);
    expect(isInventorySort("best-rolls")).toBe(true);
    expect(isInventorySort("nope")).toBe(false);
  });

  it("narrows to the echoes Echo Lab says to feed, in the list's order", () => {
    const out = applyInventoryView(list(), { sort: "default", feedOnly: true }, lookup());
    const feed = result.echoes.filter((r) => r.verdict === "feed").map((r) => r.echoId);
    expect(out.map((e) => e.echoId)).toEqual(feed);
    expect(out.length).toBe(result.counts.feed);
    expect(feedCount(list(), lookup())).toBe(result.counts.feed);
  });

  it("puts the best rolls first and the unrated last, keeping the list's order on ties", () => {
    const unrated = ["xtbwqikno2"];
    const out = applyInventoryView(list(), { sort: "best-rolls", feedOnly: false }, lookup(unrated)).map((e) => e.echoId);
    expect(out).toHaveLength(result.echoes.length);
    const p = (id: string): number | null => lookup(unrated).percentile(id);
    const rated = out.filter((id) => p(id) !== null);
    for (let i = 1; i < rated.length; i++) expect(p(rated[i - 1])!).toBeGreaterThanOrEqual(p(rated[i])!);
    // every unrated echo after every rated one, in Ryan's order
    const firstUnrated = out.findIndex((id) => p(id) === null);
    expect(out.slice(firstUnrated).every((id) => p(id) === null)).toBe(true);
    const order = list().map((e) => e.echoId);
    const tail = out.slice(firstUnrated);
    expect(tail).toEqual([...tail].sort((a, b) => order.indexOf(a) - order.indexOf(b)));
    expect(tail).toContain("xtbwqikno2");
  });

  it("puts feed first, then spare, then keep, the worst roll first inside each", () => {
    const out = applyInventoryView(list(), { sort: "feed-first", feedOnly: false }, lookup()).map((e) => e.echoId);
    const rank = { feed: 0, spare: 1, keep: 2 } as const;
    const v = (id: string) => rank[rows.get(id)!.verdict];
    for (let i = 1; i < out.length; i++) expect(v(out[i - 1])).toBeLessThanOrEqual(v(out[i]));
    const feeds = out.filter((id) => rows.get(id)!.verdict === "feed" && ratings.has(id));
    for (let i = 1; i < feeds.length; i++) expect(ratings.get(feeds[i - 1])!.percentile).toBeLessThanOrEqual(ratings.get(feeds[i])!.percentile);
    // the filter and a sort together: only feed, worst first
    const both = applyInventoryView(list(), { sort: "best-rolls", feedOnly: true }, lookup()).map((e) => e.echoId);
    expect(both.every((id) => rows.get(id)!.verdict === "feed")).toBe(true);
  });

  it("does not change the list it was given", () => {
    const l = list();
    const copy = [...l];
    applyInventoryView(l, { sort: "feed-first", feedOnly: true }, lookup());
    expect(l).toEqual(copy);
  });
});

describe("The bar's status line", () => {
  const base = { echoes: 258, builds: 23, judging: false, progress: null, error: null, judged: { keep: 128, spare: 59, feed: 71 }, rateable: 247, rated: 247 };

  it("walks through judging, rating and done", () => {
    expect(barStatus({ ...base, judging: true, judged: null, progress: 0.42 })).toEqual({ kind: "judging", text: "Echo Lab is judging 258 echoes on your 23 builds… 42%" });
    expect(barStatus({ ...base, rated: 60 })).toEqual({ kind: "rating", text: "128 keep · 59 spare · 71 feed. Rating rolls: 60 of 247…" });
    // a sort by roll waits for every roll before it reorders, and says so
    expect(barStatus({ ...base, rated: 60, rollSort: true }).text).toBe("128 keep · 59 spare · 71 feed. Rating rolls: 60 of 247… The order updates when every roll is in.");
    expect(barStatus(base)).toEqual({ kind: "done", text: "128 keep · 59 spare · 71 feed. Tap an echo's chip for why." });
  });

  it("says when the chips show the last verdicts, when there is nothing to judge against, and when it failed", () => {
    expect(barStatus({ ...base, judging: true, stale: true, progress: 0.1 }).text).toMatch(/^Your echoes changed: Echo Lab is judging them again… 10%/);
    expect(barStatus({ ...base, builds: 0 }).kind).toBe("no-builds");
    expect(barStatus({ ...base, echoes: 0 }).kind).toBe("empty");
    expect(barStatus({ ...base, error: "worker crashed" })).toEqual({ kind: "error", text: "Echo Lab stopped: worker crashed" });
    expect(barStatus({ ...base, rated: 96, ratingFailed: true })).toEqual({ kind: "error", text: "128 keep · 59 spare · 71 feed. Echo Lab could not rate every roll (96 of 247 done)." });
  });
});
