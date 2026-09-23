import { configOptimizer } from "./calculator/data/Cartethyia/data";
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

  it("imports the shown team as a Team Rotation (Wuthering Tools+)", () => {
    // a resonator filter keeps the first row importable: the unfiltered table can lead with a team the
    // app has no kit for yet (Riley's a54ec44 opens with Suoming), which the import rightly refuses
    cy.visit("/rankings#r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root #app .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.get(".skittle-root #topbar [data-test-rankings-import-team]").should("exist").click({ force: true });
    cy.get(".skittle-root #topbar .wt-import[data-test-rankings-import-done]", { timeout: 60000 }).should("exist");
    cy.window().should((win) => {
      const store = JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as { teams?: Array<{ name: string; characterIds: string[]; actions: unknown[] }> };
      expect(store.teams ?? []).to.have.length(1);
      const team = store.teams![0];
      expect(team.name).to.match(/^wuwa_calc /);
      expect(team.characterIds.filter(Boolean)).to.have.length(3);
      expect(team.actions.length).to.be.greaterThan(10);
    });
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

describe("wuwa_calc rankings: Riley's body-level popovers keep his styles", () => {
  it("draws a team's damage breakdown as his grid, not a column of cells", () => {
    cy.visit("/rankings");
    // let the boot settle first: a redraw while the solves are still coming in clears every open popover
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root #app .gotodetail", { timeout: 60000 }).should("have.length.greaterThan", 10);
    // the breakdown opens (pinned) on click; Riley closes every popover on any scroll event, and Cypress's
    // scroll-into-view before a click lands its scroll event after the click on a slow runner — the first
    // row is already in view, so click without scrolling, and click again if something closed it
    const openBreakdown = (tries: number): void => {
      cy.get(".skittle-root .trow:not(.thead) .c.teamdpr", { timeout: 60000 }).first().click({ scrollBehavior: false });
      // eslint-disable-next-line cypress/no-unnecessary-waiting -- a beat for a late scroll/redraw to land before checking
      cy.wait(500);
      cy.document().then((doc) => {
        if (doc.querySelector("body > .pop.dpr .rtable")) return;
        const state = `pops=${doc.querySelectorAll("body > .pop").length} loadingHidden=${doc.querySelector(".skittle-root #loading")?.hasAttribute("hidden")} rows=${doc.querySelectorAll(".gotodetail").length} teamdpr=${doc.querySelectorAll(".c.teamdpr").length}`;
        expect(tries, `breakdown popover never opened (${state})`).to.be.greaterThan(1);
        openBreakdown(tries - 1);
      });
    };
    openBreakdown(8);
    // the popover is appended to document.body, outside .skittle-root — its `.rtable` must still be styled
    cy.get("body > .pop.dpr .rtable", { timeout: 60000 }).should("have.css", "display", "grid");
    cy.get("body > .pop.dpr").invoke("outerWidth").should("be.greaterThan", 300);
    cy.get("body > .pop.dpr .rtrow.rthead .c").should("have.length.greaterThan", 3);
  });
});

describe("wuwa_calc rankings: filters survive a rotation detail", () => {
  it("keeps an added resonator filter after view rotation and back", () => {
    cy.visit("/rankings");
    cy.get(".skittle-root .trow:not(.thead)", { timeout: 60000 }).should("exist");
    cy.get("#optionSearch").type("Mornye");
    cy.get(".sresult").first().click();
    cy.get(".tcchips .rchip", { timeout: 60000 }).should("contain.text", "Mornye");
    cy.location("hash").should("include", "r=Mornye");
    cy.get(".skittle-root .trow:not(.thead) .gotodetail[data-team]", { timeout: 120000 }).first().click();
    cy.location("hash", { timeout: 60000 }).should("include", "team=").and("include", "r=Mornye");
    cy.get("#backLink").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "team=").and("include", "r=Mornye");
    cy.get(".tcchips .rchip", { timeout: 60000 }).should("contain.text", "Mornye");
  });
});

describe("wuwa_calc rankings on a phone", () => {
  it("keeps Riley's aside in a bottom sheet behind a Filters button on narrow viewports", () => {
    cy.viewport(390, 844);
    cy.visit("/rankings");
    cy.get("[data-test-rankings-filters]", { timeout: 60000 }).should("be.visible");
    cy.get(".skittle-root .tcside").should("not.be.visible");
    cy.get("[data-test-rankings-filters]").click();
    cy.get(".skittle-root .tcside").should("be.visible").and("contain.text", "Team Cost");
    cy.get("[data-test-rankings-filters-close]").click({ force: true });
    cy.get(".skittle-root .tcside").should("not.be.visible");
    // desktop keeps the aside beside the table and no toolbar
    cy.viewport(1440, 900);
    cy.get("[data-test-rankings-filters]").should("not.be.visible");
    cy.get(".skittle-root .tcside").should("be.visible");
  });
});

// Wuthering Tools+: the player's own echoes as a "My build" row of Riley's Substat Investment compare
// (src/sim/rankings/myBuilds.ts + the fork's `setMySubstat`).

describe("wuwa_calc rankings: My build substat row", () => {
  it("compares the account's equipped substats beside ChemX32 and High Invest", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#r=Cartethyia&cb=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".tcchips .rchip", { timeout: 60000 }).should("contain.text", "Cartethyia Substat Investment");
    cy.get(".skittle-root .tgrid", { timeout: 180000 })
      .should("contain.text", "My build")
      .and("contain.text", "High Invest")
      .and("contain.text", "ChemX32");
    // a My build row opens its rotation on the same spread, and Back keeps the compare
    cy.contains(".skittle-root .trow:not(.thead):not(.tghost)", "My build").find(".gotodetail[data-team]").click();
    cy.location("hash", { timeout: 60000 }).should("include", "team=").and("match", /\.u[0-9a-z]+/);
    cy.get(".skittle-root #app", { timeout: 60000 }).should("contain.text", "My build");
    cy.get("#backLink").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "team=").and("include", "cb=Cartethyia");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "My build");
  });

  it("offers no My build row for a resonator the account has not built", () => {
    cy.visit("/rankings#r=Mornye&cb=Mornye");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "High Invest").and("not.contain.text", "My build");
  });
});

