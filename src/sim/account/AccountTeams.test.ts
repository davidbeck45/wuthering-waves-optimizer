// /account's "Teams you can field" beside Teams (2026-11-09 hunt 2, item 6): Xuanling · Suisui + Chisa read 5.56M here
// and 7.66M on Teams, both labelled "level 100, 20 % RES". The difference is the saved team's own enemy (9 Havoc Bane
// and 13 Glacio Chafe stacks, kept from its wuwa_calc run), so the panel says its enemy has no stacks, and the saved
// team's card says what Teams' enemy has.
import { beforeEach, describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import type { TeamRow } from "../myRankings/rows";
import AccountTeams from "./AccountTeams.vue";

const enemy = { enemyLevel: 100, enemyResist: 0.2, enemyType: "Calamity", havocBaneStacks: 0, glacioChafeStacks: 0 };
const row = (id: string, source: TeamRow["source"], avgDamage: number): TeamRow =>
  ({ id, name: `team ${id}`, source, characterIds: ["YangyangXuanling", "Suisui", "Chisa"], avgDamage, dps: null, perSlot: [3, 1, 1], unarmed: [], duplicates: [] }) as unknown as TeamRow;

function panel(teams: TeamRow[]) {
  return mount(AccountTeams, { props: { teams, scoring: false, owned: [] }, global: { stubs: { RouterLink: true, CharacterAvatar: true, PresetNameLabel: true } } });
}

describe("/account's team figures beside Teams'", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    useTeamRotationsStore().teams = [
      { id: "xuanling", name: "Xuanling", characterIds: ["YangyangXuanling", "Suisui", "Chisa"], enemyConfig: { ...enemy, havocBaneStacks: 9, glacioChafeStacks: 13 } },
      { id: "plain", name: "Plain", characterIds: ["YangyangXuanling", "Suisui", "Chisa"], enemyConfig: enemy },
    ] as never;
  });

  it("says the one enemy every team here is scored at, stacks included", () => {
    const w = panel([row("xuanling", "yours", 5_556_247)]);
    expect(w.find("[data-test-account-teams-basis]").text()).toBe("Average damage per rotation, every team at one enemy: level 100, 20 % RES, no stacks on it.");
  });

  it("says on a saved team's card what Teams' enemy has that this one has not", () => {
    const w = panel([row("xuanling", "yours", 5_556_247), row("plain", "yours", 5_000_000), row("wuwa_calc:Xuanling", "wuwa_calc", 4_000_000)]);
    expect(w.find('[data-test-account-team-enemy="xuanling"]').text()).toBe(
      "Teams scores this team at its own enemy (9 Havoc Bane + 13 Glacio Chafe stacks), so it reads a different figure there",
    );
    // a saved team on the rankings' enemy, and a stock team (scored at it on every page), carry no note
    expect(w.find('[data-test-account-team-enemy="plain"]').exists()).toBe(false);
    expect(w.findAll("[data-test-account-team-enemy]")).toHaveLength(1);
  });

  it("an empty panel has no enemy line to explain", () => {
    expect(panel([]).find("[data-test-account-teams-basis]").exists()).toBe(false);
  });
});
