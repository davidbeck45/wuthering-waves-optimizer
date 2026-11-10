// The drawer's roster rank: while the roster scores, a rank among the rows done so far would still move, so it says how
// far the scoring got (it read "#1 of 0 scored" until the run ended).
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { useTeamRotationsStore } from "../../stores/teamRotations";
import AccountCharacterDrawer from "./AccountCharacterDrawer.vue";
import type { RosterCard } from "./accountView";

const card = { id: "Cartethyia", name: "Cartethyia", element: "Aero", rarity: 5, weaponType: "Sword", owned: true, sequence: 0, refinement: 1, weapon: null, echoes: 5, score: null, damage: null, dps: null, damageRank: 2, teams: [] } as unknown as RosterCard;

function rankOf(props: { rosterSize: number; scoring?: boolean; damageRank?: number | null }) {
  const { damageRank = 2, ...rest } = props;
  const w = mount(AccountCharacterDrawer, {
    props: { card: { ...card, damageRank }, items: [], rank: null, owned: [], ...rest },
    global: { stubs: { RouterLink: true, CharacterAvatar: true, WeaponIcon: true, PresetNameLabel: true, MaterialsCostToMax: true } },
  });
  return [w.find("[data-test-account-drawer-rank]").text(), w.find("[data-test-account-drawer-rank-sub]").text()];
}

describe("AccountCharacterDrawer's roster rank", () => {
  it("says how far the scoring got, and shows no rank, while the roster scores", () => {
    expect(rankOf({ rosterSize: 0, scoring: true })).toEqual(["…", "ranking…"]);
    expect(rankOf({ rosterSize: 7, scoring: true })).toEqual(["…", "ranking · 7 scored so far"]);
  });

  it("shows the rank out of the whole roster once it is done", () => {
    expect(rankOf({ rosterSize: 24 })).toEqual(["#2", "of 24 scored"]);
  });

  it("never reads \"of 0 scored\" when nothing was scored", () => {
    expect(rankOf({ rosterSize: 0, damageRank: null })).toEqual(["—", "not scored yet"]);
  });
});

// 2026-11-09 hunt 2, item 6: Chisa's drawer listed "Xuanling · Suisui + Chisa · YOURS · 5.56M" while Teams read 7.66M for
// the same saved team, both pages saying level 100 and 20 % RES. Teams' enemy carries the stacks of the team's wuwa_calc
// run; the drawer says so on that team, and says which enemy every figure here is at.
describe("AccountCharacterDrawer's teams beside Teams' figures", () => {
  const team = (id: string, source: string) => ({ id, name: id, source, characterIds: ["YangyangXuanling", "Suisui", "Chisa"], avgDamage: 5_556_247, dps: null, perSlot: [3, 1, 1], unarmed: [], duplicates: [] });
  function drawer() {
    setActivePinia(createPinia());
    useTeamRotationsStore().teams = [{ id: "mine", name: "Xuanling", characterIds: ["YangyangXuanling", "Suisui", "Chisa"], enemyConfig: { enemyLevel: 100, enemyResist: 0.2, havocBaneStacks: 9, glacioChafeStacks: 13 } }] as never;
    return mount(AccountCharacterDrawer, {
      props: { card: { ...card, id: "Chisa", name: "Chisa", teams: [team("mine", "yours"), team("wuwa_calc:Xuanling", "wuwa_calc")] } as unknown as RosterCard, items: [], rank: null, owned: [], rosterSize: 24 },
      global: { stubs: { RouterLink: true, CharacterAvatar: true, WeaponIcon: true, PresetNameLabel: true, MaterialsCostToMax: true } },
    });
  }

  it("says what Teams' enemy has on the saved team, and nothing on a stock team", () => {
    const w = drawer();
    expect(w.find('[data-test-account-drawer-team-enemy="mine"]').text()).toBe("Teams scores this team at its own enemy (9 Havoc Bane + 13 Glacio Chafe stacks), so it reads a different figure there");
    expect(w.findAll("[data-test-account-drawer-team-enemy]")).toHaveLength(1);
  });

  it("says the enemy every team figure in the drawer is at", () => {
    expect(drawer().find("[data-test-account-drawer-teams-basis]").text()).toBe("Average damage per rotation, every team at one enemy: level 100, 20 % RES, no stacks on it.");
  });
});
