// Wuthering Tools+ "Build my team" (/build-team, src/sim/buildTeam/) in the v3 UI: open a saved team from /my-rankings,
// read wuwa_calc's plan, build from the inventory, save as team builds, see the Teams editor's slot show the new build,
// undo it. Seeded through onBeforeLoad (the support file seeds classic otherwise) with public data only: upstream's
// Cartethyia golden fixture (her build + 17 echoes), two armed teammates with no echoes (Ciaccona, Chisa), and a saved
// team built from the shipped wuwa_calc team preset for the three.
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as teamPresetsModule from "../../src/sim/presets/data/teams.json";

type Preset = { name: string; data: { characterIds: string[]; actions: Array<Record<string, unknown>>; duration: number | null; enemyConfig?: Record<string, unknown>; handoffs?: Record<string, string[]> } };
const teamPresets = ((teamPresetsModule as unknown as { default?: Preset[] }).default ?? teamPresetsModule) as unknown as Preset[];
const preset = teamPresets.find((p) => ["Cartethyia", "Ciaccona", "Chisa"].every((k) => p.data.characterIds.includes(k)))!;

const TEAM_ID = "btcy1";
const TEAM_NAME = "Cartethyia + Ciaccona + Chisa (build test)";
const RUN = { timeout: 90000 };

function seed(options: { fontScale?: number; noTeam?: boolean } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  const team = {
    id: TEAM_ID,
    name: TEAM_NAME,
    characterIds: preset.data.characterIds,
    buildIds: [null, null, null],
    actions: preset.data.actions.map((a, i) => ({ ...a, id: `a${i}` })),
    duration: preset.data.duration,
    enemyConfig: preset.data.enemyConfig ?? {},
    handoffs: preset.data.handoffs ?? null,
  };
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.removeItem("wtplus:buildTeam:undo:v1");
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem("teamRotations", JSON.stringify({ teams: options.noTeam ? [] : [team], favoriteTeamIds: [], favoritePresetNames: [] }));
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

const readTeam = (win: Window): { buildIds: Array<string | null> } => JSON.parse(win.localStorage.getItem("teamRotations")!).teams.find((t: { id: string }) => t.id === TEAM_ID);
const readCart = (win: Window): { activeBuildId?: string; echoes?: unknown; builds?: Array<{ id: string; name: string }> } => JSON.parse(win.localStorage.getItem("character")!).characters.Cartethyia;

function expectNoHorizontalScroll(what: string, width: number): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    // nothing widened the layout viewport (a crushed flex item does that on a phone while scrollWidth looks fine)
    expect(win.innerWidth, `${what} layout viewport`).to.eq(width);
  });
}

