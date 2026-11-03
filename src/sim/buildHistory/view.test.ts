// Wuthering Tools+ build history: what the page prints (times, summaries, the character list) and the Settings-import
// guard (which characters it keeps, the pending stash surviving the import's reload, the versions it becomes).
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import account from "../myRankings/__fixtures__/cartethyiaAccount.json";
import { useCharacterStore } from "../../stores/character";
import { useInventoryStore } from "../../stores/inventory";
import { HISTORY_PREFIX, readHistory, versionOf } from "./history";
import { flushPendingImport, installImportGuard, PENDING_KEY, pendingFrom } from "./importGuard";
import { characterOptions, gearSummary, labelTone, pickCharacter, restoreItems, whenText } from "./view";

/* eslint-disable @typescript-eslint/no-explicit-any */

const characters = account.characters as Record<string, any>;
const echoes = account.echoes as any[];
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
const NOW = new Date(2026, 9, 31, 15, 0).getTime();

describe("page text", () => {
  it("says when a version was taken in the player's own day", () => {
    expect(whenText(new Date(2026, 9, 31, 9, 5).getTime(), NOW, "en-GB")).toBe("Today 09:05");
    expect(whenText(new Date(2026, 9, 30, 21, 15).getTime(), NOW, "en-GB")).toBe("Yesterday 21:15");
    expect(whenText(new Date(2026, 9, 28, 8, 0).getTime(), NOW, "en-GB")).toBe("28 Oct, 08:00");
    expect(whenText(new Date(2025, 11, 31, 8, 0).getTime(), NOW, "en-GB")).toBe("31 Dec 2025, 08:00");
    // a 12-hour clock keeps "PM" with its time (a no-break space, whatever space the runtime's ICU puts there)
    expect(whenText(new Date(2026, 9, 31, 18, 1).getTime(), NOW, "en-US")).toBe("Today 06:01\u00a0PM");
    expect(whenText(new Date(2026, 9, 29, 18, 1).getTime(), NOW, "en-US")).toBe("Oct 29, 06:01\u00a0PM");
  });

  it("summarises a version's gear and tells the player's saves from the automatic ones", () => {
    const v = versionOf("Cartethyia", characters.Cartethyia, echoes, "manual", NOW);
    expect(gearSummary("Cartethyia", v.payload.members[0])).toBe("Defier's Thorn R1 · S2 · 5 of 5 echoes");
    expect(labelTone("manual")).toBe("own");
    expect(labelTone("before-build-team")).toBe("auto");
    expect(labelTone("before-restore")).toBe("restore");
    expect(restoreItems({ changes: ["a"], notes: ["b"] } as any)).toEqual(["a", "b"]);
  });

  it("lists characters with a build or versions, by name, and opens on the asked one, the calculator's or the first with versions", () => {
    const opts = characterOptions({ Cartethyia: characters.Cartethyia, Chisa: { buildStatus: "none" }, Ciaccona: { weapon: "WoodlandAria" } }, { Zani: 2 });
    expect(opts.map((o) => o.id)).toEqual(["Cartethyia", "Ciaccona", "Zani"]);
    expect(opts.find((o) => o.id === "Zani")?.versions).toBe(2);
    expect(pickCharacter("Ciaccona", "Cartethyia", opts)).toBe("Ciaccona");
    expect(pickCharacter("Nobody", "Cartethyia", opts)).toBe("Cartethyia");
    expect(pickCharacter(null, "Chisa", opts)).toBe("Zani");
    expect(pickCharacter(null, null, [])).toBeNull();
    // a history under an id this app does not know is not offered (a restore would write a record for them)
    expect(characterOptions({ Cartethyia: characters.Cartethyia }, { Zani: 1, NotInThisApp: 3 }).map((o) => o.id)).toEqual(["Cartethyia", "Zani"]);
  });
});

describe("the Settings-import guard", () => {
  beforeEach(() => {
    localStorage.clear();
    setActivePinia(createPinia());
  });
  afterEach(() => localStorage.clear());

  it("keeps only the characters the import changes, with the echoes they wear", () => {
    const changed = clone(characters.Cartethyia);
    changed.weapons = { [changed.weapon]: { refinement: "5" } };
    const current = { Cartethyia: characters.Cartethyia, Same: { weapon: "x" } };
    expect(pendingFrom(current, { Cartethyia: characters.Cartethyia, Same: { weapon: "x" } }, echoes)).toBeNull();
    const p = pendingFrom(current, { Cartethyia: changed, Same: { weapon: "x" } }, echoes, NOW)!;
    expect(Object.keys(p.characters)).toEqual(["Cartethyia"]);
    expect(p.echoes.map((e) => e.echoId).sort()).toEqual(Object.values(characters.Cartethyia.echoes).map((s: any) => s.echoId).sort());
    // a character the import drops is kept too
    expect(Object.keys(pendingFrom(current, {}, echoes)!.characters).sort()).toEqual(["Cartethyia", "Same"]);
  });

  it("stashes the old builds before hardSetState and turns them into versions", async () => {
    const character = useCharacterStore();
    const inventory = useInventoryStore();
    character.characters = clone({ Cartethyia: characters.Cartethyia });
    inventory.echoes = clone(echoes);
    const stop = installImportGuard({ character: character as never, inventory: inventory as never });
    const incoming = clone(characters.Cartethyia);
    incoming.weapons = { [incoming.weapon]: { refinement: "3" } };
    character.hardSetState({ characters: { Cartethyia: incoming }, activeCharacter: "Cartethyia" });
    // written synchronously, before the import's own write: survives the reload that follows
    expect(localStorage.getItem(PENDING_KEY)).not.toBeNull();
    await flushPendingImport();
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    const [v] = readHistory("Cartethyia");
    expect(v.label).toBe("before-import");
    expect(v.payload.members[0].weapon!.rank).toBe(1);
    expect(v.payload.members[0].echoes.filter(Boolean)).toHaveLength(5);
    expect(localStorage.getItem(`${HISTORY_PREFIX}Cartethyia`)).not.toBeNull();
    // the same import again changes nothing: no new stash
    character.hardSetState({ characters: { Cartethyia: incoming }, activeCharacter: "Cartethyia" });
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
    stop();
  });

  it("flushes a stash left by a reload on the next start, and drops a damaged one", async () => {
    const pending = pendingFrom({ Cartethyia: characters.Cartethyia }, {}, echoes, NOW)!;
    localStorage.setItem(PENDING_KEY, JSON.stringify(pending));
    expect(await flushPendingImport()).toBe(1);
    expect(readHistory("Cartethyia")[0].at).toBe(NOW);
    localStorage.setItem(PENDING_KEY, "{broken");
    expect(await flushPendingImport()).toBe(0);
    expect(localStorage.getItem(PENDING_KEY)).toBeNull();
  });
});
