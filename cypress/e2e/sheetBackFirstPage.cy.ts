// Wuthering Tools+: Back closes a sheet on the first page of a visit too (src/sim/shell/sheetHistory.ts). The Back
// guard cancels a router move, and a page opened from a bookmark or a shared link has none behind it: Back with
// /my-rankings' Options, /rotation's Play along or the Ask sheet open left the site (2026-11-16, second check of the
// Back fixes). cy.visit is such a first page. v3 UI at the S26's 412 px and 130 % text, upstream's Cartethyia fixture.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function firstPage() {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      win.localStorage.setItem("wtplus:ai:key", "sk-test");
    },
    onLoad(win: Window) {
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130% !important; }";
      win.document.head.appendChild(style);
      // a mark on this document: Back must not unload it
      (win as unknown as { __firstPage: boolean }).__firstPage = true;
    },
  };
}

const stillThisPage = (): void => {
  cy.window().should((win) => expect((win as unknown as { __firstPage?: boolean }).__firstPage, "the page was not left").to.eq(true));
};

describe("Back with a sheet open on the first page of a visit", () => {
  beforeEach(() => cy.viewport(412, 915));

  it("closes /my-rankings' Options and stays, again on a second opening, and adds one entry at most", () => {
    cy.visit("/my-rankings", firstPage());
    cy.get("[data-test-my-rankings-options]", { timeout: 60000 }).should("be.visible").click();
    cy.get("[data-test-my-rankings-sheet]").should("be.visible");
    cy.go("back");
    cy.get("[data-test-my-rankings-sheet]").should("not.exist");
    cy.location("pathname").should("eq", "/my-rankings");
    stillThisPage();
    cy.get("[data-test-my-rankings-options]").should("be.visible");

    let entries = 0;
    cy.window().then((win) => (entries = win.history.length));
    cy.get("[data-test-my-rankings-options]").click();
    cy.get("[data-test-my-rankings-sheet]").should("be.visible");
    cy.window().then((win) => expect(win.history.length, "no second entry for the second opening").to.eq(entries));
    cy.go("back");
    cy.get("[data-test-my-rankings-sheet]").should("not.exist");
    cy.location("pathname").should("eq", "/my-rankings");
    stillThisPage();
  });

  it("closes the Ask sheet on the page the site opened on", () => {
    cy.visit("/teams", firstPage());
    cy.get("[data-test-ai-open]").should("be.visible").click();
    cy.get("[data-test-ai-panel]").should("be.visible");
    cy.go("back");
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    cy.location("pathname").should("eq", "/teams");
    stillThisPage();
  });

  it("a sheet closed by its own button leaves nothing in the way: a move inside the app and Back work as before", () => {
    cy.visit("/my-rankings", firstPage());
    cy.get("[data-test-my-rankings-options]", { timeout: 60000 }).should("be.visible").click();
    cy.get("[data-test-my-rankings-sheet-close]").click();
    cy.get("[data-test-my-rankings-sheet]").should("not.exist");
    cy.get("[data-test-nav-rankings]").click();
    cy.get('[data-test-nav-plus-page="/account"]').click();
    cy.location("pathname").should("eq", "/account");
    cy.go("back");
    cy.location("pathname").should("eq", "/my-rankings");
    stillThisPage();
    cy.get("[data-test-my-rankings-options]").should("be.visible");
  });
});
