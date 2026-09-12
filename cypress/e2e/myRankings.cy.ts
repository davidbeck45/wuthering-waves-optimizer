// Wuthering Tools+: "My roster rankings" (src/sim/myRankings/) — the app's own
// engine ranks the characters and teams you have set up.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

describe("my roster rankings", () => {
  it("shows the empty state without characters and links both ways with the wuwa_calc page", () => {
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-empty]").should("exist");
    cy.get("[data-test-rankings-switch-calc]").click();
    cy.location("pathname").should("eq", "/rankings");
    cy.get("[data-test-rankings-switch-mine]").click({ force: true });
    cy.location("pathname").should("eq", "/my-rankings");
  });

  it("ranks an imported account's character on her real build", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 120000 }).should("exist");
    cy.get('[data-test-my-rankings-row="Cartethyia"] [data-test-my-rankings-damage]')
      .invoke("text")
      .then((text) => {
        expect(Number(text.replace(/[^0-9]/g, ""))).to.be.greaterThan(100000);
      });
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("contain.text", "S2");
    cy.get("[data-test-my-rankings-no-teams]").should("exist");
  });
});
