// Wuthering Tools+: batch import of echoes from phone screenshots
// (src/sim/echoScan/). Runs real OCR (tesseract.js, language data from its
// CDN) on two Galaxy S26 Ultra screenshots of the same echo.
describe("phone screenshot batch echo import", () => {
  it("scans two screenshots, shows editable results, and adds the echoes to the inventory", () => {
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch]").should("exist");
    cy.get("[data-test-phone-echo-batch-input]").selectFile(
      ["cypress/fixtures/echoScan/s26_puppet_pavilion_1.jpg", "cypress/fixtures/echoScan/s26_puppet_pavilion_2.jpg"],
      { force: true },
    );
    cy.get('[data-test-phone-echo-batch-row="queued"]').should("have.length", 2);
    cy.get("[data-test-phone-echo-batch-scan]").click({ force: true });
    cy.get('[data-test-phone-echo-batch-row="done"]', { timeout: 300000 }).should("have.length", 2);

    cy.get('[data-test-phone-echo-batch-row="done"]').each(($row) => {
      cy.wrap($row).find("[data-test-phone-echo-batch-echo]").should("have.value", "ThousandPuppetPavilion");
      cy.wrap($row).find("[data-test-phone-echo-batch-set]").should("have.value", "SongofFeatheredTrace");
    });

    cy.get("[data-test-phone-echo-batch-add]").click({ force: true });
    // a fresh inventory has no duplicates, so the echoes are saved straight away
    cy.window({ timeout: 20000 }).should((win) => {
      const inventory = JSON.parse(win.localStorage.getItem("inventory") ?? "{}") as { echoes?: Array<Record<string, unknown>> };
      expect(inventory.echoes ?? []).to.have.length(2);
      expect(inventory.echoes?.[0]).to.include({ echo: "ThousandPuppetPavilion", echoSet: "SongofFeatheredTrace", type: 4, stat: "CritDMG" });
      expect(inventory.echoes?.[0]).to.include({ echoSubStatsType1: "CritDMG", echoSubStatsValue1: 19.8 });
    });
  });
});
