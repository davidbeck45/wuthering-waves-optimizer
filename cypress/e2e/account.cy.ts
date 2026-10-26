// Wuthering Tools+: "My account" (src/sim/account/AccountView.vue) — the account dashboard in the v3 UI: KPI tiles,
// the roster grid, "What to invest in next" and the character drawer, the empty state, and a phone at 130 % text.
// Seeds the Cartethyia optimizer account plus two armed teammates (Ciaccona, Chisa), so a wuwa_calc team preset
// (Cartethyia + Ciaccona + Chisa) is fieldable and every investment carries a team figure.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function seed(options: { empty?: boolean; fontScale?: number } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  if (!options.empty) {
    character.characters.Ciaccona = { weapon: "WoodlandAria" };
    character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  }
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear(); // score on this visit, never a previous test's cached ranking
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
}

const percent = (text: string): number => Number(text.replace(/[^0-9.+-]/g, ""));

describe("my account", () => {
  it("shows three ways in when nothing is set up, and the hub marks the page", () => {
    cy.visit("/account", seed({ empty: true }));
    cy.get("[data-test-account-empty]").should("exist");
    cy.get("[data-test-account-empty] [data-test-my-rankings-cta]").should("have.length", 3);
    cy.get("[data-test-account-hero]").should("not.exist");
    cy.title().should("contain", "My account");
    cy.get("[data-test-nav-rankings]").should("have.class", "btn-active").click();
    cy.get('[data-test-nav-plus-page="/account"]').should("have.attr", "aria-current", "page");
  });

  it("lays out the roster, the investments and the drawer on a real build", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    // KPI tiles from the Account State
    cy.get('[data-test-account-kpi="characters"]').should("contain.text", "3").and("contain.text", "/ 3");
    cy.get('[data-test-account-kpi="echoes"]').should("contain.text", "/");
    cy.get('[data-test-account-kpi="score"]').should("contain.text", "%");
    cy.get("[data-test-account-source]").should("contain.text", "this browser");

    // her card: display names, upstream's Build Score grade, the best rotation's damage
    cy.get('[data-test-account-card="Cartethyia"]', { timeout: 120000 }).should("contain.text", "Cartethyia").and("contain.text", "Defier's Thorn").and("contain.text", "S2");
    cy.get('[data-test-account-card="Cartethyia"] [data-test-account-card-grade]').invoke("text").should("match", /[A-E]S{0,3}\s*\d+%/);
    cy.get('[data-test-account-card="Cartethyia"] [data-test-account-card-damage]', { timeout: 120000 })
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/^\d+(\.\d+)?[KM]$/);
      });
    // Ciaccona carries no echoes: her card says so
    cy.get('[data-test-account-card="Ciaccona"]').should("have.attr", "data-status", "no-echoes");

    // the strongest fieldable team leads the page, and is listed under "Teams you can field"
    cy.get("[data-test-account-hero-damage]", { timeout: 120000 }).invoke("text").should("match", /\d/);
    cy.get("[data-test-account-teams] [data-test-account-team]").should("have.length.at.least", 1);
    cy.get('[data-test-account-kpi="teams"]').invoke("text").should("match", /\d/);

    // what to invest in next: engine gains, the team figure first; her next sequence is on the list
    cy.get("[data-test-account-invest-row]", { timeout: 120000 }).should("have.length.at.least", 3);
    cy.get("[data-test-account-invest-progress]", { timeout: 120000 }).should("not.exist");
    cy.get('[data-test-account-invest-row="Cartethyia:sequence:3"]').should("exist");
    cy.get("[data-test-account-invest-row] [data-test-account-invest-gain]").first().invoke("text").should("match", /[+-]\d+\.\d%/);
    cy.get("[data-test-account-invest-row]").first().should("contain.text", "team");
    // team gains read best first
    cy.get("[data-test-account-invest-gain]").then(($g) => {
      const values = [...$g].map((el) => percent(el.textContent ?? ""));
      for (let i = 1; i < values.length; i++) expect(values[i - 1], `row ${i}`).to.be.at.least(values[i]);
    });
    // own damage, and a kind filter
    cy.get('[data-test-account-invest-by="own"]').click();
    cy.get("[data-test-account-invest-row]").first().should("contain.text", "own");
    cy.get('[data-test-account-invest-kind="refine"]').click();
    cy.get("[data-test-account-invest-row]").each(($row) => {
      expect($row.attr("data-kind")).to.eq("refine");
    });
    cy.get('[data-test-account-invest-kind="all"]').click();

    // roster filters: element, then built only
    cy.get('[data-test-account-filter-element="Havoc"]').click();
    cy.get("[data-test-account-card]").should("have.length", 1).first().should("have.attr", "data-test-account-card", "Chisa");
    cy.get("[data-test-account-filter-clear]").click();
    cy.get('[data-test-account-filter-build="built"]').click();
    cy.get("[data-test-account-card]").should("have.length", 1);
    cy.get('[data-test-account-filter-build="all"]').click();
    cy.get("[data-test-account-card]").should("have.length", 3);

    // the drawer: her investments with own and team gains, and the way to her Substats tab
    cy.get('[data-test-account-card="Cartethyia"]').click();
    // (Electron reports an animating top-layer dialog at opacity 0, like the importer's: assert it is open instead)
    cy.get("[data-test-account-drawer]").should("have.attr", "open");
    cy.get("[data-test-account-drawer] .dr__name").should("contain.text", "Cartethyia");
    cy.get("[data-test-account-drawer-invest] .dr-inv").should("have.length.at.least", 2).first().should("contain.text", "team");
    cy.get("[data-test-account-open-substats]").click({ force: true });
    cy.location("pathname").should("eq", "/my-rankings");
    cy.location("search").should("contain", "focus=Cartethyia");
    cy.get('[data-test-my-rankings-substats-panel="Cartethyia"]', { timeout: 120000 }).should("exist");

    // back on the account page the cached ranking and plan come straight back; the drawer opens her calculator
    cy.visit("/account");
    cy.get("[data-test-account-invest-row]", { timeout: 20000 }).should("have.length.at.least", 3);
    cy.get('[data-test-account-card="Cartethyia"]').click();
    cy.get("[data-test-account-open-calculator]").click({ force: true });
    cy.location("pathname").should("eq", "/");
    cy.window().then((win) => {
      expect(JSON.parse(win.localStorage.getItem("character") ?? "{}").activeCharacter).to.eq("Cartethyia");
    });
  });

  it("fits a phone at 130 % text: two cards a row at 412 px, one at 360 px", () => {
    cy.viewport(412, 915);
    cy.visit("/account", seed({ fontScale: 1.3 }));
    cy.get('[data-test-account-card="Cartethyia"] [data-test-account-card-damage]', { timeout: 120000 }).should("exist");
    cy.get("[data-test-account-invest-row]", { timeout: 120000 }).should("have.length.at.least", 1);
    cy.get(".roster__grid").should(($grid) => {
      expect($grid.css("grid-template-columns").split(" ").length, "phone roster columns").to.equal(2);
    });
    expectNoHorizontalScroll("/account at 412 px");
    cy.get('[data-test-account-card="Cartethyia"]').click();
    cy.get("[data-test-account-drawer]").should("have.attr", "open");
    cy.get("[data-test-account-drawer] .dr__inner").should(($inner) => {
      expect($inner[0].getBoundingClientRect().right, "drawer inside the phone").to.be.at.most(412);
    });
    expectNoHorizontalScroll("/account drawer at 412 px");
    cy.get("[data-test-account-drawer-close]").click({ force: true });
    cy.get("[data-test-account-drawer]").should("not.have.attr", "open");
    cy.viewport(360, 800);
    cy.get(".roster__grid").should(($grid) => {
      expect($grid.css("grid-template-columns").split(" ").length, "narrow phone roster columns").to.equal(1);
    });
    expectNoHorizontalScroll("/account at 360 px");
  });
});
