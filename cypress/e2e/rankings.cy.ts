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
