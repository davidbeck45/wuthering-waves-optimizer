// Wuthering Tools+: the fight pages after the 2026-10-31 night audit ("fight") — the Teams editor's way into the plus
// team tools (src/sim/teamLinks/), the calculator's empty Rotations panel (Ryan's own since #690; plus's was retired),
// the right page in the v3 phone header for /energy and /rotation, the energy chips' "has / needs" words and a
// /rotation link that is not a team. v3 UI (the default since Ryan #602), seeded through onBeforeLoad like
// energyCheck.cy.ts: the Cartethyia optimizer fixture and two saved teams — one of wuwa_calc's compositions
// (Cartethyia + Ciaccona + Chisa, t500) and one hand-built team his list does not have.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const MEASURED = "Cartethyia · Ciaccona · Chisa";
const HAND_BUILT = "Cartethyia · Augusta · Lynae";
const team = (id: string, name: string, characterIds: string[]) => ({ id, name, characterIds, buildIds: [null, null, null], actions: [], duration: null, enemyConfig: {} });

function seed(options: { rotations?: boolean; fontScale?: number } = {}) {
  const { rotations = true, fontScale } = options;
  const character = JSON.parse(configOptimizer.data.character);
  if (!rotations) character.characters.Cartethyia.rotations = [];
  return {
    onBeforeLoad(win: Window) {
      win.localStorage.removeItem("wtplus:energy:v1");
      // the Teams page reopens the last team it showed: start from the list
      win.sessionStorage.removeItem("teamRotationsActiveTeamId");
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem(
        "teamRotations",
        JSON.stringify({ teams: [team("ff-t1", MEASURED, ["Cartethyia", "Ciaccona", "Chisa"]), team("ff-t2", HAND_BUILT, ["Cartethyia", "Augusta", "Lynae"])], favoriteTeamIds: [], favoritePresetNames: [] }),
      );
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

const ENGINE = { timeout: 90000 };

function openTeam(name: string): void {
  cy.get(`[data-test-team-rotations-item="${name}"]`, { timeout: 20000 }).find(".card-body h3").click();
  cy.get("[data-test-team-rotation-editor]").should("be.visible");
}

describe("fight pages", () => {
  it("shows a wuwa_calc team's engine DPS in the Teams editor and opens its cue card; a hand-built team gets nothing", () => {
    cy.viewport(1280, 900);
    cy.visit("/teams", seed());
    openTeam(MEASURED);
    cy.get('[data-test-team-plus-links][data-state="ok"]', ENGINE).should("be.visible");
    cy.get("[data-test-team-plus-dps]").invoke("text").should("match", /^[\d,.\s]+ DPS$/);
    cy.get("[data-test-team-plus-links]").should("contain.text", "wuwa_calc").and("contain.text", "this app's calculator");
    // Ciaccona and Chisa are not set up in the fixture: the panel says wuwa_calc ran them without a build of yours
    cy.get("[data-test-team-plus-unset]").should("contain.text", "not set up in the calculator").and("contain.text", "Chisa");
    cy.get('[data-test-team-plus-link="timeline"]').should("have.attr", "href").and("include", "/rotation#chars=").and("include", "tab=timeline");
    cy.get('[data-test-team-plus-link="energy"]').should("have.attr", "href", "/energy");
    cy.get('[data-test-team-plus-link="endgame"]').should("have.attr", "href", "/endgame");
    cy.get('[data-test-team-plus-link="cue"]').click();
    cy.location("pathname").should("eq", "/rotation");
    cy.location("hash").should("include", "chars=");
    cy.get('[data-test-rotation-block="loop1"]', ENGINE).should("be.visible");
    cy.get("[data-test-rotation-title]").should("contain.text", "Cartethyia");

    cy.visit("/teams", seed());
    openTeam(HAND_BUILT);
    cy.get('[data-test-team-plus-links][data-state="none"]', ENGINE).should("exist").and("not.be.visible");
  });

  // Ryan's #690 ships this panel with the test ids plus's own had, so after the 2026-11-09 sync both showed and each
  // button existed twice. Plus's is retired; what plus adds is in the presets his button opens.
  it("explains an empty Rotations panel once and puts the presets on screen", () => {
    cy.viewport(1280, 900);
    cy.visit("/", seed({ rotations: false }));
    cy.get('[data-test-calculator-nav="rotations"]').click();
    cy.get("[data-test-rotations-empty-state]").should("have.length", 1).and("be.visible").and("contain.text", "No rotations yet");
    cy.get("[data-test-rotations-empty]").should("not.exist");
    cy.get("[data-test-rotations-empty-presets]").should("have.length", 1).and("be.visible").click();
    cy.get("[data-test-rotations-presets-modal]").should("have.attr", "open");
    cy.get("[data-test-rotations-presets-cancel]").click();
    cy.get("[data-test-rotations-empty-create]").should("have.length", 1).click();
    cy.get("[data-test-rotations-empty-state]").should("not.exist");
  });

  // The darker crest stars on light themes once compiled to `html[data-theme-style="light"] { color: amber }` (a
  // `:global(html…) .toa-star` selector in scoped CSS keeps only the :global part), which turned every inherited text
  // on the site amber after a visit to /endgame.
  it("darkens the ToA crest stars on a light theme without colouring the rest of the site", () => {
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.viewport(412, 915);
    cy.visit("/endgame", {
      onBeforeLoad(win: Window) {
        const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
        settings.config = { ...settings.config, useClassicUi: false, theme: "light" };
        win.localStorage.setItem("settings", JSON.stringify(settings));
      },
    });
    cy.get("html").should("have.attr", "data-theme-style", "light");
    // the stars take the theme's warning colour made dark enough to read as text (a11y.css `--wt-text-wa`; it was a
    // flat #d97706, 2.95 : 1 on white), not DaisyUI's own warning yellow, and nothing else on the page turns amber
    const colourOf = (doc: Document, css: string): string => {
      const probe = doc.createElement("span");
      probe.style.color = css;
      doc.body.appendChild(probe);
      const colour = doc.defaultView!.getComputedStyle(probe).color;
      probe.remove();
      return colour;
    };
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-goals] .toa-star').first().should(($star) => {
      const doc = $star[0].ownerDocument;
      const star = doc.defaultView!.getComputedStyle($star[0]).color;
      expect(star, "the star's colour").to.eq(colourOf(doc, "var(--wt-text-wa)"));
      expect(star, "not DaisyUI's warning yellow").not.to.eq(colourOf(doc, "oklch(var(--wa))"));
    });
    cy.get('[data-test-toa-floor="hazard-1"]').then(($card) => {
      const doc = $card[0].ownerDocument;
      const win = doc.defaultView!;
      const amber = colourOf(doc, "var(--wt-text-wa)");
      expect(win.getComputedStyle(doc.documentElement).color, "the page's own text colour").not.to.eq(amber);
      expect(win.getComputedStyle($card[0]).color, "a floor card's text").not.to.eq(amber);
    });
  });

  it("names /energy and /rotation in the phone header, says has / needs on the chips and tells a bad link from a retired team", () => {
    cy.viewport(412, 915);
    cy.visit("/energy", seed({ fontScale: 1.3 }));
    cy.get("[data-test-nav-section-title]").should("have.text", "Energy check");
    // her build's ER against the loop's need (Ciaccona and Chisa are not set up: their chips say only what they need)
    cy.contains(`[data-test-energy-team="${MEASURED}"] .en-row__chip`, /has [\d.]+%/, ENGINE).should("contain.text", "needs");
    cy.visit("/rotation#team=AbCdEf", seed({ fontScale: 1.3 }));
    cy.get("[data-test-nav-section-title]").should("have.text", "Rotation cue cards");
    cy.get('[data-test-rotation-problem="code"]', ENGINE).should("contain.text", "Not a team link").and("contain.text", "Team rankings");
    cy.get('[data-test-rotation-problem="code"]').contains("Open on Team rankings").should("not.exist");
  });

  // 2026-11-02 (night critic item 17): the Teams list's tiles and cards are this app's calculator, the fight pages
  // wuwa_calc's; the list says so above its tiles. Phone first: 412 px at 130 % text, the line on screen and readable.
  it("says on the Teams list which engine its damage and DPS are, and fits a 412 px phone at 130 % text", () => {
    cy.viewport(412, 915);
    cy.visit("/teams", seed({ fontScale: 1.3 }));
    cy.get("[data-test-team-rotations-summary]", { timeout: 20000 }).should("be.visible");
    cy.get("[data-test-team-list-engine]")
      .should("be.visible")
      .and("contain.text", "this app's calculator")
      .and("contain.text", "wuwa_calc")
      .and("contain.text", "Energy check")
      .then(($note) => {
        const root = $note[0].ownerDocument.documentElement;
        const rect = $note[0].getBoundingClientRect();
        expect(rect.left, "left edge").to.be.at.least(0);
        expect(rect.right, "right edge").to.be.at.most(root.clientWidth);
        expect(root.scrollWidth, "no sideways scroll").to.be.at.most(root.clientWidth);
        // above the tiles it describes
        const tiles = $note[0].nextElementSibling!.getBoundingClientRect();
        expect(rect.bottom, "above the summary tiles").to.be.at.most(tiles.top);
      });
  });
});
