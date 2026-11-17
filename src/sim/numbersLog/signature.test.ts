// Wuthering Tools+ numbers log — the build signature: each part moves with the fields the engine reads for it and
// with nothing else. Synthetic account (testAccount.ts).
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { buildSignature, echoIndex, teamDefinitionHash } from "./entry";
import { changedParts, onlyASavedBuildChanged, type BuildSig } from "./signature";
import { account } from "./testAccount";

const sigOf = (acc: ReturnType<typeof account>, id = "Aaa"): BuildSig => buildSignature(acc.characters[id], echoIndex(acc.echoes));
const base = sigOf(account());
function after(edit: (acc: ReturnType<typeof account>) => void): BuildSig {
  const acc = account();
  edit(acc);
  return sigOf(acc);
}

describe("a build's signature", () => {
  it("reads the weapon, its refinement and the sequence in plain values", () => {
    expect(base).toMatchObject({ weapon: "SwordOne", refinement: 1, sequence: 2 });
    for (const part of [base.hw, base.hs, base.hl, base.he, base.ho, base.rec]) expect(part).toMatch(/^[0-9a-z]{8}$/);
    expect(sigOf(account())).toEqual(base); // the same account, the same signature
    expect(buildSignature(undefined, new Map())).toMatchObject({ weapon: null, refinement: 1, sequence: 0 });
  });

  it("moves one part for one kind of change", () => {
    expect(changedParts(base, after((a) => (a.characters.Aaa.weapon = "SwordTwo")))).toEqual(["weapon"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.weapons.SwordOne.refinement = "3")))).toEqual(["refinement"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.weapons.SwordOne.weaponLevel = "70")))).toEqual(["weapon-settings"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.weaponPassives.SwordOnePassive.isEnabled = false)))).toEqual(["weapon-settings"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.resonanceChains.SequenceNode3Third.isEnabled = true)))).toEqual(["sequence"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.resonanceChains.SequenceNode2Second.stacks = 2)))).toEqual(["chain"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.characterLevel = "80")))).toEqual(["levels"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.talents.skill = 6)))).toEqual(["levels"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.mainEcho.rank = 4)))).toEqual(["echoes"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.echoes[1] = { echoId: "e9" })))).toEqual(["echoes"]);
    expect(changedParts(base, after((a) => (a.characters.Aaa.buffs.OwnBuff.isEnabled = false)))).toEqual(["other"]);
    expect(changedParts(base, after((a) => a.characters.Aaa.rotations.push({ name: "mine", actions: [{ id: "x" }] })))).toEqual(["other"]);
  });

  it("sees an echo changed in the inventory under the same id, and not the same echo under a new id", () => {
    expect(changedParts(base, after((a) => (a.echoes[1].echoSubStatsValue1 = 10.5)))).toEqual(["echoes"]);
    const reimported = after((a) => {
      a.echoes[0].echoId = "new-1";
      a.echoes[1].echoId = "new-2";
      a.characters.Aaa.echoes = { 0: { echoId: "new-1" }, 1: { echoId: "new-2" } };
      a.characters.Aaa.builds[0].echoes = { 0: { echoId: "new-1" } };
    });
    expect(changedParts(base, reimported)).toEqual([]);
  });

  it("does not move for an echo she does not wear, another weapon's level, or bookkeeping", () => {
    const quiet: Array<(a: ReturnType<typeof account>) => void> = [
      (a) => (a.echoes[4].stat = "HP"), // e9, in the bag
      (a) => (a.characters.Aaa.weapons.SwordTwo.refinement = "5"), // not the one equipped
      (a) => (a.characters.Aaa.builds[0].updatedAt = 12345),
      (a) => (a.characters.Aaa.notes = "note to self"),
      (a) => (a.characters.Aaa.buildStatus = "wip"),
      (a) => (a.characters.Aaa.optimizer = { mainEchoes: ["BigEcho"], minStats: [{ stat: "ER", value: 120 }] }),
      (a) => (a.characters.Bbb.weapon = "GunTwo"), // someone else
    ];
    for (const edit of quiet) {
      const sig = after(edit);
      expect(changedParts(base, sig), edit.toString()).toEqual([]);
    }
    // of those, only the unequipped weapon's settings are part of the whole record (a pinned build may wield it)
    expect(after(quiet[2]).rec).toBe(base.rec);
    expect(after(quiet[3]).rec).toBe(base.rec);
    expect(after(quiet[5]).rec).toBe(base.rec);
  });

  it("keeps an optimizer setting the engine does read", () => {
    expect(changedParts(base, after((a) => (a.characters.Aaa.optimizer = { echoSetPassives: { SetA: { isEnabled: true } } })))).toEqual(["other"]);
  });

  it("marks a saved build that is not worn through the whole-record hash only", () => {
    const spare = after((a) => (a.echoes[2].echoSubStatsValue1 = 12)); // e3: the other build's echo
    expect(changedParts(base, spare)).toEqual([]);
    expect(spare.rec).not.toBe(base.rec);
    expect(onlyASavedBuildChanged(base, spare)).toBe(true);
    expect(onlyASavedBuildChanged(base, base)).toBe(false);
    expect(onlyASavedBuildChanged(base, after((a) => (a.characters.Aaa.weapon = "SwordTwo")))).toBe(false);
  });
});

