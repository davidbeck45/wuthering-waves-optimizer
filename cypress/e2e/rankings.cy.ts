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
    cy.visit("/rankings");
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
    cy.get(".skittle-root .trow:not(.thead) .c.teamdpr", { timeout: 60000 }).first().click();
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
