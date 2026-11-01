// Wuthering Tools+: the fight pages after the 2026-10-31 night audit ("fight") — the Teams editor's way into the plus
// team tools (src/sim/teamLinks/), the calculator's empty Rotations panel (src/sim/presets/RotationsEmptyState.vue),
// the right page in the v3 phone header for /energy and /rotation, the energy chips' "has / needs" words and a
// /rotation link that is not a team. v3 UI (the default since Ryan #602), seeded through onBeforeLoad like
// energyCheck.cy.ts: the Cartethyia optimizer fixture and two saved teams — one of wuwa_calc's compositions
// (Cartethyia + Ciaccona + Chisa, t500) and one hand-built team his list does not have.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const MEASURED = "Cartethyia · Ciaccona · Chisa";
const HAND_BUILT = "Cartethyia · Augusta · Lynae";
const team = (id: string, name: string, characterIds: string[]) => ({ id, name, characterIds, buildIds: [null, null, null], actions: [], duration: null, enemyConfig: {} });

function seed(options: { rotations?: boolean; fontScale?: number } = {}) {
  const { rotations = true, fontScale } = options;
  const character = JSON.parse(configOptimizer.data.character);
  if (!rotations) character.characters.Cartethyia.rotations = [];
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.removeItem("wtplus:energy:v1");
      // the Teams page reopens the last team it showed: start from the list
      win.sessionStorage.removeItem("teamRotationsActiveTeamId");
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem(
        "teamRotations",
        JSON.stringify({ teams: [team("ff-t1", MEASURED, ["Cartethyia", "Ciaccona", "Chisa"]), team("ff-t2", HAND_BUILT, ["Cartethyia", "Augusta", "Lynae"])], favoriteTeamIds: [], favoritePresetNames: [] }),
      );
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

const ENGINE = { timeout: 90000 };

function openTeam(name: string): void {
  cy.get(`[data-test-team-rotations-item="${name}"]`, { timeout: 20000 }).find(".card-body h3").click();
  cy.get("[data-test-team-rotation-editor]").should("be.visible");
}

describe("fight pages", () => {
  it("shows a wuwa_calc team's engine DPS in the Teams editor and opens its cue card; a hand-built team gets nothing", () => {
    cy.viewport(1280, 900);
    cy.visit("/teams", seed());
    openTeam(MEASURED);
    cy.get('[data-test-team-plus-links][data-state="ok"]', ENGINE).should("be.visible");
    cy.get("[data-test-team-plus-dps]").invoke("text").should("match", /^[\d,.\s]+ DPS$/);
    cy.get("[data-test-team-plus-links]").should("contain.text", "wuwa_calc").and("contain.text", "this app's calculator");
    // Ciaccona and Chisa are not set up in the fixture: the panel says wuwa_calc ran them without a build of yours
    cy.get("[data-test-team-plus-unset]").should("contain.text", "not set up in the calculator").and("contain.text", "Chisa");
    cy.get('[data-test-team-plus-link="timeline"]').should("have.attr", "href").and("include", "/rotation#chars=").and("include", "tab=timeline");
    cy.get('[data-test-team-plus-link="energy"]').should("have.attr", "href", "/energy");
    cy.get('[data-test-team-plus-link="endgame"]').should("have.attr", "href", "/endgame");
    cy.get('[data-test-team-plus-link="cue"]').click();
    cy.location("pathname").should("eq", "/rotation");
    cy.location("hash").should("include", "chars=");
    cy.get('[data-test-rotation-block="loop1"]', ENGINE).should("be.visible");
    cy.get("[data-test-rotation-title]").should("contain.text", "Cartethyia");

    cy.visit("/teams", seed());
    openTeam(HAND_BUILT);
    cy.get('[data-test-team-plus-links][data-state="none"]', ENGINE).should("exist").and("not.be.visible");
  });

  it("explains an empty Rotations panel and puts the presets on screen", () => {
    cy.viewport(1280, 900);
    cy.visit("/", seed({ rotations: false }));
    cy.get('[data-test-calculator-nav="rotations"]').click();
    cy.get("[data-test-rotations-empty]").should("be.visible").and("contain.text", "No rotation for Cartethyia yet").and("contain.text", "list of attacks");
    cy.get("[data-test-rotations-empty-presets]").should("be.visible").click();
    cy.get("[data-test-rotations-presets-modal]").should("have.attr", "open");
    cy.get("[data-test-rotations-presets-cancel]").click();
    cy.get("[data-test-rotations-empty-create]").click();
    cy.get("[data-test-rotations-empty]").should("not.exist");
  });

  // The darker crest stars on light themes once compiled to `html[data-theme-style="light"] { color: amber }` (a
  // `:global(html…) .toa-star` selector in scoped CSS keeps only the :global part), which turned every inherited text
  // on the site amber after a visit to /endgame.
  it("darkens the ToA crest stars on a light theme without colouring the rest of the site", () => {
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.viewport(412, 915);
    cy.visit("/endgame", {
      onBeforeLoad(win: Window) {
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false, theme: "light" };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });
    cy.get("html").should("have.attr", "data-theme-style", "light");
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-goals] .toa-star').first().should("have.css", "color", "rgb(217, 119, 6)");
    cy.get('[data-test-toa-floor="hazard-1"]').then(($card) => {
      const win = $card[0].ownerDocument.defaultView!;
      expect(win.getComputedStyle($card[0].ownerDocument.documentElement).color, "the page's own text colour").not.to.eq("rgb(217, 119, 6)");
      expect(win.getComputedStyle($card[0]).color, "a floor card's text").not.to.eq("rgb(217, 119, 6)");
    });
  });

  it("names /energy and /rotation in the phone header, says has / needs on the chips and tells a bad link from a retired team", () => {
    cy.viewport(412, 915);
    cy.visit("/energy", seed({ fontScale: 1.3 }));
    cy.get("[data-test-nav-section-title]").should("have.text", "Energy check");
    // her build's ER against the loop's need (Ciaccona and Chisa are not set up: their chips say only what they need)
    cy.contains(`[data-test-energy-team="${MEASURED}"] .en-row__chip`, /has [\d.]+%/, ENGINE).should("contain.text", "needs");
    cy.visit("/rotation#team=AbCdEf", seed({ fontScale: 1.3 }));
    cy.get("[data-test-nav-section-title]").should("have.text", "Rotation cue cards");
    cy.get('[data-test-rotation-problem="code"]', ENGINE).should("contain.text", "Not a team link").and("contain.text", "Team rankings");
    cy.get('[data-test-rotation-problem="code"]').contains("Open on Team rankings").should("not.exist");
  });
});
