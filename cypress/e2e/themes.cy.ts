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

// Wuthering Tools+: the Ctrl+K palette has one row per theme (useTheme's own list), the one in use marked "Now", and a
// switch from the palette moves the check mark in Ryan's theme menu too (src/sim/README.md "Loose ends", 2026-11-02).
describe("themes from the palette", () => {
  it("finds Gruvbox by name, switches to it, marks it Now and moves the theme menu's check", () => {
    cy.viewport(1440, 900);
    cy.visit("/");
    cy.get("html").should("have.attr", "data-theme").and("not.eq", "gruvbox");
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]", { timeout: 20000 }).type("gruvbox");
    cy.get("[data-test-palette-item]").first().should("have.attr", "data-test-palette-item", "theme:gruvbox").and("contain.text", "Gruvbox theme");
    cy.get("[data-test-palette-input]").type("{enter}");
    cy.get("[data-test-palette]").should("not.exist");
    cy.get("html").should("have.attr", "data-theme", "gruvbox").and("have.attr", "data-theme-style", "dark");
    // Ryan's dropdown keeps its own copy of the theme for the check mark: it follows the palette's switch
    cy.get('[data-set-theme="gruvbox"] svg').first().should("have.class", "opacity-100");
    cy.get('[data-set-theme="dark"] svg').first().should("have.class", "opacity-0");

    // "theme" lists every theme the app offers, past the six rows a group shows; the one in use says so
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]").type("theme");
    cy.get('[data-test-palette-item^="theme:"]').should("have.length", 9);
    cy.get('[data-test-palette-item="theme:gruvbox"]').should("contain.text", "Now").and("contain.text", "In use now");
    cy.get('[data-test-palette-item="theme:nord"]').should("not.contain.text", "Now").and("contain.text", "light background, dark text").click();
    cy.get("html").should("have.attr", "data-theme", "nord").and("have.attr", "data-theme-style", "light");
    cy.reload();
    cy.get("html").should("have.attr", "data-theme", "nord");
  });
});
