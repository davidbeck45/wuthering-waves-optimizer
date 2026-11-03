// Wuthering Tools+ on a phone: no page-wide horizontal scroll on any route, the nav's plus icon
// inside the viewport (classic: clear of the utility menu), and the plus tables reflowed into cards below 768 px.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const PHONE = { width: 360, height: 800 }; // the narrowest common Android viewport

function expectNoHorizontalScroll(route: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${route} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

// classic: the plus icon is the bar's last link, left of the theme button; v3 (Ryan's #668): it ends his phone header,
// which has no theme button (that moved under More)
function expectNavFits(route: string): void {
  cy.get("[data-test-nav-rankings]").should("be.visible");
  cy.get("[data-test-nav-rankings]").then(($last) => {
    const last = $last[0].getBoundingClientRect();
    const width = $last[0].ownerDocument.documentElement.clientWidth; // the test's own viewport (360, or 412 for the S26)
    expect(last.right, `${route} nav: last icon inside the viewport`).to.be.at.most(width);
    const theme = Cypress.$('[aria-label="Change Theme"]:visible')[0];
    if (theme) expect(last.right, `${route} nav: last icon vs theme button`).to.be.at.most(theme.getBoundingClientRect().left + 1);
  });
}

// Wuthering Tools+ Ask button (src/sim/shell/PlusShell.vue): it must not sit on any of these elements' buttons once
// it has settled. Retried (`should`, not `then`): when a click's scroll-into-view tucks Ryan's bottom bar, Ask and a
// plus bar slide down together over 0.2 s (phone.css § 16) and Ask passes over the bar on its way off the screen. With
// Electron drawing frames (CI under Xvfb) a single read could land mid-slide.
function expectAskClearOf(selector: string, what: string): void {
  cy.get("[data-test-ai-open]").should(($ask) => {
    const a = $ask[0].getBoundingClientRect();
    Cypress.$(selector).each((_, el) => {
      const r = el.getBoundingClientRect();
      if (!r.width || !r.height) return;
      const overlap = r.left < a.right && r.right > a.left && r.top < a.bottom && r.bottom > a.top;
      expect(overlap, `${what}: Ask over "${(el.textContent ?? "").trim().slice(0, 30)}"`).to.equal(false);
    });
  });
}

// Content cut off at the right edge of the calculator's sections. `.calculations__screens` is `overflow-x: hidden`, so a
// section that grew too wide never scrolls sideways and the scrollWidth checks can't see it (2026-11-02 core audit H1 /
// M2): this looks for the innermost visible elements whose right edge passes the page, hidden by an ancestor or not,
// except inside a scroller that scrolls on purpose.
function expectNothingCutOff(what: string): void {
  cy.document().then((doc) => {
    const win = doc.defaultView!;
    const width = doc.documentElement.clientWidth;
    const shown = (el: Element): boolean => {
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0 && (el as HTMLElement).checkVisibility({ checkOpacity: true, checkVisibilityCSS: true });
    };
    const past = (el: Element): boolean => el.getBoundingClientRect().right > width + 1;
    const cut: string[] = [];
    for (const el of doc.querySelectorAll(".calculations__screens *")) {
      if (!past(el) || !shown(el) || [...el.children].some((child) => past(child) && shown(child))) continue;
      let scroller = false;
      for (let a = el.parentElement; a && a !== doc.body && !scroller; a = a.parentElement) {
        scroller = /(auto|scroll)/.test(win.getComputedStyle(a).overflowX) && a.scrollWidth > a.clientWidth + 1;
      }
      if (!scroller) cut.push(`<${el.tagName.toLowerCase()}> "${(el.textContent ?? "").trim().slice(0, 40)}" ends at ${Math.round(el.getBoundingClientRect().right)}`);
    }
    expect(cut, `${what}: cut off at the right edge of a ${width} px page`).to.deep.equal([]);
  });
}

// Inside the screen is not enough once a grid item may shrink (phone.css § 30): a label's text must also end inside its
// own box (Custom Buffs' "Defense" ran under its Flat box at 412 px, and all three labels were covered at 360).
function expectTextInsideItsBox(selector: string, what: string): void {
  cy.document().then((doc) => {
    const over: string[] = [];
    for (const el of doc.querySelectorAll(selector)) {
      const range = doc.createRange();
      range.selectNodeContents(el);
      const rects = [...range.getClientRects()];
      if (!rects.length) continue;
      const end = Math.max(...rects.map((r) => r.right));
      const edge = el.getBoundingClientRect().right;
      if (end > edge + 1) over.push(`"${(el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 30)}" ends at ${Math.round(end)}, its box at ${Math.round(edge)}`);
    }
    expect(over, `${what}: runs past its box`).to.deep.equal([]);
  });
}

// v3 with the Cartethyia fixture and the phone's text size; `character` overrides the stored characters
function v3Phone(fontScale: number, character: string = configOptimizer.data.character as string) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", character);
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
  };
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
    for (const route of ["/", "/inventory", "/convene", "/teams", "/settings", "/info", "/updates", "/my-rankings", "/account", "/energy", "/today", "/build-team", "/build-team?mode=account", "/build-history"]) {
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

  // Wuthering Tools+ build-my-team: the plan and the result at 360 px (v3, a saved team of the three seeded through
  // onBeforeLoad; cypress/e2e/buildTeam.cy.ts has the full flow at 412 px / 130 %)
  it("keeps /build-team's plan and result inside 360 px", () => {
    const character = JSON.parse(configOptimizer.data.character);
    character.characters.Ciaccona = { weapon: "WoodlandAria" };
    character.characters.Chisa = { weapon: "Kumokiri" };
    const team = { id: "btphone", name: "Phone team", characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions: [], duration: null, enemyConfig: {} };
    cy.visit("/build-team?team=btphone", {
      onBeforeLoad(win) {
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
        win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });
    cy.get('[data-test-build-team][data-phase="plan"]', { timeout: 90000 }).should("exist");
    expectNoHorizontalScroll("/build-team plan");
    cy.get("[data-test-build-team-run]").click();
    cy.get('[data-test-build-team][data-phase="result"]', { timeout: 90000 }).should("exist");
    cy.get("[data-test-build-team-result]:visible").should("have.length", 1);
    expectNoHorizontalScroll("/build-team result");
  });

  it("keeps the wuwa_calc rankings page inside the viewport with its phone controls", () => {
    cy.visit("/rankings");
    // Search sits in the account bar's chip row; the credit and the My roster link moved into the ⋯ menu
    cy.get("[data-test-rankings-search]", { timeout: 60000 }).should("be.visible");
    expectNavFits("/rankings");
    expectNoHorizontalScroll("/rankings");
    cy.get("[data-test-rankings-switch-mine]").should("not.be.visible");
    cy.get("[data-test-rankings-menu]").click();
    cy.get("[data-test-rankings-menu-my-rankings]").should("be.visible");
    cy.get("[data-test-rankings-menu-credit]").should("be.visible").and("have.attr", "href", "https://github.com/Riley31415/wuwa_calc");
  });

  it("reflows the roster ranking tables into cards", () => {
    cy.visit("/");
    cy.importCharacterData(configOptimizer);
    cy.visit("/my-rankings");
    cy.myRankingsRow("Cartethyia");
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
    // the character's name keeps its room beside a long headline (it read "C…" at 412 px / 130 %)
    cy.get("[data-test-live-result-bar-character-open] .truncate").first().then(($name) => {
      expect($name[0].getBoundingClientRect().width, "live result bar: the name's width").to.be.at.least(60);
    });
    // the Rotations panel's detail: the name input on its own line, compact action cards inside the screen
    cy.get('[data-test-calculator-mobile-nav="rotations"]').click({ force: true });
    cy.get("[data-test-rotations-item]").first().click();
    cy.get("[data-test-rotation-name-input]").should("be.visible").then(($input) => {
      expect($input[0].getBoundingClientRect().width, "rotation name input width").to.be.at.least(240);
    });
    cy.get(".rotation__action").should("have.length.at.least", 3);
    cy.get(".rotation__action").each(($card) => {
      const r = $card[0].getBoundingClientRect();
      expect(r.right, "action card inside the screen").to.be.at.most(412);
      // a card listing its own buff overrides (the fixture's first action has 16) is as tall as its list
      if (!$card.find(".rotation__action__unified-chips").length) expect(r.height, "action card height at 412 px / 130 %").to.be.at.most(300);
    });
    expectNoHorizontalScroll("/ rotation detail (v3)");
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

  // The 2026-10-31 shell audit (src/sim/README.md "Shell refinements"): Settings › Backup & Restore and the tuning
  // planner no longer scroll sideways, the calculator's big number says what it is, and the end of a page always
  // scrolls clear of the Ask button — v3, 130 % text, at David's S26 width and at 360 px.
  it("keeps Settings, the tuning planner and the calculator header inside a phone, with the page end clear of Ask", () => {
    // 360 px at 100 % text: at 130 % Ryan's v3 header fits 360 by 0.2 px, less than Electron's scrollbar (see above)
    const seed = (fontScale: number) => ({
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
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
      [412, 915, 1.3],
      [360, 800, 1],
    ] as const) {
      cy.viewport(width, height);
      cy.visit("/settings?section=backup-restore", seed(fontScale));
      cy.get("[data-test-settings-export-copy]").should("be.visible");
      expectNoHorizontalScroll(`/settings backup at ${width}`);
      cy.get(".page-settings .file-input").then(($f) => {
        expect($f[0].getBoundingClientRect().right, "file input inside the viewport").to.be.at.most(width);
      });
      cy.scrollTo("bottom");
      expectAskClearOf(".content button, .content a[href], .content input, .content textarea", `/settings backup end at ${width}`);
      cy.visit("/info/tuning-odds", seed(fontScale));
      cy.get("[data-test-tuning-planner]").should("be.visible");
      expectNoHorizontalScroll(`/info/tuning-odds at ${width}`);
      cy.visit("/", seed(fontScale));
      cy.get("[data-test-live-result-bar-hero]").then(($hero) => {
        const caption = $hero[0].ownerDocument.defaultView!.getComputedStyle($hero[0], "::after").content;
        expect(caption, "caption under the big number").to.equal('"avg damage"');
      });
      expectNoHorizontalScroll(`/ (v3) at ${width}`);
    }
  });

  // The v3 Teams editor (Ryan's TeamRotationTeamEditor / SummaryHeader / CalculatorRotationAction, fixed in phone.css
  // § 9 and § 22, night audit 2026-10-31): the team name keeps a line beside View Damages / View Summary, the member
  // cards' stats are captioned and stay in their columns, the build button never draws over Configure / Import and the
  // action cards stay compact — at 360 and 412 px with 130 % text.
  it("keeps the v3 Teams editor's header, member cards and action list inside a phone at 130 % text", () => {
    const character = JSON.parse(configOptimizer.data.character);
    const actions = character.characters.Cartethyia.rotations[0].actions.map((a: Record<string, unknown>, i: number) => ({ ...a, id: `pl-${i}`, slot: 0, order: i + 1 }));
    const team = { id: "pl-team", name: "Phone team with a long name · Cartethyia · Ciaccona + Chisa", characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions, duration: 25, enemyConfig: {} };
    const seed = {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory);
        win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
        win.sessionStorage.removeItem("teamRotationsActiveTeamId"); // the Teams page reopens the last team: start from the list
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
      cy.visit("/teams", seed);
      cy.get(`[data-test-team-rotations-item="${team.name}"] .card-body h3`).click();
      // the editor opens at the list's scroll position (the click scrolled the card into view); with Electron drawing
      // frames (CI) the header's IntersectionObserver then shows its compact stuck strip, which has no h2: measure the
      // full header from the top of the page
      cy.scrollTo(0, 0);
      cy.get('[data-test-team-rotation-summary-stuck="false"] h2').should("be.visible").then(($h2) => {
        expect($h2[0].getBoundingClientRect().width, `team name width at ${width}`).to.be.at.least(200);
      });
      expectNoHorizontalScroll(`/teams editor at ${width}`);
      cy.get('[data-test-team-rotation-slot="0"] [data-test-team-rotation-slot-stat]').should("have.length", 6).each(($stat) => {
        const value = $stat.find("span")[0];
        const caption = value.ownerDocument.defaultView!.getComputedStyle(value, "::before").content;
        expect(caption, `${$stat.attr("data-test-team-rotation-slot-stat")} caption`).to.not.be.oneOf(["none", "normal", ""]);
        expect($stat[0].getBoundingClientRect().right, "stat inside its column").to.be.at.most($stat.parent()[0].getBoundingClientRect().right + 1);
      });
      cy.get('[data-test="team-rotation-slot-build-select-0"]').then(($build) => {
        const join = $build.closest("[data-test-team-rotation-slot]").find(".join")[0]!;
        expect($build[0].getBoundingClientRect().bottom, "build button above the Configure / Import join").to.be.at.most(join.getBoundingClientRect().top + 1);
      });
      cy.get(".rotation__action").should("have.length", actions.length).each(($card) => {
        expect($card[0].getBoundingClientRect().right, "action card inside the screen").to.be.at.most(width);
      });
      // (the stuck header's two-line strip is not measured here: its IntersectionObserver never fires under Cypress —
      // Ryan's own "sticks the summary header" test is red the same way — so the phone shots stand in for it)
      cy.get(".rotation__action").each(($card) => {
        if (!$card.find(".rotation__action__unified-chips").length) expect($card[0].getBoundingClientRect().height, `action card height at ${width}`).to.be.at.most(320);
      });
    }
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
      // the Ask button sits above the bar (--plus-bar-h), not on its "Show" button
      expectAskClearOf("[data-test-echo-plan-phone-bar] button", `/echo-plan ${width} px`);
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

  // The v3 inventory on David's S26 (412 px, 130 % text; 2026-10-31 audit M6, phone.css § 25): the tile's action column
  // moved under the substats so the labels read in full, the page padding is a phone's, the top pager sticks under the
  // nav, and the Filters panel starts folded until the player opens it.
  it("lays the v3 inventory out for a phone: readable substats, actions under them, the pager in reach", () => {
    cy.viewport(412, 915);
    cy.visit("/inventory", {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", configOptimizer.data.character);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        delete settings.config.filterPanelsOpen;
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    cy.get("[data-test-inventory-echo-tile]", { timeout: 30000 }).should("have.length.at.least", 1);
    expectNoHorizontalScroll("/inventory v3 412 px");
    cy.get("[data-test-filter-panel-toggle]").first().should("have.attr", "aria-expanded", "false");
    cy.get(".inventory__content").should("have.css", "padding-left").then((pad) => expect(parseFloat(String(pad))).to.be.at.most(16));
    cy.get("[data-test-inventory-echo-tile]").first().then(($tile) => {
      const tile = $tile[0];
      const list = tile.querySelector("[data-test-echo-card-substat]")!.parentElement!.getBoundingClientRect();
      const edit = tile.querySelector("[data-test-echo-action-edit]")!.getBoundingClientRect();
      expect(edit.top, "actions under the substat list").to.be.at.least(list.bottom - 0.5);
    });
    cy.get("[data-test-echo-card-substat] .truncate").then(($labels) => {
      const cut = $labels.toArray().filter((el) => el.scrollWidth > el.clientWidth + 1).length;
      expect(cut, `substat labels cut (of ${$labels.length})`).to.be.at.most(Math.ceil($labels.length * 0.15));
    });
    cy.get(".echoes__list__pagination").first().should("have.css", "position", "sticky");
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
      [360, 800, 1.3],
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
      // crit luck under each team row (src/sim/critLuck/): its chances wrap inside the card
      cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-odds]').first().then(($line) => {
        expect($line[0].getBoundingClientRect().right, "crit-luck line inside the viewport").to.be.at.most(width);
      });
      cy.get('[data-test-toa-tab="plan"]').click();
      cy.get("[data-test-toa-stage]").should("have.length", 12);
      expectNoHorizontalScroll(`/endgame plan ${width} px / ${fontScale * 100} %`);
      // "Plan 3★" stays on one line inside its tab (it wrapped onto the summary line at 360 px / 130 %)
      cy.get("[data-test-toa-tab]").each(($tab) => {
        const tab = $tab[0];
        expect(tab.scrollHeight, `${tab.textContent?.trim()} tab: one line at ${width} px`).to.be.at.most(tab.clientHeight + 1);
        expect(tab.scrollWidth, `${tab.textContent?.trim()} tab: inside its pill at ${width} px`).to.be.at.most(tab.clientWidth + 1);
      });
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

  // Ryan #686's build vs buffs detail (phone.css § 28): a stat row in the v3 Full breakdown sheet opens it in HomeView's
  // drawer, which the sheet (fixed, z-50, later in the page) covered on a phone; the open drawer sits above the sheet,
  // the Ask button steps aside while it is open, and closing it brings the sheet back. The command sheet's chips say
  // what their two-tone bar means.
  it("opens the build vs buffs detail above the Full breakdown sheet at 412 px / 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit("/", {
      onBeforeLoad(win: Window) {
        win.localStorage.setItem("character", configOptimizer.data.character as string);
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    cy.get(".command-bar__sheet-open").should("be.visible").click();
    cy.get("[data-test-command-sheet-stat-split]").should("have.length.at.least", 1);
    cy.get("[data-test-command-sheet-stats]").should(($grid) => {
      const legend = getComputedStyle($grid[0], "::after").content;
      expect(legend, "the chips' bar legend").to.contain("grey is your build");
    });
    cy.get("[data-test-command-sheet-breakdown]").click();
    cy.get('[data-test-live-result-detail] [data-test-live-result-stat-row-key="totalAtk"]').should("be.visible").click();
    cy.get("[data-test-stat-split-formula]").should("be.visible");
    cy.get("[data-test-stat-split-formula]").should(($formula) => {
      const r = $formula[0].getBoundingClientRect();
      const top = $formula[0].ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      expect(top?.closest("[data-test-stat-split]"), "the formula is on top, not under the Full breakdown sheet").to.not.equal(null);
    });
    cy.get("[data-test-ai-open]").should("not.be.visible");
    cy.get(".calculator-breakdown > button").first().click();
    cy.get("[data-test-live-result-detail]").should("be.visible");
    cy.get("[data-test-ai-open]").should("be.visible");
  });

  // 2026-11-02 audit M2: while /my-rankings scored, its team placeholder rows (an 11 rem grey bar beside three avatars,
  // 229 px at 130 % text) pushed a 412 px page to 418 px for the first seconds. The page samples its own width from
  // before the app mounts until the placeholders are gone, so the check can't miss the short scoring window.
  it("keeps /my-rankings inside a 412 px phone at 130 % text while its teams are still scoring", () => {
    cy.viewport(412, 915);
    type Sample = { skeletons: number; scrollWidth: number; clientWidth: number };
    // two armed teammates and one saved team (as wiring.cy.ts seeds), so the page has team rows to score
    const character = JSON.parse(configOptimizer.data.character as string);
    character.characters.Ciaccona = { weapon: "WoodlandAria" };
    character.characters.Chisa = { weapon: "Kumokiri" };
    const rotation = character.characters.Cartethyia.rotations[0];
    const actions = rotation.actions.map((a: { order: number; key: string; type: string; id: string }) => ({ slot: 0, order: a.order, key: a.key, type: a.type, count: 1, buffs: [], isDisabled: false, id: `pl-${a.id}` }));
    const team = { id: "pl-t1", name: "Cartethyia team", characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions, duration: 20 };
    cy.visit("/my-rankings?tab=teams", {
      onBeforeLoad(win: Window) {
        win.sessionStorage.clear();
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
        win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false };
        win.localStorage.setItem("settings", JSON.stringify(settings));
        win.document.documentElement.style.fontSize = "130%"; // from the first paint, not only from the load event
        const samples: Sample[] = [];
        (win as unknown as { __widths: Sample[] }).__widths = samples;
        const timer = win.setInterval(() => {
          const doc = win.document.documentElement;
          if (!doc) return;
          const skeletons = win.document.querySelectorAll("[data-test-my-rankings-team-skeleton]").length;
          samples.push({ skeletons, scrollWidth: doc.scrollWidth, clientWidth: doc.clientWidth });
          if (samples.length > 4000 || (!skeletons && samples.some((x) => x.skeletons))) {
            win.clearInterval(timer);
            (win as unknown as { __widthsDone: boolean }).__widthsDone = true;
          }
        }, 15);
      },
      onLoad(win: Window) {
        const style = win.document.createElement("style");
        style.textContent = "html { font-size: 130%; }";
        win.document.head.appendChild(style);
      },
    });
    // the sampler stops once it has seen the placeholders come and go
    cy.window({ timeout: 120000 }).its("__widthsDone", { timeout: 120000 }).should("eq", true);
    cy.get("[data-test-my-rankings-team]").should("have.length.at.least", 1);
    cy.window().then((win) => {
      const samples = (win as unknown as { __widths: Sample[] }).__widths.filter((x) => x.skeletons > 0);
      expect(samples.length, "samples taken while the teams were scoring").to.be.greaterThan(0);
      for (const x of samples) expect(x.scrollWidth, `page width with ${x.skeletons} placeholder rows`).to.be.at.most(x.clientWidth);
    });
    expectNoHorizontalScroll("/my-rankings teams, scored");
  });

  // 2026-11-02 core audit H1 / M2 (phone.css § 30). A wuwa_calc rotation's long name and description, printed with
  // `truncate` in the optimizer's target card, made Ryan's column-less setup grid 1,988 px wide: most echo sets, the
  // main-echo cards and the target were cut off. The Weapon, Enemy and Custom Buffs sections lost their right edge the
  // same way at 130 % text. Every section, at David's S26 width and at 360 px (a 375 px window less Electron's 15 px
  // scrollbar), with the optimizer's Rotation tab listing the long one.
  it("keeps every calculator section inside the screen at 130 % text, with a wuwa_calc-length rotation", () => {
    const character = JSON.parse(configOptimizer.data.character as string);
    const rotation = character.characters.Cartethyia.rotations[0];
    rotation.name = "Cartethyia S6R5 Defier's Thorn R5 · Ciaccona + Shorekeeper · S6R5 DPS · S1R1/S6R1 team (wuwa_calc)";
    rotation.description =
      "Steady-state loop from the Team Rankings page (Riley31415/wuwa_calc): Cartethyia S6R5 Defier's Thorn R5 with Ciaccona S1R1 and Shorekeeper S6R1, 25 s, the frame-accurate engine, team buffs from the members";
    const sections: Array<[string, string]> = [
      ["character", ".screen--character"],
      ["weapon", ".screen--weapon"],
      ["echoes", ".screen--echoes"],
      ["team", ".screen-party"],
      ["enemy", ".screen--enemy"],
      ["optimizer", ".screen--optimizer"],
      ["rotations", ".screen--rotations"],
      ["customBuffs", ".screen--custom-buffs"],
      ["stats", ".screen--results"],
      ["buildCard", ".screen--build-card"],
    ];
    for (const [width, height] of [
      [412, 915],
      [375, 812],
    ] as const) {
      cy.viewport(width, height);
      cy.visit("/", v3Phone(1.3, JSON.stringify(character)));
      cy.get("[data-test-live-result-bar]").should("be.visible");
      for (const [section, screen] of sections) {
        cy.get(`[data-test-calculator-mobile-nav="${section}"]`).click({ force: true });
        cy.get(screen).should("be.visible");
        if (section === "optimizer") {
          // force: changeScreen scrolls the page to the top, and a loaded CI box can still be scrolling ("animating")
          cy.get("[data-test-optimizer-workspace-target-tabs] .tab").contains("Rotation").click({ force: true });
          cy.get(`[data-test-optimizer-workspace-target-rotation="${rotation.id}"]`).should("contain.text", "(wuwa_calc)");
          // the Stat · Attack · Rotation tabs stay inside their card (they ran 15 px out at 360)
          cy.get("[data-test-optimizer-workspace-target-tabs]").should(($tabs) => {
            expect($tabs[0].getBoundingClientRect().right, `optimizer tabs at ${width}: right edge`).to.be.at.most($tabs[0].parentElement!.getBoundingClientRect().right + 1);
          });
        }
        if (section === "customBuffs") expectTextInsideItsBox(".custom-buffs-workspace .grid > .flex > .flex-1", `custom buffs labels at ${width}`);
        expectNothingCutOff(`${section} at ${width}`);
      }
    }
  });

  // 2026-11-02 core audit M1 (phone.css § 30): at the end of a calculator section Ryan's result bar compacted, the page
  // got shorter, scroll anchoring moved the page by more than his 8 px threshold, the bar expanded again, and so on
  // about five times a second, with the bottom bar and Ask sliding in and out. Scrolled to the end, the bottom bar must
  // settle within one change and stay put for the next 2 s.
  it("holds the calculator's bars still at the end of a section at 412 px / 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit("/", v3Phone(1.3));
    cy.get('[data-test-calculator-mobile-nav="enemy"]').click({ force: true });
    cy.get(".screen--enemy").should("be.visible");
    cy.get("[data-test-nav-bottom-bar]").should("be.visible");
    cy.window().then((win) => {
      expect(win.document.documentElement.scrollHeight - win.innerHeight, "the section scrolls past the bar's 80 px top zone").to.be.greaterThan(120);
      win.scrollTo(0, win.document.documentElement.scrollHeight);
    });
    cy.window()
      .then(
        { timeout: 10_000 }, // 25 samples 100 ms apart; timers run slow while the page loops
        (win) =>
          new Cypress.Promise<number[]>((resolve) => {
            const tucked: number[] = [];
            const timer = win.setInterval(() => {
              tucked.push(win.document.querySelector(".nav-bottom-bar--tucked") ? 1 : 0);
              if (tucked.length === 25) {
                win.clearInterval(timer);
                resolve(tucked);
              }
            }, 100);
          }),
      )
      .then((tucked) => {
        const changes = tucked.filter((value, i) => i > 0 && value !== tucked[i - 1]).length;
        expect(changes, `bottom bar tucked (1) or shown (0) every 100 ms: ${tucked.join("")}`).to.be.at.most(1);
      });
  });

  // 2026-11-02 core audit L1 / L2 (phone.css § 31): the Ask button (z-55) sat on the last rows of Ryan's v3 phone menus
  // (z-50), so taps on their right half opened Ask; it steps aside while one is open (both are DaisyUI focus dropdowns).
  // The inventory's Import echoes sheet opens on the phone screenshot import, the way in on a phone, not ~520 px down
  // under the Discord-bot importer.
  it("keeps Ask off Ryan's phone menus and opens the echo importer on the phone screenshots at 412 px / 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit("/inventory", v3Phone(1.3));
    cy.get("[data-test-ai-open]").should("be.visible");
    cy.get("[data-test-nav-bottom-more]").focus();
    cy.get("[data-test-options-menu-v3]").should("be.visible");
    cy.get("[data-test-ai-open]").should("not.be.visible");
    cy.get("[data-test-nav-bottom-more]").blur();
    cy.get("[data-test-ai-open]").should("be.visible");
    cy.get("[data-test-nav-section-switcher]").focus();
    cy.get("[data-test-ai-open]").should("not.be.visible");
    cy.get("[data-test-nav-section-switcher]").blur();
    cy.get("[data-test-ai-open]").should("be.visible");

    cy.contains("button", "Import echoes").click({ force: true });
    cy.get("[data-test-phone-echo-batch-picker]").should("be.visible").then(($picker) => {
      expect($picker[0].getBoundingClientRect().bottom, "Pick screenshots on the first screen").to.be.at.most(915);
      const batch = $picker[0].closest("[data-test-phone-echo-batch]")!;
      const discordBot = batch.parentElement!.firstElementChild!;
      expect(discordBot, "Ryan's importer is in the same column").to.not.equal(batch);
      expect(batch.getBoundingClientRect().top, "the phone import comes first").to.be.lessThan(discordBot.getBoundingClientRect().top);
    });
    cy.get("[data-test-phone-echo-batch-how]").should("not.have.attr", "open");
    cy.get("[data-test-phone-echo-batch-how] summary").should("contain.text", "How to take them").click();
    cy.get("[data-test-phone-echo-batch-set-tip]").should("be.visible").and("contain.text", "No Sonata filter needed");
  });
});
