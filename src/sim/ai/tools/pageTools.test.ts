// Wuthering Tools+ AI: the tools for the batch-2 pages that run in the tool worker (echo_lab, weapon_value, pull_advice,
// today) on the fixture account (Aemeath / Mornye / Lynae, src/sim/ai/__fixtures__/aiAccount.json), with the page
// caches they read handed in as a synthetic storage — never anyone's real Convene history or notices cache.
import { beforeAll, describe, expect, it } from "vitest";
import fixture from "../__fixtures__/aiAccount.json";
import patch37 from "../../today/__fixtures__/patch37.json";
import kuroMenu from "../../today/__fixtures__/kuroMenu.json";
import { parseExport, type ExportFile } from "../../cli/exportShape";
import { versionReleases } from "../../convene/banners";
import { parseNewsArticle } from "../../today/durations";
import { TODAY_NEWS_KEY } from "../../today/news";
import { TODAY_STATE_KEY } from "../../today/state";
import { clearToolMemo, readOnlyStorage, runTool } from "./index";
import { echoLabFor } from "./memo";
import { MAX_RESULT_CHARS, type ToolContext } from "./shared";
import { deepLinksOf, summarizeTool } from "../ui/toolSummary";

const exp: ExportFile = parseExport(fixture, "aiAccount.json");
/** 3.7 Phase II is running (Lucilla, Lynae, Freeze Frame, Spectrum Blaster), on the Asia server's clock */
const NOW = new Date("2026-10-31T06:00:00Z");

function ctxWith(stored: Record<string, string> = {}, now = NOW): ToolContext {
  return { exp, now, storage: readOnlyStorage(stored) };
}

async function call(name: string, input: unknown, ctx: ToolContext): Promise<any> {
  const r = await runTool(name, input, ctx);
  expect(r.content.length).toBeLessThanOrEqual(MAX_RESULT_CHARS);
  if (!r.ok) throw new Error(`${name} failed: ${r.content}`);
  return JSON.parse(r.content);
}

const asia = JSON.stringify({ v: 1, tab: "advisor", server: "asia", budgetAstrite: 16000, manualPity: { "1": { pity: 70, guaranteed: true }, "2": { pity: 30, guaranteed: false } } });

