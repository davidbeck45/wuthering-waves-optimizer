// Wuthering Tools+: the energy check (src/sim/energy/) — each member's ER need in a saved team, measured by Riley's
// wuwa_calc loop at the account (the solver worker), against the ER their build has. v3 UI (the default since Ryan
// #602), seeded through onBeforeLoad like phoneLayout.cy.ts: the Cartethyia optimizer fixture (her build only) and two
// saved teams — one of wuwa_calc's compositions (Cartethyia + Ciaccona + Chisa, t500: her ER against the need, the
// other two "not set up") and one hand-built team his list does not have ("not measured").
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const MEASURED = "Cartethyia · Ciaccona · Chisa";
const HAND_BUILT = "Cartethyia · Augusta · Lynae";
const team = (id: string, name: string, characterIds: string[]) => ({ id, name, characterIds, buildIds: [null, null, null], actions: [], duration: null });

function seed(options: { teams?: boolean; characters?: boolean; fontScale?: number; brokenWorker?: boolean } = {}) {
  const { teams = true, characters = true, fontScale, brokenWorker = false } = options;
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.removeItem("wtplus:energy:v1");
      if (brokenWorker) {
        // the engine worker dies on load (a crash, a blocked script): every measurement fails
        (win as unknown as { Worker: unknown }).Worker = class {
          onmessage: unknown = null;
          // eslint-disable-next-line no-unused-vars -- the parameters of a function type
          onerror: ((e: { message: string }) => void) | null = null;
          constructor() {
            setTimeout(() => this.onerror?.({ message: "engine crashed" }), 30);
          }
          postMessage(): void {}
          terminate(): void {}
          addEventListener(): void {}
          removeEventListener(): void {}
        };
      }
      if (characters) {
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      }
      if (teams) {
        win.localStorage.setItem(
          "teamRotations",
          JSON.stringify({ teams: [team("en-t1", MEASURED, ["Cartethyia", "Ciaccona", "Chisa"]), team("en-t2", HAND_BUILT, ["Cartethyia", "Augusta", "Lynae"])], favoriteTeamIds: [], favoritePresetNames: [] }),
        );
      }
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

function expectNoHorizontalScroll(label: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${label} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

const ENGINE = { timeout: 90000 };

/** Open a character's substat weights on /my-rankings: a link in the row today, a tab of the expanded row in the
 *  batch-1 redesign — expand first where the row has an expander. */
function openSubstats(id: string): void {
  cy.get(`[data-test-my-rankings-row="${id}"]`, { timeout: 120000 }).should("exist");
  cy.get("body").then(($body) => {
    const expand = $body.find(`[data-test-my-rankings-expand="${id}"]`);
    if (expand.length) cy.wrap(expand).click();
  });
  cy.get(`[data-test-my-rankings-substats="${id}"]`).click();
}

describe("energy check", () => {
  it("measures a saved team's ER needs and explains where the energy comes from", () => {
    cy.viewport(1440, 900);
    cy.visit("/energy", seed());
    cy.title().should("eq", "Energy check — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-energy-page]").should("be.visible");

    // the wuwa_calc composition: measured; Cartethyia has a build, the other two are not set up
    cy.get(`[data-test-energy-team="${MEASURED}"]`, ENGINE).should("have.attr", "data-test-energy-team-state", "ok");
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member]`).should("have.length", 3);
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member="Cartethyia"] [data-test-energy-status]`)
      .invoke("attr", "data-test-energy-status")
      .should("be.oneOf", ["short", "tight", "ok", "noGate"]);
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member="Cartethyia"]`)
      .invoke("text")
      .should("match", /\d+\.\d% \/ \d+\.\d%/);
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member="Chisa"] [data-test-energy-status="unknown"]`).should("exist");
    cy.get(`[data-test-energy-team="${MEASURED}"]`).should("contain.text", "wuwa_calc t");

    // the breakdown opens inline: the spend's sources add up, each named in the legend
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member="Chisa"]`).click();
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member="Chisa"]`).should("have.attr", "aria-expanded", "true");
    cy.get('[data-test-energy-breakdown="Chisa"]').should("be.visible").and("contain.text", "Where the").and("contain.text", "Cartethyia's hits (shared)");
    cy.get('[data-test-energy-breakdown="Chisa"] .en-stack__seg').its("length").should("be.gte", 3);

    // the hand-built team: not measured, with a way to a wuwa_calc team of the same three
    cy.get(`[data-test-energy-team="${HAND_BUILT}"]`).should("have.attr", "data-test-energy-team-state", "notMeasured");
    cy.get(`[data-test-energy-team="${HAND_BUILT}"] [data-test-energy-team-not-measured]`).should("contain.text", "not one of wuwa_calc's current compositions");
    cy.get(`[data-test-energy-team="${HAND_BUILT}"] a[href^="/rankings"]`).should("exist");

    // summary and the per-character floor
    cy.get("[data-test-energy-summary]").should("contain.text", "Teams checked").and("contain.text", "1");
    cy.get('[data-test-energy-floor="Cartethyia"]').should("exist");
    cy.get("[data-test-energy-scan-cta]").should("be.visible");

    // a revisit reads the kept measurement (localStorage wtplus:energy:v1): no worker needed to paint it
    cy.window()
      .its("localStorage")
      .invoke("getItem", "wtplus:energy:v1")
      .should((raw) => {
        const kept = JSON.parse(raw ?? "{}");
        expect(Object.keys(kept.entries ?? {}).some((k) => k.endsWith("Cartethyia+Chisa+Ciaccona")), "kept in wtplus:energy:v1").to.equal(true);
      });
  });

  it("puts the ER floor on /my-rankings and opens the breakdown sheet", () => {
    cy.viewport(1440, 900);
    cy.visit("/my-rankings", seed());
    cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 120000 }).should("exist");
    cy.get('[data-test-energy-floor-of="Cartethyia"]', ENGINE).should("be.visible");
    cy.get('[data-test-energy-floor-of="Cartethyia"] button[data-test-energy-chip]').click();
    cy.get("[data-test-energy-sheet]").should("be.visible");
    cy.get('[data-test-energy-sheet] [data-test-energy-breakdown="Cartethyia"]').should("contain.text", "Needs").and("contain.text", "Has");
    cy.get("[data-test-energy-sheet-close]").click();
    cy.get("[data-test-energy-sheet]").should("not.exist");
    cy.get("[data-test-my-rankings-energy-link]").should("have.attr", "href", "/energy");
    cy.get("[data-test-my-rankings-energy-link]").invoke("attr", "data-test-energy-summary-tile").should("be.oneOf", ["short", "overcap", "ok"]);
    cy.get("[data-test-my-rankings-energy-link]").should("contain.text", "Energy check:");

    // ER as a floor in her substat weights: the note says how Energy Regen was weighed
    openSubstats("Cartethyia");
    cy.get("[data-test-my-rankings-substats-result]", { timeout: 120000 }).should("exist");
    cy.get("[data-test-energy-substat-note]").invoke("attr", "data-test-energy-substat-note").should("eq", "floor");
    cy.get("[data-test-my-rankings-er-floor]").should("exist");
  });

  it("says what to do without characters, and without teams", () => {
    cy.visit("/energy", seed({ teams: false, characters: false }));
    cy.get("[data-test-energy-empty]").should("be.visible");
    cy.visit("/energy", seed({ teams: false }));
    cy.get("[data-test-energy-no-teams]").should("be.visible");
    cy.get("[data-test-energy-scan-cta]").should("be.visible");
  });

  it("shows an engine failure with a retry, keeps nothing, and the substat weights fall back", () => {
    cy.viewport(1440, 900);
    cy.visit("/energy", seed({ brokenWorker: true }));
    cy.get(`[data-test-energy-team="${MEASURED}"]`, ENGINE).should("have.attr", "data-test-energy-team-state", "error");
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-team-error]`).should("contain.text", "Could not measure").and("contain.text", "Energy Regen = 0");
    cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-retry]`).click();
    cy.get(`[data-test-energy-team="${MEASURED}"]`, ENGINE).should("have.attr", "data-test-energy-team-state", "error");
    cy.window()
      .its("localStorage")
      .invoke("getItem", "wtplus:energy:v1")
      .should((raw) => {
        const kept = JSON.parse(raw ?? '{"entries":{}}');
        expect(Object.keys(kept.entries ?? {}).some((k) => k.endsWith("Cartethyia+Chisa+Ciaccona")), "a failure is never kept").to.equal(false);
      });

    // the substat weights say Energy Regen reads 0 because the check failed (no floor, the plain scorer)
    cy.visit("/my-rankings", seed({ brokenWorker: true }));
    openSubstats("Cartethyia");
    cy.get("[data-test-my-rankings-substats-result]", { timeout: 120000 }).should("exist");
    cy.get("[data-test-energy-substat-note]").should("have.attr", "data-test-energy-substat-note", "failed").and("contain.text", "Energy Regen reads 0");
    cy.get("[data-test-my-rankings-er-floor]").should("not.exist");
  });

  for (const width of [360, 412]) {
    it(`fits a ${width} px phone at 130 % text, the breakdown as a bottom sheet`, () => {
      cy.viewport(width, 860);
      cy.visit("/energy", seed({ fontScale: 1.3 }));
      cy.get(`[data-test-energy-team="${MEASURED}"]`, ENGINE).should("have.attr", "data-test-energy-team-state", "ok");
      expectNoHorizontalScroll(`/energy at ${width}`);
      cy.get(`[data-test-energy-team="${MEASURED}"] [data-test-energy-member="Cartethyia"]`).click();
      cy.get('[data-test-energy-breakdown="Cartethyia"]').should("be.visible");
      expectNoHorizontalScroll(`/energy at ${width} (breakdown open)`);

      cy.visit("/my-rankings", seed({ fontScale: 1.3 }));
      cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 120000 }).should("exist");
      cy.get('[data-test-energy-floor-of="Cartethyia"]', ENGINE).should("be.visible");
      expectNoHorizontalScroll(`/my-rankings at ${width}`);
      cy.get('[data-test-energy-floor-of="Cartethyia"] button[data-test-energy-chip]').click();
      cy.get("[data-test-energy-sheet] .modal-box").should("be.visible").then(($box) => {
        const box = $box[0].getBoundingClientRect();
        expect(box.width, "sheet spans the phone").to.be.at.least(width - 20);
        expect(Math.round(box.bottom), "sheet sits on the bottom edge").to.be.at.least(860 - 2);
      });
    });
  }
});
