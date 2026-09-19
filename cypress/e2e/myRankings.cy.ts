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

    // what if: the same rotation at S6 with the weapon at R5
    cy.get('[data-test-my-rankings-whatif="Cartethyia"]').click({ force: true });
    cy.get('[data-test-my-rankings-whatif-panel="Cartethyia"]').should("exist");
    cy.get("[data-test-my-rankings-whatif-sequence]").select("6");
    cy.get("[data-test-my-rankings-whatif-refinement]").select("5");
    cy.get("[data-test-my-rankings-whatif-run]").click({ force: true });
    cy.get("[data-test-my-rankings-whatif-result]", { timeout: 120000 })
      .should("contain.text", "S6")
      .and("contain.text", "R5")
      .and("contain.text", "%")
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/\+\d+\.\d%/); // S6 + R5 beats S2 + R1 on her build
      });

    // substat weights: one more roll of each substat on her build — crit moves an HP scaler, ATK does not
    cy.get('[data-test-my-rankings-substats="Cartethyia"]').click({ force: true });
    cy.get('[data-test-my-rankings-substats-panel="Cartethyia"]').should("exist");
    cy.get("[data-test-my-rankings-substats-result]", { timeout: 120000 }).should("exist");
    cy.get('[data-test-my-rankings-substat="CritRate"]')
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/\+\d+\.\d%/);
      });
    cy.get('[data-test-my-rankings-substat="ATK"]').should("contain.text", "+0.0%");
    // the median tier and one tier step ride along: a real tier and a two-decimal gain on a stat that moves her
    cy.get('[data-test-my-rankings-substat-median="CritRate"]').should("contain.text", "+7.5%");
    cy.get('[data-test-my-rankings-substat-step="CritRate"]')
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/\+0\.6% → \+\d+\.\d\d%/);
      });
    cy.get("[data-test-my-rankings-substats-help] summary").should("contain.text", "How to read");
    cy.get("[data-test-my-rankings-substats-echoes] .badge").should("have.length", 5);
    cy.get('[data-test-my-rankings-substats="Cartethyia"]').click({ force: true });
    cy.get('[data-test-my-rankings-substats-panel="Cartethyia"]').should("not.exist");
  });
});
