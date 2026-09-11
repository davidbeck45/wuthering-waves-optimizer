// Wuthering Tools+: Riley31415/wuwa_calc's comparison table hosted at /rankings (src/sim/rankings/).
describe("Team Rankings (wuwa_calc)", () => {
  it("boots the comparison table from the shipped solves inside the app shell", () => {
    cy.visit("/rankings");
    cy.get("[data-test-nav-rankings]").should("have.class", "btn-active");
    cy.get(".skittle-root #app", { timeout: 60000 }).should("exist");
    // shipped solves + engine runs: the overlay hides when the table is drawn
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root #app .tclayout", { timeout: 60000 }).should("exist");
    cy.get(".skittle-root #app .gotodetail", { timeout: 60000 }).should("have.length.greaterThan", 10);
  });

  it("opens a team's rotation detail through the router and comes back", () => {
    cy.visit("/rankings");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root #app .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.location("hash").should("contain", "team=");
    cy.get(".skittle-root #topbar").should("not.have.attr", "hidden");
    cy.get(".skittle-root #app table, .skittle-root #app .log, .skittle-root #app .detail", { timeout: 60000 }).should("exist");
    cy.get("#backLink").click();
    cy.location("hash").should("not.contain", "team=");
    cy.get(".skittle-root #app .tclayout", { timeout: 60000 }).should("exist");
  });

  it("survives leaving and returning to the page", () => {
    cy.visit("/rankings");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-nav-convene]").click();
    cy.location("pathname").should("eq", "/convene");
    cy.get("[data-test-nav-rankings]").click();
    cy.location("pathname").should("eq", "/rankings");
    cy.get(".skittle-root #app .gotodetail", { timeout: 60000 }).should("have.length.greaterThan", 10);
  });
});
