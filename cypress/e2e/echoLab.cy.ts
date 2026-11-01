// Wuthering Tools+ Echo Lab (/echo-lab) in the v3 UI: the four tabs render engine results for a seeded account,
// the verdict filters and feed list work, the page stays inside a phone at 412 px with 130 % text, the empty state
// offers import / scan, and the v3 calculator's Echo Insights shows the "Engine view for this build" panel that
// links to the re-roll tab. Seeded through onBeforeLoad (the support file seeds classic otherwise). The account is
// the Echo Lab unit-test fixture: public data only (Cartethyia, Galbrena, Zani, a weaponless Augusta, synthesised
// "lab" echoes — dead lines, partial lines, one nobody can slot).
import * as fixtureModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type Account = { characters: Record<string, unknown>; echoes: Array<{ echoId: string }>; equipped: Record<string, unknown> };
const fixture = ((fixtureModule as unknown as { default?: Account }).default ?? fixtureModule) as unknown as Account;

const TITLE = "Echo Lab — Wuthering Waves Calculator & Optimizer";
const RUN = { timeout: 60000 };

interface SeedOptions {
  empty?: boolean;
  /** weapons kept, every character's echoes taken off: nobody to judge the inventory against */
  unequipped?: boolean;
  fontScale?: number;
}

