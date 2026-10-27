// Wuthering Tools+: /weapons, "Weapon value" (src/sim/weaponValue/) in the v3 UI — the empty state and the hub, the
// signature chart on a real build (rows, KPI tiles, scope / filter / sort, an expanded row with every option), the
// `?focus=` deep link from /my-rankings, both selector kinds (a weapon pool read off the chart, a resonator pool solved
// by wuwa_calc in the shared worker), and a phone at 130 % text. Seeds the Cartethyia optimizer account plus two armed
// teammates — Ciaccona on the 4★ Cadenza (so her Woodland Aria is a signature she does not hold) and Chisa on her
// Kumokiri — so a wuwa_calc team preset (Cartethyia + Ciaccona + Chisa) is fieldable.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function seed(options: { empty?: boolean; fontScale?: number } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  if (!options.empty) {
    character.characters.Ciaccona = { weapon: "Cadenza" };
    character.characters.Chisa = { weapon: "Kumokiri" };
    character.characters.Encore = { resonanceChains: {} }; // in the data, no weapon: "not set up"
  }
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear(); // score on this visit, never a previous test's cached result
      win.localStorage.removeItem("wtplus:weapons:prefs");
      if (!options.empty) {
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      }
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
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

function expectNoHorizontalScroll(what: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${what} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
  cy.window().then((win) => expect(win.innerWidth, `${what} layout viewport`).to.be.at.most(win.document.documentElement.clientWidth + 15));
}

const PCT = /^[+−-]\d+(\.\d+)?%$/;

