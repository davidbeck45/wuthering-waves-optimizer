// Wuthering Tools+: Riley31415/wuwa_calc's S6R5 loops and full-team rotations
// ship as stock presets (src/sim/presets/) next to the curated ones.
describe("wuwa_calc stock presets", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("lists Riley's S6R5 loops in the rotation presets modal and imports one", () => {
    cy.richSelect("[data-test-character-select]", "YangyangXuanling", { search: "Xuanling" });
    cy.get(".character__self-buffs").should("be.visible");
    cy.get('[data-test-calculator-nav="rotations"]').click();
    cy.get('[data-test="rotations-overflow-menu"]').click();
    cy.get('[data-test-rotations-action="presets"]').click();
    // assert on the dialog's open state, not on visibility: DaisyUI's open
    // transition (opacity 0 → 1) never advances in a frame-starved headless run
    cy.get("[data-test-rotations-presets-modal]").should("have.attr", "open");
    // the sequence-breakpoints table (Track I phase 2): Xuanling's loadout switches its loop at S1
    cy.get("[data-test-rotations-breakpoints]").should("contain.text", "Sequence breakpoints").and("contain.text", "S1 switches it");
    cy.contains("[data-test-rotations-presets] .card", "(wuwa_calc)")
      .first()
      .within(() => {
        cy.contains("Author: Riley31415 (wuwa_calc)").should("exist");
        cy.contains("button", "Import").click({ force: true });
      });
    cy.get("[data-test-rotations-presets-modal]").should("not.have.attr", "open");
    cy.get('[data-test-rotation-item-by-name*="(wuwa_calc)"]').should("exist");
  });

  it("lists the S6R5 full-team rotations under Teams > List Presets and imports one with its actions", () => {
    cy.get("[data-test-nav-team-rotations]").click();
    cy.get('[data-test="team-rotations-overflow-menu"]').click();
    cy.get("[data-test-team-rotations-toggle-presets]").click();
    cy.get("[data-test-team-rotations-presets-search]").type("wuwa_calc Xuanling");
    // the generated presets' chunk loads lazily when the modal opens
    cy.get('[data-test-team-rotations-preset^="wuwa_calc Xuanling S6R5"]', { timeout: 30000 })
      .first()
      .find("[data-test-team-rotations-preset-import]")
      .click();
    cy.get("[data-test-team-rotation-name]")
      .invoke("val")
      .should("match", /^wuwa_calc Xuanling S6R5/);
    cy.get('[data-test-team-rotation-slot="0"]').should("contain.text", "Xuanling");
    cy.get("[data-test-team-rotation-action]").should("have.length.greaterThan", 10);

    // the slot's import dialog lists the same loops under Presets
    cy.get('[data-test-team-rotation-import-rotation-open="0"]').click();
    cy.get("[data-test-team-rotation-import-modal]").should("have.attr", "open");
    cy.contains("[data-test-team-rotation-import-modal] h4", "Presets")
      .parent()
      .contains("(wuwa_calc)")
      .should("exist");
  });
});
