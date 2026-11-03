// Wuthering Tools+ (2026-10-31, track fix-account-rankings): the account and rankings pages on David's phone — v3 UI,
// 412 × 915 at 130 % text (and 360 px where the audit found the narrow-phone faults). Each check is one audit finding
// that stays fixed: the /rankings list gets the screen, its search sheet docks under its header, the detail page shows
// one member's gear at a time, the Ask button clears /build-team's bar, and phone numbers say what they are.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const S26 = { width: 412, height: 915 };

/** v3 (the default UI) with the Cartethyia account and, optionally, a saved team, at a phone's 130 % text size. */
function v3Seed(extra: (win: Window) => void = () => {}) {
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
      settings.config = { ...settings.config, useClassicUi: false };
      win.localStorage.setItem("settings", JSON.stringify(settings));
      win.document.documentElement.style.fontSize = "130%";
      extra(win);
    },
    onLoad(win: Window) {
      const style = win.document.createElement("style");
      style.textContent = "html { font-size: 130% !important; }";
      win.document.head.appendChild(style);
    },
  };
}

function expectNoHorizontalScroll(what: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${what}: page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("account and rankings pages on a phone (v3, 130 % text)", () => {
  beforeEach(() => {
    cy.viewport(S26.width, S26.height);
  });

  it("/rankings opens on My account and leaves the list most of the screen", () => {
    cy.visit("/rankings", v3Seed());
    // an account that is set up opens on My account, not on Riley's S0R1 table
    cy.location("hash", { timeout: 60000 }).should("include", "tc=mine");
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-card]", { timeout: 90000 }).should("have.length.greaterThan", 0);
    // the list heads itself: the count, what the figure is, the engine and the substats every row wears
    cy.get("[data-test-rankings-cards-head]").should("be.visible");
    cy.get("[data-test-rankings-cards-unit]").should("contain.text", "per rotation").and("contain.text", "wuwa_calc at your account");
    // the grey seconds beside the figure say what they are
    cy.get("[data-test-rankings-card-loop]").first().invoke("text").should("match", /^\d+\.\d s loop$/);
    cy.get("[data-test-rankings-cards-spread]").should("have.text", "ChemX32 substats");
    // the info chip says what its number counts
    cy.get("[data-test-rankings-info-text]").invoke("text").should("match", /^\d+ set up$/);
    // no toolbar row, no credit line: the list has at least 60 % of the screen (it had 53 %, 488 of 915 px)
    cy.get(".skittle-root .wt-toolbar").should("not.be.visible");
    cy.get(".rankings-credit").should("not.be.visible");
    cy.get(".skittle-host").should(($host) => {
      expect($host[0]!.getBoundingClientRect().height, "list height").to.be.at.least(S26.height * 0.6);
    });
    expectNoHorizontalScroll("/rankings");
    // "Only teams I can import" at My account with "Teams I can field" on: teams with Lily never show there, so the
    // option is greyed out and says so (it used to write x=Lily into the link and change nothing, 104 → 104)
    cy.get("[data-test-rankings-menu]").click();
    cy.get("[data-test-rankings-importable]").should("be.disabled").and("not.be.checked");
    cy.get("[data-test-rankings-importable-note]").should("contain.text", "no effect here").and("contain.text", "Lily");
    cy.get("[data-test-rankings-menu]").click();
    // on Riley's tiers the opt-in writes the resonators the app lacks into his Without list, the list head says what
    // it hides (the "Without" chip sits past the right edge of a phone), and the same box lifts them again
    cy.get("[data-test-rankings-riley]").click();
    cy.location("hash", { timeout: 60000 }).should("not.include", "tc=mine");
    cy.get("[data-test-rankings-card]", { timeout: 90000 }).should("have.length.greaterThan", 0);
    cy.get("[data-test-rankings-menu]").click();
    cy.get("[data-test-rankings-importable]").should("be.enabled").and("not.be.checked").check();
    cy.location("hash", { timeout: 60000 }).should("match", /x=[^&]*Lily/);
    cy.get("[data-test-rankings-cards-hiding]").should("have.text", "hiding teams with Lily");
    // the menu stays open: the same box takes it off again
    cy.get("[data-test-rankings-importable]").should("be.checked").uncheck();
    cy.location("hash", { timeout: 60000 }).should("not.match", /x=[^&]*Lily/);
    cy.get("[data-test-rankings-cards-hiding]").should("not.exist");
    // switched on under a tier, x=Lily stays in the link back at My account: the box there is still on and still
    // takes it off (greyed out only while it is off)
    cy.get("[data-test-rankings-importable]").check();
    cy.location("hash", { timeout: 60000 }).should("match", /x=[^&]*Lily/);
    cy.get("[data-test-rankings-menu]").click();
    cy.get("[data-test-rankings-mine]").click();
    cy.location("hash", { timeout: 60000 }).should("include", "tc=mine").and("match", /x=[^&]*Lily/);
    cy.get("[data-test-rankings-card]", { timeout: 90000 }).should("have.length.greaterThan", 0);
    cy.get("[data-test-rankings-menu]").click();
    cy.get("[data-test-rankings-importable]").should("be.enabled").and("be.checked").uncheck();
    cy.location("hash", { timeout: 60000 }).should("not.match", /x=[^&]*Lily/);
    cy.get("[data-test-rankings-importable]").should("be.disabled").and("not.be.checked");
    cy.get("[data-test-rankings-menu]").click();
    // at 360 px the "26.2 s loop" drops under the figure instead of pushing the card past the screen
    cy.viewport(360, 800);
    cy.get("[data-test-rankings-card]").first().should(($c) => {
      expect($c[0]!.getBoundingClientRect().right, "card inside a 360 px screen").to.be.at.most(360);
    });
  });

  it("docks the search sheet under its header and shows one member's gear at a time on the detail page", () => {
    cy.visit("/rankings", v3Seed());
    cy.get(".skittle-root #loading", { timeout: 180000 }).should("have.attr", "hidden");
    cy.get("[data-test-rankings-search]", { timeout: 60000 }).click();
    cy.get(".skittle-root .tcside #optionSearch").should("be.visible");
    cy.get(".skittle-root .wt-toolbar").then(($head) => {
      const head = $head[0]!.getBoundingClientRect();
      cy.get(".skittle-root .tcside").should(($side) => {
        const side = $side[0]!.getBoundingClientRect();
        expect(Math.abs(side.top - head.bottom), "sheet top at its header").to.be.lessThan(3);
        expect(side.bottom, "sheet clear of the bottom bar").to.be.lessThan(S26.height - 60);
      });
    });
    cy.get("[data-test-rankings-filters-close]").click({ force: true });
    cy.get(".skittle-root .tcside").should("not.be.visible");

    cy.get("[data-test-rankings-card]", { timeout: 90000 }).first().click();
    cy.get("[data-test-rankings-strip-member]", { timeout: 90000 }).should("have.length", 3);
    // the Equipment table: the main DPS's column only, as wide as the screen
    const shownMembers = (): Cypress.Chainable<string[]> =>
      cy.get(".skittle-root .rtable.loadout .rthead .c.mem").then(($c) => [...$c].filter((c) => getComputedStyle(c).display !== "none").map((c) => (c.textContent ?? "").trim()));
    cy.get(".skittle-root .rtable.loadout", { timeout: 60000 }).should(($t) => {
      expect($t[0]!.getBoundingClientRect().right, "table inside the screen").to.be.at.most(S26.width);
    });
    shownMembers().should("have.length", 1);
    cy.get("[data-test-rankings-strip-member][data-main='1']").then(($main) => {
      shownMembers().then((names) => expect(names[0]).to.contain($main.attr("data-name")));
    });
    // a tap on another member's portrait switches the column
    cy.get("[data-test-rankings-strip-member][data-main='0']").first().then(($m) => {
      cy.wrap($m).click();
      shownMembers().should((names) => {
        expect(names).to.have.length(1);
        expect(names[0]).to.contain($m.attr("data-name"));
      });
    });
    // Back and the strip's controls are 40 px tap targets
    cy.get("#backLink").should(($b) => expect($b[0]!.offsetHeight).to.be.at.least(40));
    expectNoHorizontalScroll("/rankings detail");
  });

  it("keeps the Ask button off /build-team's Build bar", () => {
    const character = JSON.parse(configOptimizer.data.character);
    character.characters.Ciaccona = { weapon: "WoodlandAria" };
    character.characters.Chisa = { weapon: "Kumokiri" };
    const team = { id: "btphone", name: "Phone team", characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions: [], duration: null, enemyConfig: {} };
    cy.viewport(360, 800);
    cy.visit(
      "/build-team?team=btphone",
      v3Seed((win) => {
        win.localStorage.setItem("character", JSON.stringify(character));
        win.localStorage.setItem("teamRotations", JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }));
      }),
    );
    cy.get('[data-test-build-team][data-phase="plan"]', { timeout: 90000 }).should("exist");
    cy.get("[data-test-ai-open]").should("be.visible");
    cy.get("[data-test-build-team-run]").should(($run) => {
      const run = $run[0]!.getBoundingClientRect();
      const ask = Cypress.$("[data-test-ai-open]")[0]!.getBoundingClientRect();
      expect(ask.bottom, "Ask above the Build bar").to.be.at.most(run.top);
      // a tap on the button's right end builds; it used to open the assistant
      const hit = $run[0]!.ownerDocument.elementFromPoint(run.right - 6, run.top + run.height / 2);
      expect(hit?.closest("[data-test-ai-open]"), "the Ask button under the tap").to.eq(null);
    });
  });

  it("says what each number is on /account and /my-rankings, and gives the 360 px weapon its own line", () => {
    cy.visit("/account", v3Seed());
    cy.get('[data-test-account-kpi="s6"] .kpi__sub', { timeout: 60000 }).should("be.visible").and("contain.text", "set up");
    cy.get('[data-test-account-kpi="r5"] .kpi__sub').should("be.visible").and("contain.text", "R5");
    // the v3 header names the page; the H1 stays for screen readers only (it repeated the title, ~50 px)
    cy.get(".nav-phone-header").should("contain.text", "My account");
    cy.get(".acc-h1").should(($h) => expect($h[0]!.getBoundingClientRect().height).to.be.at.most(2));
    expectNoHorizontalScroll("/account");

    cy.viewport(360, 800);
    cy.visit("/my-rankings", v3Seed());
    cy.get("[data-test-my-rankings-damage-unit]", { timeout: 90000 }).first().should("be.visible").and("have.text", "avg DMG / rotation");
    cy.get(".mr-row .cell--weapon").first().should(($w) => {
      expect($w[0]!.getBoundingClientRect().width, "weapon cell width at 360 px").to.be.at.least(150);
    });
    expectNoHorizontalScroll("/my-rankings at 360 px");
  });
});
