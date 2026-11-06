// Wuthering Tools+ build history (/build-history, src/sim/buildHistory/) in the v3 UI at the S26's 412 px and 130 % text:
// save a version, change the build, read the comparison, restore it through the confirm, and the automatic version a
// Settings import takes. Seeded through onBeforeLoad (the support file seeds classic otherwise) with public data only:
// upstream's Cartethyia golden fixture (her build + 17 echoes).
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const KEY = "wtplus:buildHistory:v1:Cartethyia";
const S26 = { width: 412, height: 915 };

type Slot = { echoId: string | null };
type Record = { weapon: string; weapons?: { [k: string]: { refinement?: string } }; echoes: { [k: string]: Slot } };
const fixture = (): { characters: { [k: string]: Record } } => JSON.parse(configOptimizer.data.character);
const inventory = (): { echoes: Array<{ echoId: string; type: number }> } => JSON.parse(configOptimizer.data.inventory);

function seed(options: { classic?: boolean } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.removeItem(KEY);
      win.localStorage.removeItem("wtplus:buildHistory:pendingImport");
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: !!options.classic };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130%; }";
      win.document.head.appendChild(style);
    },
  };
}

const readCart = (win: Window): Record => JSON.parse(win.localStorage.getItem("character")!).characters.Cartethyia;
const readHistory = (win: Window): Array<{ label: string; payload: { members: Array<{ weapon: { rank: number } }> } }> => JSON.parse(win.localStorage.getItem(KEY) ?? '{"versions":[]}').versions;

function expectNoHorizontalScroll(what: string, width = S26.width): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    expect(win.innerWidth, `${what} layout viewport`).to.eq(width);
  });
}

