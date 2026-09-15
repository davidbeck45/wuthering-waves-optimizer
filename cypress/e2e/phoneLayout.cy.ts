// Wuthering Tools+ on a phone: no page-wide horizontal scroll on any route, the nav's five icon
// links clear of the utility menu, and the plus tables reflowed into cards below 768 px.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const PHONE = { width: 360, height: 800 }; // the narrowest common Android viewport

function expectNoHorizontalScroll(route: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${route} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

function expectNavFits(route: string): void {
  cy.get("[data-test-nav-rankings]").should("be.visible");
  cy.get("[data-test-nav-rankings]").then(($last) => {
    cy.get('[aria-label="Change Theme"]').then(($theme) => {
      const last = $last[0].getBoundingClientRect();
      const theme = $theme[0].getBoundingClientRect();
      expect(last.right, `${route} nav: last icon vs theme button`).to.be.at.most(theme.left + 1);
      expect(last.right, `${route} nav: last icon inside the viewport`).to.be.at.most(PHONE.width);
    });
  });
}

describe("phone layout", () => {
  beforeEach(() => {
    cy.viewport(PHONE.width, PHONE.height);
  });

  it("keeps every page inside the viewport and the nav icons clear of the utility menu", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    for (const route of ["/", "/inventory", "/convene", "/teams", "/settings", "/info", "/updates", "/my-rankings"]) {
      cy.visit(route);
      cy.get(".navbar").should("be.visible");
      expectNavFits(route);
      expectNoHorizontalScroll(route);
    }
    // the classic settings tab strip wraps instead of pushing the page wide
    cy.visit("/settings");
    cy.get("[data-test-settings-labs]").should("be.visible");
    expectNoHorizontalScroll("/settings");
  });

  it("keeps the wuwa_calc rankings page inside the viewport with its phone toolbar", () => {
    cy.visit("/rankings");
    cy.get("[data-test-rankings-filters]", { timeout: 60000 }).should("be.visible");
    expectNavFits("/rankings");
    expectNoHorizontalScroll("/rankings");
    cy.get("[data-test-rankings-switch-mine]").should("be.visible");
  });

  it("reflows the roster ranking tables into cards", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 120000 }).should("exist");
    cy.get("[data-test-my-rankings-characters] thead").should("not.be.visible");
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("have.css", "display", "flex");
    cy.get('[data-test-my-rankings-row="Cartethyia"] [data-label="Weapon"]').should("be.visible");
    expectNoHorizontalScroll("/my-rankings");
    // the what-if panel row still opens under its card
    cy.get('[data-test-my-rankings-whatif="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-whatif-panel="Cartethyia"]').should("be.visible");
    expectNoHorizontalScroll("/my-rankings (what-if open)");
    // desktop keeps the table
    cy.viewport(1440, 900);
    cy.get("[data-test-my-rankings-characters] thead").should("be.visible");
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("have.css", "display", "table-row");
  });

  it("reviews phone screenshots as cards inside the echo importer", () => {
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch-input]").selectFile(
      ["cypress/fixtures/echoScan/s26_puppet_pavilion_1.jpg", "cypress/fixtures/echoScan/s26_sabercat_prowler.jpg"],
      { force: true },
    );
    cy.get("[data-test-phone-echo-batch-scan]").click({ force: true });
    cy.get('[data-test-phone-echo-batch-row="done"]', { timeout: 180000 }).should("have.length", 2);
    // (the importer dialog reports opacity 0 to Cypress, as in echoScanBatch.cy.ts - assert the layout, not visibility)
    cy.get("[data-test-phone-echo-batch-table] thead").should("have.css", "display", "none");
    cy.get('[data-test-phone-echo-batch-row="done"]').first().should("have.css", "display", "flex");
    cy.get('[data-test-phone-echo-batch-row="done"]').first().find('[data-label="Substats"]').should("have.css", "display", "block");
    expectNoHorizontalScroll("/inventory (importer)");
  });
});
