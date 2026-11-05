// Wuthering Tools+ — the calculator's optimizer after its exact speedups (track "optimizer-speed", 2026-11-02): each
// distinct rotation action scored once and the processor workers' bound skip. On upstream's golden optimizer
// configs, every one of the five result rows reads the same Normal / Average / Crit rotation totals it read before
// the change (recorded on plus-b3 d530c488 with this spec's record mode), and the run evaluates as many loadouts.
// Upstream's own specs check row 1 only; the bound skip works on the bar a row must clear, so rows 2–5 are where a
// wrong skip would show.
//
// Record mode (regenerating the numbers on a build without the change): CYPRESS_OPT_RECORD=<file.json>;
// CYPRESS_OPT_DUMP=<file.json> writes what a normal run read, elapsed times included.
import { configOptimizer as zani } from "./calculator/data/Zani/data";
import { configOptimizer as phrolova } from "./calculator/data/Phrolova/data";
import { configOptimizer as lupa } from "./calculator/data/Lupa/data";
import { configOptimizer as lynae } from "./calculator/data/Lynae/data";

type Row = [normal: string, average: string, crit: string];
interface Recorded {
  /** "Processed N of N loadouts" */
  evaluated: string;
  rows: Row[];
  /** the run's "Elapsed" line (recorded for the report, never compared) */
  elapsed?: string;
}

const CONFIGS: Array<{ name: string; config: unknown }> = [
  { name: "Zani", config: zani },
  { name: "Phrolova", config: phrolova },
  { name: "Lupa", config: lupa },
  { name: "Lynae", config: lynae },
];

// recorded on plus-b3 d530c488 (before the change: its processor worker and Calculator.vue), classic UI, Cypress's Electron
const BEFORE: Record<string, Recorded> = {
  Zani: {
    evaluated: "Processed 100 of 100 loadouts",
    rows: [
      ["1761746 (+14.0%)", "5905371 (+28.8%)", "5905371 (+18.6%)"],
      ["1709493 (+10.6%)", "5574989 (+21.6%)", "5586621 (+12.2%)"],
      ["1712523 (+10.8%)", "5566602 (+21.4%)", "5760925 (+15.7%)"],
      ["1707727 (+10.5%)", "5496214 (+19.8%)", "5601342 (+12.5%)"],
      ["1647716 (+6.6%)", "5370698 (+17.1%)", "5404509 (+8.6%)"],
    ],
  },
  Phrolova: {
    evaluated: "Processed 32 of 32 loadouts",
    rows: [
      ["1828453 (+3.5%)", "8359684 (+5.4%)", "8359684 (+5.4%)"],
      ["1767062 (+0.0%)", "7930575 (+0.0%)", "7930575 (+0.0%)"],
      ["1626868 (-7.9%)", "7194008 (-9.3%)", "7194008 (-9.3%)"],
      ["1525917 (-13.6%)", "6784224 (-14.5%)", "6784224 (-14.5%)"],
      ["1569177 (-11.2%)", "6712804 (-15.4%)", "6807086 (-14.2%)"],
    ],
  },
  Lupa: {
    evaluated: "Processed 114 of 114 loadouts",
    rows: [
      ["550964 (+5.1%)", "1506044 (+17.9%)", "1571349 (+8.3%)"],
      ["536890 (+2.4%)", "1504471 (+17.7%)", "1505440 (+3.7%)"],
      ["567126 (+8.2%)", "1500160 (+17.4%)", "1603830 (+10.5%)"],
      ["539934 (+3.0%)", "1463870 (+14.6%)", "1533413 (+5.7%)"],
      ["526173 (+0.4%)", "1462475 (+14.5%)", "1469075 (+1.2%)"],
    ],
  },
  Lynae: {
    evaluated: "Processed 69 of 69 loadouts",
    rows: [
      ["838017 (+1.4%)", "2053187 (+13.2%)", "2154561 (+5.9%)"],
      ["844782 (+2.2%)", "2038982 (+12.4%)", "2233387 (+9.8%)"],
      ["822604 (-0.5%)", "1906295 (+5.1%)", "2052674 (+0.9%)"],
      ["829040 (+0.3%)", "1892151 (+4.3%)", "2128687 (+4.6%)"],
      ["820465 (-0.7%)", "1825062 (+0.6%)", "1960757 (-3.6%)"],
    ],
  },
};

