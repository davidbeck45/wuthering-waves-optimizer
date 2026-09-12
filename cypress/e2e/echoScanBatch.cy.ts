// Wuthering Tools+: batch import of echoes from phone screenshots
// (src/sim/echoScan/). Runs real OCR (tesseract.js, language data from its
// CDN) on three Galaxy S26 Ultra screenshots: two of the same Thousand-Puppet
// Pavilion and a Sabercat Prowler whose "Basic Attack DMG Bonus 8.6%" row the
// block-only reader used to lose (the value came back as "LX)").
describe("phone screenshot batch echo import", () => {
  it("scans three screenshots, shows editable results, and adds the echoes to the inventory", () => {
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch]").should("exist");
    cy.get("[data-test-phone-echo-batch-input]").selectFile(
      [
        "cypress/fixtures/echoScan/s26_puppet_pavilion_1.jpg",
        "cypress/fixtures/echoScan/s26_puppet_pavilion_2.jpg",
        "cypress/fixtures/echoScan/s26_sabercat_prowler.jpg",
      ],
      { force: true },
    );
    cy.get('[data-test-phone-echo-batch-row="queued"]').should("have.length", 3);
    cy.get("[data-test-phone-echo-batch-scan]").click({ force: true });
    cy.get('[data-test-phone-echo-batch-row="done"]', { timeout: 400000 }).should("have.length", 3);

    cy.get('[data-test-phone-echo-batch-row="done"]').then(($rows) => {
      const echoes = $rows.toArray().map((row) => (row.querySelector("[data-test-phone-echo-batch-echo]") as HTMLSelectElement).value);
      expect(echoes.sort()).to.deep.equal(["SabercatProwler", "ThousandPuppetPavilion", "ThousandPuppetPavilion"]);
      const sets = $rows.toArray().map((row) => (row.querySelector("[data-test-phone-echo-batch-set]") as HTMLSelectElement).value);
      expect(sets.sort()).to.deep.equal(["SongofFeatheredTrace", "SongofFeatheredTrace", "SoundofTrueName"]);
    });

    cy.get("[data-test-phone-echo-batch-add]").click({ force: true });
    // a fresh inventory has no duplicates, so the echoes are saved straight away
    cy.window({ timeout: 20000 }).should((win) => {
      const inventory = JSON.parse(win.localStorage.getItem("inventory") ?? "{}") as { echoes?: Array<Record<string, unknown>> };
      const echoes = inventory.echoes ?? [];
      expect(echoes).to.have.length(3);
      const puppet = echoes.find((echo) => echo.echo === "ThousandPuppetPavilion");
      expect(puppet).to.include({ echoSet: "SongofFeatheredTrace", type: 4, stat: "CritDMG" });
      expect(puppet).to.include({ echoSubStatsType1: "CritDMG", echoSubStatsValue1: 19.8 });
      const sabercat = echoes.find((echo) => echo.echo === "SabercatProwler");
      expect(sabercat).to.include({ echoSet: "SoundofTrueName", type: 3, stat: "ATK" });
      const subs = [1, 2, 3, 4, 5].map((i) => [sabercat?.[`echoSubStatsType${i}`], sabercat?.[`echoSubStatsValue${i}`]]);
      expect(subs).to.deep.equal([
        ["CritRate", 9.3],
        ["HP", 10.9],
        ["BasicAttackDMGBonus", 8.6],
        ["EnergyRegen", 7.6],
        ["ResonanceLiberationDMGBonus", 10.9],
      ]);
    });
  });
});
