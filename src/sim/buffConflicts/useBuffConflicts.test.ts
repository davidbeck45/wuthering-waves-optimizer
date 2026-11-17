// Wuthering Tools+: the notice's state and wording for builds with two exclusive buffs on. The real stores and Ryan's
// real Sigrika kit; what is under test is what the page says about each pair and what Keep only writes, also when the
// build changed after the check (the calculator, another tab).
import { beforeEach, describe, expect, it } from "vitest";
import { defineComponent, h, nextTick } from "vue";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useCharacterStore } from "../../stores/character";
import { HISTORY_PREFIX, clearHistoryMemory, readHistory } from "../buildHistory/history";
import type { BuffConflict } from "./buffConflicts";
import type { ConflictFigures } from "./conflictFigures";
import { againstSaved, conflictConsequence, conflictHeadline, conflictWarning, figureRows, overcountOf } from "./conflictText";
import { resetBuffConflicts, switchesKey, useBuffConflicts, type BuffConflictsState } from "./useBuffConflicts";

const pair = (active = true): BuffConflict => ({
  characterId: "Sigrika",
  buildId: active ? "b1" : "b2",
  buildName: active ? "Default build" : "Old save",
  active,
  sides: [
    { category: "buffs", key: "SchemataofRunes", name: "Schemata of Runes", detail: "", stacks: null },
    { category: "buffs", key: "SoliskinVitality", name: "Soliskin Vitality", detail: "", stacks: 60 },
  ],
});
const fig = (both: number, a: number, b: number, team?: [number, number, number]): ConflictFigures => ({
  id: "x",
  rotation: { both: { name: "r", avgDamage: both }, only: [{ name: "r", avgDamage: a }, { name: "r", avgDamage: b }] },
  team: team ? { id: "t", name: "t", characterIds: ["Sigrika"], both: team[0], only: [team[1], team[2]] } : null,
  teamNote: team ? null : "no team",
});

describe("what a pair does to the figures, read off the figures", () => {
  it("is counted twice when the figure as saved is above both single figures", () => {
    expect(overcountOf(fig(1000, 944, 902))).toEqual({ kind: "twice", stronger: null });
    expect(conflictConsequence(pair(), fig(1000, 944, 902))).toBe("Sigrika's figures count both, so they read too high.");
    // the rotation does not show it and the team does: still counted twice
    expect(overcountOf(fig(1000, 1000, 1000, [5000, 4800, 4700])).kind).toBe("twice");
  });

  it("is not a double count when the figure as saved is the stronger one alone, and says which", () => {
    expect(overcountOf(fig(1000, 1000, 773))).toEqual({ kind: "stronger", stronger: 0 });
    expect(overcountOf(fig(1000, 954, 1000))).toEqual({ kind: "stronger", stronger: 1 });
    expect(conflictConsequence(pair(), fig(1000, 954, 1000))).toBe("The engine already counts only Soliskin Vitality when both are on, so no figure reads too high.");
    // a rounding-sized gap is no double count
    expect(overcountOf(fig(1_000_000, 999_900, 900_000)).kind).toBe("stronger");
  });

  it("claims nothing it has not measured", () => {
    expect(overcountOf(fig(1000, 1000, 1000)).kind).toBe("neither");
    expect(conflictConsequence(pair(), fig(1000, 1000, 1000))).toMatch(/Neither one changes a figure/);
    expect(overcountOf(null).kind).toBe("unknown");
    expect(overcountOf({ id: "x", rotation: null, team: null, teamNote: null }).kind).toBe("unknown");
    expect(conflictConsequence(pair(), null)).toBe("If the engine counts both, Sigrika's figures read too high.");
  });

  it("words a saved build that is not in use as that", () => {
    expect(conflictHeadline(pair(false))).toBe('Sigrika\'s saved build "Old save" has two buffs on that cannot be active together in the game: Schemata of Runes and Soliskin Vitality.');
    expect(conflictConsequence(pair(false), fig(1000, 944, 902))).toBe("It is not the build in use, so today's figures do not run it. A figure for that build counts both, so it reads too high.");
    expect(conflictWarning(pair(), fig(1000, 944, 902))).toBe(
      "Sigrika has two buffs on that cannot be active together in the game: Schemata of Runes and Soliskin Vitality. Sigrika's figures count both, so they read too high.",
    );
  });

  it("prints each figure with what it is and how far from the saved one", () => {
    const rows = figureRows(pair(), fig(6_758_150, 6_380_883, 6_094_439, [7_187_788, 6_800_878, 6_492_783]));
    expect(rows.rotation!.map((r) => [r.label, r.text, r.change])).toEqual([
      ["Both on, as saved", "6,758,150", ""],
      ["Only Schemata of Runes", "6,380,883", "5.6 % lower"],
      ["Only Soliskin Vitality", "6,094,439", "9.8 % lower"],
    ]);
    expect(rows.team!.map((r) => r.change)).toEqual(["", "5.4 % lower", "9.7 % lower"]);
    expect(figureRows(pair(), fig(1, 1, 1)).team).toBeNull();
    expect(againstSaved(1000, 1000)).toBe("the same");
    expect(againstSaved(1012, 1000)).toBe("1.2 % higher");
    expect(againstSaved(5, 0)).toBe("");
  });
});

// a synthetic Sigrika: his kit, a weapon, both buffs on as an old save has them; no echoes
const sigrika = (): Record<string, any> => ({
  weapon: "SolswornCiphers",
  weapons: { SolswornCiphers: { refinement: "1" } },
  buffs: { SchemataofRunes: { isEnabled: true }, SoliskinVitality: { isEnabled: true, stacks: 60 } },
  activeBuildId: "b1",
  builds: [{ id: "b1", name: "Default build" }],
});