const record = Cypress.env("OPT_RECORD") as string | undefined;
/** CYPRESS_OPT_DUMP=<file.json>: also write what this run read (elapsed times for the report) */
const dump = Cypress.env("OPT_DUMP") as string | undefined;
const recorded: Record<string, Recorded> = {};

/** Done = processed equals generated and the Elapsed clock has stopped (the generator's total grows batch by batch,
 *  so "N of N" alone can hold mid-run); the classic panel has no other running flag. */
function waitForRunEnd(tries = 40): void {
  cy.get("[data-test-optimizer-elapsed]").invoke("text").then((before) => {
    cy.wait(2500);
    cy.get("[data-test-optimizer-elapsed]").invoke("text").then((after) => {
      cy.get("progress.progress-primary").then(($el) => {
        const done = Number($el.prop("max")) > 0 && Number($el.prop("value")) === Number($el.prop("max")) && before === after;
        if (!done) {
          if (tries <= 0) throw new Error("the optimizer run did not finish");
          waitForRunEnd(tries - 1);
        }
      });
    });
  });
}

function readRun(): Cypress.Chainable<Recorded> {
  const rows: Row[] = [];
  const out: Recorded = { evaluated: "", rows };
  waitForRunEnd();
  for (let i = 0; i < 5; i++) {
    cy.get(`[data-test-optimizer-results-index="${i}"]`).then(($row) => {
      const text = (sel: string): string => $row.find(sel).first().text().replace(/\s+/g, " ").trim();
      rows.push([text("[data-test-optimizer-rotation-damage-total]"), text("[data-test-optimizer-rotation-damage-total-avg]"), text("[data-test-optimizer-rotation-damage-total-crit]")]);
    });
  }
  cy.get("[data-test-optimizer-progress]").then(($el) => {
    out.evaluated = $el.text().replace(/\s+/g, " ").trim();
  });
  cy.get("[data-test-optimizer-elapsed]").then(($el) => {
    out.elapsed = $el.text().replace(/\s+/g, " ").trim();
  });
  return cy.wrap(out);
}

function openOptimizer(name: string, config: unknown): void {
  cy.visit("/");
  cy.importCharacterData(config as any);
  cy.get("[data-test-nav-calculator]").click();
  cy.get(`.character__selection.${name}`).should("exist");
  cy.get('[data-test-calculator-nav="optimizer"]').click();
  cy.get(".screen--optimizer").should("be.visible");
  // the panel has read the imported optimizer settings once its guide button shows (upstream's specs wait so too)
  cy.get("[data-test-optimizer-guide-btn]").should("be.visible");
}

/** The page has read the character and its weapon: his buff rows mount once the module is in, and a weapon's passive rows
 *  once the weapon is. They are the last to report, and the panel above is on screen long before either. */
function waitForTheCharacter(): void {
  cy.get(".character__self-buffs").should("exist");
  cy.get("[data-test-weapon-passive]").should("exist");
}

/** Holds back one module of the dev server's; call what it returns to let it through. */
function holdModule(pathname: string): () => void {
  let release!: () => void;
  const gate = new Promise<void>((resolve) => (release = resolve));
  cy.intercept({ method: "GET", pathname }, async (req) => {
    await gate;
    req.continue();
  });
  return () => release();
}

function characterStore(win: Cypress.AUTWindow): { activeCharacter: string; setActiveCharacter: (name: string) => void } {
  const host = [...win.document.querySelectorAll("*")].find((el) => "__vue_app__" in el) as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, ReturnType<typeof characterStore>> } } } } };
  return host.__vue_app__.config.globalProperties.$pinia._s.get("character")!;
}

