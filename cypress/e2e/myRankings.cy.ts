// Wuthering Tools+: "My roster rankings" (src/sim/myRankings/) — the app's own
// engine ranks the characters and teams you have set up.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

describe("my roster rankings", () => {
  it("shows the empty state without characters and links both ways with the wuwa_calc page", () => {
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-empty]").should("exist");
    // three ways in instead of a zeroed account strip
    cy.get("[data-test-my-rankings-cta]").should("have.length", 3);
    cy.get("[data-test-my-rankings-account]").should("not.exist");
    cy.get("[data-test-rankings-switch-calc]").click();
    cy.location("pathname").should("eq", "/rankings");
    cy.get("[data-test-rankings-switch-mine]").click({ force: true });
    cy.location("pathname").should("eq", "/my-rankings");
    // the nav's rankings hub lists the plus pages and marks this one
    cy.get("[data-test-nav-rankings]").should("have.class", "btn-active").click();
    cy.get('[data-test-nav-plus-page="/my-rankings"]').should("have.attr", "aria-current", "page");
    cy.get('[data-test-nav-plus-page="/rankings"]').click();
    cy.location("pathname").should("eq", "/rankings");
  });

  it("ranks an imported account's character on her real build", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 120000 }).should("exist");
    cy.get('[data-test-my-rankings-row="Cartethyia"] [data-test-my-rankings-damage]')
      .invoke("text")
      .then((text) => {
        expect(Number(text.replace(/[^0-9]/g, ""))).to.be.greaterThan(100000);
      });
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("contain.text", "S2");
    // display names, not registry keys
    cy.get('[data-test-my-rankings-row="Cartethyia"] [data-label="Weapon"]').should("contain.text", "Defier's Thorn");
    cy.get("[data-test-my-rankings-no-teams]").should("exist");
    cy.get("[data-test-my-rankings-status]").should("have.attr", "data-status", "live");

    // what if: the same rotation at S6 with the weapon at R5 (a row opens into tabs, What if first)
    cy.get('[data-test-my-rankings-expand="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-whatif="Cartethyia"]').should("have.attr", "aria-selected", "true").click();
    cy.get('[data-test-my-rankings-whatif-panel="Cartethyia"]').should("exist");
    cy.get("[data-test-my-rankings-whatif-sequence]").select("6");
    cy.get("[data-test-my-rankings-whatif-refinement]").select("5");
    cy.get("[data-test-my-rankings-whatif-run]").click({ force: true });
    cy.get("[data-test-my-rankings-whatif-result]", { timeout: 120000 })
      .should("contain.text", "S6")
      .and("contain.text", "R5")
      .and("contain.text", "Defier's Thorn")
      .and("contain.text", "%")
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/\+\d+\.\d%/); // S6 + R5 beats S2 + R1 on her build
      });

    // substat weights: one more roll of each substat on her build — crit moves an HP scaler, ATK does not
    cy.get('[data-test-my-rankings-substats="Cartethyia"]').click({ force: true });
    cy.get('[data-test-my-rankings-substats-panel="Cartethyia"]').should("exist");
    cy.get("[data-test-my-rankings-substats-result]", { timeout: 120000 }).should("exist");
    cy.get('[data-test-my-rankings-substat="CritRate"]')
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/\+\d+\.\d%/);
      });
    cy.get('[data-test-my-rankings-substat="ATK"]').should("contain.text", "+0.0%");
    // the median tier and one tier step ride along: a real tier and a two-decimal gain on a stat that moves her
    cy.get('[data-test-my-rankings-substat-median="CritRate"]').should("contain.text", "+7.5%");
    cy.get('[data-test-my-rankings-substat-step="CritRate"]')
      .invoke("text")
      .then((text) => {
        expect(text).to.match(/\+0\.6% → \+\d+\.\d\d%/);
      });
    cy.get("[data-test-my-rankings-substats-help] summary").should("contain.text", "How to read");
    cy.get("[data-test-my-rankings-substats-echoes] .badge").should("have.length", 5);

    // every rotation tried, best first; the what-if result is still there when its tab comes back
    cy.get('[data-test-my-rankings-rotations="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-rotations-panel="Cartethyia"] li').should("have.length.greaterThan", 3);
    cy.get('[data-test-my-rankings-whatif="Cartethyia"]').click();
    cy.get("[data-test-my-rankings-whatif-result]").should("contain.text", "S6");

    // the row closes again
    cy.get('[data-test-my-rankings-expand="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-substats-panel="Cartethyia"]').should("not.exist");
    cy.get('[data-test-my-rankings-whatif-panel="Cartethyia"]').should("not.exist");
  });

  it("serves a reload from this tab's cache, and re-scores after an echo substat edit", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live");
    cy.window().then((win) => {
      const entry = JSON.parse(win.sessionStorage.getItem("wtplus:myRankings:last") ?? "{}") as { fingerprint?: string };
      expect(entry.fingerprint, "cached fingerprint").to.be.a("string");
      cy.wrap(entry.fingerprint).as("before");
    });
    // a reload: the rows are back without a scoring pass
    cy.reload();
    cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 10000 }).should("exist");
    cy.get("[data-test-my-rankings-status]").should("have.attr", "data-status", "live");
    cy.get("[data-test-my-rankings-skeleton]").should("not.exist");

    // one substat value changed in place (same JSON length — the old length fingerprint missed exactly this)
    cy.window().then((win) => {
      const inventory = JSON.parse(win.localStorage.getItem("inventory") ?? "{}") as { echoes: Array<Record<string, unknown>> };
      const echo = inventory.echoes.find((e) => typeof e.echoSubStatsValue1 === "number" && String(e.echoSubStatsValue1).length === 3);
      expect(echo, "an echo with a x.y first substat").to.exist;
      const old = String(echo!.echoSubStatsValue1);
      echo!.echoSubStatsValue1 = Number(old.replace(/^\d/, (d) => String((Number(d) % 9) + 1))); // 8.1 → 9.1
      win.localStorage.setItem("inventory", JSON.stringify(inventory));
    });
    cy.reload();
    cy.get("[data-test-my-rankings-status]", { timeout: 120000 }).should("have.attr", "data-status", "live");
    cy.get("@before").then((before) => {
      cy.window().should((win) => {
        const entry = JSON.parse(win.sessionStorage.getItem("wtplus:myRankings:last") ?? "{}") as { fingerprint?: string };
        expect(entry.fingerprint, "a new fingerprint for the edited echo").to.be.a("string").and.not.equal(before);
      });
    });
  });
});
