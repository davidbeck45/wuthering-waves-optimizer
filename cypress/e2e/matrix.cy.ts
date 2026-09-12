// Wuthering Tools+: the Endstate Matrix planner (src/sim/matrix/) — roster from an imported account,
// extras ticked by hand, teams scored by Riley's engine in workers, a plan, saved.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

describe("endstate matrix planner", () => {
  it("shows the phase, takes the roster and ticked extras, scores with the engine and keeps a saved plan", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/matrix");
    cy.get("[data-test-matrix-bosses] li").should("have.length", 5);
    cy.get('[data-test-matrix-roster-row="Cartethyia"]').should("contain.text", "S2");
    cy.get("[data-test-matrix-dps-floor]").clear();
    cy.get("[data-test-matrix-dps-floor]").type("0");
    cy.get("[data-test-matrix-extra-filter]").type("Aero Rover");
    cy.get('[data-test-matrix-extra="Aero Rover"]', { timeout: 60000 }).check({ force: true });
    cy.get("[data-test-matrix-extra-filter]").clear();
    cy.get("[data-test-matrix-extra-filter]").type("Sanhua");
    cy.get('[data-test-matrix-extra="Sanhua"]').check({ force: true });
    cy.get('[data-test-matrix-roster-row="Aero Rover"]').should("exist");
    cy.get("[data-test-matrix-score]").click();
    cy.get("[data-test-matrix-plan-count]", { timeout: 240000 }).should("contain.text", "1 team");
    cy.get('[data-test-matrix-plan-team="Cartethyia"]').should("contain.text", "Cartethyia").and("contain.text", "s2r1mdps");
    cy.get("[data-test-matrix-save-name]").type("smoke");
    cy.get("[data-test-matrix-save]").click();
    cy.get("[data-test-matrix-saved-plan]").should("have.length", 1).and("contain.text", "smoke");
    cy.reload();
    cy.get("[data-test-matrix-saved-plan]", { timeout: 60000 }).should("have.length", 1);
    cy.get('[data-test-matrix-roster-row="Sanhua"]').should("exist"); // ticked extras persist
  });
});
