// Wuthering Tools+: the command palette's items, fuzzy ranking and the "Ask Claude" row.
import { describe, expect, it } from "vitest";
import { CORE_PAGES, characterRowsOf, fuzzyScore, looksLikeQuestion, pageTitleOf, paletteItems, rankPalette, storedSequence, type PaletteSources } from "./paletteItems";
import { PLUS_PAGES } from "./plusPages";

const sources = (over: Partial<PaletteSources> = {}): PaletteSources => ({
  hasRoute: (p) => p !== "/account", // a plus page whose route isn't registered in this checkout is skipped
  characters: [
    { key: "Aemeath", name: "Aemeath", rarity: 5, element: "Fusion", weapon: "Sword", setUp: true, sequence: 6 },
    { key: "Mornye", name: "Mornye", rarity: 5, element: "Fusion", weapon: "Rectifier", setUp: true, sequence: 1 },
    { key: "RoverAero", name: "Rover Aero (Male)", rarity: 5, element: "Aero", weapon: "Sword", setUp: false },
    { key: "Yangyang", name: "Yangyang", rarity: 4, element: "Aero", weapon: "Sword", setUp: false },
  ],
  teams: [{ id: "t1", name: "Aemeath hypercarry", members: ["Aemeath", "Mornye", "Lynae"] }],
  themeStyle: "dark",
  classicUi: false,
  aiKeySet: false,
  aiChat: false,
  mod: "Ctrl",
  ...over,
});

describe("paletteItems", () => {
  it("lists core + plus pages with a route, the actions, characters (set up first) and saved teams", () => {
    const items = paletteItems(sources());
    const pages = items.filter((i) => i.group === "page").map((i) => i.run);
    expect(pages).toContainEqual({ kind: "route", path: "/my-rankings" });
    expect(pages).not.toContainEqual({ kind: "route", path: "/account" });
    expect(pages).toHaveLength(CORE_PAGES.length + PLUS_PAGES.length - 1);
    const actions = items.filter((i) => i.group === "action").map((i) => i.title);
    expect(actions).toEqual(["Rank my roster", "Open the assistant", "AI settings", "Switch to light theme", "Switch to the classic UI"]);
    expect(items.filter((i) => i.group === "character").map((i) => [i.title, i.badge])).toEqual([
      ["Aemeath", "S6"],
      ["Mornye", "S1"],
      ["Rover Aero (Male)", undefined],
      ["Yangyang", undefined],
    ]);
    expect(items.find((i) => i.group === "team")).toMatchObject({ title: "Aemeath hypercarry", subtitle: "Aemeath · Mornye · Lynae", run: { kind: "team", id: "t1" } });
  });

  it("offers a new chat only when a conversation exists and flips the toggles' wording", () => {
    const items = paletteItems(sources({ aiChat: true, themeStyle: "light", classicUi: true }));
    const titles = items.filter((i) => i.group === "action").map((i) => i.title);
    expect(titles).toContain("New chat with Claude");
    expect(titles).toContain("Switch to dark theme");
    expect(titles).toContain("Switch to the v3 UI");
  });
});

describe("rankPalette", () => {
  const items = paletteItems(sources());

  it("shows pages, actions, set-up characters and teams for an empty query", () => {
    const groups = rankPalette("", items).map((i) => i.group);
    expect(groups.indexOf("page")).toBe(0);
    expect(groups.filter((g) => g === "character")).toHaveLength(2);
    expect(groups[groups.length - 1]).toBe("team");
  });

  it("puts the best match first, grouped, without scattered-letter noise", () => {
    const ranked = rankPalette("aem", items);
    expect(ranked[0]).toMatchObject({ group: "character", title: "Aemeath" });
    expect(ranked.some((i) => i.title === "Rover Aero (Male)")).toBe(false);
    const groups = ranked.map((i) => i.group);
    // each group appears as one run
    expect(groups.filter((g, i) => i > 0 && g !== groups[i - 1]).length).toBe(new Set(groups).size - 1);
    expect(ranked[ranked.length - 1]).toMatchObject({ group: "ask", run: { kind: "ask", question: "aem" } });
  });

  it("finds /my-rankings by its words and keywords", () => {
    expect(rankPalette("roster rank", items)[0].run).toEqual({ kind: "route", path: "/my-rankings" });
    expect(rankPalette("my rankings", items).find((i) => i.group === "page")?.run).toEqual({ kind: "route", path: "/my-rankings" });
  });

  it("puts 'Ask Claude' first for a question or a weak match, and leaves it out on request", () => {
    expect(rankPalette("why is my team lower than riley's?", items)[0]).toMatchObject({ group: "ask", title: "Ask Claude: why is my team lower than riley's?" });
    expect(rankPalette("zzzz qqq", items)[0].group).toBe("ask");
    expect(rankPalette("aem", items, { ask: false }).some((i) => i.group === "ask")).toBe(false);
  });
});

describe("helpers", () => {
  it("scores exact > prefix > word prefix > initials > substring > subsequence", () => {
    const s = (q: string, t: string): number => fuzzyScore(q, t);
    expect(s("inventory", "Inventory")).toBe(1);
    expect(s("inv", "Inventory")).toBeGreaterThan(s("rot", "Team rotations"));
    expect(s("rot", "Team rotations")).toBeGreaterThan(s("tr", "Team rotations") - 0.2);
    expect(s("ntor", "Inventory")).toBeGreaterThan(0);
    expect(s("xyz", "Inventory")).toBe(0);
  });

  it("recognises questions, page titles, stored sequences and character rows", () => {
    expect(looksLikeQuestion("who should I pull for")).toBe(true);
    expect(looksLikeQuestion("inventory")).toBe(false);
    expect(pageTitleOf("/my-rankings?x=1")).toBe("My roster rankings");
    expect(pageTitleOf("/nowhere")).toBeNull();
    expect(storedSequence({ resonanceChains: { SequenceNode1: { isEnabled: true }, SequenceNode3: { isEnabled: true }, SequenceNode6: { isEnabled: false } } })).toBe(3);
    const rows = characterRowsOf(
      [{ key: "Aemeath", name: "Aemeath" }, { key: "Aemeath", name: "dup" }, { key: "Lumi", name: "Lumi" }],
      [{ key: "Aemeath", rarity: 5, element: "Fusion", weapon: "Sword" }],
      { Aemeath: { weapon: "EverbrightPolestar", resonanceChains: { SequenceNode2: { isEnabled: true } } }, Lumi: { echoes: {} } },
      (k) => `/img/${k}.png`,
    );
    expect(rows).toEqual([
      { key: "Aemeath", name: "Aemeath", rarity: 5, element: "Fusion", weapon: "Sword", setUp: true, sequence: 2, portrait: "/img/Aemeath.png" },
      { key: "Lumi", name: "Lumi", rarity: null, element: null, weapon: null, setUp: false, sequence: null, portrait: "/img/Lumi.png" },
    ]);
  });
});
