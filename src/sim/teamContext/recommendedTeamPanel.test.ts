// @vitest-environment node
// Wuthering Tools+ — Ryan's Recommended teams (lab, #663) against plus's team buffs (batch 5, lane post-merge).
// "Use team" on the calculator's Team Buffs tab names two teammates in the character's panel and turns on their
// typical buffs. The resolver keeps a panel that names exactly the team's teammates as the player's own, so a saved
// team of those three would stop deriving from the real builds. Synthetic account: Aemeath with Lynae and Mornye.
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

/** lodash's merge, as `setCharacterData` uses it, for plain objects */
function merge(target: any, source: any): any {
  for (const [k, v] of Object.entries(source)) {
    if (v && typeof v === "object" && !Array.isArray(v) && target[k] && typeof target[k] === "object") merge(target[k], v);
    else target[k] = v;
  }
  return target;
}

/* eslint-disable @typescript-eslint/no-explicit-any */

let resolveTeamCharacters: typeof import("./resolveTeam").resolveTeamCharacters;
let calcTeamRotationDamage: typeof import("../../calculator/teamRotation").calcTeamRotationDamage;
let statScaledKit: typeof import("../optimizer/testFixture").statScaledKit;
let buildRecommendedTeamBuffs: typeof import("../../buffs/recommendedTeamBuffs").buildRecommendedTeamBuffs;
let allCharactersList: any[];
let markTypicalPanel: typeof import("./typicalPanel").markTypicalPanel;

beforeAll(async () => {
  vi.stubGlobal("localStorage", { getItem: () => null, setItem: () => {}, removeItem: () => {} });
  vi.stubGlobal("window", { addEventListener() {} });
  ({ resolveTeamCharacters } = await import("./resolveTeam"));
  ({ calcTeamRotationDamage } = await import("../../calculator/teamRotation"));
  ({ statScaledKit } = await import("../optimizer/testFixture"));
  ({ buildRecommendedTeamBuffs } = await import("../../buffs/recommendedTeamBuffs"));
  ({ allCharactersList } = (await import("../../characters/characters")) as any);
  ({ markTypicalPanel } = await import("./typicalPanel"));
}, 60_000);

afterAll(() => vi.unstubAllGlobals());

const enemyConfig = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" };
const MEMBERS = ["Aemeath", "Lynae", "Mornye"];

async function account(): Promise<{ characters: Record<string, any>; team: any }> {
  const kits = await Promise.all(MEMBERS.map((id) => statScaledKit(id)));
  const characters = Object.fromEntries(MEMBERS.map((id, i) => [id, { ...kits[i]!.data, teamBuffs: { selectedCharacter1: null, selectedCharacter2: null, buffs: {} } }]));
  const actions = kits.flatMap((kit, slot) => kit.actions.map((a, i) => ({ ...a, id: `${slot}-${i}`, slot, order: slot * 100 + i })));
  return { characters, team: { name: "Aemeath + Lynae + Mornye", characterIds: MEMBERS, buildIds: [null, null, null], actions, duration: 25, enemyConfig } };
}

async function figure(team: any, characters: Record<string, any>): Promise<{ total: number; aemeath: string }> {
  const resolved = await resolveTeamCharacters(team, characters, [], { auto: true });
  const result = await calcTeamRotationDamage({ name: team.name, characterIds: team.characterIds, buildIds: team.buildIds, actions: team.actions, duration: team.duration }, resolved.characters, enemyConfig, []);
  return { total: result.total.avgDamage ?? 0, aemeath: resolved.slots[0]!.buffSource };
}

/** What `useRecommendedTeam` in Ryan's CalculatorTeamBuffsWorkspace.vue does, with "Also turn on their buffs". */
function useRecommendedTeam(characters: Record<string, any>, character: string, first: string, second: string, mark: boolean): void {
  const elementOf = (key: string) => allCharactersList.find((c: any) => c.key === key)?.element ?? "";
  merge(characters[character], { teamBuffs: { selectedCharacter1: first } });
  merge(characters[character], { teamBuffs: { selectedCharacter2: second } });
  const buffs = buildRecommendedTeamBuffs({
    teammates: [first, second].map((key) => ({ key, copy: { sequence: 0, signature: false } })),
    teamElements: [character, first, second].map(elementOf),
    existing: characters[character].teamBuffs.buffs ?? {},
    mode: "replace",
  });
  merge(characters[character], { teamBuffs: { buffs } });
  if (mark) markTypicalPanel(characters[character]);
}

describe("Recommended teams' typical buffs on a saved team", () => {
  it("measures the team's figure before and after Use team, and keeps deriving from the real builds", async () => {
    const { characters, team } = await account();
    const before = await figure(team, characters);
    expect(before.aemeath).toBe("derived");

    // his code alone: the panel names Lynae and Mornye, so plus keeps it as the player's own
    const unmarked = JSON.parse(JSON.stringify(characters));
    useRecommendedTeam(unmarked, "Aemeath", "Lynae", "Mornye", false);
    const his = await figure(team, unmarked);
    expect(his.aemeath).toBe("panel");
    console.log(`[recommended] before ${before.total.toFixed(0)} · his panel kept ${his.total.toFixed(0)} (${((his.total / before.total - 1) * 100).toFixed(1)} %)`);

    // with plus's one-line mark, the panel his typical buffs wrote is a default: the team still derives
    useRecommendedTeam(characters, "Aemeath", "Lynae", "Mornye", true);
    const after = await figure(team, characters);
    expect(after.aemeath).toBe("derived");
    expect(after.total).toBeCloseTo(before.total, 6);

    // a buff changed by hand afterwards makes it the player's panel again
    const key = Object.keys(characters.Aemeath.teamBuffs.buffs).find((k) => characters.Aemeath.teamBuffs.buffs[k].isEnabled)!;
    expect(key).toBeTruthy();
    characters.Aemeath.teamBuffs.buffs[key].isEnabled = false;
    expect((await figure(team, characters)).aemeath).toBe("panel");
  }, 60_000);

  it("a panel marked for another pair of teammates is the player's when they are picked by hand", async () => {
    const { characters, team } = await account();
    useRecommendedTeam(characters, "Aemeath", "Denia", "Mornye", true);
    merge(characters.Aemeath, { teamBuffs: { selectedCharacter1: "Lynae" } }); // by hand, buffs left as they were
    expect((await figure(team, characters)).aemeath).toBe("panel");
  }, 60_000);
});
