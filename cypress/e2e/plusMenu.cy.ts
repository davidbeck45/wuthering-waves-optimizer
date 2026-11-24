// Wuthering Tools+: the Tools+ menu in sections (src/sim/shell/plusPages.ts PLUS_GROUPS, src/sim/nav/PlusNavMenu.vue).
// 18 pages in one column were 837 px tall: beside the v3 rail it was moved up to fit, and on a phone the newest pages
// sat at the bottom of a long scroll. corePages.cy.ts checks the rail menu opens beside its button at 1280 × 720 and
// 1440 × 900.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const GROUPS = ["My account", "Rankings", "Teams", "Echoes and weapons", "More"];

function v3(options: { fontScale?: number } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character as string);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
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

describe("the Tools+ menu in sections", () => {
  it("names each section for a screen reader and lists its pages in columns, read top to bottom (1440 × 900)", () => {
    cy.viewport(1440, 900);
    cy.visit("/teams", v3());
    cy.get(".plus-nav--rail > summary").should("be.visible").click();
    cy.get("[data-test-nav-plus-menu]:visible").within(() => {
      cy.get("[role=group]").should(($groups) => {
        const names = $groups.toArray().map((g) => g.ownerDocument.getElementById(g.getAttribute("aria-labelledby")!)?.textContent?.trim());
        expect(names).to.deep.equal(GROUPS);
      });
      // Tab follows the page order in the document: a column's rows top to bottom, then the next column to the right
      cy.get("[data-test-nav-plus-page]").should(($rows) => {
        expect($rows).to.have.length(18);
        const boxes = $rows.toArray().map((r) => r.getBoundingClientRect());
        for (let i = 1; i < boxes.length; i++) {
          const [a, b] = [boxes[i - 1], boxes[i]];
          const sameColumn = Math.abs(a.left - b.left) < 2;
          if (sameColumn) expect(b.top, `row ${i + 1} under row ${i}`).to.be.greaterThan(a.top);
          else expect(b.left, `row ${i + 1} starts the next column`).to.be.greaterThan(a.left);
        }
      });
    });
  });

  it("shows every section heading on a 360 × 740 phone at 130 % text, rows 44 px tall, nothing sideways", () => {
    cy.viewport(360, 740);
    cy.visit("/account", v3({ fontScale: 1.3 }));
    cy.get(".plus-nav--header > summary").should("be.visible").click();
    cy.get("[data-test-nav-plus-menu]:visible").should(($menu) => {
      const menu = $menu[0].getBoundingClientRect();
      const heads = $menu[0].querySelectorAll("[data-test-nav-plus-group]");
      expect(heads).to.have.length(GROUPS.length);
      // all but the last on the screen as it opens; the last within one short scroll of the menu
      heads.forEach((h, i) => {
        const box = h.getBoundingClientRect();
        expect(box.bottom, `${h.textContent!.trim()}: on the screen${i === heads.length - 1 ? " or one short scroll away" : ""}`).to.be.at.most(menu.bottom + (i === heads.length - 1 ? 140 : 0));
      });
      expect(menu.right, "the menu stays inside the screen").to.be.at.most($menu[0].ownerDocument.documentElement.clientWidth + 1);
      for (const row of Array.from($menu[0].querySelectorAll("[data-test-nav-plus-page]"))) {
        expect(row.getBoundingClientRect().height, `${row.textContent!.trim()}: a 44 px tap target`).to.be.at.least(43.5);
        expect(row.scrollWidth, `${row.textContent!.trim()}: no text cut sideways`).to.be.at.most(row.clientWidth + 1);
      }
    });
  });

  it("goes to a page from a row and closes; Escape closes and gives focus back to the button", () => {
    cy.viewport(412, 915);
    cy.visit("/account", v3());
    cy.get(".plus-nav--header > summary").should("be.visible").click();
    cy.get("[data-test-nav-plus-page='/account']:visible").should("have.attr", "aria-current", "page");
    cy.get("[data-test-nav-plus-page='/tier-list']:visible").click();
    cy.location("pathname").should("eq", "/tier-list");
    cy.get(".plus-nav--header").should("not.have.attr", "open");
    cy.get(".plus-nav--header > summary").click();
    cy.get("[data-test-nav-plus-page='/tier-list']:visible").should("have.attr", "aria-current", "page").and("have.focus");
    cy.get("body").type("{esc}");
    cy.get(".plus-nav--header").should("not.have.attr", "open");
    cy.get(".plus-nav--header > summary").should("have.focus");
  });
});