describe("a saved team as defined", () => {
  const team = () => account().teams[0];

  it("moves with the members, the pins, the rotation and its timing", () => {
    const hash = teamDefinitionHash(team());
    expect(hash).toMatch(/^[0-9a-z]{8}$/);
    expect(teamDefinitionHash(team())).toBe(hash);
    expect(teamDefinitionHash({ ...team(), characterIds: ["Aaa", "Ccc", "Bbb"] })).not.toBe(hash);
    expect(teamDefinitionHash({ ...team(), buildIds: ["b2", null, null] })).not.toBe(hash);
    expect(teamDefinitionHash({ ...team(), actions: [] })).not.toBe(hash);
    expect(teamDefinitionHash({ ...team(), duration: 21 })).not.toBe(hash);
    expect(teamDefinitionHash({ ...team(), handoffs: { Aaa: ["Bbb"] } })).not.toBe(hash);
  });

  it("does not move with its name, its notes or its own enemy, which the ranking does not read", () => {
    const hash = teamDefinitionHash(team());
    expect(teamDefinitionHash({ ...team(), name: "Renamed", description: "words", enemyConfig: { enemyLevel: 120 } })).toBe(hash);
    expect(teamDefinitionHash(null)).toBe("");
  });
});

describe("the pages that show the log", () => {
  // /whats-new and /account's card load these. One static import of the ranking engine (or of the recorder, which
  // reads it) from any of them would put the whole calculator behind a page that only reads a small log.
  const PAGE_SIDE = ["signature.ts", "log.ts", "compare.ts", "view.ts", "logStore.ts", "importStamp.ts", "useNumbersLog.ts", "NumbersMoved.vue", "NumbersMoveRow.vue", "NumbersMovedCard.vue"];
  const HEAVY = /from "(\.\.\/myRankings\/rankRoster|\.\/entry|\.\/recordRanking)"/;
  const here = dirname(fileURLToPath(import.meta.url));

  it("import the engine and the recorder as types only", () => {
    for (const file of PAGE_SIDE) {
      const imports = readFileSync(resolve(here, file), "utf8").split("\n").filter((line) => /^\s*import\b/.test(line) && HEAVY.test(line));
      expect(imports.filter((line) => !/^\s*import type\b/.test(line)), file).toEqual([]);
    }
    // and the guard can see one: the recorder's side does import it
    expect(readFileSync(resolve(here, "entry.ts"), "utf8")).toMatch(/import \{[^}]*\} from "\.\.\/myRankings\/rankRoster"/);
  });
});
