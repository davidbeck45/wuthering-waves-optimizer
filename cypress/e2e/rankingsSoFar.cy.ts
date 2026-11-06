import { configOptimizer } from "./calculator/data/Cartethyia/data";
// Wuthering Tools+ speed pass (2026-11-02): at My account /rankings solves the roster in its own workers (nothing is
// shipped for an account). The rows solved so far are drawn while the rest are solved (src/sim/rankings/controller.ts
// `paintSoFar`, timing in soFar.ts), instead of the table waiting for the last team under the full-screen overlay.
// Cartethyia's ten teams with "Teams I can field" lifted: more teams than one round of solver workers on any machine
// (one worker on CI's 2-core runner, eight here), so a partial paint always happens before the whole table.
/** A chain turned off on another page: Cartethyia goes from S2 to S1, which moves the account key. */
function dropHerSequence2(win: Cypress.AUTWindow): void {
  const host = [...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { characters: Record<string, { resonanceChains: Record<string, { isEnabled: boolean }> }> }> } } } } };
  const store = host.__vue_app__.config.globalProperties.$pinia._s.get("character")!;
  store.characters.Cartethyia!.resonanceChains.SequenceNode2BladeBrokenbyTempest!.isEnabled = false;
}

describe("wuwa_calc rankings: rows so far at My account (Wuthering Tools+)", () => {
  it("a solver worker that will not load: the tab reloads once, then the table is solved here instead of sitting at 0 for good", () => {
    cy.intercept("**/src/sim/rankings/solver.worker.ts*", { forceNetworkError: true });
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    cy.window().then((win) => {
      (win as unknown as { __sameTab: boolean }).__sameTab = true;
    });
    cy.window({ timeout: 60000 }).should((win) => expect((win as unknown as { __sameTab?: boolean }).__sameTab, "the page was reloaded").to.eq(undefined));
    cy.get(".skittle-root #loading", { timeout: 240000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)").should("have.length", 10);
    cy.get(".skittle-root .tgrid .trow[data-total]").first().invoke("attr", "data-total").then(Number).should("be.greaterThan", 0);
  });

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

  it("a team opened from the rows so far keeps its place when the solve ends, and Back shows the whole table", () => {
    cy.viewport(412, 915);
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia", {
      onBeforeLoad(win) {
        // the solve holds on while the page is scrolled: on a fast machine ten teams would be done before the first scroll
        const Real = win.Worker;
        const Slow = function (this: Worker, ...args: ConstructorParameters<typeof Worker>) {
          const worker = new Real(...args);
          const post = worker.postMessage.bind(worker) as (...a: unknown[]) => void;
          worker.postMessage = (...a: unknown[]) => void setTimeout(() => post(...a), 700);
          return worker;
        } as unknown as typeof Worker;
        win.Worker = Slow;
      },
    });
    cy.get(".skittle-root.wt-sofar [data-test-rankings-card]", { timeout: 90000 }).first().click();
    cy.get(".skittle-root.wt-detail", { timeout: 30000 }).should("exist");
    const scroller = (win: Cypress.AUTWindow): Element => [win.document.querySelector(".skittle-root main"), win.document.scrollingElement].find((el) => el && el.scrollHeight > el.clientHeight + 200)!;
    cy.window().then((win) => {
      scroller(win).scrollTop = 300;
      expect(scroller(win).scrollTop, "scrolled down the team").to.be.greaterThan(100);
      cy.get(".skittle-root").should("have.class", "wt-sofar"); // still solving when it scrolled
      cy.wrap(scroller(win).scrollTop).as("top");
    });
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root").should("not.have.class", "wt-sofar");
    cy.get("@top").then((top) => {
      cy.window().then((win) => expect(scroller(win).scrollTop, "the page stayed where it was").to.eq(top));
    });
    cy.get(".skittle-root #backLink").click();
    cy.get(".skittle-root").should("not.have.class", "wt-detail");
    cy.get(".skittle-root #teamCount").should("contain.text", "10 teams").and("not.contain.text", "so far");
  });

  it("an account changed on another page mid-solve comes back solved at the new account, not as an empty list", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    cy.get(".skittle-root.wt-sofar", { timeout: 90000 }).should("exist");
    cy.get("[data-test-nav-convene]").click();
    cy.location("pathname", { timeout: 30000 }).should("eq", "/convene");
    cy.window().then(dropHerSequence2);
    // back through history: the hash is the same, so nothing but the account says the rows are old. Every answer the old
    // pass still had out is refused by `file()`, and this used to end on "0 teams" and the empty state
    cy.go("back");
    cy.location("pathname", { timeout: 30000 }).should("eq", "/rankings");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)", { timeout: 180000 }).should("have.length", 10);
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid").should("contain.text", "Cartethyia S1R1").and("not.contain.text", "Cartethyia S2R1");
  });

  it("an account changed on another page after the table finished redraws it at the new account", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)", { timeout: 180000 }).should("have.length", 10);
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid").should("contain.text", "Cartethyia S2R1");
    cy.get("[data-test-nav-convene]").click();
    cy.location("pathname", { timeout: 30000 }).should("eq", "/convene");
    cy.window().then(dropHerSequence2);
    cy.go("back");
    cy.location("pathname", { timeout: 30000 }).should("eq", "/rankings");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "Cartethyia S1R1").and("not.contain.text", "Cartethyia S2R1");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
  });

  it("a team left open when the account changed stays open, and Back shows the table at the new account", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .gotodetail[data-team]", { timeout: 180000 }).first().click();
    cy.get(".skittle-root.wt-detail", { timeout: 30000 }).should("exist");
    cy.location("hash").then((hash) => {
      cy.get("[data-test-nav-convene]").click();
      cy.location("pathname", { timeout: 30000 }).should("eq", "/convene");
      cy.window().then(dropHerSequence2);
      cy.go("back");
      cy.location("pathname", { timeout: 30000 }).should("eq", "/rankings");
      cy.location("hash").should("eq", hash);
    });
    cy.get(".skittle-root.wt-detail", { timeout: 30000 }).should("exist");
    cy.get(".skittle-root #backLink").click();
    cy.get(".skittle-root").should("not.have.class", "wt-detail");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "Cartethyia S1R1").and("not.contain.text", "Cartethyia S2R1");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
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
