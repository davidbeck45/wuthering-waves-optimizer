// The drawer's roster rank: while the roster scores, a rank among the rows done so far would still move, so it says how
// far the scoring got (it read "#1 of 0 scored" until the run ended).
import { describe, expect, it } from "vitest";
import { mount } from "@vue/test-utils";
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