describe("wuwa_calc rankings: My account tier (Wuthering Tools+)", () => {
  it("runs the account's own sequences and weapons and hides teams it cannot field", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    // the account-first bar switches the cost through the hash (her own teams only, so the in-page
    // solve stays small); his aside then lists the new tier
    cy.visit("/rankings#r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-account-summary]").should("not.exist");
    cy.get("[data-test-rankings-mine]").click();
    cy.location("hash", { timeout: 60000 }).should("include", "tc=mine").and("include", "r=Cartethyia");
    cy.get("[data-test-rankings-account-summary]").should("contain.text", "1 of 1 set up");
    cy.get(".skittle-root #cost", { timeout: 60000 }).should("have.value", "mine");
    // only Cartethyia is set up; 4-stars and Rover forms count as owned, so exactly one of her ten
    // primary teams (one per interchangeable-support group, Riley's roster of 2026-09-17) is
    // fieldable (Aero Rover + Sanhua + Cartethyia), at her S2 R1. Lifting "Teams I can field"
    // lists the other nine with their unowned limited members at S0R1.
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "Cartethyia S2R1").and("contain.text", "Sanhua");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)").should("have.length", 1);
    cy.get("[data-test-rankings-owned-only]").uncheck();
    cy.location("hash", { timeout: 60000 }).should("include", "own=0");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid .trow:not(.thead):not(.tghost)", { timeout: 180000 }).should("have.length", 10);
    cy.get(".skittle-root .tgrid").should("contain.text", "Ciaccona");
    // back to Riley's tiers: the cost falls back to his default and the owned filter is dropped
    cy.get("[data-test-rankings-riley]").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "tc=mine").and("not.include", "own=");
    cy.get(".skittle-root #cost", { timeout: 60000 }).should("have.value", "s0r1");
  });

  it("saves the current filters as a named view and applies it again", () => {
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-view-new]").click();
    cy.get("[data-test-rankings-view-name]").type("Cartethyia at mine");
    cy.get("[data-test-rankings-view-save]").click();
    cy.get("[data-test-rankings-views]").should("have.value", "Cartethyia at mine");
    cy.get("[data-test-rankings-riley]").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "tc=mine");
    cy.get("[data-test-rankings-views]").select("Cartethyia at mine");
    cy.location("hash", { timeout: 60000 }).should("include", "tc=mine").and("include", "own=0").and("include", "r=Cartethyia");
    cy.get("[data-test-rankings-view-forget]").click();
    cy.get("[data-test-rankings-views] option").should("have.length", 1);
  });
});