function page(): { state: BuffConflictsState; unmount: () => void } {
  let state!: BuffConflictsState;
  const wrapper = mount(defineComponent({ setup: () => ((state = useBuffConflicts()), () => h("div")) }));
  return { state, unmount: () => wrapper.unmount() };
}
async function until(done: () => boolean, what: string): Promise<void> {
  for (let i = 0; i < 400 && !done(); i += 1) await new Promise((r) => setTimeout(r, 10));
  await nextTick();
  if (!done()) throw new Error(`timed out waiting for ${what}`);
}

describe("the page's check and Keep only", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    resetBuffConflicts();
    clearHistoryMemory();
    for (const key of Object.keys(localStorage)) if (key.startsWith(HISTORY_PREFIX)) localStorage.removeItem(key);
  });

  it("re-reads the switches it depends on and nothing else", () => {
    const base = { Sigrika: sigrika() };
    const key = switchesKey(base);
    expect(switchesKey({ Sigrika: { ...sigrika(), echoes: { 0: { echoId: "e1" } }, rotations: [{ name: "r" }] } })).toBe(key);
    expect(switchesKey({ Sigrika: { ...sigrika(), buffs: { SchemataofRunes: { isEnabled: false } } } })).not.toBe(key);
    expect(switchesKey({ Sigrika: { ...sigrika(), weapon: "Other" } })).not.toBe(key);
    expect(switchesKey({ Sigrika: { ...sigrika(), builds: [{ id: "b1", name: "Default build" }, { id: "b2", buffs: { SchemataofRunes: { isEnabled: true } } }] } })).not.toBe(key);
    expect(switchesKey(null)).toBe("[]");
  });

  it("finds her pair, measures it as counted twice, and keeps one through the store with a version taken first", async () => {
    const store = useCharacterStore();
    store.hardSetState({ characters: { Sigrika: sigrika() }, activeCharacter: "Sigrika", favoriteCharacters: [] });
    const { state, unmount } = page();
    await until(() => state.counted.value.length === 1 && !state.checking.value, "the check");
    const view = state.counted.value[0];
    expect(view.over.kind).toBe("twice");
    expect(view.figures!.rotation!.both.avgDamage).toBeGreaterThan(view.figures!.rotation!.only[1].avgDamage);
    // measuring wrote nothing
    expect(store.characters.Sigrika.buffs).toEqual({ SchemataofRunes: { isEnabled: true }, SoliskinVitality: { isEnabled: true, stacks: 60 } });
    expect(readHistory("Sigrika")).toHaveLength(0);

    expect(await state.keepOnly(view.conflict, 1)).toBe(true);
    expect(store.characters.Sigrika.buffs).toEqual({ SchemataofRunes: { isEnabled: false }, SoliskinVitality: { isEnabled: true, stacks: 60 } });
    expect(state.kept.value).toEqual({ characterId: "Sigrika", kept: "Soliskin Vitality", off: "Schemata of Runes", versionSaved: true });
    // the version holds the build as it was: both on
    const versions = readHistory("Sigrika");
    expect(versions.map((v) => v.label)).toEqual(["before-buff-fix"]);
    expect((versions[0].payload.members[0] as any).config.buffs.SchemataofRunes).toEqual({ isEnabled: true });
    // the switches changed, so the check ran again: nothing left to say
    await until(() => state.views.value.length === 0 && !state.checking.value, "the re-check");
    unmount();
  }, 60_000);

  it("writes nothing when the pair is no longer both on in that build, and looks again", async () => {
    const store = useCharacterStore();
    store.hardSetState({ characters: { Sigrika: sigrika() }, activeCharacter: "Sigrika", favoriteCharacters: [] });
    const { state, unmount } = page();
    await until(() => state.counted.value.length === 1 && !state.checking.value, "the check");
    const stale = state.counted.value[0].conflict;
    // the calculator (or another tab) turned one off after the page checked
    store.characters.Sigrika.buffs.SoliskinVitality.isEnabled = false;
    const before = JSON.stringify(store.characters);
    expect(await state.keepOnly(stale, 1)).toBe(false);
    expect(JSON.stringify(store.characters)).toBe(before);
    expect(readHistory("Sigrika")).toHaveLength(0);
    expect(state.kept.value).toBeNull();
    await until(() => state.views.value.length === 0 && !state.checking.value, "the re-check");
    unmount();
  }, 60_000);

  it("never writes to a saved build that is not the one shown, or after the build in use was switched", async () => {
    const store = useCharacterStore();
    const data = { ...sigrika(), builds: [{ id: "b1", name: "Default build" }, { id: "b2", name: "Old save", weapon: "SolswornCiphers", buffs: sigrika().buffs }] };
    store.hardSetState({ characters: { Sigrika: data }, activeCharacter: "Sigrika", favoriteCharacters: [] });
    const { state, unmount } = page();
    await until(() => state.counted.value.length === 2 && !state.checking.value, "the check");
    const [inUse, saved] = state.counted.value.map((v) => v.conflict);
    expect([inUse.active, saved.active]).toEqual([true, false]);
    const before = JSON.stringify(store.characters);
    expect(await state.keepOnly(saved, 0)).toBe(false);
    expect(JSON.stringify(store.characters)).toBe(before);
    // the player switched builds in the calculator after the check: the notice's build is no longer the one shown
    store.equipBuild("Sigrika", "b2");
    const switched = JSON.stringify(store.characters);
    expect(await state.keepOnly(inUse, 0)).toBe(false);
    expect(JSON.stringify(store.characters)).toBe(switched);
    expect(readHistory("Sigrika")).toHaveLength(0);
    unmount();
  }, 60_000);
});
