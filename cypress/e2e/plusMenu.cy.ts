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

  it("keeps the classic bar's menu inside a 1024 px window, under the bar, in five columns", () => {
    cy.viewport(1024, 768);
    cy.visit("/account"); // the support file seeds the classic UI
    cy.get(".plus-nav--bar > summary").should("be.visible").click();
    cy.get("[data-test-nav-plus-menu]:visible").should(($menu) => {
      const menu = $menu[0].getBoundingClientRect();
      // anchored to the icon (about 290 px in), the five columns ran 260 px past the right edge
      expect(menu.left, "inside the left edge").to.be.at.least(0);
      expect(menu.right, "inside the right edge").to.be.at.most(1024);
      expect(menu.bottom, "nothing to scroll").to.be.at.most(768);
      const tops = Array.from($menu[0].querySelectorAll("[data-test-nav-plus-group]")).map((h) => Math.round(h.getBoundingClientRect().top));
      expect(new Set(tops).size, "the five headings on one line").to.eq(1);
    });
  });

  // opening the menu focuses the current page's row without scrolling the page; on a 360 px phone the menu scrolls
  // inside and What's new's row (the last) sat 55 px under its visible end, focused but out of sight
  it("shows the current page's row when the menu opens on a short phone (360 × 640, 130 % text, What's new)", () => {
    cy.viewport(360, 640);
    cy.visit("/whats-new", v3({ fontScale: 1.3 }));
    cy.get(".plus-nav--header > summary").should("be.visible").click();
    cy.get("[data-test-nav-plus-menu]:visible").should(($menu) => {
      const row = $menu[0].querySelector<HTMLElement>(".plus-nav__item--on")!;
      expect(row, "the current page's row").to.exist;
      expect(row.ownerDocument.activeElement, "focused").to.eq(row);
      const m = $menu[0].getBoundingClientRect();
      const r = row.getBoundingClientRect();
      expect(r.top, "row's top inside the menu").to.be.at.least(m.top - 0.5);
      expect(r.bottom, "row's bottom inside the menu").to.be.at.most(m.bottom + 0.5);
    });
    cy.window().its("scrollY").should("eq", 0);
  });

  // the floating Ask sat on the right-hand figures of the Tier list and Roster value at rest (412 and 360 px): on a v3
  // phone it is a button in the header beside Tools+ (src/sim/nav/PlusHeaderAsk.vue, src/sim/shell/askDock.ts)
  for (const path of ["/tier-list", "/roster-value"]) {
    it(`keeps Ask off ${path}'s figures on a 412 px phone: Ask is in the header, nothing of the page under it`, () => {
      cy.viewport(412, 915);
      cy.visit(path, v3({ fontScale: 1.3 }));
      cy.get("[data-test-ai-open-header]").should("be.visible");
      cy.get(".wt-ask-button").should("not.exist");
      cy.get("[data-test-ai-open]:visible").should("have.length", 1).and(($ask) => {
        const r = $ask[0].getBoundingClientRect();
        expect(r.width, "a 44 px tap target").to.be.at.least(43.5);
        expect(r.height, "a 44 px tap target").to.be.at.least(43.5);
        const doc = $ask[0].ownerDocument;
        for (let x = r.left + 2; x < r.right; x += 6) {
          for (let y = r.top + 2; y < r.bottom; y += 6) {
            const under = doc.elementsFromPoint(x, y).find((e) => !$ask[0].contains(e) && e.closest(".content"));
            expect(under, `nothing of the page under Ask at ${Math.round(x)}, ${Math.round(y)}`).to.eq(undefined);
          }
        }
      });
    });
  }

  // phone.css § 16 pads every page's end by the floating Ask's height so the end can scroll out from under it. On a v3
  // phone Ask is in the header and there is no floating button: that room was an empty band at the end of every page
  // (about 88 px at 412 px and 130 % text, under /backups' last button). Classic keeps the floating button and its room.
  it("leaves no room for a floating Ask at a v3 phone page's end, and keeps it in the classic UI", () => {
    cy.viewport(412, 915);
    const room = ($content: JQuery<HTMLElement>) => {
      const win = $content[0].ownerDocument.defaultView!;
      const style = win.getComputedStyle($content[0]);
      const root = win.getComputedStyle($content[0].ownerDocument.documentElement);
      const px = (v: string) => parseFloat(v) || 0;
      // what is left once Ryan's bottom bar (an inline value AppLayout keeps in --nav-bottom-h) and any plus bar are taken off
      return px(style.paddingBottom) - px(style.getPropertyValue("--nav-bottom-h") || root.getPropertyValue("--nav-bottom-h")) - px(style.getPropertyValue("--plus-bar-h"));
    };
    cy.visit("/backups", v3({ fontScale: 1.3 }));
    cy.get("[data-test-ai-open-header]").should("be.visible");
    cy.get("#wt-app .contain > .content").should(($c) => {
      expect(room($c), "room left at the end for a floating Ask").to.be.at.most(24);
    });
    cy.visit("/backups");
    cy.get(".wt-ask-button").should("be.visible");
    cy.get("#wt-app .contain > .content").should(($c) => {
      expect(room($c), "the classic UI still clears its floating Ask (48 px)").to.be.at.least(48);
    });
  });

  it("opens and closes the assistant from the header's Ask, focus back on it; the classic UI keeps the floating button", () => {
    cy.viewport(360, 740);
    cy.visit("/account", v3({ fontScale: 1.3 }));
    cy.get("[data-test-ai-open-header]").should("have.attr", "aria-expanded", "false").click();
    cy.get("[data-test-ai-panel]").should("be.visible");
    cy.get("[data-test-ai-open-header]").should("have.attr", "aria-expanded", "true");
    cy.get("[data-test-ai-close]:visible").click();
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    cy.get("[data-test-ai-open-header]").should("have.focus");
    // the classic UI (the support file's default) has no v3 header: the floating button is still there
    cy.visit("/account");
    cy.get(".wt-ask-button").should("be.visible");
    cy.get("[data-test-ai-open-header]").should("not.exist");
  });
});
