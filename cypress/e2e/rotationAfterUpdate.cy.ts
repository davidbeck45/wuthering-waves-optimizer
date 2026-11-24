// Wuthering Tools+ — /rotation after one of Riley's updates (batch 5 lane check-upgrade, 2026-11-23). His team keys are
// positions in his list: after his 2026-11-22 update production's "Continue: Aemeath · Lupa + Lynae" card
// (`wtplus:rotation:v1`, `#team=t279-…`) opened Aemeath · Verina + Lupa. A key is now stored with its members beside it
// (`&chars=…`), read as those members when the key names another team, and an old card with no members is not offered.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function seed(prefs: object | null) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      if (prefs) win.localStorage.setItem("wtplus:rotation:v1", JSON.stringify(prefs));
      else win.localStorage.removeItem("wtplus:rotation:v1");
    },
  };
}

describe("rotation after a wuwa_calc update", () => {
  it("does not offer a Continue card production stored as a bare team key", () => {
    cy.viewport(412, 915);
    cy.visit("/rotation", seed({ beep: false, size: "l", pace: 0, hp: 0, last: "#team=t279-0.0.3.s3.r0-0.1.10.s6.r0-0.0.3.s6.r4", lastTitle: "Aemeath · Lupa + Lynae" }));
    cy.contains("Your teams", { timeout: 90000 }).should("be.visible");
    cy.get("[data-test-rotation-continue]").should("not.exist");
  });

  it("stores a team key with its members, and reads it as them once the key names another team", () => {
    cy.viewport(1280, 900);
    cy.visit("/rotation#team=t425", seed(null)); // Shorekeeper · Lynae · Iuno on wuwa_calc 821f8db
    cy.get("[data-test-rotation-cue]", { timeout: 90000 }).should("be.visible");
    cy.window().its("localStorage").invoke("getItem", "wtplus:rotation:v1").should("match", /"last":"#team=t425&chars=[^"]*Shorekeeper/);
    cy.visit("/rotation");
    cy.get("[data-test-rotation-continue]", { timeout: 90000 }).should("have.attr", "href").and("match", /team=t425&chars=/);
    // the same members under a key that is another team now: the members win, and the page says why
    cy.visit("/rotation#team=t1&chars=Shorekeeper,Lynae,Iuno");
    cy.get("[data-test-rotation-cue]", { timeout: 90000 }).should("be.visible");
    cy.get("[data-test-rotation-title]").should("contain.text", "Shorekeeper").and("contain.text", "Lynae").and("contain.text", "Iuno");
    cy.get("[data-test-rotation-notice]").should("contain.text", "is another team now");
  });
});