describe("echo_lab", () => {
  beforeAll(() => clearToolMemo());

  it("groups the feed list the way the game filters, with counts that add up", async () => {
    const r = await call("echo_lab", { show: "feed", character: null }, ctxWith());
    expect(r.counts.keep + r.counts.spare + r.counts.feed).toBe(exp.inventory.echoes.length);
    expect(r.charactersJudgedOn).toBe(3);
    const fed = r.feedGroups.reduce((n: number, g: any) => n + Number(g.group.split(" × ")[0]), 0);
    if (!r.groupsOmitted) expect(fed).toBe(r.counts.feed);
    for (const g of r.feedGroups) expect(g.group).toMatch(/^\d+ × Cost [134] · .+ · .+ main$/);
    expect(r.path).toBe("/echo-lab?tab=verdicts");
  });

  it("keeps: upgrades come with the owner, the slot and the gain; the character filter narrows them", async () => {
    const all = await call("echo_lab", { show: "keep", character: null }, ctxWith());
    expect(all.matching).toBe(all.counts.keep);
    const mine = await call("echo_lab", { show: "keep", character: "aemeath" }, ctxWith());
    expect(mine.forCharacter).toBe("Aemeath");
    expect(mine.matching).toBeLessThanOrEqual(all.matching);
    for (const e of mine.echoes.filter((x: any) => x.bestFor)) {
      expect(e.bestFor.slot).toBeGreaterThanOrEqual(1);
      expect(e.bestFor.damageGainPct).toBeGreaterThan(0);
    }
    expect(mine.path).toBe("/echo-lab?tab=verdicts&character=Aemeath");
  });

  it("never lists an echo a saved build holds as feed, and says which build holds it and whose", async () => {
    const { verdicts } = await echoLabFor(exp);
    const fed = verdicts.echoes.find((e) => e.verdict === "feed")!;
    // Mornye's "Account plan" build, saved beside the one she wears (Whole account without "Also make active")
    const held: ExportFile = JSON.parse(JSON.stringify(exp));
    const mornye = held.characters.Mornye;
    mornye.activeBuildId = "live";
    mornye.builds = [
      { id: "live", name: "Default build", echoes: { ...mornye.echoes } },
      { id: "plan", name: "Account plan", echoes: { ...mornye.echoes, 4: { echoId: fed.echoId } } },
    ];
    const ctx: ToolContext = { exp: held, now: NOW, storage: readOnlyStorage({}) };
    const feed = await call("echo_lab", { show: "feed", character: null }, ctx);
    expect(feed.counts).toEqual({ keep: verdicts.counts.keep + 1, spare: verdicts.counts.spare, feed: verdicts.counts.feed - 1 });
    const listed = feed.feedGroups.reduce((n: number, g: any) => n + Number(g.group.split(" × ")[0]), 0);
    if (!feed.groupsOmitted) expect(listed).toBe(verdicts.counts.feed - 1);
    const keep = await call("echo_lab", { show: "keep", character: null }, ctx);
    const row = keep.echoes.find((e: any) => e.heldBySavedBuilds);
    expect(row).toMatchObject({ verdict: "keep", why: "In a saved build", heldBySavedBuilds: ["Mornye's saved build “Account plan”"] });
    expect(row.wornBy).toBeUndefined();
    // the inventory search agrees: held is not "unequipped", and the row names the build
    const before = await call("search_inventory", { equipped: "unequipped", sort: "crit_value_asc", limit: 30 }, ctxWith());
    const after = await call("search_inventory", { equipped: "unequipped", sort: "crit_value_asc", limit: 30 }, ctx);
    expect(before.echoes.map((e: any) => e.id)).toContain(fed.echoId);
    expect(after.echoes.map((e: any) => e.id)).not.toContain(fed.echoId);
    expect(after.matching).toBe(before.matching - 1);
    const all = await call("search_inventory", { limit: 30 }, ctx);
    expect(all.echoes.find((e: any) => e.id === fed.echoId)).toMatchObject({ equippedBy: [], heldBySavedBuilds: ["Mornye's saved build “Account plan”"] });
  }, 60_000);

  it("re-roll advice per equipped echo, and a clear error without a character", async () => {
    const r = await call("echo_lab", { show: "reroll", character: "Aemeath" }, ctxWith());
    expect(r.character).toBe("Aemeath");
    expect(r.echoes.length + r.notSoon.length).toBe(5);
    for (const e of r.echoes) {
      expect(e.lines).toHaveLength(5);
      for (const l of e.lines) expect(l).toMatch(/: (lock|keep|reroll \(#\d\))$/); // the plan's own chips (planChips)
    }
    expect(r.rerollFirst).toMatch(/^slot \d|^none/);
    const bad = await runTool("echo_lab", { show: "reroll", character: null }, ctxWith());
    expect(JSON.parse(bad.content).error).toMatch(/needs a character/);
    const unknown = await runTool("echo_lab", { show: "burn", character: null }, ctxWith());
    expect(JSON.parse(unknown.content).error).toMatch(/show must be one of feed, keep, spare, reroll/);
  }, 60_000); // the re-roll pass scores every equipped echo: 4-5 s on CI's 2-core runner, over vitest's 5 s default
});

describe("weapon_value", () => {
  it("every set-up character's signature, and one character's full detail", async () => {
    const all = await call("weapon_value", { character: null }, ctxWith());
    expect(all.enemy).toBe("Lv 100 / 20 % RES");
    expect(all.characters.map((c: any) => c.character).sort()).toEqual(["Aemeath", "Lynae", "Mornye"]);
    const lynae = all.characters.find((c: any) => c.character === "Lynae");
    expect(lynae.signature).toBe("Spectrum Blaster");
    expect(lynae.next).toBe("Spectrum Blaster R2");
    expect(all.notSetUp).toEqual(["Augusta"]);
    const one = await call("weapon_value", { character: "Lynae" }, ctxWith());
    expect(one.now).toBe("Spectrum Blaster R1");
    expect(one.signature.steps.map((s: any) => s.weapon)).toEqual(["Spectrum Blaster R2", "Spectrum Blaster R3", "Spectrum Blaster R4", "Spectrum Blaster R5"]);
    const gains = one.signature.steps.map((s: any) => s.ownGainPct);
    expect([...gains].sort((a, b) => a - b)).toEqual(gains); // each refinement at least as good
    expect(one.path).toBe("/weapons?focus=Lynae");
  });
});

describe("pull_advice", () => {
  it("prices the running banners from the typed pity and budget", async () => {
    const r = await call("pull_advice", { item: null }, ctxWith({ "wtplus:convene:prefs": asia }));
    expect(r.pity[0]).toMatchObject({ pool: "Featured Resonator", pity: 70, nextFiveStarIsFeatured: true, source: "typed on the advisor tab" });
    expect(r.budget).toBe("16000 Astrite = 100 pulls");
    // one row per phase: its four banners share the label and the end
    expect(r.banners).toEqual([{ banner: "3.7 Phase II", endsInDays: expect.any(Number) }]);
    expect(r.notes.join(" ")).toMatch(/Each step counts from today/);
    const names = r.items.map((i: any) => i.item).sort();
    expect(names).toEqual(["Freeze Frame", "Lucilla", "Lynae", "Spectrum Blaster"]);
    const blaster = r.items.find((i: any) => i.item === "Spectrum Blaster");
    expect(blaster.onCharacter).toBe("Lynae");
    expect(blaster.steps[0].step).toBe("Spectrum Blaster R2 on Lynae");
    expect(blaster.steps[0].expectedAstrite).toBeGreaterThan(0);
    expect(blaster.steps[0].chanceWithBudgetPct).toBeGreaterThan(0);
    expect(r.items.find((i: any) => i.item === "Lucilla").status).toMatch(/not on your account/);
    expect(r.items.find((i: any) => i.item === "Lynae").status).toMatch(/already S6/);
    expect(r.notes.join(" ")).toMatch(/No Convene history imported/);
    expect(r.path).toBe("/convene?tab=advisor");
  });

  it("one item, and an item that is not on a banner now", async () => {
    const one = await call("pull_advice", { item: "spectrum" }, ctxWith({ "wtplus:convene:prefs": asia }));
    expect(one.items.map((i: any) => i.item)).toEqual(["Spectrum Blaster"]);
    const off = await call("pull_advice", { item: "Phoebe" }, ctxWith());
    expect(off.onABannerNow).toBe(false);
    expect(off.runningNow).toContain("Lynae");
    // pity without a history or typed pity counts as 0
    const zero = await call("pull_advice", { item: "Spectrum Blaster" }, ctxWith());
    expect(zero.pity[1]).toMatchObject({ pity: 0, source: "unknown (counted as 0)" });
    // without a history or typed pity the 50/50 is not claimed either way
    expect(zero.pity[0]).toMatchObject({ pity: 0, nextFiveStarIsFeatured: "unknown (counted as a 50/50)" });
  });
});

describe("today", () => {
  const releases = versionReleases(kuroMenu);
  const news = JSON.stringify({ v: 1, fetchedAt: NOW.getTime() - 3_600_000, articles: { "5571": parseNewsArticle(patch37) }, releases });

  it("resets, Waveplates, events from the notices cache and the running banners", async () => {
    const state = JSON.stringify({ v: 1, waveplates: { value: 200, crystals: 10, atMs: NOW.getTime() - 60 * 60_000 }, ticks: {}, hidden: [], timeMode: "local", notify: false, showLive: true });
    const r = await call("today", {}, ctxWith({ "wtplus:convene:prefs": asia, [TODAY_NEWS_KEY]: news, [TODAY_STATE_KEY]: state }));
    expect(r.serverClock).toBe("asia (UTC+8)");
    expect(r.nextDailyReset).toMatch(/\(in \d+h \d+m\)$/);
    expect(r.nextWeeklyReset).toMatch(/\(in /);
    expect(r.waveplates.now).toBe(210); // 200 + 60 min / 6 min
    expect(r.waveplates.full).toMatch(/\(in 3h/);
    expect(typeof r.events).toBe("object");
    expect([...r.events.endingWithin3Days, ...r.events.running, ...r.events.startingWithin14Days].length).toBeGreaterThan(0);
    expect(r.endgameCycles.map((c: any) => c.mode)).toContain("Tower of Adversity");
    expect(r.bannersRunning.flatMap((b: any) => b.featured)).toContain("Lynae");
    expect(r.path).toBe("/today");
  });

  it("says plainly what this browser hasn't loaded", async () => {
    const r = await call("today", {}, ctxWith());
    expect(r.events).toMatch(/open \/today once/);
    expect(r.waveplates).toMatch(/not logged/);
  });

  it("reads storage only through the read-only view (a write is dropped)", () => {
    const backing: Record<string, string> = { a: "1" };
    const s = readOnlyStorage(backing);
    s.setItem("a", "2");
    expect(s.getItem("a")).toBe("1");
    expect(s.getItem("missing")).toBeNull();
    const throwing = readOnlyStorage({ getItem: () => { throw new Error("blocked"); } });
    expect(throwing.getItem("x")).toBeNull();
  });
});

describe("the panel's view of the page tools", () => {
  it("labels each one, picks a headline and offers the page as a button", async () => {
    const result = await runTool("today", {}, ctxWith());
    const row = summarizeTool({ name: "today", input: {}, result: result.content, status: "ok" });
    expect(row.label).toBe("Today");
    expect(row.headline).toMatch(/reset/);
    const links = deepLinksOf([{ name: "today", input: {}, result: result.content, status: "ok" }]);
    expect(links[0]).toMatchObject({ kind: "route", path: "/today", label: "Today" });
  });
});
