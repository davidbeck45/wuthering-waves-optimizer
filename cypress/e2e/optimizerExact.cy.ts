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

describe("the optimizer's five results are the ones it found before the speedups", { defaultCommandTimeout: 20000 }, () => {
  for (const { name, config } of CONFIGS) {
    it(`${name}: rows 1–5, Normal / Average / Crit`, () => {
      cy.visit("/");
      cy.importCharacterData(config as any);
      cy.get("[data-test-nav-calculator]").click();
      cy.get(`.character__selection.${name}`).should("exist");
      cy.get('[data-test-calculator-nav="optimizer"]').click();
      cy.get(".screen--optimizer").should("be.visible");
      // the panel has read the imported optimizer settings once its guide button shows (upstream's specs wait so too)
      cy.get("[data-test-optimizer-guide-btn]").should("be.visible");
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