describe("build history", () => {
  beforeEach(() => cy.viewport(S26.width, S26.height));

  it("saves a version, compares it with the changed build and restores it", () => {
    cy.visit("/build-history?char=Cartethyia", seed());
    cy.title().should("eq", "Build history — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-build-history-character]").should("have.value", "Cartethyia");
    cy.get("[data-test-build-history-now-gear]").should("contain.text", "Defier's Thorn R1").and("contain.text", "5 of 5 echoes");
    cy.get("[data-test-build-history-now-damage]", { timeout: 60000 }).invoke("text").should("match", /\d/);
    cy.get("[data-test-build-history-none]").should("be.visible");

    // save, then save the same build again: deduped
    cy.get("[data-test-build-history-save]").click();
    cy.get("[data-test-build-history-save-status]").should("have.text", "Saved.");
    cy.get("[data-test-build-history-version]").should("have.length", 1).first().should("have.attr", "data-version-label", "manual").and("contain.text", "Saved by you");
    cy.get("[data-test-build-history-save]").click();
    cy.get("[data-test-build-history-save-status]").should("contain.text", "Already saved");
    cy.window().then((win) => expect(readHistory(win)).to.have.length(1));
    expectNoHorizontalScroll("/build-history, one version");

    // change the build by hand (weapon to R5, another 1-cost echo in slot 3), as the calculator would have stored it
    let original: string[] = [];
    let swapped = "";
    cy.window().then((win) => {
      const store = JSON.parse(win.localStorage.getItem("character")!);
      const cart: Record = store.characters.Cartethyia;
      original = Object.values(cart.echoes).map((s) => s.echoId!);
      swapped = inventory().echoes.find((e) => e.type === 1 && !original.includes(e.echoId))!.echoId;
      cart.weapons = { ...(cart.weapons ?? {}), [cart.weapon]: { refinement: "5" } };
      cart.echoes["2"] = { ...cart.echoes["2"], echoId: swapped };
      win.localStorage.setItem("character", JSON.stringify(store));
    });
    cy.reload();
    cy.get("[data-test-build-history-now-gear]").should("contain.text", "Defier's Thorn R5");

    // the comparison opens on the newest version against now
    cy.get("[data-test-build-history-from] option:selected").should("contain.text", "Saved by you");
    cy.get("[data-test-build-history-to]").should("have.value", "now");
    cy.get("[data-test-build-history-diff-gear]").should("contain.text", "Weapon: Defier's Thorn R1 → Defier's Thorn R5").and("contain.text", "Same sequence");
    cy.get("[data-test-build-history-slot]").eq(2).should("have.attr", "data-slot-status", "changed");
    cy.get('[data-test-build-history-slot][data-slot-status="same"]').should("have.length", 4);
    cy.get("[data-test-build-history-stat]", { timeout: 30000 }).should("have.length.at.least", 6);
    cy.get('[data-test-build-history-stat][data-stat="ATK_FLAT"]').should("have.class", "bh-stats__changed");
    // a changed percentage stat says its change is in percentage points; a flat stat stays a plain number
    cy.get("[data-test-build-history-stat].bh-stats__changed .bh-stats__delta").each(($d) => {
      const key = $d.closest("[data-stat]").attr("data-stat")!;
      expect($d.text(), key).to.match(key.endsWith("_FLAT") ? /^[+−][\d,]+$/ : /^[+−]\d+\.\d\u00a0pts$/);
    });
    cy.get("[data-test-build-history-diff-damage-change]", { timeout: 60000 }).invoke("text").should("match", /^[+−]\d+\.\d %$/);
    cy.get("[data-test-build-history-version-change]", { timeout: 60000 }).invoke("text").should("match", /vs now/);
    expectNoHorizontalScroll("/build-history, comparison");
    // the narrowest common phone too
    cy.viewport(360, 800);
    expectNoHorizontalScroll("/build-history, comparison at 360 px", 360);
    cy.viewport(S26.width, S26.height);

    // restore: the confirm lists the changes; afterwards the old build is back and the changed one is a version
    cy.get("[data-test-build-history-restore]").first().click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "Restore Cartethyia's build").and("contain.text", "R5 → Defier's Thorn R1").and("contain.text", "Slot 3:").and("contain.text", "Before a restore");
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get("[data-test-build-history-now-gear]").should("contain.text", "Defier's Thorn R1");
    cy.get("[data-test-build-history-version]").should("have.length", 2).first().should("have.attr", "data-version-label", "before-restore");
    cy.window().then((win) => {
      const cart = readCart(win);
      expect(cart.weapons?.[cart.weapon]?.refinement).to.eq("1");
      expect(Object.values(cart.echoes).map((s) => s.echoId)).to.deep.eq(original);
      const inv = JSON.parse(win.localStorage.getItem("inventory")!);
      expect(inv.echoes, "no echo added: all five were still in the inventory").to.have.length(inventory().echoes.length);
      expect(inv.equipped[swapped]?.Cartethyia, "the swapped-in echo is off her again").to.eq(undefined);
      const hist = readHistory(win);
      expect(hist.map((v) => v.label)).to.deep.eq(["before-restore", "manual"]);
      expect(hist[0].payload.members[0].weapon.rank).to.eq(5);
    });
    // the comparison now reads from the build before the restore to the restored one
    cy.get("[data-test-build-history-from] option:selected").should("contain.text", "Before a restore");
    cy.get("[data-test-build-history-diff-gear]").should("contain.text", "Weapon: Defier's Thorn R5 → Defier's Thorn R1");

    // delete a version
    cy.get("[data-test-build-history-delete]").last().click();
    cy.get(".confirm-dialog .modal-action .btn-error").click();
    cy.get("[data-test-build-history-version]").should("have.length", 1);
  });

  it("keeps a version of every build a Settings import replaces", () => {
    cy.visit("/", seed({ classic: true }));
    const next = fixture();
    const cart = next.characters.Cartethyia;
    cart.weapons = { ...(cart.weapons ?? {}), [cart.weapon]: { refinement: "4" } };
    cy.importCharacterData({ ...configOptimizer, data: { ...configOptimizer.data, character: JSON.stringify(next) } });
    cy.window().its("localStorage").invoke("getItem", "wtplus:buildHistory:pendingImport").should("eq", null);
    cy.window().then((win) => {
      const hist = readHistory(win);
      expect(hist.map((v) => v.label)).to.deep.eq(["before-import"]);
      expect(hist[0].payload.members[0].weapon.rank, "the build from before the import").to.eq(1);
      expect(readCart(win).weapons?.[cart.weapon]?.refinement).to.eq("4");
    });
    cy.visit("/build-history?char=Cartethyia");
    cy.get("[data-test-build-history-version]").should("have.length", 1).first().should("contain.text", "Before a Settings import");
  });

  it("Back during a Restore confirm cancels it: the dialog goes and nothing is written", () => {
    cy.visit("/today", seed());
    cy.get("[data-test-today]", { timeout: 60000 }).should("exist"); // a push before the first route has landed replaces it
    const go = (path: string) => cy.window().then((win) => ((win.document.querySelector("#wt-app") as unknown as { __vue_app__: { config: { globalProperties: { $router: { push(p: string): void } } } } }).__vue_app__.config.globalProperties.$router.push(path)));
    go("/build-history?char=Cartethyia");
    cy.get("[data-test-build-history-save]", { timeout: 60000 }).click();
    cy.get("[data-test-build-history-version]").should("have.length", 1);
    // the build changes after that version, so a restore has something to do
    cy.window().then((win) => {
      const store = (win.document.querySelector("#wt-app") as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { characters: { [k: string]: Record } }> } } } } }).__vue_app__.config.globalProperties.$pinia._s.get("character")!;
      const cart = store.characters.Cartethyia!;
      cart.weapons = { ...(cart.weapons ?? {}), [cart.weapon]: { refinement: "5" } };
    });
    cy.get("[data-test-build-history-now-gear]").should("contain.text", "Defier's Thorn R5");
    cy.get("[data-test-build-history-restore]").first().click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "Restore Cartethyia's build");
    cy.go("back");
    cy.location("pathname").should("eq", "/today");
    cy.get(".confirm-dialog .modal-box").should("not.exist");
    cy.window().then((win) => {
      const cart = readCart(win);
      expect(cart.weapons?.[cart.weapon]?.refinement, "the restore did not run").to.eq("5");
    });
  });

  it("opens from the account drawer", () => {
    cy.visit("/account", seed());
    cy.get('[data-test-account-card="Cartethyia"]', { timeout: 120000 }).click();
    cy.get("[data-test-account-drawer-history]").should("contain.text", "No versions");
    cy.get("[data-test-account-open-history]").click();
    cy.location("pathname").should("eq", "/build-history");
    cy.location("search").should("contain", "char=Cartethyia");
    cy.get("[data-test-build-history-character]").should("have.value", "Cartethyia");
  });
});