function seed({ empty = false, unequipped = false, fontScale }: SeedOptions = {}) {
  return {
    onBeforeLoad(win: Window) {
      // a fresh tab: no cached pass from the previous test
      win.sessionStorage.clear();
      if (!empty) {
        const characters = unequipped
          ? Object.fromEntries(Object.entries(fixture.characters).map(([id, c]) => [id, { ...(c as Record<string, unknown>), echoes: {} }]))
          : fixture.characters;
        win.localStorage.setItem("character", JSON.stringify({ characters, activeCharacter: "Cartethyia" }));
        win.localStorage.setItem(
          "inventory",
          JSON.stringify({ echoes: fixture.echoes, equipped: unequipped ? {} : fixture.equipped, echoPresets: [], equippedPresets: {} }),
        );
      }
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

function expectNoHorizontalScroll(label: string): void {
  cy.document().then((doc) => {
    expect(doc.documentElement.scrollWidth, `${label} page width`).to.be.at.most(doc.documentElement.clientWidth);
  });
}

describe("Echo Lab", () => {
  it("judges every inventory echo with keep / spare / feed, filters them and lists the feed groups", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seed());
    cy.title().should("eq", TITLE);
    cy.get("[data-test-echo-lab-row]", RUN).should("have.length", fixture.echoes.length);
    cy.get("[data-test-echo-lab-meta]").should("contain.text", "engine runs");
    cy.get('[data-test-echo-lab-verdict="keep"]').should("exist");
    cy.get('[data-test-echo-lab-verdict="feed"]').should("exist");
    // the synthesised echo no built character can slot is fed, with its reason
    cy.get('[data-test-echo-lab-row^="labnoslot"]').first().should("have.attr", "data-verdict", "feed").and("contain.text", "No one can slot it");

    // KPI → verdict filter
    cy.get('[data-test-echo-lab-kpi="feed"]').click();
    cy.get('[data-test-echo-lab-filter-verdict="feed"]').should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-echo-lab-row]").each(($row) => expect($row.attr("data-verdict")).to.eq("feed"));
    cy.get("[data-test-echo-lab-feed-list]").should("be.visible");
    cy.get("[data-test-echo-lab-feed-toggle]").click();
    cy.get("[data-test-echo-lab-feed-group]").should("have.length.at.least", 1);

    // search, no match, clear
    cy.get("[data-test-echo-lab-search]").type("no such echo anywhere");
    cy.get("[data-test-echo-lab-no-match]").should("be.visible");
    cy.get("[data-test-echo-lab-filters-reset]").click();
    cy.get("[data-test-echo-lab-row]").should("have.length", fixture.echoes.length);

    // a row opens the exact per-owner scores
    cy.get('[data-test-echo-lab-row][data-verdict="keep"]').first().click();
    cy.get("[data-test-echo-lab-detail]").should("be.visible").and("contain.text", "Scored on");
  });

  it("renders Tune or Feed, the re-roll advisor and the build benchmark", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seed());
    cy.get("[data-test-echo-lab-row]", RUN).should("have.length.at.least", 1);

    cy.get('[data-test-echo-lab-tab="tune"]').click();
    cy.location("search").should("eq", "?tab=tune");
    cy.get("[data-test-echo-lab-tune-row]").should("have.length.at.least", 1);
    cy.get("[data-test-echo-lab-tune-pbeat]").first().invoke("text").should("match", /^\d+%$/);
    cy.get("[data-test-echo-lab-tune-verdict]").should("exist");

    cy.get('[data-test-echo-lab-tab="reroll"]').click();
    cy.get("[data-test-echo-lab-reroll-character]").should("have.length", 3); // Augusta has no weapon
    cy.get('[data-test-echo-lab-reroll-character="Galbrena"]').click();
    cy.location("search").should("contain", "character=Galbrena");
    cy.get("[data-test-echo-lab-reroll-echo]").should("have.length", 5);
    cy.get('[data-test-echo-lab-reroll-line="lock"]', RUN).should("exist");
    cy.get("[data-test-echo-lab-reroll-loading]", RUN).should("not.exist");
    cy.get('[data-test-echo-lab-reroll-line="pending"]').should("not.exist");
    cy.get("[data-test-echo-lab-reroll-first]").should("have.length.at.most", 1);
    cy.get("[data-test-echo-lab-info=reroll]").click();
    cy.get("[data-test-echo-lab-info-panel=reroll]").should("be.visible").and("contain.text", "verify in game");

    cy.get('[data-test-echo-lab-tab="benchmark"]').click();
    cy.get("[data-test-echo-lab-benchmark-row]", RUN).should("have.length", 3);
    cy.get("[data-test-echo-lab-benchmark-score]").first().invoke("text").should("match", /^\s*\d+%\s*$/);
    cy.get("[data-test-echo-lab-info=benchmark]").click();
    cy.get("[data-test-echo-lab-info-panel=benchmark]").should("contain.text", "ChemX32");
  });

  // David's S26 is 412 px wide at 130 % text; 360 px is the narrowest phone we budget for (2026-10-31 audit H3: the
  // re-roll line table and the benchmark row detail ran a 360 px page sideways)
  for (const [width, height] of [
    [412, 915],
    [360, 800],
  ] as const) {
    it(`stays inside a ${width} px phone with 130 % text on every tab, tables and details open`, () => {
      cy.viewport(width, height);
      cy.visit("/echo-lab", seed({ fontScale: 1.3 }));
      cy.get("[data-test-echo-lab-row]", RUN).should("have.length.at.least", 1);
      expectNoHorizontalScroll("verdicts");
      cy.get("[data-test-echo-lab-line-legend]").should("be.visible").and("contain.text", "Substat colour");
      cy.get("[data-test-echo-lab-feed-toggle]").click();
      expectNoHorizontalScroll("verdicts with the feed groups open");
      // each group says its game filter: Sonata, then Cost and main stat
      cy.get("[data-test-echo-lab-feed-group-filter]").first().invoke("text").should("match", /^Cost \d · \S/);
      cy.get('[data-test-echo-lab-tab="tune"]').click();
      cy.get("[data-test-echo-lab-tune-row]").should("exist");
      cy.get("[data-test-echo-lab-tune-legend]").should("be.visible");
      expectNoHorizontalScroll("tune");
      cy.get('[data-test-echo-lab-tab="reroll"]').click();
      cy.get('[data-test-echo-lab-reroll-line="lock"]', RUN).should("exist");
      cy.get("[data-test-echo-lab-reroll-loading]", RUN).should("not.exist");
      cy.get("[data-test-echo-lab-reroll-legend]").should("be.visible").and("contain.text", "Worth");
      expectNoHorizontalScroll("re-roll");
      // the line table never runs past its card
      cy.get("[data-test-echo-lab-reroll-echo]").each(($card) => {
        const card = $card[0].getBoundingClientRect();
        const table = $card[0].querySelector("table")?.getBoundingClientRect();
        if (table) expect(table.right, "re-roll table inside its card").to.be.at.most(card.right + 0.5);
      });
      cy.get(".reroll__plans summary").first().click();
      expectNoHorizontalScroll("re-roll, all lock plans open");
      // every header word fits its column (the long headers broke "Transducers" mid-word on a phone)
      cy.get(".reroll__plans").first().find("th").each(($th) => {
        expect($th[0].scrollWidth, `"${$th.text().trim()}" fits its column`).to.be.at.most($th[0].clientWidth + 1);
      });
      cy.get("[data-test-echo-lab-reroll-plans-legend]").first().should("be.visible").and("contain.text", "Transducers");
      cy.get('[data-test-echo-lab-tab="benchmark"]').click();
      cy.get("[data-test-echo-lab-benchmark-row]", RUN).should("exist");
      expectNoHorizontalScroll("benchmark");
      cy.get("[data-test-echo-lab-benchmark-row]").first().click();
      cy.get("[data-test-echo-lab-benchmark-spread]").should("be.visible");
      cy.get("[data-test-echo-lab-benchmark-dmg]").should("be.visible").and("contain.text", "per rotation");
      expectNoHorizontalScroll("benchmark row detail");
      cy.get("[data-test-echo-lab-benchmark-spread]").then(($t) => {
        const box = $t[0].getBoundingClientRect();
        for (const cell of $t[0].querySelectorAll("td")) expect(cell.getBoundingClientRect().right, "spread cell inside the table").to.be.at.most(box.right + 0.5);
      });
    });
  }

  it("a Keep / Spare / Feed tap on a phone brings the filtered list up and marks the tile", () => {
    cy.viewport(412, 915);
    cy.visit("/echo-lab", seed({ fontScale: 1.3 }));
    cy.get("[data-test-echo-lab-row]", RUN).should("have.length.at.least", 1);
    cy.window().its("scrollY").should("eq", 0);
    cy.get('[data-test-echo-lab-kpi="feed"]').click();
    cy.get('[data-test-echo-lab-kpi="feed"]').should("have.attr", "aria-pressed", "true");
    cy.get('[data-test-echo-lab-kpi="keep"]').should("have.attr", "aria-pressed", "false");
    cy.get('[data-test-echo-lab-filter-verdict="feed"]').should("have.attr", "aria-pressed", "true");
    // the list's top lands near the top of the screen
    cy.get("[data-test-echo-lab-verdicts]").should(($list) => {
      const top = $list[0].getBoundingClientRect().top;
      expect(top, "verdict list top after the tap").to.be.lessThan(915 * 0.45);
    });
  });

  it("offers import and scan when there is nothing to judge", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seed({ empty: true }));
    cy.get("[data-test-echo-lab-empty]").should("be.visible").and("contain.text", "Bring your echoes in");
    cy.get('[data-test-echo-lab-cta="import"]').should("have.attr", "href", "/settings");
    cy.get('[data-test-echo-lab-cta="scan"]').should("have.attr", "href", "/inventory?open=import");
  });

  it("never feeds the inventory when no built character wears five echoes", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab", seed({ unequipped: true }));
    cy.get("[data-test-echo-lab-empty]", RUN).should("be.visible").and("contain.text", "No character with a weapon wears five echoes");
    cy.get('[data-test-echo-lab-cta="build"]').should("have.attr", "href", "/");
    cy.get("[data-test-echo-lab-kpis]").should("not.exist");
    cy.get("[data-test-echo-lab-feed-list]").should("not.exist");
  });

  it("shows the engine view for the build in the v3 calculator's Echo Insights, linked to the re-roll tab", () => {
    cy.viewport(1440, 1200);
    cy.visit("/", seed());
    cy.get('[data-test-calculator-nav="echoes"]').filter(":visible").click();
    cy.get("[data-test-echo-lab-engine]").filter(":visible").as("engine");
    cy.get("@engine").find("[data-test-echo-lab-engine-benchmark]", RUN).invoke("text").should("match", /\d+%/);
    cy.get("@engine").find("[data-test-echo-lab-engine-substat]").should("have.length", 3);
    cy.get("@engine").find("[data-test-echo-lab-engine-reroll-loading]", RUN).should("not.exist");
    cy.get("@engine")
      .find("[data-test-echo-lab-engine-link]")
      .should("have.attr", "href")
      .and("include", "/echo-lab?tab=reroll&character=Cartethyia");
    // the panel's "re-roll first" is the echo the re-roll tab marks (one rule, pickRerollFirst)
    cy.get("@engine")
      .find("[data-test-echo-lab-engine-reroll] .echo-lab-echo")
      .then(($echo) => ($echo.length ? $echo.first().text().trim() : null))
      .as("panelPick");
    cy.get("@engine").find("[data-test-echo-lab-engine-link]").click();
    cy.location("pathname").should("eq", "/echo-lab");
    cy.get('[data-test-echo-lab-reroll-character="Cartethyia"]', RUN).should("have.attr", "aria-pressed", "true");
    cy.get("[data-test-echo-lab-reroll-loading]", RUN).should("not.exist");
    cy.get('[data-test-echo-lab-reroll-line="pending"]').should("not.exist");
    cy.get<string | null>("@panelPick").then((pick) => {
      if (pick === null) cy.get("[data-test-echo-lab-reroll-first]").should("not.exist");
      else cy.get("[data-test-echo-lab-reroll-first]").closest("[data-test-echo-lab-reroll-echo]").find(".echo-lab-echo").first().should("contain.text", pick);
    });
  });
});
