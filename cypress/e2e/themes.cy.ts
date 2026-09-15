// Wuthering Tools+: the theme picker carries a Gruvbox dark theme (tailwind.config.js `gruvbox`).
describe("themes", () => {
  it("offers Gruvbox dark and applies it as a dark-style theme", () => {
    cy.visit("/");
    // the DaisyUI dropdown opens on focus; Cypress does not see the focus-driven visibility
    cy.get('[aria-label="Change Theme"]').click();
    cy.get('[data-set-theme="gruvbox"]').should("exist").click({ force: true });
    cy.get("html").should("have.attr", "data-theme", "gruvbox").and("have.attr", "data-theme-style", "dark");
    // the DaisyUI tokens resolve to the Gruvbox palette (orange primary on the bg0 base)
    cy.get(".navbar").should("be.visible");
    cy.window().then((win) => {
      const primary = win.getComputedStyle(win.document.documentElement).getPropertyValue("--p").trim();
      expect(primary, "primary token").to.not.equal("");
    });
    // persisted: the choice survives a reload
    cy.reload();
    cy.get("html").should("have.attr", "data-theme", "gruvbox");
  });
});