describe("wuwa_calc rankings: one substat spread for every row (Wuthering Tools+)", () => {
  it("runs every row at High Invest, then at the account's own builds, from the bar", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-subs]").should("have.value", "");
    cy.get("[data-test-rankings-subs]").select("h");
    cy.location("hash", { timeout: 60000 }).should("include", "sb=h");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    // the rows are the same builds in the High Invest spread: the detail page names it
    cy.get(".skittle-root .trow:not(.thead):not(.tghost) .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.get(".skittle-root #app", { timeout: 60000 }).should("contain.text", "High Invest").and("not.contain.text", "ChemX32");
    cy.get("#backLink").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "team=").and("include", "sb=h");
    // the player's own builds: Cartethyia's equipped echoes, ChemX32 for a teammate without any
    cy.get("[data-test-rankings-subs]").select("m");
    cy.location("hash", { timeout: 60000 }).should("include", "sb=m");
    cy.get("[data-test-rankings-subs-hint]").should("contain.text", "1 character with echoes");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .trow:not(.thead):not(.tghost) .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.location("hash", { timeout: 60000 }).should("match", /\.u[0-9a-z]+/);
    cy.get(".skittle-root #app", { timeout: 60000 }).should("contain.text", "My build").and("contain.text", "ChemX32");
    cy.get("#backLink").click();
    cy.get("[data-test-rankings-subs]").select("");
    cy.location("hash", { timeout: 60000 }).should("not.include", "sb=");
  });
});

describe("wuwa_calc rankings: Sync my teams (Wuthering Tools+)", () => {
  it("re-imports a saved wuwa_calc team at the account's state in place and reports no change for a fresh import", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    // import Cartethyia's one fieldable team from its detail page, at her own state
    cy.get(".skittle-root .trow:not(.thead):not(.tghost) .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.get(".skittle-root #topbar [data-test-rankings-import-team]").should("exist").click({ force: true });
    cy.get(".skittle-root #topbar .wt-import[data-test-rankings-import-done]", { timeout: 60000 }).should("exist");
    // the import's success toast lives in a top-layer dialog (ToastContainer) that covers the Back link and, on
    // CI's viewport, the account bar's Sync button too — cy.click() refuses a covered element. It dismisses
    // itself after 4 s (useToast DEFAULT_DURATION); wait it out rather than click through it
    cy.get(".toast .alert-success", { timeout: 15000 }).should("not.exist");
    cy.get("#backLink").click();
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    // the sync re-imports it at the same state: same actions, so "unchanged"; the team count does not grow
    cy.get("[data-test-rankings-sync]").click();
    cy.get("[data-test-rankings-sync-report]", { timeout: 180000 }).should("exist");
    cy.get("[data-test-rankings-sync-team][data-test-rankings-sync-status='unchanged']", { timeout: 180000 }).should("have.length", 1).and("contain.text", "wuwa_calc Cartethyia");
    cy.window().should((win) => {
      const store = JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as { teams?: Array<{ name: string; actions: unknown[] }> };
      expect(store.teams ?? []).to.have.length(1);
      expect(store.teams![0].actions.length).to.be.greaterThan(5);
    });
    // the sync's own toast covers the report's Close button on CI's viewport the same way: let it go first
    cy.get(".toast .alert", { timeout: 20000 }).should("not.exist");
    cy.get("[data-test-rankings-sync-close]").click();
    cy.get("[data-test-rankings-sync-report]").should("not.exist");
  });
});
