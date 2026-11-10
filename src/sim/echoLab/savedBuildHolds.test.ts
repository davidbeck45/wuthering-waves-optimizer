// Wuthering Tools+ Echo Lab — an echo a saved build holds is never fodder (2026-11-08 hunt, numbers 3). Whole account
// and Build my team save "Account plan" and "Built for …" builds beside the one worn, pin them in teams and tell the
// player to switch later; the pass read only the worn builds, so four plan echoes on a real account read Feed and
// counted in the Feed list that Copy list copies. On the public test account: the two echoes the pass feeds, each put
// into a saved build that is not the one worn.
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "./__fixtures__/echoLabAccount.json";
import { bestOwners, type BestOwnerResult, type EchoVerdict } from "./bestOwner";
import { createLabSession, wearsNow, wornByIndex, type LabAccount } from "./core";
import { DEFAULT_FILTERS, applyFilters, feedGroups, feedListText, holdersLabel, qualityTarget, reasonText, savedBuildNote, savedBuildsHolding } from "./echoLabView";
import { wornTarget } from "./rollQuality";
import { applyInventoryView, chipFor, feedCount, type QualityLookup } from "../inventoryQuality/inventoryQuality";

const base = fixture as unknown as LabAccount;
const quiet = { yieldMs: 0 };

/** the two echoes the pass feeds on this account: a dead 1-cost nobody gains from, and one no build can slot */
const NO_GAIN = "labdeadwp01";
const NO_SLOT = "labnoslot01";
const PLAN = "Account plan";
const BUILT_FOR = "Built for Galbrena: Lupa + Mornye";

/** The account after a Whole account save without "Also make active": Cartethyia has an "Account plan" build beside the
 *  one she wears, Galbrena a "Built for …" one; each holds one of the two feed echoes in a slot of its cost. */
function withSavedBuilds(): LabAccount {
  const next = JSON.parse(JSON.stringify(base)) as LabAccount;
  const car = next.characters.Cartethyia;
  car.activeBuildId = "car-live";
  car.builds = [
    // the worn build's own entry: a copy from the last switch, here still naming an echo she no longer wears
    { id: "car-live", name: "Default build", echoes: { ...car.echoes, 4: { echoId: "zeh5ht6xz6" } } },
    { id: "car-plan", name: PLAN, echoes: { ...car.echoes, 2: { echoId: NO_GAIN } } },
  ];
  const gal = next.characters.Galbrena;
  gal.activeBuildId = "gal-live";
  gal.builds = [
    { id: "gal-live", name: "Default build", echoes: { ...gal.echoes } },
    { id: "gal-built", name: BUILT_FOR, echoes: { ...gal.echoes, 4: { echoId: NO_SLOT } } },
  ];
  return next;
}

let before: BestOwnerResult;
let after: BestOwnerResult;
const rowOf = (r: BestOwnerResult, id: string): EchoVerdict => r.echoes.find((e) => e.echoId === id)!;

beforeAll(async () => {
  before = await bestOwners(createLabSession(base), {}, quiet);
  after = await bestOwners(createLabSession(withSavedBuilds()), {}, quiet);
}, 120_000);

describe("who holds an echo", () => {
  it("counts a saved build's echoes, names the build, and leaves the worn build's own stale copy out", () => {
    const index = wornByIndex(withSavedBuilds());
    expect(index.get(NO_GAIN)).toEqual([{ characterId: "Cartethyia", slot: 2, stale: false, build: { id: "car-plan", name: PLAN } }]);
    expect(index.get(NO_SLOT)).toEqual([{ characterId: "Galbrena", slot: 4, stale: false, build: { id: "gal-built", name: BUILT_FOR } }]);
    // "zeh5ht6xz6" is only in the copy of the build Cartethyia wears now: the live record is the truth, nobody holds it
    expect(index.get("zeh5ht6xz6")).toBeUndefined();
    // an echo she wears now and her plan also holds: worn says it, once
    expect(index.get("xtbwqikno2")).toEqual([{ characterId: "Cartethyia", slot: 0, stale: false }]);
    // without saved builds the index is what it was
    expect(wornByIndex(base).get(NO_GAIN)).toBeUndefined();
  });

  it("gives a build without a name a name to say", () => {
    const account = withSavedBuilds();
    account.characters.Cartethyia.builds[1].name = "  ";
    expect(wornByIndex(account).get(NO_GAIN)?.[0].build).toEqual({ id: "car-plan", name: "Unnamed build" });
  });
});

