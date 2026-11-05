// Wuthering Tools+: contrast, focus and keyboard (src/sim/a11y/, src/sim/README.md "Contrast, focus and keyboard";
// the 2026-11-02 a11y audit). Real key presses (cy.press) where the browser's own focus order is what is tested.
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as wavescanFixture from "../../src/sim/wavescan/__fixtures__/newEchoes.json";

// Cypress's webpack build hands a JSON import over as the module namespace, without a default export
const wavescan = ((wavescanFixture as unknown as { default?: typeof wavescanFixture }).default ?? wavescanFixture) as typeof wavescanFixture;

const ENGINE = { timeout: 120000 };
const LAZY = { timeout: 30000 };

function seed(options: { fontScale?: number; theme?: string } = {}) {
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false, ...(options.theme ? { theme: options.theme } : {}) };
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

type Rgba = [number, number, number, number];
const linear = (x: number): number => (x <= 0.04045 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4));
const lum = (c: Rgba): number => 0.2126 * linear(c[0]) + 0.7152 * linear(c[1]) + 0.0722 * linear(c[2]);
const over = (fg: Rgba, bg: Rgba): Rgba => {
  const a = fg[3];
  return [fg[0] * a + bg[0] * (1 - a), fg[1] * a + bg[1] * (1 - a), fg[2] * a + bg[2] * (1 - a), 1];
};

/** The WCAG ratio of an element's text against what is painted behind it: colours resolved through a canvas (so
 *  oklch and relative colours work), the element's and its ancestors' opacity applied, backgrounds composited up to
 *  the page. Works on a closed menu too: it reads computed styles, not pixels. */
