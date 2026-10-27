// Wuthering Tools+: the Echo Management plan builder (/echo-plan, src/sim/echoPlan/) — the in-game lock / discard
// grid built from the account, its switches, the "done in game" ticks and what changed since, all kept across a
// reload in localStorage `wtplus:echoPlan:v1`. Seeds the v3 UI through onBeforeLoad (the support file seeds classic).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const PLAN_KEY = "wtplus:echoPlan:v1";

function seed(withAccount: boolean, classic = false) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.removeItem(PLAN_KEY);
      if (withAccount) {
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
      }
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: classic };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
  };
}

const card = (set: string) => `[data-test-echo-plan-card="${set}"]`;
const chip = (set: string, id: string) => `${card(set)} [data-test-echo-plan-chip="${id}"]`;

describe("echo plan", () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
  });

  it("builds the grid from the account, follows the switches and keeps the ticks across a reload", () => {
    cy.visit("/echo-plan", seed(true));
    cy.title().should("contain", "Echo plan");
    cy.get("[data-test-echo-plan-grid]", { timeout: 60000 }).should("be.visible");
    cy.get("[data-test-echo-plan-card]").should("have.length.at.least", 37);

    // Cartethyia wears Windward Pilgrimage: her 4-cost Crit Rate is locked, a 4-cost DEF is not
    cy.get(card("WindwardPilgrimage")).should("have.attr", "data-test-echo-plan-state", "planned");
    cy.get(chip("WindwardPilgrimage", "4:CritRate")).should("have.attr", "data-test-echo-plan-verdict", "keep");
    cy.get(chip("WindwardPilgrimage", "4:DEF")).should("have.attr", "data-test-echo-plan-verdict", "discard");
    // the Havoc 1.0 set reads by its in-game name; nobody uses Freezing Frost, so it has no plan
    cy.get(card("HavocEclipse")).should("contain.text", "Sun-sinking Eclipse");
    cy.get(card("FreezingFrost")).should("have.attr", "data-test-echo-plan-state", "off");

    // only what she wears (a 4-cost Crit Rate): its Crit DMG pair is kept until "pair the crit 4-costs" goes off
    cy.get('[data-test-echo-plan-source="presets"]').uncheck();
    cy.get('[data-test-echo-plan-source="engine"]').uncheck();
    cy.get(chip("WindwardPilgrimage", "4:CritDMG")).should("have.attr", "data-test-echo-plan-verdict", "keep");
    cy.get('[data-test-echo-plan-option="pairCrit"]').uncheck();
    cy.get(chip("WindwardPilgrimage", "4:CritDMG")).should("have.attr", "data-test-echo-plan-verdict", "discard");
    cy.get('[data-test-echo-plan-option="pairCrit"]').check();
    cy.get('[data-test-echo-plan-source="presets"]').check();
    cy.get('[data-test-echo-plan-source="engine"]').check();

    // keep every 4-cost
    cy.get('[data-test-echo-plan-option="keepAll4"]').check();
    cy.get(chip("WindwardPilgrimage", "4:DEF")).should("have.attr", "data-test-echo-plan-verdict", "keep");
    // throw unused Sonatas
    cy.get('[data-test-echo-plan-option="throwUnused"]').check();
    cy.get(card("FreezingFrost")).should("have.attr", "data-test-echo-plan-state", "thrown");
    cy.get(chip("FreezingFrost", "4:CritDMG")).should("have.attr", "data-test-echo-plan-verdict", "discard");
    cy.get('[data-test-echo-plan-option="throwUnused"]').uncheck();

    // done in game: the card folds into the "Set in game" list and stays there after a reload
    cy.get('[data-test-echo-plan-done="WindwardPilgrimage"]').check();
    cy.get(`[data-test-echo-plan-done-list] ${card("WindwardPilgrimage")}`).should("have.attr", "data-test-echo-plan-status", "done");
    cy.get('[data-test-echo-plan-filter="done"]').should("contain.text", "1");
    cy.reload();
    // (her only planned Sonata is ticked, so the "to set" grid is gone; the ticked tile is the anchor)
    cy.get(`[data-test-echo-plan-done-list] ${card("WindwardPilgrimage")}`, { timeout: 60000 }).should("have.attr", "data-test-echo-plan-status", "done");
    cy.get('[data-test-echo-plan-option="keepAll4"]').should("be.checked");
    cy.window().then((win) => {
      const saved = JSON.parse(win.localStorage.getItem(PLAN_KEY) ?? "{}");
      expect(saved.done).to.deep.equal({ WindwardPilgrimage: true });
      expect(saved.grid.WindwardPilgrimage.keep).to.include("4:DEF");
    });

    // flip a switch: the ticked card is changed, with the chips that moved, and the diff banner says so
    cy.get('[data-test-echo-plan-option="keepAll4"]').uncheck();
    cy.get(card("WindwardPilgrimage")).should("have.attr", "data-test-echo-plan-status", "changed");
    cy.get(`${card("WindwardPilgrimage")} [data-test-echo-plan-change-note]`).should("contain.text", "discard COST 4");
    cy.get("[data-test-echo-plan-diff]").should("contain.text", "Windward Pilgrimage");
    cy.get("[data-test-echo-plan-diff-show]").click();
    cy.get("[data-test-echo-plan-grid] [data-test-echo-plan-card]").should("have.length", 1);
  });

  it("explains a chip, lets the player pin it, and keeps the Plan Code", () => {
    cy.visit("/echo-plan", seed(true));
    cy.get("[data-test-echo-plan-grid]", { timeout: 60000 }).should("be.visible");
    cy.get(chip("WindwardPilgrimage", "4:CritRate")).click();
    // (DaisyUI's modal fades in, which Cypress reads as opacity 0 — assert the open dialog)
    cy.get("[data-test-echo-plan-sheet]").should("have.attr", "open");
    cy.get('[data-test-echo-plan-wanted-by="Cartethyia"]').should("contain.text", "Wears now");
    cy.get('[data-test-echo-plan-override="discard"]').click({ force: true });
    cy.get("[data-test-echo-plan-sheet-verdict]").should("contain.text", "Discard");
    cy.get("[data-test-echo-plan-sheet-close]").click({ force: true });
    cy.get("[data-test-echo-plan-sheet]").should("not.have.attr", "open");
    cy.get(chip("WindwardPilgrimage", "4:CritRate")).should("have.attr", "data-test-echo-plan-verdict", "discard");

    cy.get('[data-test-echo-plan-server="europe"]').click();
    cy.get("[data-test-echo-plan-code]").type("hgB5KC7W25WAAcIsH2kv").blur();
    cy.reload();
    cy.get("[data-test-echo-plan-grid]", { timeout: 60000 }).should("be.visible");
    cy.get(chip("WindwardPilgrimage", "4:CritRate")).should("have.attr", "data-test-echo-plan-verdict", "discard");
    cy.get('[data-test-echo-plan-server="europe"]').should("have.attr", "aria-selected", "true");
    cy.get("[data-test-echo-plan-code]").should("have.value", "hgB5KC7W25WAAcIsH2kv");
  });

  it("starts empty without an account and builds a plan for planned characters", () => {
    cy.visit("/echo-plan", seed(false));
    cy.get("[data-test-echo-plan-empty]").should("be.visible");
    cy.get('[data-test-echo-plan-cta="planned"]').click();
    cy.get("[data-test-echo-plan-add]").select("Chisa");
    cy.get("[data-test-echo-plan-empty]").should("not.exist");
    cy.get("[data-test-echo-plan-grid]", { timeout: 60000 }).should("be.visible");
    cy.get('[data-test-echo-plan-roster-entry="Chisa"]').should("contain.text", "Planned");
    cy.get('[data-test-echo-plan-kpi="characters"]').should("have.text", "1");
  });

  it("renders in the classic UI too", () => {
    cy.visit("/echo-plan", seed(true, true));
    cy.get("[data-test-echo-plan-grid]", { timeout: 60000 }).should("be.visible");
    cy.get(chip("WindwardPilgrimage", "4:CritRate")).should("have.attr", "data-test-echo-plan-verdict", "keep");
  });
});