describe("an echo a saved build holds", () => {
  it("read Feed before any saved build held it (the two this account feeds)", () => {
    expect(rowOf(before, NO_GAIN)).toMatchObject({ verdict: "feed", reason: "no-gain", wornBy: [] });
    expect(rowOf(before, NO_SLOT)).toMatchObject({ verdict: "feed", reason: "no-slot", wornBy: [] });
  });

  it("is kept, never fed, and says which build holds it and whose", () => {
    const noGain = rowOf(after, NO_GAIN);
    const noSlot = rowOf(after, NO_SLOT);
    expect(noGain).toMatchObject({ verdict: "keep", reason: "worn" });
    expect(noSlot).toMatchObject({ verdict: "keep", reason: "worn" });
    expect(reasonText(noGain)).toBe("In a saved build");
    expect(holdersLabel(noGain)).toBe("held by");
    expect(savedBuildsHolding(noGain)).toEqual([`Cartethyia's saved build “${PLAN}”`]);
    expect(savedBuildNote(noGain)).toBe(`Cartethyia's saved build “${PLAN}” holds this echo: feeding it would break that build.`);
    expect(savedBuildNote(noSlot)).toBe(`Galbrena's saved build “${BUILT_FOR}” holds this echo: feeding it would break that build.`);
    // an echo worn now keeps its words, and no echo of any saved build is left to feed
    expect(reasonText(rowOf(after, "xtbwqikno2"))).toBe("Worn");
    expect(holdersLabel(rowOf(after, "xtbwqikno2"))).toBe("worn by");
    expect(savedBuildNote(rowOf(after, "xtbwqikno2"))).toBeNull();
    for (const r of after.echoes) if (r.wornBy.length) expect(r.verdict, `${r.echoId} is held`).not.toBe("feed");
  });

  it("moves the counts by exactly those echoes: two fewer to feed, two more kept, every other verdict as it was", () => {
    expect(after.counts).toEqual({ keep: before.counts.keep + 2, spare: before.counts.spare, feed: before.counts.feed - 2 });
    for (const r of after.echoes) {
      if (r.echoId === NO_GAIN || r.echoId === NO_SLOT) continue;
      expect([r.echoId, r.verdict, r.reason]).toEqual([r.echoId, rowOf(before, r.echoId).verdict, rowOf(before, r.echoId).reason]);
    }
  });

  it("is in no Feed list group and not in the text Copy list puts on the clipboard", () => {
    const fedBefore = feedGroups(before.echoes).flatMap((g) => g.echoIds);
    const fedAfter = feedGroups(after.echoes).flatMap((g) => g.echoIds);
    expect(fedBefore).toEqual(expect.arrayContaining([NO_GAIN, NO_SLOT]));
    expect(fedAfter).not.toContain(NO_GAIN);
    expect(fedAfter).not.toContain(NO_SLOT);
    expect(fedAfter).toHaveLength(fedBefore.length - 2);
    expect(feedListText(feedGroups(after.echoes))).toContain(`${fedBefore.length - 2} echo`);
    expect(feedListText(feedGroups(after.echoes))).not.toContain("Sierra Gale"); // the no-slot echo was its Sonata's only one
  });

  it("is outside the inventory's Feed candidates filter and its count, and sorts with the kept echoes under Feed first", () => {
    const lookup: QualityLookup = { verdict: (id) => after.echoes.find((r) => r.echoId === id)?.verdict ?? null, percentile: () => null };
    const list = after.echoes.map((r) => ({ echoId: r.echoId }));
    const candidates = applyInventoryView(list, { sort: "default", feedOnly: true }, lookup).map((e) => e.echoId);
    expect(candidates).not.toContain(NO_GAIN);
    expect(candidates).not.toContain(NO_SLOT);
    expect(candidates).toHaveLength(before.counts.feed - 2);
    expect(feedCount(list, lookup)).toBe(before.counts.feed - 2);
    const order = applyInventoryView(list, { sort: "feed-first", feedOnly: false }, lookup).map((e) => e.echoId);
    const lastNotKept = Math.max(...order.map((id, i) => (rowOf(after, id).verdict === "keep" ? -1 : i)));
    expect(order.indexOf(NO_GAIN)).toBeGreaterThan(lastNotKept);
    expect(order.indexOf(NO_SLOT)).toBeGreaterThan(lastNotKept);
    // Echo Lab's own "In no build" filter leaves them out, "Worn or in a saved build" has them
    expect(applyFilters(after.echoes, { ...DEFAULT_FILTERS, worn: "free" }).map((r) => r.echoId)).not.toContain(NO_GAIN);
    expect(applyFilters(after.echoes, { ...DEFAULT_FILTERS, worn: "worn" }).map((r) => r.echoId)).toEqual(expect.arrayContaining([NO_GAIN, NO_SLOT]));
  });

  it("reads Keep on its inventory chip, with the build and its owner in the hover text and the spoken label", () => {
    const chip = chipFor({ row: rowOf(after, NO_GAIN), judged: true, rating: null, rateable: false });
    expect(chip).toMatchObject({ state: "ready", verdict: "keep", verdictLabel: "Keep", reason: "In a saved build" });
    expect(chip.title).toContain(`Echo Lab: Keep (in a saved build). Cartethyia's saved build “${PLAN}” holds this echo: feeding it would break that build.`);
    expect(chip.aria).toBe(`Echo Lab: Keep, In a saved build: Cartethyia's saved build “${PLAN}” holds this echo: feeding it would break that build. Open in Echo Lab`);
    // the chip of an echo no saved build holds says nothing of builds
    expect(chipFor({ row: rowOf(after, "xtbwqikno2"), judged: true, rating: null, rateable: false }).title).not.toContain("saved build");
  });

  it("is still rated where a build could wear it, not on the saved build's slot: nobody wears it there now", () => {
    const account = withSavedBuilds();
    expect(wornByIndex(account).get(NO_GAIN)!.some(wearsNow)).toBe(false);
    expect(wornTarget(createLabSession(account), NO_GAIN)).toBeNull();
    const row = rowOf(after, NO_GAIN);
    expect(qualityTarget(row, after.characters)).toEqual({ characterId: row.best!.characterId, slot: row.best!.slot });
  });
});
