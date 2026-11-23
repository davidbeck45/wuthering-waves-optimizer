// Wuthering Tools+ — Ryan's Recommended teams (lab, #663) on plus (batch 5, lane post-merge). "Use team" with the
// teammates' typical buffs writes a default, not the player's choice: plus's teams keep deriving the team buffs from the
// real builds while the panel reads as Use team left it (src/sim/teamContext/typicalPanel.ts).
import { isTypicalPanel } from "../../src/sim/teamContext/typicalPanel";

/* eslint-disable @typescript-eslint/no-explicit-any */

const panelOf = (win: Cypress.AUTWindow): any => {
  const host = [...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as any;
  return host.__vue_app__.config.globalProperties.$pinia._s.get("character").characters.Carlotta?.teamBuffs;
};

describe("Recommended teams' typical buffs on plus", () => {
  it("are stamped as Use team wrote them, and a buff changed by hand makes the panel the player's", () => {
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("settings", JSON.stringify({ config: {}, labs: { recommendedTeams: { isEnabled: true } } }));
      },
    });
    cy.selectWorkspaceCharacter("Carlotta");
    cy.get('[data-test-calculator-nav="team"]').click();
    cy.get("[data-test-recommended-teams-with-buffs]").check();
    cy.get('[data-test-recommended-teams-use="Shorekeeper+Zhezhi"]').click();
    cy.get('[data-test-team-buffs-buff-enabled="OutroSkillBinaryButterfly"]').should("be.checked");
    cy.window().should((win) => {
      const panel = panelOf(win);
      expect(panel?.plusTypical, "stamped").to.be.a("string");
      expect(isTypicalPanel(panel), "still as Use team wrote it").to.eq(true);
    });
    cy.get('[data-test-team-buffs-buff-enabled="OutroSkillBinaryButterfly"]').uncheck();
    cy.window().should((win) => expect(isTypicalPanel(panelOf(win)), "changed by hand").to.eq(false));
  });

  it("picking the teammates without their buffs is the player's panel, as picking them by hand always was", () => {
    cy.visit("/", {
      onBeforeLoad(win) {
        win.localStorage.setItem("settings", JSON.stringify({ config: {}, labs: { recommendedTeams: { isEnabled: true } } }));
      },
    });
    cy.selectWorkspaceCharacter("Carlotta");
    cy.get('[data-test-calculator-nav="team"]').click();
    cy.get('[data-test-recommended-teams-use="Shorekeeper+Zhezhi"]').click();
    cy.get('[data-test-team-buffs-slot-name="2"]').should("contain.text", "Shorekeeper");
    cy.window().should((win) => expect(isTypicalPanel(panelOf(win))).to.eq(false));
  });
});
