// Wuthering Tools+ — how a calculator run ends when it cannot give rows, and how rows end when what they were scored on
// goes (hunt round 1, 2026-11-06). Upstream's golden Zani account, on the v3 screens unless a test says classic.
import { configOptimizer as zani } from "./calculator/data/Zani/data";

/* eslint-disable @typescript-eslint/no-explicit-any */

const RUN = "[data-test-optimizer-workspace-optimize-btn]";
const ROW = "[data-test-optimizer-workspace-leaderboard-row]";
const WHY = "[data-test-optimizer-workspace-empty-reason]";

const hostOf = (win: Cypress.AUTWindow): any => ([...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as any).__vue_app__.config.globalProperties;
const storeOf = (win: Cypress.AUTWindow): any => hostOf(win).$pinia._s.get("character");

/** Zani with a second build, its weapon at R1 rather than her own. */
function account(edit: (zaniRecord: any) => void = () => {}): any {
  const data = JSON.parse(zani.data.character);
  const record = data.characters.Zani;
  const { builds: _builds, activeBuildId: _active, ...fields } = record;
  record.builds = [
    { ...JSON.parse(JSON.stringify(fields)), id: "one", name: "One" },
    { ...JSON.parse(JSON.stringify(fields)), id: "two", name: "Two" },
  ];
  record.activeBuildId = "one";
  edit(record);
  return data;
}

function visit(data: any, ui: "v3" | "classic" = "v3"): void {
  cy.visit("/?screen=optimizer", {
    onBeforeLoad(win) {
      win.localStorage.setItem("character", JSON.stringify(data));
      win.localStorage.setItem("inventory", zani.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: ui === "classic" };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
  });
  cy.get(ui === "v3" ? RUN : "[data-test-optimizer-optimize-btn]").should("exist");
  cy.wait(1500); // the character and its weapon are in (a press before that is held, optimizerExact.cy.ts)
}

function finishedRun(): void {
  cy.get(RUN).click({ force: true });
  cy.get(ROW, { timeout: 60000 }).should("have.length", 5);
}

describe("rows go with the build and weapon they were scored on", { defaultCommandTimeout: 30000 }, () => {
  it("a run left going when another build is picked stops, says so, and lands nothing", () => {
    visit(account());
    cy.window().then((win) => {
      cy.spy(win.Worker.prototype, "terminate").as("terminate");
      cy.get(RUN).then(($button) => {
        $button[0]!.click();
        storeOf(win).equipBuild("Zani", "two");
      });
    });
    cy.get<sinon.SinonSpy>("@terminate").should("have.been.called");
    cy.get(WHY).should("contain.text", "build or weapon changed");
    cy.wait(3000);
    cy.get(ROW).should("not.exist");
  });

  it("a finished run's rows go when another build is picked", () => {
    visit(account());
    finishedRun();
    cy.window().then((win) => storeOf(win).equipBuild("Zani", "two"));
    cy.get(ROW).should("not.exist");
    cy.get(WHY).should("contain.text", "build or weapon changed");
    cy.get(RUN).should("exist");
  });

  it("a finished run's rows go when the weapon's refinement changes, then a new run reads the new weapon", () => {
    visit(account());
    finishedRun();
    cy.get(`${ROW} .font-mono`).first().invoke("text").then((before) => {
      cy.window().then((win) => {
        const store = storeOf(win);
        const weapon = store.characters.Zani.weapon;
        const refinement = String(store.characters.Zani.weapons?.[weapon]?.refinement ?? "1") === "1" ? "5" : "1";
        store.characters.Zani.weapons = { ...store.characters.Zani.weapons, [weapon]: { ...store.characters.Zani.weapons?.[weapon], refinement } };
      });
      cy.get(ROW).should("not.exist");
      cy.get(WHY).should("contain.text", "build or weapon changed");
      cy.wait(800);
      finishedRun();
      cy.get(WHY).should("not.exist");
      cy.get(`${ROW} .font-mono`).first().invoke("text").should("not.eq", before);
    });
  });

  it("the rows stay through Equip loadout, which changes only the echoes", () => {
    visit(account());
    finishedRun();
    cy.get(`${ROW}[data-test-optimizer-workspace-leaderboard-row="1"]`).click();
    cy.get("[data-test-optimizer-workspace-equip-btn]").click();
    cy.wait(1000);
    cy.get(ROW).should("have.length", 5);
    cy.get(WHY).should("not.exist");
  });
});

describe("a run that cannot give rows says why", { defaultCommandTimeout: 30000 }, () => {
  it("a floor no loadout reaches: the setup screen comes back with the reason", () => {
    visit(
      account((record) => {
        record.optimizer.minStats = [{ id: "a", stat: "energyRegen", minValue: "999" }];
      }),
    );
    cy.get(RUN).click({ force: true });
    cy.get(WHY, { timeout: 60000 }).should("contain.text", "minimum stat requirements");
    cy.get(RUN).should("exist");
  });

  it("a rotation target that has been deleted names the target, not the filters", () => {
    visit(
      account((record) => {
        record.optimizer.optimizationTarget = "Rotation:gone123";
      }),
    );
    cy.window().then((win) => cy.spy(win.Worker.prototype, "postMessage").as("post"));
    cy.get(RUN).click({ force: true });
    cy.get(WHY).should("contain.text", "no longer exists");
    cy.get<sinon.SinonSpy>("@post").should("not.have.been.called");
  });

  for (const script of ["processor", "generator"]) {
    it(`a ${script} worker that cannot load ends the run with a message, and the next run works`, () => {
      cy.intercept(`**/src/workers/${script}.worker.ts*`, { forceNetworkError: true });
      visit(account());
      cy.get(RUN).click({ force: true });
      cy.get(WHY, { timeout: 30000 }).should("contain.text", "could not start");
      cy.get("[data-test-optimizer-workspace-running]").should("not.exist");
      cy.intercept(`**/src/workers/${script}.worker.ts*`, (req) => req.continue());
      finishedRun();
      cy.get(WHY).should("not.exist");
    });
  }

  it("classic, with no Cancel to get out: the same worker failure says so", () => {
    cy.intercept("**/src/workers/processor.worker.ts*", { forceNetworkError: true });
    visit(account(), "classic");
    cy.get("[data-test-optimizer-optimize-btn]").click({ force: true });
    cy.get("[data-test-optimizer-empty-reason]", { timeout: 30000 }).should("contain.text", "could not start");
  });
});

describe("leaving the calculator", { defaultCommandTimeout: 30000 }, () => {
  it("stops the run's workers: nothing runs on for a page nobody is on", () => {
    // a run that cannot finish on its own, so a terminate can only be the page leaving
    let release!: () => void;
    const gate = new Promise<void>((resolve) => (release = resolve));
    cy.intercept({ method: "GET", pathname: "/src/workers/processor.worker.ts" }, async (req) => {
      await gate;
      req.continue();
    });
    visit(account());
    cy.window().then((win) => {
      cy.spy(win.Worker.prototype, "terminate").as("terminate");
      cy.get(RUN).click({ force: true });
      cy.get("[data-test-optimizer-workspace-running]").should("exist");
      cy.get<sinon.SinonSpy>("@terminate").then((terminate) => expect(terminate.callCount, "still running").to.eq(0));
      cy.then(() => hostOf(win).$router.push("/inventory"));
    });
    cy.location("pathname").should("eq", "/inventory");
    cy.get<sinon.SinonSpy>("@terminate").should("have.been.called");
    cy.then(() => release());
  });
});
