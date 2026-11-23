// Wuthering Tools+ — "Use their real buffs" on the calculator's Team Buffs screen (batch 5, lane real-panel;
// src/sim/teamContext/RealTeamBuffsCard.vue, realPanel.ts). A synthetic account: Iuno (a 5-star support whose Sequence
// Node 2 is a team buff) at S0 and then S2, Shorekeeper with her weapon, main echo and five pieces of her set, and a
// saved team of Carlotta with the two.
import { configOptimizer } from "./calculator/data/Augusta/data";

/* eslint-disable @typescript-eslint/no-explicit-any */

const S2_BUFF = "SequenceNode2DayorNightLetThisBeEternal";
const IUNO_OUTRO = "OutroSkillFromGloomtoGleam";

const echo = (set: string, i: number) => ({ echoId: `${set}-${i}`, echo: "Hurriclaw", echoSet: set, type: 3, rank: 5, stat: "ATK" });
const fiveOf = (set: string) => Object.fromEntries([0, 1, 2, 3, 4].map((i) => [i, echo(set, i)]));
const iuno = (s2: boolean) => ({
  weapon: "Stringmaster",
  resonanceChains: { SequenceNode1: { isEnabled: s2 }, [S2_BUFF]: { isEnabled: s2 } },
  teamBuffs: { selectedCharacter1: null, selectedCharacter2: null, buffs: {} },
});
const shorekeeper = {
  weapon: "StellarSymphony",
  weapons: { StellarSymphony: { refinement: "5" } },
  mainEcho: { echo: "FallacyOfNoReturn", rank: 5 },
  echoes: fiveOf("RejuvenatingGlow"),
  teamBuffs: { selectedCharacter1: null, selectedCharacter2: null, buffs: {} },
};

const pinia = (win: Cypress.AUTWindow): any => {
  const host = [...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as any;
  return host.__vue_app__.config.globalProperties.$pinia;
};
const store = (win: Cypress.AUTWindow, id: string): any => pinia(win)._s.get(id);

function seedTeammates(s2: boolean) {
  cy.window().then((win) => {
    const characters = store(win, "character");
    characters.characters.Iuno = iuno(s2);
    characters.characters.Shorekeeper = structuredClone(shorekeeper);
  });
}

describe("Team buffs from your own builds", () => {
  it("offers a saved team, fills its real buffs, says why, follows a teammate's change and names a change by hand", () => {
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("settings", JSON.stringify({ config: {}, labs: {} }));
      },
    });
    cy.selectWorkspaceCharacter("Carlotta");
    seedTeammates(false);
    cy.window().then((win) => {
      store(win, "character").clearAllTeamBuffs("Carlotta");
      store(win, "teamRotations").teams.push({ id: "wtp-test-team", name: "Carlotta core", characterIds: ["Carlotta", "Iuno", "Shorekeeper"], buildIds: [null, null, null], actions: [] });
    });
    cy.get('[data-test-calculator-nav="team"]').click();

    // no teammates picked: the saved team is the one-tap choice
    cy.get("[data-test-real-panel-team]").should("have.length", 1).and("contain.text", "Iuno + Shorekeeper").click();
    cy.get('[data-test-team-buffs-slot-name="1"]').should("contain.text", "Iuno");
    cy.get('[data-test-team-buffs-slot-name="2"]').should("contain.text", "Shorekeeper");
    cy.get('[data-test-real-panel-status="match"]').should("contain.text", "what your own builds of Iuno and Shorekeeper give");

    // Iuno is S0: her S2 buff stays off and the list says why; her Outro and Shorekeeper's gear are on
    cy.get(`[data-test-team-buffs-buff-enabled="${S2_BUFF}"]`).should("not.be.checked");
    cy.get(`[data-test-team-buffs-buff-enabled="${IUNO_OUTRO}"]`).should("be.checked");
    cy.get("[data-test-real-panel-why]").click();
    cy.get("[data-test-real-panel-off]").should("contain.text", "Off: your Iuno is S0; it needs S2.");
    cy.get("[data-test-real-panel-on]").should("contain.text", "Shorekeeper holds Stellar Symphony at Rank 5");
    cy.get("[data-test-real-panel-on]").should("contain.text", "Shorekeeper wears 5 pieces of Rejuvenating Glow");

    // Iuno reaches S2: the panel is not rewritten behind the player's back; the card says so and Refresh fills it
    seedTeammates(true);
    cy.get('[data-test-real-panel-status="drift"]').should("contain.text", "Your Iuno changed since these buffs were filled");
    cy.get(`[data-test-team-buffs-buff-enabled="${S2_BUFF}"]`).should("not.be.checked");
    cy.get("[data-test-real-panel-use]").should("contain.text", "Refresh").click();
    cy.get(`[data-test-team-buffs-buff-enabled="${S2_BUFF}"]`).should("be.checked");
    cy.get('[data-test-real-panel-status="match"]').should("exist");
    cy.window().its("localStorage").invoke("getItem", "character").should("contain", '"plusTypicalSource":"builds"');

    // a change by hand is the player's: kept, and named
    cy.get(`[data-test-team-buffs-buff-enabled="${IUNO_OUTRO}"]`).uncheck({ force: true });
    cy.get('[data-test-real-panel-status="differs"]').should("contain.text", "1 buff here is not what your own builds of Iuno and Shorekeeper give");
    cy.get(`[data-test-team-buffs-buff-enabled="${IUNO_OUTRO}"]`).should("not.be.checked");
    cy.get("[data-test-real-panel-differences]").should("contain.text", "here: off · your builds: on");
    cy.get("[data-test-real-panel-use]").should("contain.text", "Use their real buffs");
  });

  it("flags optimizer results that ran on the old panel (Ryan's #706 alert)", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.get("[data-test-nav-calculator]").click();
    cy.get(".character__selection.Augusta").should("be.visible");
    cy.get("[data-test-options-menu]").click();
    cy.get("[data-test-options-settings]").click();
    cy.get("[data-test-use-classic-ui]").uncheck();
    cy.get("[data-test-nav-calculator]").click();
    cy.get('[data-test-workspace-avatar="Augusta"]').should("exist");

    seedTeammates(true);
    cy.window().then((win) => {
      store(win, "character").setCharacterData("Augusta", { teamBuffs: { selectedCharacter1: "Iuno", selectedCharacter2: "Shorekeeper" } });
    });
    cy.get('[data-test-calculator-nav="optimizer"]').click();
    cy.get("[data-test-optimizer-workspace]").should("be.visible");
    cy.wait(300);
    cy.get("[data-test-optimizer-workspace-optimize-btn]").click();
    cy.get('[data-test-optimizer-workspace-leaderboard-row="0"]').should("exist");
    cy.get("[data-test-optimizer-stale-alert]").should("not.exist");

    cy.get('[data-test-calculator-nav="team"]').click();
    cy.get("[data-test-real-panel-use]").should("contain.text", "Use their real buffs").click();
    cy.get('[data-test-real-panel-status="match"]').should("exist");
    cy.get('[data-test-calculator-nav="optimizer"]').click();
    cy.get("[data-test-optimizer-stale-alert]").should("be.visible");
  });
});
