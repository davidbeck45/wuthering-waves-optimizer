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