describe("build my team", () => {
  it("lists the saved teams when opened without one, and the plus hub links the page", () => {
    cy.viewport(1440, 900);
    cy.visit("/build-team", seed());
    cy.title().should("contain", "Build my team");
    cy.get(`[data-test-build-team-pick="${TEAM_NAME}"]`).should("exist");
    cy.get("[data-test-nav-rankings]").click();
    cy.get('[data-test-nav-plus-page="/build-team"]').should("exist");
  });

  it("says so when there is no saved team", () => {
    cy.visit("/build-team", seed({ noTeam: true }));
    cy.get("[data-test-build-team-no-teams]").should("exist");
  });

  it("from /my-rankings: plan, build, save as team builds, the Teams editor shows them, undo puts everything back", () => {
    cy.viewport(1440, 1000);
    cy.visit("/my-rankings", seed());
    cy.get(`[data-test-my-rankings-team-build="${TEAM_NAME}"]`, RUN).click();
    cy.location("search").should("contain", `team=${TEAM_ID}`);

    // step 1: wuwa_calc's plan for each member at the account
    cy.get('[data-test-build-team][data-phase="plan"]', RUN).should("exist");
    cy.get("[data-test-build-team-riley]").should("contain.text", "wuwa_calc").and("contain.text", "DPS");
    cy.get('[data-test-build-team-plan="Cartethyia"]').should("contain.text", "wuwa_calc pick").and("contain.text", "Windward Pilgrimage");
    cy.get("[data-test-build-team-plan]").should("have.length", 3);
    // the priority order follows Riley's DPS share: Cartethyia first
    cy.get("[data-test-build-team-plan]").first().should("have.attr", "data-test-build-team-plan", "Cartethyia");
    cy.get('[data-test-build-team-opt="takeFromOthers"]').should("not.be.checked");

    // step 2 → 3: build
    cy.get("[data-test-build-team-run]").click();
    cy.get('[data-test-build-team][data-phase="result"]', RUN).should("exist");
    cy.get('[data-test-build-team-result="Cartethyia"]').should("have.attr", "data-status", "ok");
    cy.get('[data-test-build-team-result="Cartethyia"] [data-test-build-team-echo]').should("have.length", 5);
    cy.get('[data-test-build-team-result="Cartethyia"] [data-test-build-team-er-line]').should("exist");
    // Chisa has no echo of her sets: said in words, nothing to save
    cy.get('[data-test-build-team-result="Chisa"]').should("not.have.attr", "data-status", "ok");
    cy.get('[data-test-build-team-result="Chisa"] [data-test-build-team-fail]').should("exist");
    // no echo is used twice across the team
    cy.get("[data-test-build-team-echo]").then(($tiles) => {
      const ids = [...$tiles].map((t) => t.getAttribute("data-echo-id"));
      expect(new Set(ids).size, "distinct echoes").to.eq(ids.length);
    });
    cy.get("[data-test-build-team-summary]").should("contain.text", "Scored on the team's own rotation");

    // save: confirm first, then the build exists and is pinned; the active build is untouched
    cy.get('[data-test-build-team-save-slot="Cartethyia"]').check({ force: true });
    cy.window().then((win) => cy.wrap(JSON.stringify(readCart(win).echoes ?? {})).as("liveEchoes"));
    cy.get("[data-test-build-team-save]").click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "Built for").and("contain.text", "pinned in slot");
    cy.get(".confirm-dialog .modal-action .btn-primary").click();
    cy.get("[data-test-build-team-saved]").should("contain.text", "pinned in");
    cy.window().then((win) => {
      const team = readTeam(win);
      const cart = readCart(win);
      const slot = team.buildIds.findIndex(Boolean);
      expect(slot, "a slot pinned").to.be.at.least(0);
      const built = cart.builds!.find((b) => b.id === team.buildIds[slot]);
      expect(built?.name).to.match(/^Built for /);
      // a new build, not the active one: the live echoes are the ones she wore
      expect(cart.activeBuildId).not.to.eq(team.buildIds[slot]);
      cy.get("@liveEchoes").then((live) => expect(JSON.stringify(cart.echoes ?? {})).to.eq(live));
    });

    // the Teams editor's slot reads the pinned build
    cy.visit("/teams", { onBeforeLoad: () => undefined });
    cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).first().click();
    cy.get('[data-test="team-rotation-slot-build-select-0"]').should("contain.text", "Built for");

    // undo from the page: the build is gone and the pin is back to "active build"
    cy.visit(`/build-team?team=${TEAM_ID}`, { onBeforeLoad: () => undefined });
    cy.get("[data-test-build-team-undo]", RUN).click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get("[data-test-build-team-undo]").should("not.exist");
    cy.window().then((win) => {
      expect(readTeam(win).buildIds).to.deep.eq([null, null, null]);
      expect((readCart(win).builds ?? []).some((b) => /^Built for /.test(b.name))).to.eq(false);
    });
  });

  it("cancel during the run returns to the plan with nothing written", () => {
    cy.viewport(1440, 900);
    cy.visit(`/build-team?team=${TEAM_ID}`, seed());
    cy.get('[data-test-build-team][data-phase="plan"]', RUN).should("exist");
    cy.get('[data-test-build-team-er="Cartethyia"]').clear().type("400").blur();
    cy.get("[data-test-build-team-run]").click();
    cy.get("[data-test-build-team-cancel]").click();
    cy.get('[data-test-build-team][data-phase="plan"]').should("exist");
    cy.window().then((win) => expect(readTeam(win).buildIds).to.deep.eq([null, null, null]));
  });

  it("fits a phone at 412 px with 130 % text: one member at a time, a sticky save bar", () => {
    cy.viewport(412, 915);
    cy.visit(`/build-team?team=${TEAM_ID}`, seed({ fontScale: 1.3 }));
    cy.get('[data-test-build-team][data-phase="plan"]', RUN).should("exist");
    cy.get("[data-test-build-team-switch]").should("have.length", 3);
    cy.get("[data-test-build-team-plan]:visible").should("have.length", 1);
    expectNoHorizontalScroll("plan", 412);
    cy.get('[data-test-build-team-switch="Ciaccona"]').click();
    cy.get('[data-test-build-team-plan="Ciaccona"]').should("be.visible");
    cy.get("[data-test-build-team-run]").should("be.visible").click();
    cy.get('[data-test-build-team][data-phase="result"]', RUN).should("exist");
    cy.get("[data-test-build-team-result]:visible").should("have.length", 1);
    cy.get("[data-test-build-team-savebar]").should("be.visible").and("have.css", "position", "fixed");
    expectNoHorizontalScroll("result", 412);
  });
});
