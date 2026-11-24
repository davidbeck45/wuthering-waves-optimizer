// Wuthering Tools+: a /rankings saved view written before Riley's level-suffixed resonator filters (2026-11-23,
// src/sim/rankings/savedViews.ts). Production saved `r=Cartethyia`; his page now reads that as her at S0 and the
// controller settles it to the tier's level (`r=CartethyiaS6` at S6R5).
describe("wuwa_calc rankings: a view saved before level filters", () => {
  it("opens its teams and still names itself in the Views menu, so it can be forgotten", () => {
    cy.visit("/rankings", {
      onBeforeLoad(win) {
        win.localStorage.setItem("wtplus:rankings:views", JSON.stringify([{ name: "Carte before", hash: "#tc=s6r5&r=Cartethyia" }]));
      },
    });
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-views]").click();
    cy.get('[data-test-rankings-view="Carte before"]').click();
    cy.location("hash", { timeout: 60000 }).should("include", "tc=s6r5").and("include", "r=CartethyiaS6");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)", { timeout: 180000 }).should("have.length", 10);
    cy.get("[data-test-rankings-views-current]").should("have.text", "Carte before");
    cy.get("[data-test-rankings-views]").click();
    cy.get("[data-test-rankings-view-forget]").click();
    cy.get("[data-test-rankings-view]").should("not.exist");
  });
});
