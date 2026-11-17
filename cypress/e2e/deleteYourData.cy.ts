// Wuthering Tools+: Settings › Delete your data takes the whole account (src/sim/storage/deleteAccount.ts). Upstream
// blanks the characters and the inventory; the teams, Build history, the undo records and the energy check stayed, so
// /teams, /build-history and /energy went on showing an account that was gone (2026-11-08 hunt, M2). v3 UI at the
// S26's 412 px and 130 % text, seeded through onBeforeLoad with public data only: upstream's Cartethyia fixture and one
// saved team.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const TEAM = "Cartethyia · Ciaccona · Chisa";
const HISTORY = "wtplus:buildHistory:v1:Cartethyia";
/** kept from the account: each must be gone afterwards */
const LEFT_BEHIND = ["wtplus:buildAccount:undo:v1", "wtplus:buildTeam:undo:v1", "wtplus:energy:v1", "wtplus:endgame:check", "wtplus:buildAccount:choice:v1"];
/** this device's settings, and the pull history: each must still be there */
const KEPT = { "wtplus:buildTeam:options:v1": '{"useSets":false}', "wtplus:convene:history": '{"v":1,"activePlayerId":null,"players":{}}', "wtplus:ai:key": "sk-test", "wtplus:teamBuffs:auto": "0" };

function seed() {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.clear();
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem(
        "teamRotations",
        JSON.stringify({
          teams: [{ id: "del-t1", name: TEAM, characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions: [], duration: null }],
          favoriteTeamIds: ["del-t1"],
          favoritePresetNames: ["Aemeath · Chisa + Denia · S6R5 (wuwa_calc)"],
        }),
      );
      for (const key of LEFT_BEHIND) win.localStorage.setItem(key, "{}");
      for (const [key, value] of Object.entries(KEPT)) win.localStorage.setItem(key, value);
      win.sessionStorage.setItem("wtplus:ai:chat", "{}");
      win.localStorage.setItem("settings", JSON.stringify({ config: { useClassicUi: false, theme: "dark" }, labs: {} }));
    },
    onLoad: large,
  };
}

function large(win: Window): void {
  const style = win.document.createElement("style");
  style.textContent = "html { font-size: 130%; }";
  win.document.head.appendChild(style);
}

