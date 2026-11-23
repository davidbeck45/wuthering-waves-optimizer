// Wuthering Tools+ (batch 5, src/sim/syncNotice): a saved team from Team rankings read off an older engine than the
// app runs shows one notice on /account and /teams; its button opens the existing Sync my teams on /rankings, and after
// a Sync (or Hide) it is gone until the next engine update. A fresh account never sees it.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

type SavedTeam = { name: string; wuwaCalcCommit?: string; syncedAt?: number; actions: unknown[] };
const teamsOf = (win: Window): SavedTeam[] => (JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as { teams?: SavedTeam[] }).teams ?? [];

describe("the sync notice (Wuthering Tools+)", () => {
  it("never shows for an account without a saved team from Team rankings", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/account");
    cy.get("[data-test-account-teams]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-sync-notice]").should("not.exist");
    // a team the player built, even of the same three, is never counted
    cy.window().then((win) => {
      const store = JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as { teams?: unknown[] };
      store.teams = [{ id: "own", name: "My Cartethyia team", characterIds: ["Cartethyia", null, null], buildIds: [null, null, null], actions: [{ id: "a", slot: 0, key: "BasicAttack1", type: "basic", count: 1 }], duration: null }];
      win.localStorage.setItem("teamRotations", JSON.stringify(store));
    });
    cy.visit("/teams");
    cy.get("[data-test-team-list-engine]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-sync-notice]").should("not.exist");
  });

  it("shows for a team read before the update, leads to Sync my teams, and is gone after the Sync", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    // a team imported from Team rankings, as the importer writes it
    cy.visit("/rankings#tc=mine&r=Cartethyia");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get(".skittle-root .trow:not(.thead):not(.tghost) .gotodetail[data-team]", { timeout: 60000 }).first().click();
    cy.get(".skittle-root #topbar [data-test-rankings-import-team]").should("exist").click({ force: true });
    cy.get(".skittle-root #topbar .wt-import[data-test-rankings-import-done]", { timeout: 60000 }).should("exist");
    cy.window().should((win) => {
      expect(teamsOf(win)).to.have.length(1);
      expect(teamsOf(win)[0]!.wuwaCalcCommit, "a fresh import is stamped with today's engine").to.match(/^[0-9a-f]{7}$/);
    });
    // a fresh import is current: no notice
    cy.visit("/account");
    cy.get("[data-test-account-teams]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-sync-notice]").should("not.exist");

    // the same team as saved before stamps (every team saved before batch 5), with a shorter loop than today's
    cy.window().then((win) => {
      const store = JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as { teams: SavedTeam[] };
      delete store.teams[0]!.wuwaCalcCommit;
      store.teams[0]!.actions = store.teams[0]!.actions.slice(0, 3);
      win.localStorage.setItem("teamRotations", JSON.stringify(store));
    });
    cy.reload();
    cy.get("[data-test-sync-notice-text]", { timeout: 60000 }).should("contain.text", "Your saved team from Team rankings was read before its update of");
    cy.get("[data-test-sync-notice]").should("contain.text", "can be undone");
    cy.get("[data-test-sync-notice-go]").should("match", "button").and("contain.text", "Sync my teams");
    // one notice on /teams too
    cy.visit("/teams");
    cy.get("[data-test-sync-notice]", { timeout: 60000 }).should("have.length", 1);

    // the button is the existing Sync my teams: its question, then its report
    cy.get("[data-test-sync-notice-go]").click();
    cy.location("pathname").should("eq", "/rankings");
    cy.get(".confirm-dialog .modal-box", { timeout: 180000 }).should("contain.text", "Re-import 1 wuwa_calc team");
    cy.location("search", { timeout: 10000 }).should("eq", ""); // asked once: a reload does not ask again
    cy.get(".confirm-dialog .modal-action .btn-primary").should("contain.text", "Sync 1 team").click();
    cy.get("[data-test-rankings-sync-summary]", { timeout: 180000 }).should("contain.text", "1 updated");
    cy.window().should((win) => {
      const t = teamsOf(win)[0]!;
      expect(t.wuwaCalcCommit, "the sync stamps the team").to.match(/^[0-9a-f]{7}$/);
      expect(t.syncedAt, "and records when it moved it").to.be.greaterThan(0);
      expect(t.actions.length).to.be.greaterThan(3);
      expect(win.localStorage.getItem("wtplus:syncNotice:handled")).to.eq(t.wuwaCalcCommit);
    });
    cy.visit("/account");
    cy.get("[data-test-account-teams]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-sync-notice]").should("not.exist");
  });

  it("Hide keeps it away until the next engine update", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.window().then((win) => {
      const store = JSON.parse(win.localStorage.getItem("teamRotations") ?? "{}") as { teams?: unknown[] };
      store.teams = [{ id: "old", name: "Cartethyia · Chisa + Shorekeeper · S6R5 (wuwa_calc)", characterIds: ["Cartethyia", "Chisa", "Shorekeeper"], buildIds: [null, null, null], actions: [], duration: null, wuwaCalcCommit: "e95d4e6" }];
      win.localStorage.setItem("teamRotations", JSON.stringify(store));
    });
    cy.visit("/teams");
    cy.get("[data-test-sync-notice]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-sync-notice-hide]").should("have.attr", "aria-label").and("contain", "next update");
    cy.get("[data-test-sync-notice-hide]").click();
    cy.get("[data-test-sync-notice]").should("not.exist");
    cy.reload();
    cy.get("[data-test-team-list-engine]", { timeout: 60000 }).should("exist");
    cy.get("[data-test-sync-notice]").should("not.exist");
    // hidden at an older engine: back after an update
    cy.window().then((win) => win.localStorage.setItem("wtplus:syncNotice:handled", "e95d4e6"));
    cy.reload();
    cy.get("[data-test-sync-notice]", { timeout: 60000 }).should("exist");
  });
});
