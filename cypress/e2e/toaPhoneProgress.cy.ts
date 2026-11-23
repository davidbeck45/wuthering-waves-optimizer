// Wuthering Tools+ — /endgame's progress card on a 360 px phone at 130 % text (David's S26): while the check runs, the
// step's label ("Solving the teams you can field at your account") keeps a readable width. It shared one row with the
// spinner, the count and Cancel, and was squeezed to one word a line.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

describe("ToA clear check on a phone (/endgame)", () => {
  it("gives the running step's label a line of its own width at 360 px, 130 % text", () => {
    cy.viewport(360, 800);
    cy.clock(Date.UTC(2026, 10, 20, 12), ["Date"]);
    cy.visit("/endgame", {
      onBeforeLoad(win: Window) {
        for (const k of ["wtplus:endgame:check", "wtplus:endgame:clears", "wtplus:endgame:prefs"]) win.localStorage.removeItem(k);
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        win.localStorage.setItem("wtplus:endgame:prefs", JSON.stringify({ v: 1, region: "asia", usePace: false }));
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false, theme: "light" };
        win.localStorage.setItem("settings", JSON.stringify(settings));
        win.document.documentElement.style.fontSize = "130%";
      },
    });
    cy.get("[data-test-toa-progress]", { timeout: 60000 }).within(() => {
      cy.get("[data-test-toa-progress-label]").then(($label) => {
        const card = $label.closest(".card-body")[0]!.getBoundingClientRect().width;
        // at least 60 % of the card: two lines at most for the longest step, not one word a line
        expect($label[0]!.getBoundingClientRect().width).to.be.greaterThan(card * 0.6);
      });
      cy.get("[data-test-toa-cancel]").should("be.visible");
    });
  });
});
