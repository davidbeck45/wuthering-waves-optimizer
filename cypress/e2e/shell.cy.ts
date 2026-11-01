// Wuthering Tools+ shell refinements (2026-10-31 audit; src/sim/README.md "Shell refinements"): the Tools+ menu opens
// the search palette (the only way on a phone), the palette reaches Convene's tabs and the Settings sections, the
// v3 "What's new" pictures only load when that dialog opens, and the first-visit card on the calculator.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const WHATS_NEW = "https://ryanbenson.github.io/wuthering-waves-assets/wt-info/**";

function v3(extra: (win: Window) => void = () => {}) {
  return {
    onBeforeLoad(win: Window) {
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      extra(win);
    },
  };
}

describe("shell", () => {
  it("opens the search palette from the Tools+ menu on a phone and reaches a Convene tab", () => {
    cy.viewport(412, 915);
    cy.visit("/today", v3());
    cy.get("[data-test-nav-rankings]:visible").click();
    cy.get("[data-test-nav-plus-search]:visible").should("contain.text", "Search pages").click();
    cy.get("[data-test-palette]").should("have.attr", "open");
    cy.get("[data-test-palette-input]").type("pull advisor");
    cy.get('[data-test-palette-item="page:/convene?tab=advisor"]').should("exist");
    cy.get("[data-test-palette-input]").type("{enter}");
    cy.location("pathname").should("eq", "/convene");
    cy.location("search").should("eq", "?tab=advisor");
    cy.get("[data-test-palette]").should("not.exist");
  });

  it("opens a Settings section from the address, also while Settings is open", () => {
    cy.visit("/settings?section=backup-restore", v3());
    cy.get("[data-test-settings-export-copy]").should("be.visible");
    // the palette's Wavescan row on the open page: the query changes, the page stays
    cy.window().then((win) => {
      win.history.pushState({}, "", "/settings?section=wavescan");
      win.dispatchEvent(new PopStateEvent("popstate"));
    });
    cy.get("[data-test-wavescan-file-input]").should("exist");
    cy.get("[data-test-settings-export-copy]").should("not.exist");
  });

  it("loads the What's new pictures only when that dialog opens", () => {
    let fetched = 0;
    cy.intercept("GET", WHATS_NEW, (req) => {
      fetched += 1;
      req.reply({ statusCode: 200, headers: { "content-type": "image/png" }, body: "" });
    });
    cy.visit("/today", v3());
    cy.get("[data-test-today]").should("be.visible");
    cy.wait(1500);
    cy.then(() => expect(fetched, "What's new pictures on a cold load").to.equal(0));
    // Electron never fetches lazy images, so the count above can't fail on its own: what keeps Chromium from fetching
    // them is the closed dialog being display:none (phone.css § 18; at opacity 0 inside the viewport it loaded ~5 MB)
    cy.get("[data-test-whats-new-v3-modal]").should("not.have.attr", "open");
    cy.get("[data-test-whats-new-v3-modal]").should("have.css", "display", "none");
    cy.get("[data-test-whats-new-v3-modal]").then(($d) => ($d[0] as HTMLDialogElement).showModal());
    cy.get("[data-test-whats-new-v3-modal]").should("not.have.css", "display", "none").and("have.attr", "open");
    // (lazy images wait on rendering frames, which headless Electron doesn't run: that they load once the dialog is
    // open was checked in Chromium with shot.mjs — every picture decoded)
    cy.get("[data-test-whats-new-v3-modal] img").should("have.length.greaterThan", 0);
  });

  it("welcomes a first-time visitor on the calculator until they dismiss it", () => {
    const fresh = v3((win) => win.localStorage.setItem("wtplus:welcome:e2e", "1"));
    cy.visit("/", fresh);
    cy.get("[data-test-welcome]").should("be.visible").and("contain.text", "New here?");
    cy.get("[data-test-welcome-start]").should("have.attr", "href", "/account");
    cy.get("[data-test-welcome-restore]").should("have.attr", "href", "/settings?section=backup-restore");
    // only on the calculator
    cy.visit("/today", fresh);
    cy.get("[data-test-today]").should("be.visible");
    cy.get("[data-test-welcome]").should("not.exist");
    cy.visit("/", fresh);
    cy.get("[data-test-welcome-close]").click();
    cy.get("[data-test-welcome]").should("not.exist");
    cy.reload();
    cy.get("[data-test-live-result-bar]").should("be.visible");
    cy.get("[data-test-welcome]").should("not.exist");
  });

  it("doesn't welcome someone whose account is already in", () => {
    cy.visit(
      "/",
      v3((win) => {
        win.localStorage.setItem("wtplus:welcome:e2e", "1");
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      }),
    );
    cy.get("[data-test-live-result-bar]").should("be.visible");
    cy.get("[data-test-welcome]").should("not.exist");
  });
});
