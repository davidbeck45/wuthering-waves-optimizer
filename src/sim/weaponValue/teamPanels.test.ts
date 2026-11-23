// Wuthering Tools+ — /weapons' and /account's what-ifs follow a teammate's Team Buffs panel only where resolveTeam keeps
// it as the player's own. A panel Recommended teams' "Use team" wrote (stamped, typicalPanel.ts) is a default that
// resolveTeam derives over (batch 5): taken here as "set by hand", the what-if edited it, which broke the stamp, so the
// what-if's team read the typical buffs verbatim against a base that derives, and the page said the panel was set by hand.
import { describe, expect, it } from "vitest";
import { markTypicalPanel } from "../teamContext/typicalPanel";
import { keptPanelMembers, panelsFollowWeapon, weaponTeamBuffKeys } from "./teamPanels";

/* eslint-disable @typescript-eslint/no-explicit-any */

const team = { characterIds: ["Cartethyia", "Ciaccona", "Chisa"] };
const kumokiri = weaponTeamBuffKeys("Kumokiri");
const enemy = { enemyLevel: 90, enemyResist: 0.1, enemyType: "Calamity" } as any;

function account(stamped: boolean): Record<string, any> {
  const cartethyia: Record<string, any> = {
    weapon: "DefiersThorn",
    teamBuffs: { selectedCharacter1: "Ciaccona", selectedCharacter2: "Chisa", buffs: Object.fromEntries(kumokiri.map((k) => [k, { isEnabled: true, refinement: "1" }])) },
  };
  if (stamped) markTypicalPanel(cartethyia);
  return { Cartethyia: cartethyia, Ciaccona: { weapon: "Cadenza" }, Chisa: { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "1" } } } };
}

describe("a teammate's panel in a weapon what-if", () => {
  it("follows a panel the player set for this team", async () => {
    expect(kumokiri.length).toBeGreaterThan(0);
    const before = account(false);
    expect(keptPanelMembers(team, before)).toEqual(["Cartethyia"]);
    const step = await panelsFollowWeapon(team, before, { ...before, Chisa: { ...before.Chisa, weapons: { Kumokiri: { refinement: "4" } } } }, "Chisa", [], enemy);
    expect(step.adjusted.map((a) => a.member)).toEqual(["Cartethyia"]);
  });

  it("leaves alone a panel Recommended teams wrote and nobody changed: resolveTeam derives that member's buffs", async () => {
    const before = account(true);
    expect(keptPanelMembers(team, before)).toEqual([]);
    const hypo = { ...before, Chisa: { ...before.Chisa, weapons: { Kumokiri: { refinement: "4" } } } };
    const step = await panelsFollowWeapon(team, before, hypo, "Chisa", [], enemy);
    expect(step.adjusted).toEqual([]);
    expect(step.characters).toBe(hypo);
  });
});
