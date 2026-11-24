// Wuthering Tools+ (batch 5, 2026-11-23, lane check-pages): the second check of Tier list and Roster value
// (src/sim/rileyPages/) living beside /rankings. Each test here was red before the fix it names.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

type RouterHost = { __vue_app__: { config: { globalProperties: { $router: { push: (to: string) => Promise<unknown> } } } } };
/** In-app navigation, as a menu link or a RouterLink does it (no page load). */
function push(to: string): void {
  cy.window().then((win) => {
    const host = [...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as unknown as RouterHost;
    return host.__vue_app__.config.globalProperties.$router.push(to);
  });
}
const rileyLoaded = () => cy.get(".wt-riley-pages #loading", { timeout: 180000 }).should("have.attr", "hidden");

describe("Tier list and Roster value beside /rankings (second check)", () => {
  it("Tier list opened first: /rankings at My account still says how many teams are solved so far", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/tier-list");
    rileyLoaded();
    cy.window().then((win) => { (win as unknown as { wtMarker: number }).wtMarker = 11; });
    push("/rankings#tc=mine&own=0&r=Cartethyia");
    // the same look as rankingsSoFar.cy.ts: the docked box names the solve and counts it while rows are on screen
    cy.get(".skittle-root:not(.wt-riley-pages)", { timeout: 90000 }).should(($root) => {
      expect($root.hasClass("wt-sofar"), "rows so far on screen").to.eq(true);
      expect($root.find("#loading .status-text").text()).to.eq("Solving teams at your account");
      expect($root.find("#loading .progress-count").text()).to.match(/^\d+ of 10$/);
      expect($root.find("#loading .wt-sofar-note").text()).to.contain("so far");
    });
    cy.get(".skittle-root:not(.wt-riley-pages) #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.window().its("wtMarker").should("eq", 11);
  });
});
