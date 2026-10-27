// Wuthering Tools+ on a phone: no page-wide horizontal scroll on any route, the nav's five icon
// links clear of the utility menu, and the plus tables reflowed into cards below 768 px.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const PHONE = { width: 360, height: 800 }; // the narrowest common Android viewport

function expectNoHorizontalScroll(route: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${route} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

function expectNavFits(route: string): void {
  cy.get("[data-test-nav-rankings]").should("be.visible");
  cy.get("[data-test-nav-rankings]").then(($last) => {
    cy.get('[aria-label="Change Theme"]').then(($theme) => {
      const last = $last[0].getBoundingClientRect();
      const theme = $theme[0].getBoundingClientRect();
      expect(last.right, `${route} nav: last icon vs theme button`).to.be.at.most(theme.left + 1);
      expect(last.right, `${route} nav: last icon inside the viewport`).to.be.at.most(PHONE.width);
    });
  });
}

// /today reads Kuro's news feed: answer it from the unit-test fixtures (the 3.7 patch notes) so the page has events to lay out
function interceptKuroNews(): void {
  const news = "https://hw-media-cdn-mingchao.kurogame.com/akiwebsite/website2.0/json/G152/en";
  cy.readFile("src/sim/today/__fixtures__/kuroMenu.json").then((body) => cy.intercept("GET", `${news}/ArticleMenu.json`, { body }));
  cy.readFile("src/sim/today/__fixtures__/patch37.json").then((patch) =>
    cy.intercept("GET", `${news}/article/*.json`, (req) => req.reply(req.url.endsWith("/5571.json") ? { body: patch } : { statusCode: 404, body: "" })),
  );
}

describe("phone layout", () => {
  beforeEach(() => {
    cy.viewport(PHONE.width, PHONE.height);
  });

  it("keeps every page inside the viewport and the nav icons clear of the utility menu", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    interceptKuroNews();
    for (const route of ["/", "/inventory", "/convene", "/teams", "/settings", "/info", "/updates", "/my-rankings", "/account", "/energy", "/today"]) {
      cy.visit(route);
      cy.get(".navbar").should("be.visible");
      expectNavFits(route);
      expectNoHorizontalScroll(route);
    }
    // the classic settings tab strip wraps instead of pushing the page wide
    cy.visit("/settings");
    cy.get("[data-test-settings-labs]").should("be.visible");
    expectNoHorizontalScroll("/settings");
  });

  it("keeps the wuwa_calc rankings page inside the viewport with its phone toolbar", () => {
    cy.visit("/rankings");
    cy.get("[data-test-rankings-filters]", { timeout: 60000 }).should("be.visible");
    expectNavFits("/rankings");
    expectNoHorizontalScroll("/rankings");
    cy.get("[data-test-rankings-switch-mine]").should("be.visible");
  });

  it("reflows the roster ranking tables into cards", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.get('[data-test-my-rankings-row="Cartethyia"]', { timeout: 120000 }).should("exist");
    cy.get("[data-test-my-rankings-characters] thead").should("not.be.visible");
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("have.css", "display", "flex");
    cy.get('[data-test-my-rankings-row="Cartethyia"] [data-label="Weapon"]').should("be.visible");
    expectNoHorizontalScroll("/my-rankings");
    // the row opens into its tabs under its card, What if first
    cy.get('[data-test-my-rankings-expand="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-whatif="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-whatif-panel="Cartethyia"]').should("be.visible");
    expectNoHorizontalScroll("/my-rankings (what-if open)");
    // the substat weights panel: a grid of short labels, the bar column dropped
    cy.get('[data-test-my-rankings-substats="Cartethyia"]').click();
    cy.get("[data-test-my-rankings-substats-result]", { timeout: 120000 }).should("be.visible");
    cy.get('[data-test-my-rankings-substat="CritRate"]').should("be.visible");
    expectNoHorizontalScroll("/my-rankings (substats open)");
    // desktop keeps the table
    cy.viewport(1440, 900);
    cy.get("[data-test-my-rankings-characters] thead").should("be.visible");
    cy.get('[data-test-my-rankings-row="Cartethyia"]').should("have.css", "display", "table-row");
  });

  it("reflows the calculator's damage tables and echo cards for a phone", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/");
    // Stats & Damages: each attack row is a two-line card (name, then Normal / Average / Crit)
    cy.get(".main-menu-mobile summary").click();
    cy.get('[data-test-calculator-mobile-nav="stats"]').click({ force: true });
    cy.get("table.calculator__damages tbody tr").first().should("have.css", "display", "flex");
    cy.get("table.calculator__damages thead").first().should("have.css", "display", "none");
    expectNoHorizontalScroll("/ (stats)");
    // Echoes: the picture sits beside the name, the actions are one row, nothing is a screen tall
    cy.get(".main-menu-mobile summary").click();
    cy.get('[data-test-calculator-mobile-nav="echoes"]').click({ force: true });
    cy.get(".echo__item .echo__content").first().should("have.css", "display", "grid");
    cy.get(".echo__item .echo__item__actions").first().should("have.css", "flex-direction", "row");
    expectNoHorizontalScroll("/ (echoes)");
    // the character browser lists two cards per row
    cy.get("[data-test-nav-calculator]").click();
    // (the browser dialog reports opacity 0 to Cypress like the importer's - assert the layout)
    cy.get(".characters__list__items")
      .should("exist")
      .and(($grid) => {
        expect($grid.css("grid-template-columns").split(" ").length, "phone browser columns").to.equal(2);
      });
    expectNoHorizontalScroll("/ (character browser)");
  });

  // v3 is the default UI since Ryan #602 (ADR 0038); the support file seeds classic for every other
  // spec here, so this one seeds v3 itself, with the phone's 130 % text and a wuwa_calc-length
  // rotation name as the live result bar's headline. At David's S26 width: at 360 px and 130 % the
  // nav fits a phone by 0.2 px, and Electron's 15 px scrollbar takes more than that.
  it("keeps the v3 calculator and updates pages inside the viewport at 130 % text", () => {
    cy.viewport(412, 915);
    const character = JSON.parse(configOptimizer.data.character);
    character.characters.Cartethyia.rotations[0].name =
      "Cartethyia S6R5 Defier's Thorn R5 · Ciaccona + Shorekeeper · S6R5 DPS · S1R1/S6R1 team (wuwa_calc)";
    const seed = {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    };
    cy.visit("/", seed);
    cy.get("[data-test-live-result-bar-hero]").should("contain.text", "(wuwa_calc)");
    expectNavFits("/ (v3)");
    expectNoHorizontalScroll("/ (v3)");
    cy.visit("/updates", seed);
    cy.get(".page-updates--v3").should("be.visible");
    expectNoHorizontalScroll("/updates (v3)");
    // Wuthering Tools+ /today: one column of cards, the events list filled from the fixture feed
    interceptKuroNews();
    cy.clock(Date.UTC(2026, 9, 26, 4, 0), ["Date"]); // inside 3.7, while the fixture's events run
    cy.visit("/today", seed);
    cy.get("[data-test-today-live-list]").should("contain.text", "Back to Solaris");
    expectNavFits("/today (v3)");
    expectNoHorizontalScroll("/today (v3)");
  });

  // Share cards (src/sim/share/): the page, its share sheet as a bottom sheet with the scaled card preview, and
  // the import preview of a link — all inside 360 px (v3).
  it("keeps /share, its share sheet and an import preview inside 360 px", () => {
    const seed = {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    };
    cy.visit("/share", seed);
    cy.get("[data-test-share-export-panel]").should("be.visible");
    expectNavFits("/share");
    expectNoHorizontalScroll("/share");
    cy.get("[data-test-share-open-build]").click();
    cy.get("[data-test-share-sheet] [data-test-share-post-card]", { timeout: 30000 }).should("exist");
    cy.get("[data-test-share-sheet] [data-test-share-preview]").then(($p) => {
      expect($p[0].getBoundingClientRect().right, "card preview inside the viewport").to.be.at.most(PHONE.width);
    });
    cy.get("[data-test-share-download]").then(($b) => {
      expect($b[0].getBoundingClientRect().right, "sheet buttons inside the viewport").to.be.at.most(PHONE.width);
    });
    expectNoHorizontalScroll("/share (sheet)");
    cy.get("[data-test-share-copy-link]")
      .should("not.be.disabled")
      .invoke("attr", "data-test-share-link-url")
      .then((url) => {
        const u = new URL(url as string);
        cy.visit(u.pathname + u.hash, seed);
      });
    cy.get("[data-test-share-import-preview]", { timeout: 30000 }).should("be.visible");
    cy.get("[data-test-share-import-confirm]").should("be.visible");
    expectNoHorizontalScroll("/share (import preview)");
  });

  it("reviews phone screenshots as cards inside the echo importer", () => {
    cy.visit("/inventory");
    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch-input]").selectFile(
      ["cypress/fixtures/echoScan/s26_puppet_pavilion_1.jpg", "cypress/fixtures/echoScan/s26_sabercat_prowler.jpg"],
      { force: true },
    );
    cy.get("[data-test-phone-echo-batch-scan]").click({ force: true });
    cy.get('[data-test-phone-echo-batch-row="done"]', { timeout: 180000 }).should("have.length", 2);
    // (the importer dialog reports opacity 0 to Cypress, as in echoScanBatch.cy.ts - assert the layout, not visibility)
    cy.get("[data-test-phone-echo-batch-table] thead").should("have.css", "display", "none");
    cy.get('[data-test-phone-echo-batch-row="done"]').first().should("have.css", "display", "flex");
    cy.get('[data-test-phone-echo-batch-row="done"]').first().find('[data-label="Substats"]').should("have.css", "display", "block");
    expectNoHorizontalScroll("/inventory (importer)");
  });

  // /echo-plan (src/sim/echoPlan/) in the v3 UI: the narrowest phone at 100 % text, David's S26 width at 130 %
  // (the nav itself only fits 360 px at 130 % without Electron's scrollbar - see the v3 test above).
  it("keeps the echo plan inside the viewport with its chips wrapping and the tap sheet as a bottom sheet", () => {
    const seed = (fontScale: number) => ({
      onBeforeLoad(win: Window) {
        win.localStorage.removeItem("wtplus:echoPlan:v1");
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = `html { font-size: ${fontScale * 100}%; }`;
        win.document.head.appendChild(style);
      },
    });
    for (const [width, height, fontScale] of [
      [360, 800, 1],
      [412, 915, 1.3],
    ]) {
      cy.viewport(width, height);
      cy.visit("/echo-plan", seed(fontScale));
      cy.get('[data-test-echo-plan-card="WindwardPilgrimage"] [data-test-echo-plan-row="3"]', { timeout: 60000 }).should("be.visible");
      expectNoHorizontalScroll(`/echo-plan ${width} px`);
      // the rules fold behind one button; the 3-cost row wraps; the cards still to set stay in reach
      cy.get("[data-test-echo-plan-options]").should("not.be.visible");
      cy.get("[data-test-echo-plan-phone-settings]").click();
      cy.get("[data-test-echo-plan-options]").should("be.visible");
      expectNoHorizontalScroll(`/echo-plan ${width} px (rules open)`);
      cy.get('[data-test-echo-plan-card="WindwardPilgrimage"] [data-test-echo-plan-row="3"]').then(($row) => {
        expect($row[0].getBoundingClientRect().height, "3-cost row wraps").to.be.greaterThan(60);
        expect($row[0].getBoundingClientRect().right, "3-cost row inside the viewport").to.be.at.most(width);
      });
      cy.get("[data-test-echo-plan-phone-bar]").should("be.visible");
      cy.get('[data-test-echo-plan-card="WindwardPilgrimage"] [data-test-echo-plan-chip="4:CritRate"]').click();
      cy.get("[data-test-echo-plan-sheet]").should("have.attr", "open");
      cy.get("[data-test-echo-plan-sheet] .modal-box").then(($box) => {
        const r = $box[0].getBoundingClientRect();
        expect(r.right, "sheet inside the viewport").to.be.at.most(width + 1);
        expect(r.bottom, "sheet sits on the bottom edge").to.be.closeTo(height, 2);
      });
      cy.get("[data-test-echo-plan-sheet-close]").click({ force: true });
    }
  });

  // /endgame (src/sim/endgame/, the ToA clear check) in the v3 UI: the narrowest phone at 100 % text, David's S26 width
  // at 130 % — floor cards one per screen width, team rows and time bars inside it, the plan as a vertical list.
  it("keeps the ToA clear check inside the viewport with its floor cards, team rows and plan", () => {
    const seed = (fontScale: number) => ({
      onBeforeLoad(win: Window) {
        win.localStorage.removeItem("wtplus:endgame:check");
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = `html { font-size: ${fontScale * 100}%; }`;
        win.document.head.appendChild(style);
      },
    });
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    for (const [width, height, fontScale] of [
      [360, 800, 1],
      [412, 915, 1.3],
    ]) {
      cy.viewport(width, height);
      cy.visit("/endgame", seed(fontScale));
      cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-team]', { timeout: 120000 }).should("have.length.at.least", 1);
      expectNoHorizontalScroll(`/endgame ${width} px`);
      cy.get('[data-test-toa-floor="hazard-1"]').then(($card) => {
        expect($card[0].getBoundingClientRect().right, "floor card inside the viewport").to.be.at.most(width);
      });
      cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-timebar]').first().then(($bar) => {
        expect($bar[0].getBoundingClientRect().right, "time bar inside the viewport").to.be.at.most(width);
      });
      cy.get('[data-test-toa-tab="plan"]').click();
      cy.get("[data-test-toa-stage]").should("have.length", 12);
      expectNoHorizontalScroll(`/endgame plan ${width} px`);
      cy.get('[data-test-toa-tab="calibrate"]').click();
      cy.get("[data-test-toa-calibrate-team]").should("have.length.at.least", 1);
      expectNoHorizontalScroll(`/endgame calibrate ${width} px`);
    }
  });

  // Wuthering Tools+ rotation view (src/sim/rotation/): both tabs and the play mode on v3 at 130 % text, at David's
  // S26 width and at 360 px — the timeline's phone layout (time flows down) must never scroll sideways.
  it("keeps the rotation view's cue card, play mode and timeline inside a phone at 130 % text", () => {
    const seed = {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    };
    for (const [width, height] of [[412, 915], [360, 800]] as const) {
      cy.viewport(width, height);
      cy.visit("/rotation#team=t404", seed);
      cy.get('[data-test-rotation-block="loop1"]', { timeout: 90000 }).should("be.visible");
      expectNoHorizontalScroll(`/rotation cue card at ${width}`);
      cy.get("[data-test-rotation-play-open]").click();
      cy.get("[data-test-rotation-next-button]").should("be.visible").click();
      cy.get("[data-test-rotation-play]").then(($el) => {
        expect($el[0].scrollWidth, `play mode width at ${width}`).to.be.at.most($el[0].clientWidth);
      });
      cy.get("[data-test-rotation-play-exit]").click();
      cy.visit("/rotation#team=t404&tab=timeline", seed);
      cy.get("[data-test-rotation-timeline-phone]", { timeout: 90000 }).should("be.visible");
      cy.get("[data-test-rotation-phone-lane]").should("have.length", 3);
      cy.get("[data-test-rotation-kill]").should("have.length.greaterThan", 0);
      expectNoHorizontalScroll(`/rotation timeline at ${width}`);
    }
  });

  // /weapons (src/sim/weaponValue/, Weapon value) in the v3 UI: the narrowest phone at 100 % text, David's S26 width at
  // 130 % — the chart rows as cards, an opened row's option table as cards, the selector's pool cards and ranked list.
  it("keeps Weapon value inside the viewport with its cards, an open row and the selector", () => {
    const seed = (fontScale: number) => ({
      onBeforeLoad(win: Window) {
        win.sessionStorage.clear();
        win.localStorage.removeItem("wtplus:weapons:prefs"); // the last loop ended on the Selector tab
        const character = JSON.parse(configOptimizer.data.character);
        character.characters.Ciaccona = { weapon: "Cadenza" };
        character.characters.Chisa = { weapon: "Kumokiri" };
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = `html { font-size: ${fontScale * 100}%; }`;
        win.document.head.appendChild(style);
      },
    });
    for (const [width, height, fontScale] of [
      [360, 800, 1],
      [412, 915, 1.3],
    ]) {
      cy.viewport(width, height);
      cy.visit("/weapons", seed(fontScale));
      cy.get('[data-test-weapons-row="Ciaccona"]', { timeout: 120000 }).scrollIntoView();
      cy.get('[data-test-weapons-row="Ciaccona"]').should("be.visible");
      cy.get("[data-test-weapons-progress]", { timeout: 120000 }).should("not.exist");
      expectNoHorizontalScroll(`/weapons ${width} px`);
      cy.get('[data-test-weapons-toggle="Ciaccona"]').click();
      cy.get('[data-test-weapons-detail="Ciaccona"]').then(($d) => {
        expect($d[0].getBoundingClientRect().right, "open row inside the viewport").to.be.at.most(width);
      });
      expectNoHorizontalScroll(`/weapons ${width} px (row open)`);
      cy.get('[data-test-weapons-tab="selector"]').click();
      cy.get('[data-test-weapons-pool="standard-weapon"]').click();
      cy.get("[data-test-weapons-pick]", { timeout: 60000 }).should("have.length", 10);
      expectNoHorizontalScroll(`/weapons selector ${width} px`);
    }
  });
});
