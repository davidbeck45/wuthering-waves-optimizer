// Wuthering Tools+ — how a calculator run ends when it cannot give rows, and how rows end when what they were scored on
// goes (hunt round 1, 2026-11-06; batch 5: they stay, flagged). Upstream's golden Zani account, on the v3 screens unless a test says classic.
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

/** `reloadUsed`: the tab has had its one reload (chunkReload's guard), so a worker that cannot load shows its message. */
function visit(data: any, ui: "v3" | "classic" = "v3", reloadUsed = false): void {
  cy.visit("/?screen=optimizer", {
    onBeforeLoad(win) {
      if (reloadUsed) win.sessionStorage.setItem("wtplus:chunkReloadAt", String(Date.now()));
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

// Ryan's #706 and plus's rule answered one question twice: plus threw the rows away on a build or weapon change, his flags
// them on any non-echo change and keeps comparing against the build they ran on. Plus keeps his answer (batch 5).
const STALE = "[data-test-optimizer-stale-alert]";
const firstRow = `${ROW}[data-test-optimizer-workspace-leaderboard-row="0"]`;

/** Build "two" holds the weapon at the other refinement: picking it changes a non-echo input. */
function otherRefinement(record: any): void {
  const weapon = record.weapon;
  const now = String(record.weapons?.[weapon]?.refinement ?? "1");
  record.builds[1].weapons = { ...record.builds[1].weapons, [weapon]: { ...record.builds[1].weapons?.[weapon], refinement: now === "1" ? "5" : "1" } };
}

function setRefinementInStore(win: Cypress.AUTWindow): void {
  const store = storeOf(win);
  const weapon = store.characters.Zani.weapon;
  const refinement = String(store.characters.Zani.weapons?.[weapon]?.refinement ?? "1") === "1" ? "5" : "1";
  store.characters.Zani.weapons = { ...store.characters.Zani.weapons, [weapon]: { ...store.characters.Zani.weapons?.[weapon], refinement } };
}

describe("rows outlive a change to what they were scored on, flagged", { defaultCommandTimeout: 30000 }, () => {
  it("a run left going when a build with another weapon is picked lands its rows, flagged", () => {
    visit(account(otherRefinement));
    cy.window().then((win) => {
      cy.get(RUN).then(($button) => {
        $button[0]!.click();
        storeOf(win).equipBuild("Zani", "two");
      });
    });
    cy.get(ROW, { timeout: 60000 }).should("have.length", 5);
    cy.get(STALE).should("contain.text", "Your setup changed");
    cy.get(WHY).should("not.exist");
  });

  it("a finished run's rows stay, flagged, when a build with another weapon is picked; Equip loadout still works", () => {
    visit(account(otherRefinement));
    finishedRun();
    cy.get(STALE).should("not.exist");
    cy.window().then((win) => storeOf(win).equipBuild("Zani", "two"));
    cy.get(STALE).should("contain.text", "Your setup changed");
    cy.get(ROW).should("have.length", 5);
    cy.get(WHY).should("not.exist");
    cy.get(firstRow).click();
    cy.get("[data-test-optimizer-workspace-equip-btn]").click();
    cy.wait(800);
    cy.get(ROW).should("have.length", 5);
    cy.get(STALE).should("exist");
  });

  it("the weapon's refinement changes after a run: the rows and their comparison stay as run, flagged; Run again reads the new weapon", () => {
    visit(account());
    finishedRun();
    cy.get(firstRow).invoke("text").then((before) => {
      cy.window().then(setRefinementInStore);
      cy.get(STALE).should("contain.text", "Your setup changed");
      cy.wait(800);
      cy.get(firstRow).invoke("text").should("eq", before);
      cy.get("[data-test-optimizer-rerun]").click();
      cy.get(STALE).should("not.exist");
      cy.get(ROW, { timeout: 60000 }).should("have.length", 5);
      cy.get(firstRow).invoke("text").should("not.eq", before);
    });
  });

  it("a run left going when a build with other echoes and the same weapon is picked lands unflagged, compared with the build now worn", () => {
    const cleared = account((record) => {
      record.builds[1].echoes = record.builds[1].echoes.map((slot: any) => ({ ...slot, echoId: null, echo: null }));
    });
    // what a run on build two reads, started on two
    visit(cleared);
    cy.window().then((win) => storeOf(win).equipBuild("Zani", "two"));
    cy.wait(1500);
    finishedRun();
    cy.get(firstRow).invoke("text").then((onTwo) => {
      visit(cleared);
      cy.window().then((win) => {
        cy.get(RUN).then(($button) => {
          $button[0]!.click();
          storeOf(win).equipBuild("Zani", "two");
        });
      });
      cy.get(ROW, { timeout: 60000 }).should("have.length", 5);
      cy.get(STALE).should("not.exist");
      cy.get(firstRow).invoke("text").should("eq", onTwo);
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
    cy.get(STALE).should("not.exist");
  });

  it("a press the moment the page opens, on a slow start: the run lands unflagged and stays so", () => {
    // the character's module and her weapon's held back, as on a slow phone (optimizerExact.cy.ts holds them the same way)
    const gates = ["/src/characters/Zani/index.ts", "/src/weapons/Gauntlets/BlazingJustice.ts"].map((pathname) => {
      let release!: () => void;
      const gate = new Promise<void>((resolve) => (release = resolve));
      cy.intercept({ method: "GET", pathname }, async (req) => {
        await gate;
        req.continue();
      });
      return () => release();
    });
    const data = account();
    cy.visit("/?screen=optimizer", {
      onBeforeLoad(win) {
        win.localStorage.setItem("character", JSON.stringify(data));
        win.localStorage.setItem("inventory", zani.data.inventory);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });
    cy.get(RUN).click({ force: true });
    cy.wait(1000);
    cy.get(ROW).should("not.exist");
    cy.then(() => gates.forEach((release) => release()));
    cy.get(ROW, { timeout: 60000 }).should("have.length", 5);
    cy.wait(2500);
    cy.get(STALE).should("not.exist");
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

  it("a saved target naming a rotation she no longer has falls to her first rotation, and Run gives rows", () => {
    const first = (data: any): string => data.characters.Zani.rotations[0].id;
    const data = account((record) => {
      record.optimizer.optimizationTarget = "Rotation:gone123";
    });
    expect(data.characters.Zani.rotations.length, "the fixture has a rotation").to.be.greaterThan(0);
    visit(data);
    cy.window().should((win) => expect(storeOf(win).characters.Zani.optimizer.optimizationTarget).to.eq(`Rotation:${first(data)}`));
    finishedRun();
    cy.get(WHY).should("not.exist");
  });

  for (const ui of ["v3", "classic"] as const) {
    it(`${ui}: a saved rotation target on a character with no rotation at all falls to an attack, and Run gives rows`, () => {
      visit(
        account((record) => {
          record.rotations = [];
          record.optimizer.optimizationTarget = "Rotation:gone123";
        }),
        ui,
      );
      cy.window().should((win) => expect(storeOf(win).characters.Zani.optimizer.optimizationTarget).to.match(/^Attack:/));
      if (ui === "v3") finishedRun();
      else {
        cy.get("[data-test-optimizer-optimize-btn]").click({ force: true });
        cy.get("[data-test-optimizer-result-loadout]", { timeout: 60000 }).should("exist");
      }
    });
  }

  it("a rotation deleted while the screen is open: Run names the target, not the filters", () => {
    visit(account());
    cy.window().then((win) => {
      storeOf(win).characters.Zani.rotations = []; // the screen read the target while it was still there
      cy.spy(win.Worker.prototype, "postMessage").as("post");
    });
    cy.get(RUN).click({ force: true });
    cy.get(WHY).should("contain.text", "no longer exists");
    cy.get<sinon.SinonSpy>("@post").should("not.have.been.called");
  });

  for (const script of ["processor", "generator"]) {
    it(`a ${script} worker that cannot load, with the tab's one reload spent: a message, and the next run works`, () => {
      cy.intercept(`**/src/workers/${script}.worker.ts*`, { forceNetworkError: true });
      visit(account(), "v3", true);
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
    visit(account(), "classic", true);
    cy.get("[data-test-optimizer-optimize-btn]").click({ force: true });
    cy.get("[data-test-optimizer-empty-reason]", { timeout: 30000 }).should("contain.text", "could not start");
  });

  it("a tab older than the site reloads once, onto the Optimizer: a second press with the script still gone says why", () => {
    cy.intercept("**/src/workers/processor.worker.ts*", { forceNetworkError: true });
    visit(account());
    cy.window().then((win) => {
      (win as any).__sameTab = true;
    });
    cy.get(RUN).click({ force: true });
    cy.window({ timeout: 30000 }).should((win) => expect((win as any).__sameTab, "the page was reloaded").to.eq(undefined));
    cy.get(RUN, { timeout: 30000 }).should("exist"); // a plain reload opens the calculator on Character
    cy.wait(1500);
    cy.get(RUN).click({ force: true });
    cy.get(WHY, { timeout: 30000 }).should("contain.text", "could not start");
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