describe("weapon value", () => {
  it("asks for an account when nothing is set up, and the hub lists the page", () => {
    cy.visit("/weapons", seed({ empty: true }));
    cy.get("[data-test-weapons-empty]").should("exist");
    cy.get("[data-test-weapons-empty] [data-test-my-rankings-cta]").should("have.length", 3);
    cy.get('[data-test-weapons-empty] [data-test-my-rankings-cta="import"]').should("have.attr", "href", "/settings");
    cy.get("[data-test-weapons-chart]").should("not.exist");
    cy.title().should("contain", "Weapon value");
    cy.get("[data-test-nav-rankings]").click();
    cy.get('[data-test-nav-plus-page="/weapons"]').should("have.attr", "aria-current", "page").and("contain.text", "Weapon value");
  });

  it("charts every set-up character's signature and opens a row on every option", () => {
    cy.viewport(1440, 900);
    cy.visit("/weapons", seed());
    cy.get("[data-test-weapons-source]").should("contain.text", "this browser");
    cy.get('[data-test-weapons-row="Ciaccona"]', { timeout: 120000 }).should("have.attr", "data-kind", "swap");
    cy.get("[data-test-weapons-progress]", { timeout: 120000 }).should("not.exist");
    cy.get("[data-test-weapons-row]").should("have.length", 3);
    cy.get('[data-test-weapons-row="Cartethyia"]').should("have.attr", "data-kind", "held").and("contain.text", "Defier's Thorn");
    cy.get('[data-test-weapons-row="Chisa"]').should("have.attr", "data-kind", "held").and("contain.text", "Kumokiri");
    // Ciaccona does not hold Woodland Aria: her bar is its R1, with the further refinements behind it
    cy.get('[data-test-weapons-row="Ciaccona"]').should("contain.text", "Woodland Aria").and("contain.text", "not held");
    cy.get('[data-test-weapons-row="Ciaccona"] [data-test-weapons-value]').invoke("text").should("match", PCT);
    cy.get("[data-test-weapons-kpis]").should("contain.text", "3").and("contain.text", "/ 3").and("contain.text", "1 without a weapon");

    // own scope: the whisker (stats only) appears on the signature she does not hold
    cy.get('[data-test-weapons-scope="own"]').click();
    cy.get('[data-test-weapons-row="Ciaccona"] .wv-whisker').should("exist");
    cy.get('[data-test-weapons-scope="team"]').click();
    cy.get('[data-test-weapons-row="Ciaccona"] .wv-whisker').should("not.exist");

    // filters and the not-set-up list
    cy.get('[data-test-weapons-filter="swap"]').click();
    cy.get("[data-test-weapons-row]").should("have.length", 1);
    cy.get('[data-test-weapons-filter="all"]').click();
    cy.get("[data-test-weapons-not-set-up]").check({ force: true });
    cy.get('[data-test-weapons-not-set-up-row="Encore"]').should("contain.text", "Not set up");
    cy.get('[data-test-weapons-sort]').select("name");
    cy.get("[data-test-weapons-row]").first().should("have.attr", "data-test-weapons-row", "Cartethyia");

    // a row opened: the signature ladder R1…R5, the standard 5★ options, the best 4★, the held weapon's next refinement
    cy.get('[data-test-weapons-toggle="Ciaccona"]').click();
    cy.get('[data-test-weapons-detail="Ciaccona"]').should("be.visible");
    for (const r of [1, 2, 3, 4, 5]) cy.get(`[data-test-weapons-option="signature:WoodlandAria:R${r}"]`).should("exist");
    cy.get('[data-test-weapons-option="signature:WoodlandAria:R1"]').should("contain.text", "stats only");
    cy.get('[data-test-weapons-option="refine:Cadenza:R2"]').should("contain.text", "Cadenza R2");
    cy.get('[data-test-weapons-detail="Ciaccona"] [data-test-weapons-option^="standard:"]').should("have.length", 2);
    cy.get('[data-test-weapons-detail="Ciaccona"] [data-test-weapons-option^="four:"]').should("have.length", 1).and("contain.text", "R5");
    cy.get('[data-test-weapons-detail="Ciaccona"] a[href*="prydwen.gg"]').should("have.attr", "target", "_blank");
    cy.get('[data-test-weapons-whatif="Ciaccona"]').should("have.attr", "href").and("contain", "/my-rankings?focus=Ciaccona");
    // a reload is served from the tab's cache, the open row from the focus link
    cy.reload();
    cy.get('[data-test-weapons-row="Ciaccona"]', { timeout: 60000 }).should("exist");
    cy.get("[data-test-weapons-skeleton]").should("not.exist");
    cy.get(".wv-foot").should("contain.text", "kept for this tab");
  });

  it("opens the row a /my-rankings link points at", () => {
    cy.viewport(1440, 900);
    cy.visit("/weapons?focus=Chisa", seed());
    cy.get('[data-test-weapons-detail="Chisa"]', { timeout: 120000 }).should("be.visible");
    cy.get('[data-test-weapons-detail="Chisa"] [data-test-weapons-option="signature:Kumokiri:R2"]').should("exist");
    cy.get('[data-test-weapons-calculator="Chisa"]').click();
    cy.location("pathname").should("eq", "/");
  });

  it("ranks a weapon selector off the chart and a resonator selector through wuwa_calc", () => {
    cy.viewport(1440, 900);
    cy.visit("/weapons?tab=selector", seed());
    cy.title().should("contain", "Weapon value");
    cy.get('[data-test-weapons-pool="standard-weapon"]').click();
    cy.get("[data-test-weapons-pool-source]").should("contain.text", "3.7").and("contain.text", "last checked");
    cy.get("[data-test-weapons-pool-item]").should("have.length", 10);
    cy.get("[data-test-weapons-pick]", { timeout: 120000 }).should("have.length", 10);
    // Emerald of Genesis: a sword — Cartethyia is the only sword user here
    cy.get('[data-test-weapons-pick="EmeraldOfGenesis"] button').click();
    cy.get('[data-test-weapons-pick="EmeraldOfGenesis"] .sc-uses li').should("have.length", 1).and("contain.text", "Cartethyia");
    // leave an option out (not in your copy of the selector)
    cy.get('[data-test-weapons-pool-item="BosonAstrolabe"]').click();
    cy.get("[data-test-weapons-pick]").should("have.length", 9);

    // the standard resonator pick, solved on demand
    cy.get('[data-test-weapons-pool="standard-resonator"]').click();
    cy.get("[data-test-weapons-pool-item]").should("have.length", 5);
    cy.get("[data-test-weapons-selector-run]", { timeout: 120000 }).should("not.be.disabled").click();
    cy.get("[data-test-weapons-pick]", { timeout: 180000 }).should("have.length", 5);
    cy.get('[data-test-weapons-pick="Encore"]').should("have.attr", "data-status").and("match", /^(no-teams|new)$/);
    cy.get('[data-test-weapons-pick="Jianxin"]').should("exist");
    cy.get('[data-test-weapons-pick="Verina"] button').click();
    cy.get('[data-test-weapons-pick-rankings="Verina"]').should("have.attr", "href").and("contain", "/rankings#tc=mine");

    // the Moonlit Path pool says to check it in game; a custom pool takes released resonators only
    cy.get('[data-test-weapons-pool="moonlit-path"]').should("contain.text", "check in game").click();
    cy.get("[data-test-weapons-pool-source]").should("contain.text", "check the pick in game");
    cy.get('[data-test-weapons-pool="custom"]').click();
    cy.get("[data-test-weapons-custom-input]").type("Phoe");
    cy.get('[data-test-weapons-custom-suggestion="Phoebe"]').click();
    cy.get('[data-test-weapons-pool-item="Phoebe"]').should("exist");
    cy.get("[data-test-weapons-custom-input]").type("Shore{enter}");
    cy.get('[data-test-weapons-pool-item="Shorekeeper"]').should("exist");
    cy.get("[data-test-weapons-custom-input]").type("Lily");
    cy.get("[data-test-weapons-custom-suggestion]").should("not.exist"); // not released here
    cy.get(".sc-suggest__none").should("contain.text", "No released resonator");
  });

  it("reads as cards on a phone at 130 % text, with the options in a sheet", () => {
    for (const [width, height, fontScale] of [
      [412, 915, 1.3],
      [360, 800, 1],
    ]) {
      cy.viewport(width, height);
      cy.visit("/weapons", seed({ fontScale }));
      cy.get('[data-test-weapons-row="Ciaccona"]', { timeout: 120000 }).scrollIntoView();
      cy.get('[data-test-weapons-row="Ciaccona"]').should("be.visible");
      cy.get("[data-test-weapons-progress]", { timeout: 120000 }).should("not.exist");
      expectNoHorizontalScroll(`/weapons ${width} px`);
      cy.get('[data-test-weapons-row="Ciaccona"]').then(($row) => expect($row[0].getBoundingClientRect().right, "card inside the viewport").to.be.at.most(width));
      cy.get('[data-test-weapons-toggle="Ciaccona"]').click();
      cy.get('[data-test-weapons-detail="Ciaccona"] thead').should("have.css", "display", "none");
      expectNoHorizontalScroll(`/weapons ${width} px (row open)`);
      cy.get("[data-test-weapons-options]").should("be.visible").click();
      cy.get("[data-test-weapons-sheet]").should("be.visible");
      cy.get('[data-test-weapons-sheet-scope="own"]').click();
      cy.get("[data-test-weapons-sheet-close]").click();
      cy.get("[data-test-weapons-sheet]").should("not.exist");
      cy.get('[data-test-weapons-tab="selector"]').click();
      cy.get('[data-test-weapons-pool="standard-weapon"]').click();
      cy.get("[data-test-weapons-pick]", { timeout: 60000 }).should("have.length", 10);
      expectNoHorizontalScroll(`/weapons selector ${width} px`);
    }
  });
});
