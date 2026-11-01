// Wuthering Tools+ — an address the router doesn't know (src/sim/shell/NotFoundView.vue, the catch-all in main.ts): the
// nav and the saved theme, "Page not found" with the address asked for, a guess at the page it meant, links that work,
// and a phone layout that fits 360 px at 130 % text. It used to be a blank white page with no way back.
function seed(theme: string, opts: { v3?: boolean; fontScale?: number } = {}) {
  return {
    onBeforeLoad(win: Window) {
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, theme, useClassicUi: opts.v3 === false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!opts.fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${opts.fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

describe("page not found", () => {
  it("shows the nav, the saved theme, the address and a guess at the page it meant", () => {
    cy.visit("/acount?from=old-link", seed("dark"));
    cy.get("[data-test-not-found]").should("be.visible").and("contain.text", "Page not found");
    cy.title().should("eq", "Page not found — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-not-found-path]").should("have.text", "/acount?from=old-link");
    cy.get("html").should("have.attr", "data-theme", "dark");
    cy.get("[data-test-nav-rankings]").should("be.visible");
    cy.get("[data-test-not-found-suggest]").should("contain.text", "My account").click();
    cy.location("pathname").should("eq", "/account");
  });

  it("links the calculator, Today and every Tools+ page, and opens the search palette", () => {
    cy.visit("/this-page-does-not-exist", seed("gruvbox"));
    cy.get("[data-test-not-found-suggest]").should("not.exist");
    cy.get("html").should("have.attr", "data-theme", "gruvbox");
    cy.get("[data-test-not-found-page]").should("have.length.at.least", 12);
    cy.get('[data-test-not-found-page="/echo-plan"]').should("contain.text", "Echo plan");
    // (Esc closes the palette through the native dialog's cancel, which a synthetic key doesn't fire: run a row instead)
    cy.get("[data-test-not-found-search]").click();
    cy.get("[data-test-palette]").should("have.attr", "open");
    cy.get("[data-test-palette-input]").type("weapon value{enter}");
    cy.location("pathname").should("eq", "/weapons");
    cy.go("back");
    cy.get('[data-test-not-found-link="/today"]').click();
    cy.location("pathname").should("eq", "/today");
    cy.go("back");
    cy.get('[data-test-not-found-link="/"]').click();
    cy.location("pathname").should("eq", "/");
  });

  it("keeps the classic UI's nav too", () => {
    cy.visit("/nope", seed("light", { v3: false }));
    cy.get(".navbar").should("be.visible");
    cy.get("[data-test-not-found]").should("contain.text", "Page not found");
    cy.get("html").should("have.attr", "data-theme", "light");
  });

  // David's S26 width at 130 % text; 360 px at 100 % (at 130 % Ryan's v3 header fits 360 by less than Electron's scrollbar)
  it("fits a phone", () => {
    for (const [width, height, fontScale] of [
      [412, 915, 1.3],
      [360, 800, 1],
    ] as const) {
      cy.viewport(width, height);
      cy.visit("/nope/deeper", seed("dark", { fontScale }));
      cy.get("[data-test-not-found]").should("be.visible");
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, `not-found page width at ${width}`).to.be.at.most(doc.documentElement.clientWidth);
      });
      cy.get('[data-test-not-found-link="/account"]').then(($a) => {
        expect($a[0].getBoundingClientRect().right, "main link inside the viewport").to.be.at.most(width);
      });
    }
  });
});