function contrastOf(el: Element): number {
  const doc = el.ownerDocument;
  const win = doc.defaultView!;
  const canvas = doc.createElement("canvas");
  canvas.width = canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const rgba = (css: string): Rgba => {
    ctx.clearRect(0, 0, 1, 1);
    ctx.fillStyle = "#000";
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0]! / 255, d[1]! / 255, d[2]! / 255, d[3]! / 255];
  };
  let opacity = 1;
  const layers: Rgba[] = [];
  for (let node: Element | null = el; node; node = node.parentElement) {
    const cs = win.getComputedStyle(node);
    opacity *= parseFloat(cs.opacity || "1");
    const bg = rgba(cs.backgroundColor);
    if (bg[3] > 0) layers.push(bg);
  }
  let bg: Rgba = [1, 1, 1, 1];
  for (const layer of layers.reverse()) bg = over(layer, bg);
  const fg = rgba(win.getComputedStyle(el).color);
  const text = over([fg[0], fg[1], fg[2], fg[3] * opacity], bg);
  const a = lum(text), b = lum(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const THEMES = [["dark", "dark"], ["light", "light"], ["black", "dark"], ["synthwave", "dark"], ["pastel", "light"], ["night", "dark"], ["nord", "light"], ["dracula", "dark"], ["gruvbox", "dark"]] as const;

function setTheme(theme: string, style: "light" | "dark"): void {
  cy.document().then((doc) => {
    doc.documentElement.setAttribute("data-theme", theme);
    doc.documentElement.setAttribute("data-theme-style", style);
  });
}

describe("contrast, focus and keyboard", () => {
  it("lets Tab leave Riley's search box on /rankings", () => {
    cy.viewport(1440, 900);
    cy.visit("/rankings", seed());
    cy.get(".skittle-root .tcside #optionSearch", ENGINE).should("be.visible").focus();
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.focused().should("not.have.id", "optionSearch");
    cy.focused().then(($el) => expect($el[0].closest(".tcside #optionSearch"), "focus left the search box").to.equal(null));
    cy.get("h1").should("have.text", "Team rankings").and("have.class", "sr-only");
  });

  it("keeps closed dialogs out of the Tab order, offers a skip link and marks the main landmark", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    cy.get("[data-test-account-source]", LAZY).should("exist");
    cy.document().then((doc) => {
      const closed = Array.from(doc.querySelectorAll("dialog.modal:not([open])"));
      expect(closed.length, "closed DaisyUI dialogs on the page").to.be.greaterThan(0);
      for (const d of closed) expect(doc.defaultView!.getComputedStyle(d).visibility, `${d.className}`).to.equal("hidden");
      expect(doc.body.firstElementChild?.matches(".wt-skip-link"), "skip link first in <body>").to.equal(true);
      expect(doc.querySelectorAll('[role="main"], main').length, "one main landmark").to.equal(1);
      expect(doc.documentElement.hasAttribute("data-wt-plus"), "plus scope on a plus page").to.equal(true);
      (doc.activeElement as HTMLElement | null)?.blur();
    });
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.focused().should("have.attr", "data-test-skip-link");
    cy.focused().then(($a) => expect($a[0].getBoundingClientRect().top, "visible once focused").to.be.at.least(0));
    cy.press(Cypress.Keyboard.Keys.ENTER);
    cy.focused().should("have.attr", "role", "main");
    // Ryan's pages keep his own look: no plus scope there
    cy.visit("/teams", seed());
    cy.get("html").should("not.have.attr", "data-wt-plus");
    // the router also serves a trailing slash and any letter case: the page is the same page
    cy.visit("/account/", seed());
    cy.get("[data-test-account-source]", LAZY).should("exist");
    cy.get("html").should("have.attr", "data-wt-plus");
    cy.visit("/Account", seed());
    cy.get("[data-test-account-source]", LAZY).should("exist");
    cy.get("html").should("have.attr", "data-wt-plus");
    cy.visit("/rankings/", seed());
    cy.get(".skittle-root main", ENGINE).should("exist");
    cy.document().then((doc) => expect(doc.querySelectorAll('[role="main"], main').length, "one main landmark on /rankings/").to.equal(1));
  });

  it("keeps ToA's unearned crest stars dim: the dim is the count, so the text floor stays off them", () => {
    cy.viewport(412, 915);
    cy.visit("/endgame", seed());
    cy.get("[data-test-toa-crests]", ENGINE).should("have.length.greaterThan", 0);
    cy.document().then((doc) => {
      // which stars go unearned depends on the solve (this fixture earns them all), so this measures the class on a
      // real crest row; a11y.test.ts pins both templates to it
      const star = doc.createElement("span");
      star.className = "opacity-[.25]";
      star.textContent = "★";
      doc.querySelector("[data-test-toa-crests]")!.appendChild(star);
      const opacity = parseFloat(doc.defaultView!.getComputedStyle(star).opacity);
      star.remove();
      expect(opacity, "an unearned star next to an earned one at 1").to.be.below(0.4);
    });
  });

  it("reads plus muted text and the Tools+ menu at AA in dark, light, nord and pastel", () => {
    cy.viewport(412, 915);
    cy.visit("/account", seed({ fontScale: 1.3 }));
    cy.get("[data-test-account-card]", ENGINE).should("have.length.greaterThan", 0);
    const SELECTORS = [".cc__rank", ".cc__meta-text", ".acc-seg__n", ".plus-nav__desc", ".plus-nav__eyebrow"];
    for (const [theme, style] of [["dark", "dark"], ["light", "light"], ["nord", "light"], ["pastel", "light"]] as const) {
      setTheme(theme, style);
      cy.document().then((doc) => {
        let measured = 0;
        for (const sel of SELECTORS) {
          for (const el of Array.from(doc.querySelectorAll(sel)).slice(0, 4)) {
            if (!(el.textContent ?? "").trim()) continue;
            measured++;
            expect(contrastOf(el), `${theme}: ${sel} "${(el.textContent ?? "").trim().slice(0, 24)}"`).to.be.at.least(4.5);
          }
        }
        expect(measured, `${theme}: muted labels measured`).to.be.at.least(6);
        // links and primary text on plus pages: pastel's own primary was 1.7 : 1
        for (const el of Array.from(doc.querySelectorAll(".content .link-primary, .content .text-primary")).slice(0, 6)) {
          if ((el.textContent ?? "").trim()) expect(contrastOf(el), `${theme}: primary text "${(el.textContent ?? "").trim().slice(0, 24)}"`).to.be.at.least(4.5);
        }
      });
    }
    // a box in the other theme (the share sheet's Light / Dark card) reads its own primary, not the page's
    for (const [page, card, style] of [["dark", "light", "dark"], ["light", "dark", "light"]] as const) {
      setTheme(page, style);
      cy.document().then((doc) => {
        const box = doc.createElement("div");
        box.setAttribute("data-theme", card);
        box.className = "bg-base-100 p-2";
        box.innerHTML = '<span class="text-primary">Team DPS</span>';
        doc.querySelector(".content")!.appendChild(box);
        expect(contrastOf(box.firstElementChild!), `${card} box on a ${page} page`).to.be.at.least(4.5);
        box.remove();
      });
    }
    // the outlined "Tools+" badge beside a page title (Echo Lab, Echo plan): 1.6 : 1 in pastel before the token
    for (const [theme, style] of [["pastel", "light"], ["nord", "light"], ["dark", "dark"]] as const) {
      setTheme(theme, style);
      cy.document().then((doc) => {
        const badge = doc.createElement("span");
        badge.className = "badge badge-primary badge-outline badge-sm";
        badge.textContent = "Tools+";
        doc.querySelector(".content")!.appendChild(badge);
        expect(contrastOf(badge), `${theme}: Tools+ badge`).to.be.at.least(4.5);
        badge.remove();
      });
    }
  });

  // Muted text under a second dim, and a colour-mix the build step does not rewrite: each read 2.8–4.3 : 1 somewhere
  it("reads the twice-dimmed counts and the light themes' gain colour at AA in every theme", () => {
    const measure = (selectors: string[]) => {
      cy.document().then((doc) => {
        const still = doc.createElement("style");
        still.textContent = "* { transition: none !important; }";
        doc.head.appendChild(still);
      });
      for (const [theme, style] of THEMES) {
        setTheme(theme, style);
        cy.document().then((doc) => {
          for (const sel of selectors) {
            const shown = Array.from(doc.querySelectorAll<HTMLElement>(sel)).filter((el) => (el.textContent ?? "").trim() && el.getClientRects().length);
            expect(shown.length, `${theme}: ${sel} on screen`).to.be.at.least(sel === ".ep-text-keep" ? 2 : 1);
            for (const el of shown.slice(0, 40)) expect(contrastOf(el), `${theme}: ${sel} "${(el.textContent ?? "").trim().slice(0, 24)}"`).to.be.at.least(4.5);
          }
        });
      }
    };
    cy.viewport(412, 915);
    cy.visit("/account", seed({ fontScale: 1.3 }));
    cy.get(".inv-chip__n", ENGINE).should("exist");
    cy.get(".acc-gain-up", ENGINE).should("exist");
    cy.get(".acc-refresh").should(($b) => expect($b[0].getBoundingClientRect().height, "the refresh button").to.be.at.least(39.5));
    measure([".inv-chip__n", ".acc-gain-up"]);
    cy.visit("/echo-plan", seed({ fontScale: 1.3 }));
    cy.get("article .ep-text-keep", ENGINE).should("exist"); // a card's "2 to lock": the KPI above has the class too
    measure([".ep-text-keep", ".ep-chip--keep", ".ep-chip--discard"]);
    cy.visit("/weapons", seed({ fontScale: 1.3 }));
    cy.get(".wv-pill", ENGINE).should("exist");
    measure([".wv-pill", ".wv-who__weapon"]);
    cy.visit("/echo-lab", seed({ fontScale: 1.3 }));
    cy.get(".el-seg__btn .tabular-nums", ENGINE).should("exist");
    measure([".el-seg__btn .tabular-nums"]);
  });

  it("gives focus to the Ask panel and back to what opened it", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    // a click focuses the button the way a tap or Enter does (cy.press(ENTER) doesn't activate a <button> in Electron)
    cy.get("[data-test-ai-open]", LAZY).should("be.visible").click();
    cy.get("[data-test-ai-panel]", LAZY).should("be.visible");
    cy.focused().then(($el) => expect($el[0].closest("[data-test-ai-panel]"), "focus inside the panel").to.not.equal(null));
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    cy.focused().should("have.attr", "data-test-ai-open");
    // a click on the page's text leaves focus on <body> (the main box has no standing tabindex), so Esc still closes it
    cy.get("[data-test-ai-open]").click();
    cy.get("[data-test-ai-panel]").should("be.visible");
    cy.get(".content h1").first().click();
    cy.document().then((doc) => expect(doc.activeElement, "focus after a click on page text").to.equal(doc.body));
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    // on a phone the sheet is a modal dialog with its heading focused (no keyboard popping up over it)
    cy.viewport(412, 915);
    cy.get("[data-test-ai-open]").click();
    cy.get("[data-test-ai-panel]").should("have.attr", "role", "dialog").and("have.attr", "aria-modal", "true");
    cy.focused().should("have.attr", "data-test-ai-heading");
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get("[data-test-ai-panel]").should("not.be.visible");
    cy.focused().should("have.attr", "data-test-ai-open");
  });

  it("moves focus into the play-along overlay, keeps the page behind it inert and gives focus back", () => {
    cy.viewport(1440, 900);
    cy.visit("/rotation#team=t404", seed());
    cy.get("[data-test-rotation-play-open]", ENGINE).should("be.visible").click();
    cy.get("[data-test-rotation-play]").should("be.visible");
    cy.focused().should("have.attr", "data-test-rotation-play");
    cy.get("#wt-app").should("have.attr", "inert");
    cy.get(".wt-skip-link").should("have.attr", "inert"); // it sits in <body>, outside #wt-app
    cy.press(Cypress.Keyboard.Keys.TAB);
    cy.focused().then(($el) => expect($el[0].closest("[data-test-rotation-play]"), "Tab stays in the overlay").to.not.equal(null));
    cy.press(Cypress.Keyboard.Keys.ESC);
    cy.get("[data-test-rotation-play]").should("not.exist");
    cy.get("#wt-app").should("not.have.attr", "inert");
    cy.get(".wt-skip-link").should("not.have.attr", "inert");
    cy.focused().should("have.attr", "data-test-rotation-play-open");
  });

  it("closes the palette from a phone's Cancel and gives focus back to the Tools+ menu", () => {
    cy.viewport(412, 915);
    cy.visit("/today", seed({ fontScale: 1.3 }));
    cy.get("[data-test-nav-rankings]:visible").first().click();
    cy.get("[data-test-nav-plus-search]:visible").first().click();
    cy.get("[data-test-palette-list]", LAZY).should("have.attr", "aria-label", "Results");
    cy.get("[data-test-palette-cancel]").should("be.visible").click();
    cy.get("[data-test-palette]").should("not.exist");
    cy.focused().should("have.attr", "data-test-nav-rankings");
    cy.get("[data-test-nav-plus-menu]").first().should("not.have.attr", "role");
  });

  it("gives /today's, /endgame's and /rotation's controls 40 px targets on a 412 px phone at 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit("/today", seed({ fontScale: 1.3 }));
    cy.get("[data-test-today-check-toggle]", LAZY).should("have.length.greaterThan", 0);
    cy.document().then((doc) => {
      const groups = ["[data-test-today-check-toggle]", "[data-test-today-time-mode]", "[data-test-today-region]", ".td-ck__src", "[data-test-today-checklist-edit]"];
      for (const sel of groups) {
        const els = Array.from(doc.querySelectorAll(sel)).filter((el) => el.getClientRects().length);
        expect(els.length, `${sel} on the page`).to.be.greaterThan(0);
        for (const el of els) expect(el.getBoundingClientRect().height, `${sel} height`).to.be.at.least(39.5);
      }
    });
    // the region select (select-xs h-6) and the tabs on two fight pages
    cy.visit("/endgame", seed({ fontScale: 1.3 }));
    cy.get("[data-test-toa-region]", LAZY).should(($s) => expect($s[0].getBoundingClientRect().height, "ToA region select").to.be.at.least(39.5));
    cy.visit("/rotation#team=t404", seed({ fontScale: 1.3 }));
    cy.get("[data-test-rotation-tab]", ENGINE).should("have.length.at.least", 2).each(($t) => {
      expect($t[0].getBoundingClientRect().height, "rotation tab").to.be.at.least(39.5);
    });
  });

  // It sits on Ryan's Settings page, where html[data-wt-plus] is off, so a11y.css's scope lists name it. Every line of
  // text, not a sample: the eyebrow, "Added N echoes." and the Phantom skin badge each failed on their own.
  it("reads all of WaveScan's card at AA in every theme", () => {
    const measureCard = () => {
      for (const [theme, style] of THEMES) {
        setTheme(theme, style);
        cy.get("[data-test-wavescan-new-only]").then(($card) => {
          const texts = [$card[0], ...Array.from($card[0].querySelectorAll<HTMLElement>("*"))].filter((el) => {
            const hasText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim());
            // a disabled control is exempt (WCAG 1.4.3), and "Nothing new to add" is said in the fold line too
            return hasText && el.offsetParent !== null && !el.closest("[disabled]");
          });
          expect(texts.length, `${theme}: lines measured`).to.be.at.least(40);
          for (const el of texts) expect(contrastOf(el), `${theme}: "${(el.textContent ?? "").trim().slice(0, 30)}"`).to.be.at.least(4.5);
        });
      }
    };
    cy.viewport(1440, 900);
    cy.visit("/settings?section=wavescan", {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("inventory", JSON.stringify(wavescan.inventory));
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });
    cy.get("html").should("not.have.attr", "data-wt-plus");
    cy.get("[data-test-wavescan-file-input]").selectFile(
      { contents: Cypress.Buffer.from(JSON.stringify(wavescan.scan)), fileName: "wavescan.json", mimeType: "application/json" },
      { force: true },
    );
    cy.get("[data-test-wavescan-new-only]", { timeout: 20000 }).should("be.visible");
    // .btn and .badge fade their colours for 200 ms: without this a theme change is measured halfway
    cy.document().then((doc) => {
      const still = doc.createElement("style");
      still.textContent = "* { transition: none !important; }";
      doc.head.appendChild(still);
    });
    for (const id of ["owned", "missing"]) cy.get(`[data-test-wavescan-new-only-list="${id}"] summary`).click();
    measureCard();
    setTheme("dark", "dark");
    cy.get("[data-test-wavescan-new-only-add]").click();
    cy.get(".confirm-dialog[open] .modal-action").contains("button", "Add 3 echoes").click();
    cy.get("[data-test-wavescan-new-only-done]").should("contain.text", "Added 3 echoes.");
    measureCard();
  });
});
