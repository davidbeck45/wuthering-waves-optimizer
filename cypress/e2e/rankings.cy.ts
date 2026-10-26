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
    // his Team Cost box is the account bar's tier control now (hidden, still in the DOM); the sheet keeps his search
    cy.get(".skittle-root .tcside").should("be.visible");
    cy.get(".skittle-root .tcside #optionSearch").should("be.visible");
    cy.get(".skittle-root .tcside #cost").should("exist").and("not.be.visible");
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
    // Save and Forget live in one Views menu
    cy.get("[data-test-rankings-views]").click();
    cy.get("[data-test-rankings-view]").should("not.exist");
    cy.get("[data-test-rankings-view-new]").click();
    cy.get("[data-test-rankings-view-name]").type("Cartethyia at mine");
    cy.get("[data-test-rankings-view-save]").click();
    cy.get("[data-test-rankings-views-current]").should("have.text", "Cartethyia at mine");
    // a press outside the menu closes it
    cy.get("[data-test-rankings-riley]").click();
    cy.get("[data-test-rankings-pop]").should("not.exist");
    cy.location("hash", { timeout: 60000 }).should("not.include", "tc=mine");
    cy.get("[data-test-rankings-views-current]").should("have.text", "Views");
    cy.get("[data-test-rankings-views]").click();
    cy.get('[data-test-rankings-view="Cartethyia at mine"]').click();
    cy.location("hash", { timeout: 60000 }).should("include", "tc=mine").and("include", "own=0").and("include", "r=Cartethyia");
    cy.get("[data-test-rankings-views-current]").should("have.text", "Cartethyia at mine");
    cy.get("[data-test-rankings-views]").click();
    cy.get("[data-test-rankings-view-forget]").click();
    cy.get("[data-test-rankings-view]").should("not.exist");
    cy.window().should((win) => expect(win.localStorage.getItem("wtplus:rankings:views")).to.eq("[]"));
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