describe("Settings › Delete your data", () => {
  beforeEach(() => cy.viewport(412, 915));

  it("takes the teams, Build history, the undo records and the checks with the account, says so first, and keeps the settings", () => {
    // an account with a saved team and a Build history version
    cy.visit("/build-history?char=Cartethyia", seed());
    cy.get("[data-test-build-history-save]").click();
    cy.get("[data-test-build-history-save-status]").should("have.text", "Saved.");
    cy.window().then((win) => expect(win.localStorage.getItem(HISTORY), "a Build history version").to.not.eq(null));
    cy.visit("/teams", { onLoad: large });
    cy.contains(TEAM).should("be.visible");

    // the card and the confirm say what goes and what stays
    cy.visit("/settings?section=danger-zone", { onLoad: large });
    cy.get("[data-test-delete-what]").should("contain.text", "characters, builds, echoes and teams").and("contain.text", "settings stay");
    cy.contains("button.btn-error", "Delete").click();
    cy.get(".confirm-dialog[open] .modal-box").within(() => {
      cy.contains("p", "cannot be undone").should("be.visible").and("contain.text", "your teams").and("contain.text", "Build history").and("contain.text", "export a backup first");
      cy.get(".confirm-dialog__items li").should("have.length", 2);
      cy.contains("li", "Convene pull history").should("contain.text", "Kept");
      cy.contains("li", "API key").should("contain.text", "Kept");
      // the list of what stays is read without scrolling inside its box, at 412 px and 130 % text
      cy.get(".confirm-dialog__items").should(($ul) => expect($ul[0].scrollHeight, "the kept list fits its box").to.be.at.most($ul[0].clientHeight + 1));
    });
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth, "confirm page width").to.be.at.most(doc.documentElement.clientWidth));
    cy.window().then((win) => ((win as unknown as { __beforeDelete: boolean }).__beforeDelete = true));
    cy.get(".confirm-dialog[open] .modal-action .btn").last().click();

    // the page reloads 1.5 s later: wait for the new document, then read what is left
    cy.window({ timeout: 15000 }).should((win) => expect((win as unknown as { __beforeDelete?: boolean }).__beforeDelete, "reloaded").to.eq(undefined));
    cy.window().then((win) => {
      const ls = win.localStorage;
      expect(ls.getItem("character"), "characters").to.eq("");
      expect(ls.getItem("inventory"), "echoes").to.eq("");
      const teams = ls.getItem("teamRotations");
      expect(teams ? JSON.parse(teams) : { teams: [], favoriteTeamIds: [], favoritePresetNames: [] }, "teams and stars").to.deep.eq({ teams: [], favoriteTeamIds: [], favoritePresetNames: [] });
      const history = Object.keys(ls).filter((k) => k.startsWith("wtplus:buildHistory:"));
      expect(history, "Build history").to.deep.eq([]);
      for (const key of LEFT_BEHIND) expect(ls.getItem(key), key).to.eq(null);
      expect(win.sessionStorage.getItem("wtplus:ai:chat"), "this tab's Ask chat").to.eq(null);
      for (const [key, value] of Object.entries(KEPT)) expect(ls.getItem(key), key).to.eq(value);
      expect(JSON.parse(ls.getItem("settings")!).config, "settings").to.include({ useClassicUi: false, theme: "dark" });
      // the stamp the other tabs act on, already acted on in this one
      expect(ls.getItem("wtplus:account:deletedAt"), "the Delete's stamp").to.match(/^\d+:[a-z0-9]+$/);
      expect(win.sessionStorage.getItem("wtplus:account:deleteSeen"), "acted on here").to.eq(ls.getItem("wtplus:account:deletedAt"));
    });

    // and each page reads as empty
    cy.visit("/teams", { onLoad: large });
    cy.get("[data-test-team-rotations-empty]").should("be.visible");
    cy.contains(TEAM).should("not.exist");
    cy.visit("/build-history", { onLoad: large });
    cy.get("[data-test-build-history-empty]").should("be.visible");
    cy.get("[data-test-build-history-version]").should("not.exist");
    cy.visit("/energy", { onLoad: large });
    cy.get("[data-test-energy-empty]").should("be.visible");
    cy.get("[data-test-energy-summary]").should("not.exist");
    cy.get("[data-test-energy-page]").should("not.contain.text", "every Liberation paid");
  });

  // 2026-11-16, second check: sessionStorage is per tab, so a Delete in one tab never reached what another tab kept.
  // Its Ask sheet still showed the conversation about the deleted account after a reload of that tab, its copies of the
  // ranking and the investment plan stayed, and a check still running there wrote its result back. The other tab is
  // played here by this one: what it holds, then the stamp a Delete leaves, as the `storage` event another tab gets.
  const CHAT = JSON.stringify({
    version: 1,
    id: "c1",
    model: "claude-opus-5-5",
    startedAt: "2026-11-16T00:00:00Z",
    snapshot: "Cartethyia S0, Ciaccona, Chisa",
    accountKey: "k",
    pageContext: null,
    messages: [
      { role: "user", content: "which team is my best?" },
      { role: "assistant", content: [{ type: "text", text: "Your best team is Cartethyia · Ciaccona · Chisa." }] },
    ],
    usage: { requests: 1, inputTokens: 10, outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 0, costUsd: 0.01 },
    budgetUsd: 1,
    budgetStepUsd: 1,
  });
  const STAMP = "1794000000000:abc123";
  const TAB_COPIES = ["wtplus:myRankings:last", "wtplus:account:invest", "wtplus:echoLab:cache"];

  function otherTab(deletedAlready: boolean) {
    return {
      onBeforeLoad(win: Window) {
        win.sessionStorage.clear();
        win.localStorage.clear();
        win.localStorage.setItem("settings", JSON.stringify({ config: { useClassicUi: false, theme: "dark" }, labs: {} }));
        win.localStorage.setItem("wtplus:ai:key", "sk-test");
        win.sessionStorage.setItem("wtplus:ai:chat", CHAT);
        for (const key of TAB_COPIES) win.sessionStorage.setItem(key, "{}");
        if (deletedAlready) win.localStorage.setItem("wtplus:account:deletedAt", STAMP);
      },
      onLoad: large,
    };
  }

  it("a tab that is open when another tab deletes drops its Ask chat and its copies, and reloads", () => {
    cy.visit("/teams", otherTab(false));
    cy.get("[data-test-team-rotations-empty]").should("be.visible");
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem("wtplus:ai:chat"), "the chat before the Delete").to.eq(CHAT);
      (win as unknown as { __beforeDelete: boolean }).__beforeDelete = true;
      // the other tab's Delete: the stamp lands in the shared localStorage, and this tab hears of it
      win.localStorage.setItem("wtplus:account:deletedAt", STAMP);
      win.dispatchEvent(new win.StorageEvent("storage", { key: "wtplus:account:deletedAt", newValue: STAMP, oldValue: null, storageArea: win.localStorage }));
    });
    cy.window({ timeout: 15000 }).should((win) => expect((win as unknown as { __beforeDelete?: boolean }).__beforeDelete, "reloaded").to.eq(undefined));
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem("wtplus:ai:chat"), "this tab's Ask chat").to.eq(null);
      for (const key of TAB_COPIES) expect(win.sessionStorage.getItem(key), key).to.eq(null);
      expect(win.sessionStorage.getItem("wtplus:account:deleteSeen"), "acted on").to.eq(STAMP);
      expect(win.localStorage.getItem("wtplus:ai:key"), "the assistant's key stays").to.eq("sk-test");
    });
    // the sheet opens on a new chat, not on the answers about the account that is gone
    cy.get("[data-test-ai-open]").click();
    cy.get("[data-test-ai-panel]").should("be.visible").and("not.contain.text", "Your best team is Cartethyia");
    cy.get("[data-test-ai-question]").should("not.exist");
  });

  it("a tab that slept through a Delete drops them as it loads, once: a chat started afterwards stays", () => {
    cy.visit("/teams", otherTab(true));
    cy.get("[data-test-team-rotations-empty]").should("be.visible");
    cy.window().then((win) => {
      expect(win.sessionStorage.getItem("wtplus:ai:chat"), "this tab's Ask chat").to.eq(null);
      for (const key of TAB_COPIES) expect(win.sessionStorage.getItem(key), key).to.eq(null);
      expect(win.sessionStorage.getItem("wtplus:account:deleteSeen"), "acted on").to.eq(STAMP);
      // a new chat in this tab, after it acted on the Delete
      win.sessionStorage.setItem("wtplus:ai:chat", CHAT);
    });
    cy.reload();
    cy.get("[data-test-team-rotations-empty]").should("be.visible");
    cy.window().then((win) => expect(win.sessionStorage.getItem("wtplus:ai:chat"), "the later chat").to.eq(CHAT));
  });
});
