// Wuthering Tools+: "add only new echoes" from a Wavescan file (src/sim/wavescan/), hooked into Ryan's Settings ›
// Wavescan panel. Uploads the synthetic scan in src/sim/wavescan/__fixtures__/newEchoes.json against its inventory:
// 3 new, 6 already owned (Phantom skins both ways, counted copies, a reordered and a 4★-typo close match), 2 only in
// the inventory. Seeds the v3 UI through onBeforeLoad (the support file seeds classic), on David's phone at 130 % text.
import * as fixtureModule from "../../src/sim/wavescan/__fixtures__/newEchoes.json";

// Cypress's webpack build hands a JSON import over as the module namespace, without a default export
const fixture = ((fixtureModule as unknown as { default?: typeof fixtureModule }).default ?? fixtureModule) as typeof fixtureModule;

type Inventory = { echoes: Array<{ echoId: string; echo: string }>; equipped: Record<string, Record<string, number>> };

function seed(options: { classic?: boolean; fontScale?: number } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("inventory", JSON.stringify(fixture.inventory));
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: Boolean(options.classic) };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!options.fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${options.fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

const readInventory = (win: Window): Inventory => JSON.parse(win.localStorage.getItem("inventory")!);

function uploadScan() {
  cy.get("[data-test-wavescan-file-input]").selectFile(
    { contents: Cypress.Buffer.from(JSON.stringify(fixture.scan)), fileName: "wavescan.json", mimeType: "application/json" },
    { force: true },
  );
  cy.get("[data-test-wavescan-new-only]", { timeout: 20000 }).should("be.visible");
}

function expectNoHorizontalScroll(what: string, width: number): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    expect(win.innerWidth, `${what} layout viewport`).to.eq(width);
  });
}

const count = (id: string) => cy.get(`[data-test-wavescan-new-only-count="${id}"]`);
const list = (id: string) => `[data-test-wavescan-new-only-list="${id}"]`;
const group = (listId: string, base: string) => `${list(listId)} [data-test-wavescan-new-only-group][data-base="${base}"]`;

describe("Wavescan: add only new echoes", () => {
  it("reviews a scan on a phone and adds only the new echoes, without touching who wears what", () => {
    cy.viewport(412, 915);
    cy.visit("/settings?section=wavescan", seed({ fontScale: 1.3 }));
    uploadScan();

    count("new").should("contain.text", "3").and("contain.text", "will be added");
    count("owned").should("contain.text", "6").and("contain.text", "Already in your inventory");
    count("missing").should("contain.text", "2").and("contain.text", "kept, never deleted");
    cy.get("[data-test-wavescan-new-only-note]").should("contain.text", "Who wears what doesn't change");

    // the new list: the scanned Phantom Gulpuff sits under Gulpuff with a badge, and says it's added unequipped
    cy.get(group("new", "Gulpuff")).within(() => {
      cy.get("[data-test-wavescan-new-only-skin]").should("contain.text", "Phantom skin");
      cy.contains("Worn by Jiyan in game. Added unequipped.");
    });
    cy.get(group("new", "Tambourinist")).find("[data-test-wavescan-new-only-echo]").should("have.length", 1);
    expectNoHorizontalScroll("review, new list open", 412);

    // owned: skins matched both ways, under their base echo
    cy.get(`${list("owned")} summary`).click();
    cy.get(group("owned", "Sigillum")).should("contain.text", "Scanned as the Phantom skin");
    cy.get(group("owned", "Dreamless")).should("contain.text", "Your inventory has it as the Phantom skin");
    cy.get(group("owned", "GlacioDrake")).should("contain.text", "another order");
    cy.get(group("owned", "Tambourinist")).find("[data-test-wavescan-new-only-echo]").should("have.length", 2);
    // only in the inventory: listed, equipped one says so
    cy.get(`${list("missing")} summary`).click();
    cy.get(group("missing", "Hoochief")).should("contain.text", "Equipped on Jiyan here");
    expectNoHorizontalScroll("review, all lists open", 412);

    // it asks first: cancel adds nothing, then confirm
    cy.get("[data-test-wavescan-new-only-add]").should("contain.text", "Add 3 echoes").click();
    cy.get(".confirm-dialog[open] .modal-box")
      .should("contain.text", "Add 3 echoes to your inventory?")
      .and("contain.text", "Keep the 2 echoes only in your inventory");
    expectNoHorizontalScroll("confirm", 412);
    cy.get(".confirm-dialog .modal-action").contains("button", "Cancel").click();
    cy.get(".confirm-dialog[open]").should("not.exist");
    count("new").should("contain.text", "3");
    cy.window().then((win) => expect(readInventory(win).echoes, "cancel adds nothing").to.have.length(fixture.inventory.echoes.length));
    cy.get("[data-test-wavescan-new-only-add]").click();
    cy.get(".confirm-dialog[open] .modal-action").contains("button", "Add 3 echoes").click();
    cy.get("[data-test-wavescan-new-only-done]").should("contain.text", "Added 3 echoes.");
    count("new").should("contain.text", "0");
    cy.get("[data-test-wavescan-new-only-add]").should("be.disabled").and("contain.text", "Nothing new to add");
    // the Echoes section below still says "… ready to import": the card says whether it has anything left to add
    cy.get("[data-test-wavescan-new-only]").then(($card) => {
      const upstreamWouldAdd = $card.find("[data-test-wavescan-new-only-upstream]").length > 0;
      if (upstreamWouldAdd) cy.get("[data-test-wavescan-new-only-after]").should("not.exist");
      else cy.get("[data-test-wavescan-new-only-after]").should("contain.text", "nothing new to add");
    });
    cy.window().then((win) => {
      const inventory = readInventory(win);
      expect(inventory.echoes, "3 echoes added").to.have.length(fixture.inventory.echoes.length + 3);
      expect(inventory.echoes.slice(0, fixture.inventory.echoes.length), "existing echoes untouched").to.deep.equal(fixture.inventory.echoes);
      expect(inventory.echoes.slice(-3).map((echo) => echo.echo)).to.deep.equal(["Tambourinist", "FogLionarch", "PhantomGulpuff"]);
      expect(inventory.equipped, "who wears what").to.deep.equal(fixture.inventory.equipped);
    });

    // a second pass over the same file finds nothing new
    cy.reload();
    uploadScan();
    count("new").should("contain.text", "0");
    count("owned").should("contain.text", "9");
  });

  it("is offered in the classic Settings › Wavescan tab too", () => {
    cy.viewport(1440, 900);
    cy.visit("/settings?section=wavescan", seed({ classic: true }));
    uploadScan();
    count("new").should("contain.text", "3");
    // Ryan's own import stays right below it
    cy.get("[data-test-wavescan-echoes]").should("be.visible");
    // a desktop lays a group's echo cards side by side (one 1,220 px card per line before)
    cy.get(`${list("owned")} summary`).click();
    cy.get(group("owned", "Tambourinist")).find("[data-test-wavescan-new-only-echo]").should(($cards) => {
      expect($cards).to.have.length(2);
      const [a, b] = [...$cards].map((c) => c.getBoundingClientRect());
      expect(Math.abs(a!.top - b!.top), "two cards on one row").to.be.lessThan(2);
      expect(a!.width, "a card is not the full width").to.be.lessThan(800);
    });
  });
});