// Wuthering Tools+ (2026-10-12): one state control (Riley's tiers in the bar), Main DPS / With / Without
// chips over his r= / x= hash, the Compare column as % of the top row, the compact bar on a phone.
describe("wuwa_calc rankings: the account bar's tier, chips and Compare column (Wuthering Tools+)", () => {
  const rows = ".skittle-root .tgrid .trow:not(.thead):not(.tghost)";

  it("sets Riley's tier from the bar, with his own Team Cost box hidden", () => {
    cy.visit("/rankings#r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(rows, { timeout: 60000 }).should("have.length.greaterThan", 0);
    cy.get(".skittle-root .tcopt:has(#cost)").should("not.be.visible");
    cy.get(".skittle-root .tcopt.note[data-note='readme']").should("not.be.visible");
    cy.get("[data-test-rankings-tier]").should("have.value", "").select("s6r5");
    cy.location("hash", { timeout: 60000 }).should("include", "tc=s6r5").and("include", "r=Cartethyia");
    cy.get(".skittle-root #cost", { timeout: 60000 }).should("have.value", "s6r5");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "Cartethyia S6R5");
    // My account and back: Riley's tiers returns to the tier last picked
    cy.get("[data-test-rankings-mine]").click();
    cy.location("hash", { timeout: 60000 }).should("include", "tc=mine");
    cy.get("[data-test-rankings-tier]").should("not.exist");
    cy.get("[data-test-rankings-riley]").click();
    cy.location("hash", { timeout: 60000 }).should("include", "tc=s6r5");
    // the neutral "Beta · how to read" chip replaces his README box
    cy.get("[data-test-rankings-beta]").click();
    cy.get("[data-test-rankings-howto]").should("be.visible").and("contain.text", "% of top").and("contain.text", "Riley31415");
  });

  it("reads the Compare column as each team's share of the top row, or of a pinned row", () => {
    cy.visit("/rankings#r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .trow.thead .c.huehead", { timeout: 60000 }).should("have.text", "% of top");
    cy.get(`${rows} .c.baseline`).first().should("have.text", "100.0%").and("have.class", "wt-pct");
    cy.get(`${rows} .c.baseline`).then(($cells) => {
      const shares = [...$cells].map((c) => parseFloat((c.textContent ?? "").replace(/,/g, "")));
      expect(shares.every((v) => v > 0 && v <= 100)).to.eq(true);
      // the column runs down with the table (Team Avg DPR, best first)
      expect(shares[shares.length - 1]).to.be.lessThan(shares[0]!);
    });
    // pinning the last row measures every team against it; clicking it again goes back to the top row
    cy.get(`${rows} .c.baseline`).last().click({ scrollBehavior: false });
    cy.get(".skittle-root .trow.thead .c.huehead").should("have.text", "% of pinned");
    cy.get(`${rows} .c.baseline`).first().invoke("text").then((t) => expect(parseFloat(t.replace(/,/g, ""))).to.be.greaterThan(100));
    cy.get(`${rows}.isbaseline .c.baseline`).should("have.text", "100.0%").click({ scrollBehavior: false });
    cy.get(".skittle-root .trow.thead .c.huehead").should("have.text", "% of top");
  });

  it("filters by Main DPS / With / Without chips written to Riley's r= / x= hash, the account's resonators first", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(rows, { timeout: 60000 }).should("have.length.greaterThan", 10);
    // Main DPS: the picker lists the account's resonators ahead of the ones it lacks (Cartethyia is set up, S2)
    cy.get("[data-test-rankings-chip-add='main']").click();
    cy.get("[data-test-rankings-pop='pick-main'] [data-test-rankings-chip-option]").then(($opts) => {
      const names = [...$opts].map((o) => o.getAttribute("data-test-rankings-chip-option"));
      expect(names.indexOf("Cartethyia")).to.be.greaterThan(-1);
      // Phrolova leads teams and is not on this account
      expect(names.indexOf("Cartethyia")).to.be.lessThan(names.indexOf("Phrolova"));
    });
    cy.get("[data-test-rankings-chip-option='Cartethyia']").should("contain.text", "S2");
    cy.get("[data-test-rankings-chip-search]").type("carte");
    cy.get("[data-test-rankings-chip-option]").should("have.length", 1);
    cy.get("[data-test-rankings-chip-option='Cartethyia']").click();
    cy.location("hash", { timeout: 60000 }).should("include", "r=Cartethyia");
    cy.get("[data-test-rankings-chip-group='main'] [data-test-rankings-chip='Cartethyia']").should("exist");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    // retried until his redraw lands: every row fields her
    cy.get(rows, { timeout: 60000 }).should(($rows) => {
      expect($rows.length).to.be.greaterThan(0);
      expect([...$rows].every((r) => (r.textContent ?? "").includes("Cartethyia")), "every row fields Cartethyia").to.eq(true);
    });
    // Without: hides every team fielding Ciaccona (x=); his own resonator bubbles stay hidden behind the bar's
    cy.get("body").type("{esc}");
    cy.get("[data-test-rankings-chip-add='without']").click();
    cy.get("[data-test-rankings-chip-search]").type("Ciaccona");
    cy.get("[data-test-rankings-chip-option='Ciaccona']").click();
    cy.location("hash", { timeout: 60000 }).should("include", "x=Ciaccona").and("include", "r=Cartethyia");
    cy.get("[data-test-rankings-chip-group='without'] [data-test-rankings-chip='Ciaccona']").should("exist");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(rows, { timeout: 60000 }).should(($rows) => {
      expect($rows.length).to.be.greaterThan(0);
      expect([...$rows].some((r) => (r.textContent ?? "").includes("Ciaccona")), "no row fields Ciaccona").to.eq(false);
    });
    cy.get(".skittle-root .tcchips .rchip[data-resonator='Ciaccona']").should("not.be.visible");
    // a chip comes off on a click; Clear takes the rest
    cy.get("[data-test-rankings-chip='Ciaccona']").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "x=").and("include", "r=Cartethyia");
    cy.get("[data-test-rankings-chip-add='with']").click();
    cy.get("[data-test-rankings-chip-search]").type("Sanhua");
    cy.get("[data-test-rankings-chip-option='Sanhua']").click();
    cy.get("[data-test-rankings-chip-group='with'] [data-test-rankings-chip='Sanhua']").should("exist");
    cy.location("hash", { timeout: 60000 }).should("include", "r=Cartethyia,Sanhua");
    cy.get("[data-test-rankings-chips-clear]").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "r=");
    cy.get("[data-test-rankings-chip]").should("not.exist");
  });

  it("folds into two rows on a phone at 130 % text: summary and Teams I can field in a popover, views in one menu", () => {
    cy.viewport(412, 915);
    cy.visit("/rankings#tc=mine&r=Cartethyia&x=Ciaccona", {
      onBeforeLoad(win) {
        win.document.documentElement.style.fontSize = "130%";
      },
    });
    cy.document().then((doc) => {
      const style = doc.createElement("style");
      style.textContent = "html { font-size: 130% !important; }";
      doc.head.appendChild(style);
    });
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-account-bar]").should(($bar) => {
      // two rows of xs controls at 130 %: the state control and the menu, then the chip strip
      expect($bar[0]!.getBoundingClientRect().height).to.be.lessThan(100);
    });
    cy.get("[data-test-rankings-account-summary]").should("not.exist");
    cy.get("[data-test-rankings-chip-summary='main']").should("have.text", "Cartethyia");
    cy.get("[data-test-rankings-chip-summary='without']").should("have.text", "Ciaccona");
    cy.get("[data-test-rankings-info]").click();
    cy.get("[data-test-rankings-account-summary]").should("be.visible").and("contain.text", "set up");
    cy.get("[data-test-rankings-owned-only]").should("be.visible").and("be.checked");
    cy.get("[data-test-rankings-menu]").click();
    cy.get("[data-test-rankings-account-summary]").should("not.exist");
    cy.get("[data-test-rankings-subs]").should("be.visible");
    cy.get("[data-test-rankings-views]").click();
    cy.get("[data-test-rankings-view-new]").should("be.visible");
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, "no sideways scroll").to.be.at.most(doc.documentElement.clientWidth);
    });
  });
});