function expectZaniRows(): void {
  readRun().then((run) => {
    expect(run.rows).to.deep.equal(BEFORE.Zani!.rows);
    expect(run.evaluated).to.equal(BEFORE.Zani!.evaluated);
  });
}

describe("the optimizer's five results are the ones it found before the speedups", { defaultCommandTimeout: 20000 }, () => {
  for (const { name, config } of CONFIGS) {
    it(`${name}: rows 1–5, Normal / Average / Crit`, () => {
      openOptimizer(name, config);
      waitForTheCharacter();
      cy.get("[data-test-optimizer-optimize-btn]").click();
      cy.wait(100);
      cy.get("[data-test-optimizer-optimize-btn]").click();
      cy.get('[data-test-optimizer-results-index="0"]', { timeout: 60000 }).should("exist");
      readRun().then((run) => {
        recorded[name] = run;
        if (record) return;
        const want = BEFORE[name];
        expect(want, `recorded numbers for ${name}`).to.exist;
        expect(run.rows).to.deep.equal(want!.rows);
        expect(run.evaluated).to.equal(want!.evaluated);
      });
    });
  }

  after(() => {
    const file = record ?? dump;
    if (file) cy.writeFile(file, JSON.stringify(recorded, null, 2));
  });
});

// A run reads what the page holds when it starts, and the panel is up before the character is (a slow chunk, a character
// just picked): these rows came back wrong under a normal "Processed 100 of 100 loadouts", with nothing to say so
// (src/sim/optimizer/optimizerPress.ts). The hold stands in for that slow chunk.
describe("the optimizer pressed too early, twice, or left running", { defaultCommandTimeout: 20000 }, () => {
  it("a press before the character has loaded waits for it and finds the same rows", () => {
    const release = holdModule("/src/characters/Zani/index.ts");
    openOptimizer("Zani", zani);
    cy.get("[data-test-optimizer-optimize-btn]").click();
    cy.wait(500);
    cy.get('[data-test-optimizer-results-index="0"]').should("not.exist");
    cy.then(release);
    cy.get('[data-test-optimizer-results-index="0"]', { timeout: 60000 }).should("exist");
    expectZaniRows();
  });

  it("a press before the weapon has loaded waits for it too, passives and all", () => {
    const release = holdModule("/src/weapons/Gauntlets/BlazingJustice.ts");
    openOptimizer("Zani", zani);
    cy.get(".character__self-buffs").should("exist");
    cy.get("[data-test-optimizer-optimize-btn]").click();
    cy.wait(500);
    cy.get('[data-test-optimizer-results-index="0"]').should("not.exist");
    cy.then(release);
    cy.get('[data-test-optimizer-results-index="0"]', { timeout: 60000 }).should("exist");
    expectZaniRows();
  });

  it("two presses while it loads make one run", () => {
    const release = holdModule("/src/characters/Zani/index.ts");
    openOptimizer("Zani", zani);
    cy.window().then((win) => {
      cy.spy(win.Worker.prototype, "postMessage").as("post");
    });
    cy.get("[data-test-optimizer-optimize-btn]").click();
    cy.get("[data-test-optimizer-optimize-btn]").click();
    cy.then(release);
    cy.get('[data-test-optimizer-results-index="0"]', { timeout: 60000 }).should("exist");
    expectZaniRows();
    // the generator is told to start once a run
    cy.get<sinon.SinonSpy>("@post").then((post) => {
      expect(post.getCalls().filter((call) => call.args[0]?.type === "start"), "runs started").to.have.length(1);
    });
  });

  it("a second press stops the run in flight, so the last to finish cannot win", () => {
    openOptimizer("Zani", zani);
    waitForTheCharacter();
    cy.window().then((win) => {
      cy.spy(win.Worker.prototype, "terminate").as("terminate");
    });
    cy.get("[data-test-optimizer-optimize-btn]").then(($button) => {
      $button[0]!.click();
      cy.get<sinon.SinonSpy>("@terminate").then((terminate) => {
        expect(terminate.callCount, "still running").to.eq(0);
        $button[0]!.click();
        expect(terminate.callCount, "the first run's workers").to.be.greaterThan(0);
      });
    });
    cy.get('[data-test-optimizer-results-index="0"]', { timeout: 60000 }).should("exist");
    expectZaniRows();
  });

  it("a run left going when another character is picked stops, and nothing lands on the new one", () => {
    openOptimizer("Zani", zani);
    waitForTheCharacter();
    cy.window().then((win) => {
      cy.spy(win.Worker.prototype, "terminate").as("terminate");
      const store = characterStore(win);
      cy.get("[data-test-optimizer-optimize-btn]").then(($button) => {
        $button[0]!.click();
        store.setActiveCharacter("Augusta");
      });
    });
    cy.get(".character__selection.Augusta").should("exist");
    cy.get<sinon.SinonSpy>("@terminate").should("have.been.called");
    cy.get("[data-test-optimizer-guide-btn]").should("be.visible");
    cy.wait(3000);
    cy.get('[data-test-optimizer-results-index="0"]').should("not.exist");
  });

  it("on the v3 screens a character just picked runs with its own weapon, not the last one's still in hand", () => {
    // same kind of weapon, and Zani's has no passive rows to report their going: v3's panel says nothing until the new one
    // is in, and until then the page still holds hers
    const release = holdModule("/src/weapons/Gauntlets/AbyssSurges.ts");
    const account = JSON.parse(zani.data.character);
    account.characters.Zani.weapon = "GauntletsOfVoyager";
    account.characters.Lingyang = { ...account.characters.Zani, weapon: "AbyssSurges", weaponPassives: {} };
    cy.visit("/?screen=optimizer", {
      onBeforeLoad(win) {
        win.localStorage.setItem("character", JSON.stringify(account));
        win.localStorage.setItem("inventory", zani.data.inventory);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });
    cy.get("[data-test-optimizer-workspace-optimize-btn]").should("exist");
    cy.wait(1500); // Zani's weapon in hand (a slower page only makes this a switch before it is, which must hold too)
    cy.window().then((win) => {
      cy.spy(win.Worker.prototype, "postMessage").as("post");
      characterStore(win).setActiveCharacter("Lingyang");
    });
    cy.wait(300); // the page has moved over (nothing on the v3 optimizer screen names the character)
    cy.get("[data-test-optimizer-workspace-optimize-btn]").should("exist").click({ force: true });
    cy.wait(1500);
    const runs = (post: sinon.SinonSpy): Array<{ data: { context: { character: string; weaponData: { weaponPassiveDefs: Array<{ key: string }> } } } }> =>
      post.getCalls().map((call) => call.args[0]).filter((message) => message?.type === "init" && message?.data?.context);
    cy.get<sinon.SinonSpy>("@post").then((post) => expect(runs(post), "runs started on the old weapon").to.have.length(0));
    cy.then(release);
    cy.get<sinon.SinonSpy>("@post").should((post) => {
      const init = runs(post)[0];
      expect(init, "the run").to.exist;
      expect(init!.data.context.character).to.eq("Lingyang");
      expect(init!.data.context.weaponData.weaponPassiveDefs.map((def) => def.key).join()).to.contain("AbyssSurges");
    });
  });

  it("a character still loading when another is picked does not pull the page back to it", () => {
    openOptimizer("Zani", zani);
    waitForTheCharacter();
    const release = holdModule("/src/characters/Phrolova/index.ts");
    cy.window().then((win) => {
      const store = characterStore(win);
      store.setActiveCharacter("Phrolova");
      cy.wait(200).then(() => store.setActiveCharacter("Augusta"));
      cy.get(".character__selection.Augusta").should("exist");
      cy.get(".character__self-buffs").should("exist");
      cy.then(release);
      cy.wait(1500).then(() => expect(store.activeCharacter).to.eq("Augusta"));
      cy.get(".character__selection.Augusta").should("exist");
    });
  });
});
