// Wuthering Tools+ Gear map on /account (src/sim/gearMap/): every set-up character's five equipped echoes, each cell
// Echo Lab's roll rating of that echo. The cell says what the inventory's chip says for the same echo; a tap opens a
// sheet whose Echo Lab link opens that echo; the sort switch puts the weakest gear first; a phone at 360 px with 130 %
// text keeps 44 px cells and no sideways scroll. Seeded with the Echo Lab unit-test fixture (public data only).
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

type Account = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const RUN = { timeout: 120000 };

function seed({ fontScale }: { fontScale?: number } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.removeItem("wtplus:inventory:sort");
      win.localStorage.setItem("character", JSON.stringify({ characters: fixture.characters, activeCharacter: "Cartethyia" }));
      win.localStorage.setItem("inventory", JSON.stringify({ echoes: fixture.echoes, equipped: fixture.equipped, echoPresets: [], equippedPresets: {} }));
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
    },
    onLoad(win: Window) {
      if (!fontScale) return;
      const style = win.document.createElement("style");
      style.textContent = `html { font-size: ${fontScale * 100}%; }`;
      win.document.head.appendChild(style);
    },
  };
}

function openMap(): void {
  cy.get("[data-test-gear-map]", RUN).scrollIntoView();
  cy.get('[data-test-gear-map][data-state="ready"]', RUN).should("exist");
}

describe("Gear map on My account", () => {
  it("says what the inventory's chip says for every echo both show", () => {
    cy.viewport(1440, 900);
    cy.visit("/inventory", seed());
    cy.get('[data-test-inventory-quality-status][data-state="done"]', RUN).should("exist");
    cy.get("[data-test-inventory-quality-chip][data-roll]").then(($chips) => {
      const inventory = new Map($chips.toArray().map((el) => [el.getAttribute("data-test-inventory-quality-chip")!, { roll: el.getAttribute("data-roll"), verdict: el.getAttribute("data-verdict") }]));
      expect(inventory.size, "rated chips on the inventory's first page").to.be.greaterThan(3);
      cy.visit("/account", seed());
      openMap();
      cy.get("button[data-test-gear-map-cell]").then(($cells) => {
        let compared = 0;
        for (const el of $cells.toArray()) {
          const chip = inventory.get(el.getAttribute("data-test-gear-map-cell")!);
          if (!chip) continue;
          expect(el.getAttribute("data-roll"), `roll of ${el.getAttribute("data-test-gear-map-cell")}`).to.equal(chip.roll);
          expect(el.getAttribute("data-verdict")?.toLowerCase()).to.equal(chip.verdict);
          compared += 1;
        }
        expect(compared, "echoes compared").to.be.greaterThan(3);
      });
    });
  });

  it("opens a sheet for a cell whose Echo Lab link opens that echo; Escape closes it and focus returns; the sort puts the weakest gear first", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    openMap();
    cy.get("[data-test-gear-map-count]").invoke("text").should("match", /^\d+ of the \d+ echoes your \d+ damage dealers wear (is|are) in the lowest two bands/);
    cy.get("[data-test-gear-map-left-out]").should("not.exist");
    // the sort: the character wearing the weakest echo comes first
    cy.get("[data-test-gear-map-weak]").first().invoke("attr", "data-test-gear-map-weak").then((weakId) => {
      cy.get(`[data-test-gear-map-cell="${weakId}"]`).closest("[data-test-gear-map-row]").invoke("attr", "data-test-gear-map-row").then((who) => {
        cy.get('[data-test-gear-map-sort="weakest"]').click();
        cy.get('[data-test-gear-map-sort="weakest"]').should("have.attr", "aria-pressed", "true");
        cy.get("[data-test-gear-map-row]").first().should("have.attr", "data-test-gear-map-row", who);
        cy.get(`[data-test-gear-map-row="${who}"] [data-test-gear-map-cell="${weakId}"]`).should("exist");
      });
    });
    cy.get('[data-test-gear-map-sort="roster"]').click();
    // a tap: the sheet, Escape, focus back on the cell
    cy.get("button[data-test-gear-map-cell][data-roll]:not([data-roll=''])").first().as("cell");
    cy.get("@cell").invoke("attr", "data-test-gear-map-cell").then((id) => {
      cy.get("@cell").invoke("attr", "data-roll").then((roll) => {
        cy.get("@cell").click();
        cy.get("[data-test-gear-map-sheet]").should("have.attr", "open");
        cy.get("[data-test-gear-map-sheet-roll]").should("have.text", roll);
        cy.get("[data-test-gear-map-sheet-close]").type("{esc}");
        cy.get("[data-test-gear-map-sheet]").should("not.have.attr", "open");
        cy.focused().should("have.attr", "data-test-gear-map-cell", id);
        cy.get("@cell").click();
        cy.get("[data-test-gear-map-sheet-echo-lab]").click();
        cy.location("pathname", RUN).should("eq", "/echo-lab");
        cy.location("search").should("contain", `echo=${id}`);
      });
    });
  });

  it("fits a 360 px phone at 130 % text: 44 px cells, the names whole, no sideways scroll", () => {
    cy.viewport(360, 800);
    cy.visit("/account", seed({ fontScale: 1.3 }));
    openMap();
    cy.get("button[data-test-gear-map-cell]").each(($el) => {
      const r = $el[0].getBoundingClientRect();
      expect(r.height, "cell height").to.be.at.least(44);
      expect(r.width, "cell width").to.be.at.least(44);
    });
    cy.get(".gm-who__name").each(($el) => expect($el[0].scrollWidth, "name not cut").to.be.at.most($el[0].clientWidth + 1));
    cy.document().then((doc) => expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth));
  });
});
