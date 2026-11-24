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

describe("Roster value: ticks naming a resonator his roster no longer has (second check)", () => {
  it("a name his engine dropped is not counted: ticks equal to the account read as the account's, with no button", () => {
    cy.viewport(1280, 900);
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/roster-value");
    rileyLoaded();
    cy.window().then((win) => {
      const account = JSON.parse(win.localStorage.getItem("wtplus:rosterValue.applied")!) as string[];
      expect(account).to.include("Cartethyia");
      // ticks kept by his own site or an older backup, with a name his roster has since dropped (no record of plus writing them)
      win.localStorage.setItem("wuwa.owned.v1", JSON.stringify([...account, "Nobody"]));
      win.localStorage.removeItem("wtplus:rosterValue.applied");
    });
    cy.reload();
    rileyLoaded();
    cy.get(".wt-riley-value input[data-name='Nobody']").should("not.exist");
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Ticked from your account").and("not.contain.text", "different");
    cy.get("[data-test-riley-owned-use-account]").should("not.exist");
    // and plus wrote the same names on record: the next account change is followed, and no "removed Nobody" is ever said
    cy.window().then((win) => {
      win.localStorage.setItem("wuwa.owned.v1", JSON.stringify([...JSON.parse(win.localStorage.getItem("wuwa.owned.v1")!), "Nobody"]));
      win.localStorage.setItem("wtplus:rosterValue.applied", win.localStorage.getItem("wuwa.owned.v1")!);
    });
    cy.reload();
    rileyLoaded();
    cy.get("[data-test-riley-owned-line]").should("contain.text", "Ticked from your account").and("not.contain.text", "Nobody");
  });
});
