// Wuthering Tools+: long computes are said to a screen reader at their start and end, and nothing in between
// (display/WorkStatus.vue, critic item 9). The listener logs every change to a live region from the first paint, which
// is what a screen reader would read out: /rankings' phone line used to say all 104 counts.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const RUN = { timeout: 120000 };
type Spoken = Window & { __said?: string[] };

function seed(extra?: (win: Window) => void) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      extra?.(win);
      const said: string[] = [];
      (win as Spoken).__said = said;
      const last = new WeakMap<Element, string>();
      new (win as unknown as { MutationObserver: typeof MutationObserver }).MutationObserver(() => {
        for (const el of Array.from(win.document.querySelectorAll('[role="status"], [aria-live="polite"], [aria-live="assertive"]'))) {
          const text = (el.textContent ?? "").replace(/\s+/g, " ").trim();
          if (text && last.get(el) !== text) said.push(text);
          last.set(el, text);
        }
      }).observe(win.document, { subtree: true, childList: true, characterData: true });
    },
  };
}

const said = (): Cypress.Chainable<string[]> => cy.window().then((win) => (win as unknown as Spoken).__said ?? []);
/** The page's status line reaches `end`, having said `start` once and no step between. */
function expectStartAndEnd(start: string, end: string): void {
  cy.contains("[data-test-work-status]", end, RUN);
  said().then((lines) => {
    expect(lines.filter((l) => l === start), `"${start}" said once`).to.have.length(1);
    expect(lines.filter((l) => l === end), `"${end}" said once`).to.have.length(1);
    expect(lines.indexOf(start), "the start comes first").to.be.lessThan(lines.indexOf(end));
    expect(lines.filter((l) => /\d+\s*(of|\/)\s*\d+/.test(l)), "no count read out").to.deep.equal([]);
  });
}

describe("long computes, said to a screen reader", () => {
  it("/rankings' phone line says the start and the end, not every team", () => {
    cy.viewport(412, 915);
    cy.visit("/rankings#tc=mine&own=0&r=Cartethyia", seed());
    // the count on screen still runs for everyone who can see it
    // one look: the line is gone the moment the solve ends
    cy.get("[data-test-rankings-cards-solving]", RUN).should(($line) => {
      expect($line.text()).to.contain("the list catches up as they land");
      expect($line.attr("role"), "the count is no live region").to.eq(undefined);
    });
    expectStartAndEnd("Solving teams at your account", "Finished solving teams");
  });

  it("/weapons says when it starts scoring and when it is done", () => {
    cy.viewport(412, 915);
    cy.visit("/weapons", seed());
    expectStartAndEnd("Scoring your weapons", "Finished scoring your weapons");
  });

  it("/endgame says when the plan is being worked out and when it is done", () => {
    cy.viewport(412, 915);
    // the season ships dated and the plan needs a run: pin the clock inside Season 41, whose floors have their HP
    // (on the real clock this went red on 2026-11-09, the day that season ended)
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.visit("/endgame", seed());
    expectStartAndEnd("Working out your Tower of Adversity plan", "Tower of Adversity plan finished");
  });

  it("/energy says when its check starts and finishes", () => {
    cy.viewport(412, 915);
    const team = { id: "ws1", name: "Cartethyia · Ciaccona · Chisa", characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions: [], duration: null };
    cy.visit(
      "/energy",
      seed((win) => {
        win.localStorage.removeItem("wtplus:energy:v1");
        win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
      }),
    );
    expectStartAndEnd("Checking your teams' Energy Regen", "Energy Regen check finished");
  });

  it("/rotation says when the rotation is ready", () => {
    cy.viewport(412, 915);
    cy.visit("/rotation#team=t404", seed());
    expectStartAndEnd("Working out this rotation", "Rotation ready");
  });
});
