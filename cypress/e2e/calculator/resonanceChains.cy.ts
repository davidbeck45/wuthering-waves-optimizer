import {
  carlottaOnlyResonanceChainsStats,
  carlottaOnlyResonanceChainsDamages,
} from "./data/Carlotta/index";
import { testAttacks } from "./utils/attackUtils";
import { testStats } from "./utils/statUtils";

describe("Calculator Resonance Chains", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("should verify that by default no resonance chains are chosen", () => {
    cy.get('[data-test-calculator-nav="resonanceChains"]').click();
    cy.get(".character__resonance-chains").should("be.visible");
    // Wuthering Tools+: this screen's boxes only. His "Hide impossible buffs" toggle on Team Buffs is on by
    // default since #720 and sits in the page (hidden) on every screen, so "no box on the page is checked"
    // went red on his own code; his CI runs no Cypress.
    cy.get('.character__resonance-chains [type="checkbox"]').should("have.length.greaterThan", 0);
    cy.get('.character__resonance-chains [type="checkbox"]').should("not.be.checked");
  });

  it("should ensure all resonance chains are able to be chosen and affect your results", () => {
    cy.richSelect("[data-test-character-select]", "Carlotta");
    cy.get(".character__self-buffs").should("be.visible"); // wait for things to load
    cy.get(".character__selection.Carlotta").should("be.visible");
    cy.get('[data-test-calculator-nav="resonanceChains"]').click();

    cy.get(".character__resonance-chain").each(($card) => {
      cy.wrap($card).find("input[type=checkbox]").click();
    });
    // validate the stats and damages after
    testStats(carlottaOnlyResonanceChainsStats, cy);
    testAttacks(carlottaOnlyResonanceChainsDamages, cy);
  });
});
