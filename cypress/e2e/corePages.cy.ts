// Wuthering Tools+ on Ryan's core pages (2026-11-02 core audit, track fix-core; src/sim/README.md "Core pages,
// refined"): the palette opens a calculator section and /optimizer lands on the optimizer, the desktop rail's Tools+
// menu opens beside its button, Backup & Restore says what an overwrite keeps, and the Teams editor's team buffs switch
// says what it does in a line a phone shows (its member stat icons readable on a light theme). The phone layout checks
// of the same audit (every calculator section inside the screen, no flicker at a section's end, Ask off Ryan's menus,
// the echo importer) are in phoneLayout.cy.ts; the Wavescan fold in wavescanNewEchoes.cy.ts.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function v3(options: { theme?: string; fontScale?: number; teams?: unknown[] } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character as string);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
      if (options.teams) win.localStorage.setItem("teamRotations", JSON.stringify({ teams: options.teams }));
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false, ...(options.theme ? { theme: options.theme } : {}) };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!options.fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${options.fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

describe("core pages, refined", () => {
  it("opens the rail's Tools+ menu beside its button, and a calculator section from the palette and the old /optimizer address", () => {
    cy.viewport(1440, 900);
    cy.visit("/teams", v3());
    cy.get(".plus-nav--rail > summary").should("be.visible").click();
    cy.get("[data-test-nav-plus-menu]:visible").should(($menu) => {
      const menu = $menu[0].getBoundingClientRect();
      const item = $menu[0].closest("details")!.querySelector("summary")!.getBoundingClientRect();
      // it used to open at the top of the window (y 12) with its button half way down
      expect(menu.top, "menu top: no lower than the button's top").to.be.at.most(item.top + 1);
      expect(menu.bottom, "menu bottom: reaches past the button").to.be.at.least(item.bottom - 1);
      expect(menu.top, "menu top: moved down to its button").to.be.greaterThan(100);
      expect(menu.bottom, "the menu fits the window").to.be.at.most(900);
    });
    cy.get("[data-test-nav-plus-search]:visible").click();
    cy.get("[data-test-palette-input]").type("optimizer");
    cy.get("[data-test-palette-item]").first().should("have.attr", "data-test-palette-item", "page:/?screen=optimizer");
    cy.get("[data-test-palette-input]").type("{enter}");
    cy.location("pathname").should("eq", "/");
    cy.location("search").should("eq", "");
    cy.get(".screen--optimizer").should("be.visible");
    cy.get(".screen--character").should("not.be.visible");

    // the palette on the calculator itself: another section, the same page
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]").type("build card{enter}");
    cy.get(".screen--build-card").should("be.visible");
    cy.location("search").should("eq", "");

    // Ryan's old /optimizer page redirects to the calculator: it lands on the optimizer, not on Character
    cy.visit("/optimizer", v3());
    cy.location("pathname").should("eq", "/");
    cy.get(".screen--optimizer").should("be.visible");
  });

  it("says what a Backup & Restore overwrite keeps, and what the Teams editor's team buffs switch does, on a phone", () => {
    cy.viewport(412, 915);
    cy.visit("/settings?section=backup-restore", v3({ fontScale: 1.3 }));
    cy.get("[data-test-backup-kept-note]")
      .should("be.visible")
      .and("contain.text", "Kept:")
      .and("contain.text", "Before a Settings import")
      .and("contain.text", "Not kept: their other saved builds, levels and talents, your other echoes and your teams");
    cy.get("[data-test-backup-kept-note-link]").should("have.attr", "href", "/build-history").click();
    cy.location("pathname").should("eq", "/build-history");

    const character = JSON.parse(configOptimizer.data.character as string);
    const actions = character.characters.Cartethyia.rotations[0].actions.map((a: Record<string, unknown>, i: number) => ({ ...a, id: `cp-${i}`, slot: 0, order: i + 1 }));
    const team = { id: "cp-team", name: "Core pages team", characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions, duration: 25, enemyConfig: {} };
    cy.visit("/teams", v3({ fontScale: 1.3, theme: "light", teams: [team] }));
    cy.get(`[data-test-team-rotations-item="${team.name}"] .card-body h3`).click();
    cy.get("[data-test-auto-team-buffs-caption]")
      .should("be.visible")
      .invoke("attr", "id")
      .then((id) => cy.get("[data-test-auto-team-buffs]").should("have.attr", "aria-describedby", id));
    cy.get("[data-test-auto-team-buffs]").then(($toggle) => {
      const on = ($toggle[0] as HTMLInputElement).checked;
      cy.get("[data-test-auto-team-buffs-caption]").should("contain.text", on ? "Uses your teammates' real builds" : "Each character's Team Buffs panel");
      cy.wrap($toggle).click({ force: true });
      cy.get("[data-test-auto-team-buffs-caption]").should("contain.text", on ? "Each character's Team Buffs panel" : "Uses your teammates' real builds");
      cy.wrap($toggle).click({ force: true }); // back as it was (the switch is saved)
      // the words are not part of the switch: a tap to read them moves no team's numbers
      cy.get("[data-test-auto-team-buffs-caption]").click();
      cy.get("[data-test-auto-team-buffs]").should(on ? "be.checked" : "not.be.checked");
    });
    // light theme: the member cards' white stat icons are inverted, as the Forte card's are
    cy.get('[data-test-team-rotation-slot="0"] [data-test-team-rotation-slot-stat] > img').should("have.length", 6).each(($img) => {
      expect($img[0].ownerDocument.defaultView!.getComputedStyle($img[0]).filter, "stat icon on a light card").to.contain("invert");
    });
  });
});
