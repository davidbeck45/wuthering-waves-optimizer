// Wuthering Tools+: the "My roster" share card (src/sim/share/RosterSheet.vue, RosterCard.vue) — opened from the My
// account hero and from /share, a toggle changes the preview, Download hands over a PNG at the design width × 2, the
// teams strip reads the hero's own figure, and the sheet holds at 360 px. Seeds the Cartethyia optimizer account plus
// two armed teammates, as account.cy.ts does, so one team is fieldable.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

function seed() {
  const character = JSON.parse(configOptimizer.data.character);
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
  };
}

/** Downloads are caught: the blob handed to URL.createObjectURL is kept on the window, the link click does nothing. */
function catchDownloads(win: Window & { __rosterBlobs?: Blob[] }) {
  win.__rosterBlobs = [];
  const create = win.URL.createObjectURL.bind(win.URL);
  cy.stub(win.URL, "createObjectURL").callsFake((b: Blob) => {
    win.__rosterBlobs!.push(b);
    return create(b);
  });
  cy.stub(win.HTMLAnchorElement.prototype, "click").callsFake(() => undefined);
}

describe("share my roster", () => {
  it("opens from My account, follows its toggles, and downloads a PNG at the design width", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    // the ranking has finished: the hero prints the best team
    cy.get("[data-test-account-hero-damage]", { timeout: 120000 }).invoke("text").should("match", /\d/);
    cy.get("[data-test-account-hero-eyebrow]").should("not.contain.text", "so far");
    cy.window().then((win) => catchDownloads(win as any));

    cy.get("[data-test-roster-share-button]").click();
    cy.get("[data-test-roster-sheet]").should("have.attr", "open");
    cy.get("[data-test-roster-sheet-picture-only]").should("contain.text", "no data to load back");
    cy.get("[data-test-roster-tile]").should("have.length", 3);
    cy.get('[data-test-roster-tile-id="Cartethyia"]').should("contain.text", "Defier's Thorn").and("contain.text", "S2").and("contain.text", "5★");
    cy.get('[data-test-roster-tile-id="Chisa"] [data-test-roster-tile-rank]').should("have.text", "R5");
    // the strip reads the hero's own figure for the strongest team
    cy.get("[data-test-roster-team]").should("have.length.at.least", 1);
    cy.get("[data-test-account-hero-damage]")
      .invoke("text")
      .then((hero) => {
        cy.get("[data-test-roster-team-damage]").first().should("have.text", hero.trim());
      });
    // the preview's text alternative says what is on it
    cy.get("[data-test-roster-preview] [role=img]").should("have.attr", "aria-label").and("match", /^Roster card with 3 resonators/);

    // toggles change the preview
    cy.get("[data-test-roster-tile-score]").should("have.length.at.least", 1);
    cy.get("[data-test-roster-toggle-scores]").uncheck({ force: true });
    cy.get("[data-test-roster-tile-score]").should("not.exist");
    cy.get("[data-test-roster-toggle-teams]").uncheck({ force: true });
    cy.get("[data-test-roster-card-teams]").should("not.exist");
    cy.get("[data-test-roster-title]").type("Main account");
    cy.get("[data-test-roster-card-title]").should("have.text", "Main account");

    // Download: a real PNG, 1080 px design width at 2×
    cy.get("[data-test-roster-download]").should("not.be.disabled").click({ force: true });
    cy.window({ timeout: 60000 })
      .its("__rosterBlobs.length", { timeout: 60000 })
      .should("eq", 1);
    cy.window()
      .then((win) => (win as any).__rosterBlobs[0].arrayBuffer())
      .then((buf: ArrayBuffer) => {
        const bytes = new Uint8Array(buf);
        expect(Array.from(bytes.slice(0, 8)), "PNG signature").to.deep.equal([137, 80, 78, 71, 13, 10, 26, 10]);
        const view = new DataView(buf);
        expect(view.getUint32(16), "width").to.eq(2160);
        expect(view.getUint32(20), "height").to.be.greaterThan(600);
        expect(bytes.length).to.be.greaterThan(20000);
      });

    // closed and opened again: the choices are forgotten (Escape is the native <dialog>'s own; Cypress's typed keys
    // are synthetic and a dialog ignores them, so the close button stands in)
    cy.get("[data-test-roster-sheet-close]").click({ force: true });
    cy.get("[data-test-roster-sheet]").should("not.have.attr", "open");
    cy.get("[data-test-roster-share-button]").click();
    cy.get("[data-test-roster-tile-score]").should("have.length.at.least", 1);
    cy.get("[data-test-roster-card-title]").should("not.exist");
  });

  it("opened while My account is still scoring, fills the teams strip when that run ends (and starts none of its own)", () => {
    cy.viewport(1440, 900);
    // hold one rotation file back so the sheet opens mid-run on any machine
    cy.intercept("GET", "**/presets/data/rotations/Cartethyia.json*", (req) => req.on("response", (res) => res.setDelay(6000)));
    cy.visit("/account", seed());
    cy.get("[data-test-account-hero-eyebrow]", { timeout: 60000 }).should("contain.text", "so far");
    cy.get("[data-test-roster-share-button]").click();
    cy.get("[data-test-roster-sheet]").should("have.attr", "open");
    cy.get("[data-test-roster-sheet-scoring]").should("contain.text", "still scoring");
    cy.get("[data-test-roster-team-damage]").should("not.exist");
    // the run ends: the hero prints the best team, and the open sheet's strip reads the same figure
    cy.get("[data-test-account-hero-eyebrow]", { timeout: 120000 }).should("not.contain.text", "so far");
    cy.get("[data-test-roster-sheet-scoring]", { timeout: 30000 }).should("not.exist");
    cy.get("[data-test-account-hero-damage]")
      .invoke("text")
      .then((hero) => {
        cy.get("[data-test-roster-team-damage]").first().should("have.text", hero.trim());
      });
    cy.get("[data-test-roster-card-no-ranking]").should("not.exist");
  });

  it("is the third choice on /share, and fits a 360 px phone", () => {
    cy.viewport(360, 780);
    cy.visit("/share", seed());
    cy.get("[data-test-share-roster-choice] [data-test-roster-share-button]").should("contain.text", "Share my roster").click();
    cy.get("[data-test-roster-sheet]").should("have.attr", "open");
    cy.get("[data-test-roster-tile]").should("have.length", 3);
    // no ranking in this fresh tab: the card says where the team figures come from, never a half-scored one
    cy.get("[data-test-roster-card-no-ranking]").should("contain.text", "open My account");
    cy.get("[data-test-roster-team-damage]").should("not.exist");
    cy.get("[data-test-roster-download]").should("not.be.disabled");
    // the 4-star switch: none of the three is a 4-star, so the count holds
    cy.get("[data-test-roster-toggle-four]").uncheck({ force: true });
    cy.get("[data-test-roster-tile]").should("have.length", 3);
    cy.get(".roster-sheet__box").should(($box) => {
      const r = $box[0].getBoundingClientRect();
      expect(r.right, "sheet right edge").to.be.at.most($box[0].ownerDocument.documentElement.clientWidth + 1);
    });
    cy.document().then((doc) => {
      expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth);
    });
    cy.get("[data-test-roster-sheet-close]").click();
    cy.get("[data-test-roster-sheet]").should("not.have.attr", "open");
    // Back closes the sheet and stays on the page, on the first page of a visit too (sheetHistory.ts)
    cy.get("[data-test-share-roster-choice] [data-test-roster-share-button]").click();
    cy.get("[data-test-roster-sheet]").should("have.attr", "open");
    cy.go("back");
    cy.get("[data-test-roster-sheet]").should("not.have.attr", "open");
    cy.location("pathname").should("eq", "/share");
  });
});
