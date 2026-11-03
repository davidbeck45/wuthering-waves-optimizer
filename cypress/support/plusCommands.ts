// Wuthering Tools+: plus-side test commands. Ryan's own commands (commands.ts) stay as they are upstream; this file
// only adds new ones.

// `/my-rankings` scores the roster progressively: each character's row lands as it is scored, and the status tile
// reads "live" when the whole run is done. Wait for the row, or for a run that ended without it, and say which.
Cypress.Commands.add("myRankingsRow", (id: string) => {
  const row = `[data-test-my-rankings-row="${id}"]`;
  cy.location("pathname").should("eq", "/my-rankings");
  cy.get(`${row}, [data-test-my-rankings-status][data-status="live"], [data-test-my-rankings-empty], [data-test-my-rankings] .alert-error`, {
    timeout: 120000,
  }).should("exist");
  cy.get("[data-test-my-rankings]").then(($page) => {
    const status = $page.find("[data-test-my-rankings-status]");
    const why = [
      `status ${status.attr("data-status") ?? "missing"} (${(status[0]?.innerText ?? "").replace(/\s+/g, " ").trim()})`,
      $page.find("[data-test-my-rankings-empty]").length ? "the empty state (no character set up)" : "",
      $page.find(".alert-error").text().trim(),
    ].filter(Boolean);
    expect($page.find(row).length, `the ${id} row on /my-rankings — ${why.join("; ")}`).to.be.greaterThan(0);
  });
  return cy.get(row);
});

// Saved results (src/sim/persist): the heavy pages keep their last result in IndexedDB, which Cypress's test isolation
// does not clear (it clears cookies, localStorage and sessionStorage). Without this, a spec would open on a result an
// earlier test scored and never show "Scoring". The spec runs on the app's origin, so it can delete the app's database;
// the app lets go of its connection on `versionchange`, and a delete still blocked after 5 s is left to the next test.
export const SAVED_RESULTS_DB = "wtplus-results";
export function deleteSavedResults(): Cypress.Chainable<string> {
  return cy.wrap(
    new Promise<string>((resolve) => {
      const timer = setTimeout(() => resolve("timeout"), 5000);
      const done = (how: string) => () => {
        clearTimeout(timer);
        resolve(how);
      };
      try {
        const r = window.indexedDB.deleteDatabase(SAVED_RESULTS_DB);
        r.onsuccess = done("deleted");
        r.onerror = done("error");
      } catch {
        done("unavailable")();
      }
    }),
    { log: false, timeout: 10000 },
  );
}
beforeEach(() => {
  deleteSavedResults();
});

// Cypress's own extension point. The base no-unused-vars rule does not read TS type declarations (the namespace and
// the parameter name trip it, as in Ryan's cypress/e2e/e2e.d.ts); this repo's ESLint has no @typescript-eslint rules.
/* eslint-disable no-unused-vars */
declare global {
  namespace Cypress {
    interface Chainable {
      myRankingsRow(id: string): Chainable<JQuery<HTMLElement>>;
    }
  }
}
/* eslint-enable no-unused-vars */

export {};
