// Wuthering Tools+ "Build my team" with an Energy Regen need out of reach (critic item 3, batch 3c): the page's real
// optimizer workers and the inline backend the CLI runs give the same build, the note says what the search did, and it
// fits a phone. Public data only: upstream's Cartethyia golden fixture, the shipped wuwa_calc team preset for her team,
// and synthetic 1-cost echoes that hold no ER and differ in crit, so many loadouts tie on the most ER and each deals its
// own damage (the case a top five can't hold).
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as teamPresetsModule from "../../src/sim/presets/data/teams.json";

type Preset = { name: string; data: { characterIds: string[]; actions: Array<Record<string, unknown>>; duration: number | null; enemyConfig?: Record<string, unknown>; handoffs?: Record<string, string[]> } };
const teamPresets = ((teamPresetsModule as unknown as { default?: Preset[] }).default ?? teamPresetsModule) as unknown as Preset[];
const preset = teamPresets.find((p) => ["Cartethyia", "Ciaccona", "Chisa"].every((k) => p.data.characterIds.includes(k)))!;

const TEAM_ID = "ertiescy1";
const RUN = { timeout: 90000 };
const SPECIES = ["AeroPredator", "AeroPrism", "AureatePicket", "BabyViridblazeSaurian", "ChestMimic", "Chirpuff"];

function seed(options: { fontScale?: number } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  const inventory = JSON.parse(configOptimizer.data.inventory);
  const crit = [6.3, 6.9, 7.5, 8.1, 8.7, 9.3];
  SPECIES.forEach((echo, i) =>
    inventory.echoes.push({ echo, type: 1, rank: 5, stat: "HP", echoId: `tie${i}`, echoSet: "WindwardPilgrimage", echoSubStatsType1: "CritRate", echoSubStatsValue1: crit[i] }),
  );
  const team = {
    id: TEAM_ID,
    name: "Tied on Energy Regen",
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
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", JSON.stringify(inventory));
      win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
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

type Inline = { id: string; echoes: string[]; value: number; er: number };

/** The run the page just made, by the inline backend (the CLI's), in this browser: same stores, same plan, same floor. */
const inlineRun = (floor: number): string => `(async () => {
  const { useBuildTeam } = await import("/src/sim/buildTeam/useBuildTeam.ts");
  const { buildMyTeam } = await import("/src/sim/buildTeam/buildTeam.ts");
  const { inlineBackend } = await import("/src/sim/buildTeam/headlessOptimizer.ts");
  const { useCharacterStore } = await import("/src/stores/character.js");
  const { useInventoryStore } = await import("/src/stores/inventory.js");
  const plain = (v) => JSON.parse(JSON.stringify(v ?? null));
  const bt = useBuildTeam();
  await bt.load({ teamId: ${JSON.stringify(TEAM_ID)} });
  const slot = bt.team.value.characterIds.indexOf("Cartethyia");
  const erFloors = bt.erFloors.value.map((v, i) => (i === slot ? ${floor} : v));
  const inv = useInventoryStore();
  const result = await buildMyTeam({ characters: plain(useCharacterStore().characters), inventory: { echoes: plain(inv.echoes), equipped: plain(inv.equipped) }, team: bt.team.value, plans: bt.plans.value.plans, order: bt.order.value, options: { ...bt.options }, erFloors, autoTeamBuffs: true }, inlineBackend());
  return result.members.filter((m) => m.after).map((m) => ({ id: m.characterId, echoes: m.after.picks.map((p) => String(p.echo.echoId)), value: m.after.value, er: m.after.menuEr }));
})()`;

/** Builds with Cartethyia's floor at 400 % through the page's own buttons (a phone shows one member at a time). */
function buildOutOfReach(options: { phone?: boolean } = {}): void {
  cy.get('[data-test-build-team][data-phase="plan"]', RUN).should("exist");
  if (options.phone) cy.get('[data-test-build-team-switch="Cartethyia"]').click();
  // "you have" lands a moment after the plan, and that re-render puts a half-typed floor back to the plan's number
  cy.get('[data-test-build-team-plan="Cartethyia"]', RUN).should("contain.text", "you have");
  const floor = '[data-test-build-team-er="Cartethyia"]';
  cy.get(floor).should("be.visible");
  cy.get(floor).clear();
  cy.get(floor).type("400");
  cy.get(floor).blur();
  cy.get(floor).should("have.value", "400");
  cy.get("[data-test-build-team-run]").click();
  cy.get('[data-test-build-team][data-phase="result"]', RUN).should("exist");
}

describe("build my team: an Energy Regen need out of reach", () => {
  it("the page's workers and the CLI's inline backend give the same build, and the note says what the search did", () => {
    cy.viewport(1440, 900);
    cy.visit(`/build-team?team=${TEAM_ID}`, seed());
    buildOutOfReach();
    const result = '[data-test-build-team-result="Cartethyia"]';
    cy.get(result).should("have.attr", "data-status", "ok");
    cy.get(`${result} [data-test-build-team-er-line]`).should("have.attr", "data-band", "short");
    cy.get(result).should("contain.text", "with the echoes this run can use").and("contain.text", "damage decided between builds with the same ER").and("not.contain.text", "your echoes allow");
    cy.get(`${result} [data-test-build-team-echo]`).then(($tiles) => {
      const page = [...$tiles].map((t) => t.getAttribute("data-echo-id"));
      expect(page, "five echoes").to.have.length(5);
      cy.get(`${result} [data-test-build-team-after]`)
        .invoke("attr", "title")
        .then((after) => {
          cy.window().then((win) => {
            cy.wrap(win.eval(inlineRun(400)) as Promise<Inline[]>, RUN).then((inline) => {
              const cart = (inline as Inline[]).find((m) => m.id === "Cartethyia")!;
              expect([...page].sort(), "the same five echoes").to.deep.eq([...cart.echoes].sort());
              expect(Number(String(after).replace(/\D/g, "")), "the same damage").to.eq(Math.round(cart.value));
            });
          });
        });
    });
  });

  it("the note fits a phone at 412 px with 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit(`/build-team?team=${TEAM_ID}`, seed({ fontScale: 1.3 }));
    buildOutOfReach({ phone: true });
    cy.get('[data-test-build-team-switch="Cartethyia"]').click();
    cy.get('[data-test-build-team-result="Cartethyia"]').should("be.visible").and("contain.text", "with the echoes this run can use");
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollWidth, "page width").to.be.at.most(win.document.documentElement.clientWidth);
      expect(win.innerWidth, "layout viewport").to.eq(412);
    });
  });
});