// Wuthering Tools+ (2026-10-12, Stage 2): a phone reads Riley's rows as cards (RankingsCards.vue over his model's
// visibleRows, in his table's order); the rotation detail carries a member strip (RankingsMemberStrip.vue).
describe("wuwa_calc rankings: phone cards and the detail's member strip (Wuthering Tools+)", () => {
  const cards = "[data-test-rankings-card]";
  const figureOf = (el: Element): number => parseFloat((el.querySelector("[data-test-rankings-card-figure]")?.firstChild?.textContent ?? "").replace(/,/g, ""));

  it("lists his rows as cards on a phone, 50 at a time, and a tap opens the team's rotation with the member strip", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.viewport(412, 915);
    cy.visit("/rankings", {
      onBeforeLoad(win) {
        win.document.documentElement.style.fontSize = "130%";
      },
    });
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(cards, { timeout: 60000 }).should("have.length", 50);
    // his grid is hidden behind the cards; the toolbar holds the list's count and DPR / DPS
    cy.get(".skittle-root").should("have.class", "wt-cards");
    cy.get(".skittle-root .tcwrap").should("not.be.visible");
    cy.get("[data-test-rankings-cards-count]").invoke("text").should("match", /^\d[\d,]* teams$/);
    cy.get("[data-test-rankings-card-share]").first().should("have.text", "100.0%");
    cy.get(cards).should(($cards) => {
      const figures = [...$cards].map(figureOf);
      // one row per team (no compare open): best first, as his table
      expect(figures.every((f, i) => i === 0 || f <= figures[i - 1]!), "figures run down").to.eq(true);
      // three portraits per card, whoever the team is built around first (his slots are support-first)
      for (const card of [...$cards]) {
        const members = [...card.querySelectorAll<HTMLElement>("[data-test-rankings-card-member]")];
        expect(members).to.have.length(3);
        if (members.some((m) => m.dataset.main === "1")) expect(members[0]!.dataset.main, card.getAttribute("data-team") ?? "").to.eq("1");
      }
    });
    // under one of Riley's tiers each member says where the account stands (this account owns only Cartethyia)
    cy.get("[data-test-rankings-card-own][data-kind='missing']").should("exist");
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, "no sideways scroll").to.be.at.most(doc.documentElement.clientWidth);
    });
    // the next 50
    cy.get("[data-test-rankings-cards-more]").click();
    cy.get(cards).should("have.length", 100);
    // DPS through his own switch: the figures become damage over each run's seconds
    cy.get(cards).first().then(($c) => {
      const dpr = figureOf($c[0]!);
      cy.get("[data-test-rankings-cards-mode='dps']").click();
      cy.get(".skittle-root .tgrid .c.dprhead").should("have.text", "Team DPS");
      cy.get(cards).first().should(($n) => expect(figureOf($n[0]!)).to.be.lessThan(dpr));
      cy.get("[data-test-rankings-cards-mode='dpr']").click();
      cy.get(".skittle-root .tgrid .c.dprhead").should("have.text", "Team Avg DPR");
    });
    // the Search & compare sheet still opens over the cards
    cy.get("[data-test-rankings-filters]").click();
    cy.get(".skittle-root .tcside #optionSearch").should("be.visible");
    cy.get("[data-test-rankings-filters-close]").click({ force: true });
    // a tap opens the team's rotation through the router, the member strip on top
    cy.get(cards).first().invoke("attr", "data-team").then((team) => {
      cy.get(cards).first().click();
      cy.location("hash", { timeout: 60000 }).should("include", `team=${team}`);
    });
    cy.get(".skittle-root").should("have.class", "wt-detail");
    cy.get("[data-test-rankings-strip-member]", { timeout: 60000 }).should("have.length", 3).first().should("have.attr", "data-main", "1");
    cy.get("[data-test-rankings-strip-own]").should("have.length", 3);
    cy.get(".skittle-root #topbar [data-test-rankings-import-team]").should("be.visible");
    cy.get(".skittle-root #topbar [data-test-rankings-import-team] .wt-import__short").should("be.visible").and("have.text", "Import team");
    cy.get(".skittle-root #topbar [data-test-rankings-import-team] .wt-import__long").should("not.be.visible");
    // Back and the short Import share the first line; the strip takes its own under them
    cy.get("#backLink").then(($back) => {
      const back = $back[0]!.getBoundingClientRect();
      cy.get(".skittle-root #topbar [data-test-rankings-import-team]").should(($b) => {
        const b = $b[0]!.getBoundingClientRect();
        expect(Math.abs((b.top + b.bottom) / 2 - (back.top + back.bottom) / 2), "Back and Import on one line").to.be.lessThan(16);
      });
      cy.get("[data-test-rankings-strip]").should(($s) => expect($s[0]!.getBoundingClientRect().top).to.be.greaterThan(back.bottom));
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, "no sideways scroll on the detail").to.be.at.most(doc.documentElement.clientWidth);
    });
    // and Back lands on the cards again
    cy.get("#backLink").click();
    cy.location("hash").should("not.include", "team=");
    cy.get(cards, { timeout: 60000 }).should("have.length.greaterThan", 0);
    cy.get("[data-test-rankings-strip]").should("not.exist");
  });

  it("lists the rows the player pinned first on the cards, as his grid does", () => {
    cy.visit("/rankings");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    const rows = ".skittle-root .tgrid .trow[data-team]:not(.thead):not(.tghost)";
    cy.get(rows, { timeout: 60000 }).should("have.length.greaterThan", 10);
    cy.get(rows).eq(6).invoke("attr", "data-team").then((team) => {
      cy.get(rows).eq(6).find(".c.pin").click({ scrollBehavior: false });
      cy.location("hash", { timeout: 60000 }).should("include", "pin=");
      // his grid lists it first; the same link on a phone lists that card first too, marked as pinned
      // (reloaded at the phone's size: headless Electron never reports a media-query change after cy.viewport)
      cy.get(rows, { timeout: 60000 }).first().should("have.attr", "data-team", team);
      cy.viewport(412, 915);
      cy.reload();
      cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
      cy.location("hash").should("include", "pin=");
      cy.get(cards, { timeout: 60000 }).first().should("have.attr", "data-team", team).find("[data-test-rankings-card-pinned]").should("exist");
      cy.get(cards).eq(1).find("[data-test-rankings-card-pinned]").should("not.exist");
    });
  });

  it("says why the table is empty on a desktop: nothing set up at My account, or no match", () => {
    // no account imported: My account with Teams I can field lists nothing
    cy.visit("/rankings#tc=mine");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-cards-empty]", { timeout: 60000 }).should("be.visible").and("contain.text", "No team you can field yet");
    cy.get("[data-test-rankings-cards-setup]").should("have.attr", "href", "/");
    cy.get(cards).should("not.exist");
    cy.get(".skittle-root .tcwrap").should("be.visible");
    // Riley's tiers list every team again, and the note goes
    cy.get("[data-test-rankings-riley]").click();
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .trow:not(.thead) .gotodetail[data-team]", { timeout: 60000 }).should("have.length.greaterThan", 10);
    cy.get("[data-test-rankings-cards-empty]").should("not.exist");
  });

  it("keeps Riley's grid on a desktop, and reads the account in the detail's member strip", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/rankings#tc=mine&r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tcwrap").should("be.visible");
    cy.get(cards).should("not.exist");
    cy.get(".skittle-root .trow:not(.thead) .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.location("hash", { timeout: 60000 }).should("include", "team=");
    // My account: Cartethyia runs the account's own S2 on Defier's Thorn, with five echoes on her build
    cy.get("[data-test-rankings-strip-member][data-name='Cartethyia']", { timeout: 60000 })
      .should("have.attr", "data-own", "same")
      .and("have.attr", "data-build", "full")
      .within(() => {
        cy.get("[data-test-rankings-strip-own]").should("have.text", "Own S2R1");
        cy.get("[data-test-rankings-strip-build]").should("contain.text", "build");
        cy.get("[data-test-rankings-strip-weapon-name]").should("contain.text", "Defier");
      });
    // Teams I can field: her teammates are 4★ / Rover forms the account never set up, counted at S6 (his rule), no build to show
    cy.get("[data-test-rankings-strip-member]:not([data-name='Cartethyia'])").should(($m) => {
      expect($m).to.have.length(2);
      for (const m of [...$m]) {
        const own = m.getAttribute("data-own");
        expect(["assumed", "same"], `${m.getAttribute("data-name")}: ${own}`).to.include(own);
        if (own !== "assumed") continue;
        expect(m.querySelector("[data-test-rankings-strip-own]")?.textContent).to.eq("4★ · S6");
        expect(m.querySelector("[data-test-rankings-strip-build]")).to.eq(null);
      }
      expect([...$m].some((m) => m.getAttribute("data-own") === "assumed"), "a free teammate counted at S6").to.eq(true);
    });
    cy.get("#backLink").click();
    // at Riley's S6R5 the same resonator is a step above the account
    cy.get("[data-test-rankings-riley]").click();
    cy.get("[data-test-rankings-tier]").select("s6r5");
    cy.location("hash", { timeout: 60000 }).should("include", "tc=s6r5");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .tgrid", { timeout: 180000 }).should("contain.text", "Cartethyia S6R5");
    cy.get(".skittle-root .trow:not(.thead) .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.get("[data-test-rankings-strip-member][data-name='Cartethyia']", { timeout: 60000 })
      .should("have.attr", "data-own", "below")
      .within(() => {
        cy.get("[data-test-rankings-strip-token]").should("have.text", "runs S6R5");
        cy.get("[data-test-rankings-strip-own]").should("contain.text", "Own S2R1");
      });
  });
});
