// Wuthering Tools+: the command palette's items, fuzzy ranking and the "Ask Claude" row.
import { describe, expect, it } from "vitest";
import { CORE_PAGES, SECTION_PAGES, characterRowsOf, fuzzyScore, looksLikeQuestion, pageTitleOf, paletteItems, rankPalette, storedSequence, type PaletteItem, type PaletteSources } from "./paletteItems";
import { contextTargetOf, paletteWithCommands, type PaletteContext } from "./paletteCommands";
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
    expect(pages).toHaveLength(CORE_PAGES.length + PLUS_PAGES.length - 1 + SECTION_PAGES.length);
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

  it("reaches Convene's tabs and the Settings sections by search, without listing them in an empty palette", () => {
    const first = (q: string) => rankPalette(q, items).find((i) => i.group === "page")?.run;
    expect(first("pull advisor")).toEqual({ kind: "route", path: "/convene?tab=advisor" });
    expect(first("pity")).toEqual({ kind: "route", path: "/convene?tab=pulls" });
    expect(first("banners")).toEqual({ kind: "route", path: "/convene?tab=banners" });
    expect(first("wavescan")).toEqual({ kind: "route", path: "/settings?section=wavescan" });
    expect(first("backup")).toEqual({ kind: "route", path: "/settings?section=backup-restore" });
    expect(first("import echoes")).toEqual({ kind: "route", path: "/settings?section=wavescan" });
    expect(rankPalette("", items).some((i) => i.run.kind === "route" && i.run.path.includes("?"))).toBe(false);
    expect(pageTitleOf("/convene?tab=advisor")).toBe("Convene odds");
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

describe("commands (paletteCommands.ts)", () => {
  const teams = [
    { id: "t1", name: "Aemeath hypercarry", members: ["Aemeath", "Mornye", "Lynae"], memberKeys: ["Aemeath", "Mornye", "Lynae"] },
    { id: "t2", name: "Two only", members: ["Aemeath", "Mornye"], memberKeys: ["Aemeath", "Mornye"] },
  ];
  const ctx = (path: string, over: Partial<PaletteContext> = {}): PaletteContext => ({ path, query: {}, hash: "", activeCharacter: null, openTeamId: null, ...over });
  const withCtx = (context: PaletteContext | undefined, over: Partial<PaletteSources> = {}) =>
    paletteWithCommands(sources({ teams, context, characters: [...sources().characters, { key: "Lynae", name: "Lynae", rarity: 5, element: "Spectro", weapon: "Pistols", setUp: true, sequence: 0 }], ...over }));
  const runs = (items: PaletteItem[], group: string) => items.filter((i) => i.group === group).map((i) => i.run);

  it("every set-up character and three-member saved team gets its commands, all waiting for a query", () => {
    const items = withCtx(undefined, { autoTeamBuffs: true });
    const commands = items.filter((i) => i.group === "command");
    expect(commands.every((c) => c.queryOnly)).toBe(true);
    expect(items.some((i) => i.group === "context")).toBe(false);
    const titles = commands.map((c) => c.title);
    expect(titles).toEqual(expect.arrayContaining(["Share Aemeath's build", "Weapon value: Aemeath", "Substats & what-if: Mornye", "Rotation cue card: Aemeath + Mornye + Lynae", "Build from my echoes: Aemeath + Mornye + Lynae", "Energy check: Aemeath + Mornye + Lynae", "Share team: Aemeath + Mornye + Lynae", "ToA clear check for my teams", "Which selector pick is best for me?", "Turn team-aware buffs off"]));
    // not set up (Rover, Yangyang) and a two-member team get none
    expect(titles.some((t) => /Rover|Yangyang|Two only/.test(t))).toBe(false);
    expect(commands.find((c) => c.title === "Weapon value: Aemeath")?.run).toEqual({ kind: "route", path: "/weapons?focus=Aemeath" });
    expect(commands.find((c) => c.title === "Substats & what-if: Aemeath")?.run).toEqual({ kind: "route", path: "/my-rankings?focus=Aemeath&tab=substats" });
    expect(commands.find((c) => c.title.startsWith("Rotation cue card"))?.run).toEqual({ kind: "route", path: "/rotation#chars=Aemeath,Mornye,Lynae" });
    expect(commands.find((c) => c.title.startsWith("Build from my echoes"))?.run).toEqual({ kind: "route", path: "/build-team?team=t1" });
    expect(commands.find((c) => c.title.startsWith("Energy check"))?.run).toEqual({ kind: "route", path: "/energy?team=t1" });
    expect(commands.find((c) => c.title === "Share Aemeath's build")?.run).toEqual({ kind: "share", source: { kind: "build", charId: "Aemeath" } });
    expect(commands.find((c) => c.title.startsWith("Share team"))?.run).toEqual({ kind: "share", source: { kind: "team", teamId: "t1" } });
    expect(withCtx(undefined, { autoTeamBuffs: false }).find((i) => i.key === "command:team-buffs")?.title).toBe("Turn team-aware buffs on");
    expect(withCtx(undefined).some((i) => i.key === "command:team-buffs")).toBe(false);
  });

  it("the empty list leaves the commands out; a query finds them, a character's own before its teams'", () => {
    const items = withCtx(undefined);
    expect(rankPalette("", items).some((i) => i.group === "command")).toBe(false);
    // the character itself still comes first
    expect(rankPalette("aem", items)[0]).toMatchObject({ group: "character", title: "Aemeath" });
    const share = rankPalette("share aem", items);
    expect(share.find((i) => i.group === "command")).toMatchObject({ title: "Share Aemeath's build" });
    const aem = rankPalette("aemeath", items).filter((i) => i.group === "command").map((i) => i.title);
    expect(aem.slice(0, 3).sort()).toEqual(["Share Aemeath's build", "Substats & what-if: Aemeath", "Weapon value: Aemeath"]);
    expect(rankPalette("toa", items).find((i) => i.group === "command")?.run).toEqual({ kind: "route", path: "/endgame" });
    expect(rankPalette("energy lynae", items).find((i) => i.group === "command")?.title).toBe("Energy check: Aemeath + Mornye + Lynae");
  });

  it("reads the page: the calculator's character, the open team, a ?focus=, ?team=, ?members= or #chars=", () => {
    const s = { characters: [...sources().characters, { key: "Lynae", name: "Lynae", setUp: true }], teams };
    expect(contextTargetOf(ctx("/", { activeCharacter: "Aemeath" }), s)).toEqual({ character: "Aemeath", team: null });
    expect(contextTargetOf(ctx("/", { activeCharacter: "Yangyang" }), s).character).toBeNull(); // not set up
    expect(contextTargetOf(ctx("/weapons", { query: { focus: "Mornye" } }), s).character).toBe("Mornye");
    expect(contextTargetOf(ctx("/my-rankings", { query: { focus: "Aemeath", tab: "substats" } }), s).character).toBe("Aemeath");
    expect(contextTargetOf(ctx("/teams", { openTeamId: "t1" }), s).team).toEqual({ id: "t1", name: "Aemeath hypercarry", members: ["Aemeath", "Mornye", "Lynae"] });
    expect(contextTargetOf(ctx("/teams"), s).team).toBeNull();
    expect(contextTargetOf(ctx("/energy", { query: { team: "t1" } }), s).team?.id).toBe("t1");
    expect(contextTargetOf(ctx("/build-team", { query: { members: "Lynae,Aemeath,Mornye" } }), s).team?.id).toBe("t1"); // a saved team of the same three
    expect(contextTargetOf(ctx("/build-team", { query: { members: "Aemeath,Mornye,Yangyang" } }), s).team).toEqual({ id: null, name: "", members: ["Aemeath", "Mornye", "Yangyang"] });
    expect(contextTargetOf(ctx("/rotation", { hash: "#chars=Mornye,Lynae,Aemeath&tab=timeline" }), s).team?.id).toBe("t1");
    // a #team= key or code is read by Riley's list in the worker, never here
    expect(contextTargetOf(ctx("/rotation", { hash: "#team=t404" }), s).team).toBeNull();
    expect(contextTargetOf(ctx("/inventory"), s)).toEqual({ character: null, team: null });
    expect(contextTargetOf(undefined, s)).toEqual({ character: null, team: null });
  });

  it("lists the page's commands first, leaves out the one that reopens this page, and never twice", () => {
    const calc = withCtx(ctx("/", { activeCharacter: "Aemeath" }));
    const empty = rankPalette("", calc);
    expect(empty[0].group).toBe("context");
    expect(empty.filter((i) => i.group === "context").map((i) => i.title)).toEqual(["Share Aemeath's build", "Weapon value: Aemeath", "Substats & what-if: Aemeath", "Ask Claude how to raise Aemeath's damage"]);
    expect(runs(calc, "context")).toContainEqual({ kind: "ask", question: "How can I raise Aemeath's damage on my account? What should I change first?" });
    // the same command isn't listed again under Commands
    expect(calc.filter((i) => i.title === "Share Aemeath's build")).toHaveLength(1);
    expect(calc.filter((i) => i.title === "Share Mornye's build")).toHaveLength(1);

    const weapons = withCtx(ctx("/weapons", { query: { focus: "Aemeath" } })).filter((i) => i.group === "context").map((i) => i.title);
    expect(weapons).not.toContain("Weapon value: Aemeath");
    expect(weapons).toContain("Substats & what-if: Aemeath");

    const teamsPage = withCtx(ctx("/teams", { openTeamId: "t1" })).filter((i) => i.group === "context");
    expect(teamsPage.map((i) => i.title)).toEqual(["Rotation cue card for this team", "Build from my echoes for this team", "Energy check for this team", "Share this team"]);
    expect(teamsPage[0].subtitle).toMatch(/^Aemeath \+ Mornye \+ Lynae · /);
    // on another page the open-in-the-editor jump is offered too
    const rotation = withCtx(ctx("/rotation", { hash: "#chars=Aemeath,Mornye,Lynae" })).filter((i) => i.group === "context");
    expect(rotation.map((i) => i.run)).toContainEqual({ kind: "team", id: "t1" });
    expect(rotation.some((i) => i.title.startsWith("Rotation cue card"))).toBe(false);
    expect(rotation.find((i) => i.run.kind === "team")?.title).toBe("Open this team in Team rotations");
    // a composition with no saved team: rotation and build only (energy and share need a saved team)
    const preset = withCtx(ctx("/build-team", { query: { members: "Aemeath,Mornye,Yangyang" } })).filter((i) => i.group === "context");
    expect(preset.map((i) => i.run)).toEqual([{ kind: "route", path: "/rotation#chars=Aemeath,Mornye,Yangyang" }]);
  });
});
