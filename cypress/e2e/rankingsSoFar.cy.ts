import { configOptimizer } from "./calculator/data/Cartethyia/data";
// Wuthering Tools+ speed pass (2026-11-02): at My account /rankings solves the roster in its own workers (nothing is
// shipped for an account). The rows solved so far are drawn while the rest are solved (src/sim/rankings/controller.ts
// `paintSoFar`, timing in soFar.ts), instead of the table waiting for the last team under the full-screen overlay.
// Cartethyia's ten teams with "Teams I can field" lifted: more teams than one round of solver workers on any machine
// (one worker on CI's 2-core runner, eight here), so a partial paint always happens before the whole table.
describe("wuwa_calc rankings: rows so far at My account (Wuthering Tools+)", () => {
  it("draws the first rows while the rest still solve, says so, then draws the whole table", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    // first rows inside a budget CI's runner meets, before the solve is over: checked in one look at the page, since the
    // whole table can replace them a second later
    cy.get(".skittle-root", { timeout: 90000 }).should(($root) => {
      expect($root.hasClass("wt-sofar"), "rows so far on screen").to.eq(true);
      const rows = $root.find(".tgrid .trow[data-total]").length;
      expect(rows, "rows drawn so far").to.be.within(1, 9);
      expect($root.find("#teamCount").text(), "his heading").to.match(/\d+ teams so far/);
      // the overlay is up, docked: it names the solve and what the list is
      expect($root.find("#loading").attr("hidden"), "docked box shown").to.eq(undefined);
      expect($root.find("#loading .status-text").text()).to.eq("Solving teams at your account");
      expect($root.find("#loading .progress-count").text()).to.match(/^\d+ of 10$/);
      expect($root.find("#loading .wt-sofar-note").text()).to.contain("so far");
    });
    // the table under it stays usable: a row's figure is a real number
    cy.get(".skittle-root .tgrid .trow[data-total]").first().invoke("attr", "data-total").then(Number).should("be.greaterThan", 0);
    // then the whole table: ten rows, the box gone, the heading plain again
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root").should("not.have.class", "wt-sofar");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)").should("have.length", 10);
    cy.get(".skittle-root #teamCount").should("contain.text", "10 teams").and("not.contain.text", "so far");
  });

  it("opens a team from the rows so far and Back returns to My account while the rest still solve", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    // his "view rotation" and Back link were wired only after the first pass: mid-solve the first did nothing and the
    // second followed its "#" and landed on his S0R1 tier (verify1)
    cy.get(".skittle-root.wt-sofar .gotodetail[data-team]", { timeout: 90000 }).first().click();
    cy.get(".skittle-root.wt-detail", { timeout: 30000 }).should("exist");
    cy.location("hash").should("include", "team=").and("include", "tc=mine");
    // the docked box is about the list: it does not sit over his detail page
    cy.get(".skittle-root #loading").should("not.be.visible");
    cy.get(".skittle-root #backLink").click();
    cy.location("hash").should("include", "tc=mine").and("not.include", "team=");
    cy.get(".skittle-root").should("not.have.class", "wt-detail");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)").should("have.length", 10);
    cy.get(".skittle-root #teamCount").should("contain.text", "10 teams");
  });

  it("a tier picked while My account is still solving shows that tier, not the account's answers", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    cy.get(".skittle-root.wt-sofar", { timeout: 90000 }).should("exist");
    // Riley's tiers from the account bar, mid-solve: the shipped S0R1 solves draw, and the My account answers still
    // coming back are filed under My account (they used to land under whatever tier was on screen)
    cy.get("[data-test-rankings-riley]").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "tc=mine");
    cy.get(".skittle-root #cost", { timeout: 60000 }).should("have.value", "s0r1");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root").should("not.have.class", "wt-sofar");
    // at S0R1 every member runs S0R1 — her S2 from the account never shows here
    cy.get(".skittle-root .tgrid", { timeout: 60000 }).should("contain.text", "Cartethyia").and("not.contain.text", "Cartethyia S2R1");
  });
});
