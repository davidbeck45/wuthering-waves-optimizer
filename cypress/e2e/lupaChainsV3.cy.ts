// Wuthering Tools+ — Lupa on the v3 screens (hunt round 1, 2026-11-06). Calculator.vue's chain handler called into the
// classic buffs panel, which v3 does not mount: 22 errors on every load and one per chain toggle, Lupa alone of the
// roster. Her figures were right all along (other watchers redo the sums), so this checks the console.
import { configOptimizer as lupa } from "./calculator/data/Lupa/data";

/* eslint-disable @typescript-eslint/no-explicit-any */

const raised = (spy: sinon.SinonSpy): number => spy.getCalls().filter((call) => call.args.some((arg) => String(arg?.message ?? arg).includes("retriggerBuffCalculations"))).length;

describe("Lupa on the v3 screens", () => {
  it("loads and takes a chain toggle with no error", () => {
    cy.visit("/", {
      onBeforeLoad(win) {
        const data = JSON.parse(lupa.data.character);
        data.activeCharacter = "Lupa";
        win.localStorage.setItem("character", JSON.stringify(data));
        win.localStorage.setItem("inventory", lupa.data.inventory as string);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
        cy.spy(win.console, "error").as("error");
      },
    });
    cy.get("[data-test-resonance-chains] input", { timeout: 30000 }).should("have.length.greaterThan", 3);
    cy.wait(1500); // the handler waits a tick before it reaches the panel
    cy.get("[data-test-resonance-chains] input").first().click({ force: true });
    cy.wait(800);
    cy.get<sinon.SinonSpy>("@error").then((spy) => expect(raised(spy), "errors from the classic panel's handle").to.eq(0));
  });
});
