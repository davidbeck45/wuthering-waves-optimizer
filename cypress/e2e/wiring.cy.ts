// Wuthering Tools+ — the pages wired together (track "wiring", 2026-10-31): Explain buttons that open the assistant
// with the numbers attached, share buttons on /my-rankings rows, the command palette's "On this page" commands and
// per-character / per-team commands, /energy?team= focus, and the team Summary page computing its members through
// resolveTeamCharacters like the editor. No request ever reaches Anthropic (every call is intercepted and counted).
// v3, seeded through onBeforeLoad: the Cartethyia optimizer fixture, two armed teammates and one saved team with her
// rotation; her own Team Buffs panel names another teammate, so team-aware buffs change the team's numbers.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const TEAM_ID = "wr-t1";
const TEAM_NAME = "Cartethyia team";
const ENGINE = { timeout: 120000 };
/** a lazy chunk (the assistant panel, the share sheet, the palette) on a cold dev server */
const LAZY = { timeout: 30000 };

function account(): { character: string; inventory: string; teamRotations: string } {
  const character = JSON.parse(configOptimizer.data.character);
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  // her panel names Ciaccona + Rover, not the team's real Ciaccona + Chisa: team-aware buffs re-derive it
  character.characters.Cartethyia.teamBuffs.selectedCharacter2 = "RoverAeroFemale";
  const rotation = character.characters.Cartethyia.rotations[0];
  const actions = rotation.actions.map((a: { order: number; key: string; type: string; id: string }) => ({ slot: 0, order: a.order, key: a.key, type: a.type, count: 1, buffs: [], isDisabled: false, id: `wr-${a.id}` }));
  const enemyConfig = { enemyLevel: 100, enemyResist: 0.2, enemyType: "Calamity", enemyBrowserKey: null, spectroFrazzleStacks: 0, aeroErosionStacks: 0, havocBaneStacks: 0, fusionBurstStacks: 0, electroFlareStacks: 0, electroRageStacks: 0, glacioChafeStacks: 0, strainStacks: 0 };
  const team = { id: TEAM_ID, name: TEAM_NAME, characterIds: ["Cartethyia", "Ciaccona", "Chisa"], buildIds: [null, null, null], actions, duration: 20, enemyConfig };
  return {
    character: JSON.stringify(character),
    inventory: configOptimizer.data.inventory,
    teamRotations: JSON.stringify({ teams: [team], favoriteTeamIds: [], favoritePresetNames: [] }),
  };
}

function seed(options: { fontScale?: number } = {}) {
  const data = account();
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.setItem("character", data.character);
      win.localStorage.setItem("inventory", data.inventory);
      win.localStorage.setItem("teamRotations", data.teamRotations);
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

/** Fails the test on any request to Anthropic; returns the count for a final check. */
function noAnthropic(): { count: number } {
  const seen = { count: 0 };
  cy.intercept("https://api.anthropic.com/**", (req) => {
    seen.count += 1;
    req.reply({ statusCode: 500, body: "no request may reach Anthropic from this spec" });
  });
  return seen;
}

const averageOf = (text: string): number => Number((/Average:\s*([\d,]+)/.exec(text)?.[1] ?? "").replace(/,/g, ""));

describe("wiring: explain, share and the palette across the plus pages", () => {
  it("explains and shares a /my-rankings character row and a saved team row", () => {
    cy.viewport(1440, 900);
    const api = noAnthropic();
    cy.visit("/my-rankings", seed());
    cy.get('[data-test-my-rankings-row="Cartethyia"]', ENGINE).should("exist");
    cy.get('[data-test-my-rankings-expand="Cartethyia"]').click();
    cy.get('[data-test-my-rankings-actions="Cartethyia"]').should("exist");

    // Explain: no key yet → the setup; once a key is saved the question and the row's numbers wait in the composer
    cy.get('[data-test-explain="my-rankings:Cartethyia"]').should("contain.text", "Explain").click();
    cy.get("[data-test-ai-onboarding]", LAZY).should("be.visible");
    // above the key setup, the parked question says what waits and that nothing is sent yet
    cy.get("[data-test-ai-parked]").should("be.visible").and("contain.text", "Your question is ready").and("contain.text", "Nothing is sent until you tap Send");
    cy.get("[data-test-ai-parked-question]").invoke("text").should("match", /^Explain Cartethyia's ranking/);
    cy.get("[data-test-ai-parked-attachment]").should("contain.text", "Cartethyia on My roster rankings");
    cy.get("[data-test-ai-key-input]").type("sk-ant-api03-cypress-000000000000000000AbCd");
    cy.get("[data-test-ai-key-save]").click();
    cy.get("[data-test-ai-draft-attachment]").should("contain.text", "Cartethyia on My roster rankings");
    cy.get("[data-test-ai-input]").invoke("val").should("match", /^Explain Cartethyia's ranking/);
    cy.get("[data-test-ai-close]").click({ force: true });

    // Share build from the same row: the share sheet for her build
    cy.get('[data-test-my-rankings-actions="Cartethyia"] [data-test-share-button="Cartethyia"]').click();
    cy.get("dialog[open]", LAZY).should("contain.text", "Share Cartethyia's build");
    cy.get("dialog[open] [data-test-share-sheet-close]").click({ force: true });
    cy.get("dialog[open]").should("not.exist");

    // the saved team's row: Explain + Share; a stock preset row has nothing to share
    cy.get(`[data-test-my-rankings-team="${TEAM_NAME}"]`, ENGINE).within(() => {
      cy.get(`[data-test-share-button="team:${TEAM_ID}"]`).should("exist");
      cy.get(`[data-test-explain="my-rankings-team:${TEAM_NAME}"]`).should("exist");
    });
    cy.get("[data-test-my-rankings-team]").then(($rows) => {
      const shares = $rows.find("[data-test-share-button]").length;
      const yours = $rows.filter((_, r) => r.getAttribute("data-test-my-rankings-team") === TEAM_NAME).length;
      expect(shares, "share buttons only on saved teams").to.equal(yours);
    });
    cy.get(`[data-test-share-button="team:${TEAM_ID}"]`).click({ force: true });
    cy.get("dialog[open]", LAZY).should("contain.text", `Share team · ${TEAM_NAME}`);
    cy.get("dialog[open] [data-test-share-sheet-close]").click({ force: true });

    // the team row's Explain, on a fresh visit (the key lives in this tab's sessionStorage, which the seed clears: with a
    // key stored, Explain would send at once)
    cy.visit("/my-rankings", seed());
    cy.get(`[data-test-explain="my-rankings-team:${TEAM_NAME}"]`, ENGINE).click({ force: true });
    cy.get("[data-test-ai-onboarding]", LAZY).should("be.visible");
    // the parked card's × forgets the question; Explain parks it again
    cy.get("[data-test-ai-parked-forget]").click();
    cy.get("[data-test-ai-parked]").should("not.exist");
    cy.get("[data-test-ai-close]").click({ force: true });
    cy.get(`[data-test-explain="my-rankings-team:${TEAM_NAME}"]`).click({ force: true });
    cy.get("[data-test-ai-parked-attachment]").should("contain.text", "Team · Cartethyia + Ciaccona + Chisa on My roster rankings");
    cy.get("[data-test-ai-key-input]").type("sk-ant-api03-cypress-000000000000000000AbCd");
    cy.get("[data-test-ai-key-save]").click();
    cy.get("[data-test-ai-draft-attachment]").should("contain.text", "Team · Cartethyia + Ciaccona + Chisa on My roster rankings");
    cy.get("[data-test-ai-input]").invoke("val").should("match", /^Explain the team "Cartethyia team"/);
    cy.then(() => expect(api.count, "requests to Anthropic").to.equal(0));
  });

  it("palette: the open team's commands first, a page's #chars= context, /energy?team= focus, share from anywhere", () => {
    cy.viewport(1440, 900);
    const api = noAnthropic();
    cy.visit("/teams", seed());
    cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).click();
    cy.get("[data-test-team-rotation-editor]").should("exist");
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-item]", LAZY).first().should("have.attr", "data-test-palette-item", `context:team:${TEAM_ID}:rotation`);
    cy.get("[data-test-palette-list]").should("contain.text", "On this page").and("contain.text", "Energy check for this team").and("contain.text", "Share this team");
    cy.get(`[data-test-palette-item="context:team:${TEAM_ID}:rotation"]`).click();
    cy.location("pathname").should("eq", "/rotation");
    cy.location("hash").should("eq", "#chars=Cartethyia,Ciaccona,Chisa");

    // on /rotation the composition is read off #chars= and matched to the saved team
    cy.get("body").type("{ctrl}k");
    cy.get(`[data-test-palette-item="context:team:${TEAM_ID}:open"]`).should("exist");
    cy.get(`[data-test-palette-item="context:team:${TEAM_ID}:rotation"]`).should("not.exist");
    cy.get(`[data-test-palette-item="context:team:${TEAM_ID}:energy"]`).click();
    cy.location("pathname").should("eq", "/energy");
    cy.location("search").should("eq", `?team=${TEAM_ID}`);
    cy.get("[data-wt-focused]", ENGINE).should("have.attr", "data-test-energy-team-id", TEAM_ID);

    // run from /energy itself (the page stays mounted, only the query changes): it still finds and outlines the team
    cy.get("[data-wt-focused]").then(($el) => $el[0].removeAttribute("data-wt-focused"));
    cy.get("body").type("{ctrl}k");
    cy.get('[data-test-palette-item="page:/energy"]', LAZY).click();
    cy.location("search").should("eq", "");
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]").type("energy check cart");
    cy.get(`[data-test-palette-item="command:team:${TEAM_ID}:energy"]`).click();
    cy.location("search").should("eq", `?team=${TEAM_ID}`);
    cy.get("[data-wt-focused]", ENGINE).should("have.attr", "data-test-energy-team-id", TEAM_ID);

    // a typed command: share a character's build without leaving the page
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]").type("share cart");
    cy.get("[data-test-palette-item]").first().should("have.attr", "data-test-palette-item", "command:character:Cartethyia:share");
    cy.get("[data-test-palette-input]").type("{enter}");
    cy.get("dialog[open]", LAZY).should("contain.text", "Share Cartethyia's build");
    cy.location("pathname").should("eq", "/energy");
    cy.then(() => expect(api.count, "requests to Anthropic").to.equal(0));
  });

  it("the team Summary page reads the same total as the editor, with team-aware buffs on and off", () => {
    cy.viewport(1440, 900);
    cy.visit("/teams", seed());
    cy.get(`[data-test-team-rotations-item="${TEAM_NAME}"]`).click();
    // off under Cypress by default (upstream's numbers): the Summary is upstream's own
    cy.get("[data-test-auto-team-buffs]").should("not.be.checked");
    cy.get("[data-test-team-rotation-summary]").should(($h) => expect(averageOf($h.text()), "the editor has scored the team").to.be.greaterThan(0));
    cy.get("[data-test-team-rotation-summary]").invoke("text").then((offText) => {
      const off = averageOf(offText);
      expect(off, "editor average, buffs off").to.be.greaterThan(0);
      cy.get("[data-test-auto-team-buffs]").check({ force: true });
      cy.get("[data-test-team-rotation-summary]").should(($h) => expect(averageOf($h.text())).not.to.equal(off));
      cy.get("[data-test-team-rotation-summary]").invoke("text").then((onText) => {
        const on = averageOf(onText);
        cy.get("[data-test-team-rotation-summary-view-summary]").first().click({ force: true });
        cy.get("[data-test-team-rotation-summary-stats]").should(($s) => expect(averageOf($s.text()), "summary = editor, buffs on").to.equal(on));
        cy.get("[data-test-team-rotation-summary-back]").click();
        cy.get("[data-test-auto-team-buffs]").uncheck({ force: true });
        cy.get("[data-test-team-rotation-summary-view-summary]").first().click({ force: true });
        cy.get("[data-test-team-rotation-summary-stats]").should(($s) => expect(averageOf($s.text()), "summary = editor, buffs off").to.equal(off));
      });
    });
  });

  for (const [width, height] of [[412, 915], [360, 800]]) {
    it(`fits a ${width} px phone at 130 % text: the row's actions, the team row's words`, () => {
      cy.viewport(width, height);
      noAnthropic();
      cy.visit("/my-rankings", seed({ fontScale: 1.3 }));
      cy.get('[data-test-my-rankings-row="Cartethyia"]', ENGINE).should("exist");
      cy.get('[data-test-my-rankings-expand="Cartethyia"]').click();
      cy.get(`[data-test-my-rankings-team="${TEAM_NAME}"]`, ENGINE).should("exist");
      // the saved team's row carries all four buttons (Explain, Share, build, ↗): the last one ran past 360 px once
      for (const sel of ['[data-test-explain="my-rankings:Cartethyia"]', '[data-test-my-rankings-actions="Cartethyia"] [data-test-share-button]', `[data-test-explain="my-rankings-team:${TEAM_NAME}"]`, `[data-test-share-button="team:${TEAM_ID}"]`, `[data-test-my-rankings-team-mine-link="${TEAM_NAME}"]`]) {
        cy.get(sel).scrollIntoView();
        cy.get(sel).should(($el) => {
          const r = $el[0].getBoundingClientRect();
          expect(r.left, `${sel} left`).to.be.at.least(0);
          expect(r.right, `${sel} right`).to.be.at.most(width);
        });
      }
      // on a phone the team row's new buttons carry words, not just an icon
      cy.get(`[data-test-explain="my-rankings-team:${TEAM_NAME}"]`).should("contain.text", "Explain").find("span").should("be.visible");
      // the team's number keeps its unit and its member-share bar (the bar had 0 px beside the number + unit), and the
      // number stays inside its cell
      cy.get(`[data-test-my-rankings-team="${TEAM_NAME}"]`).within(() => {
        cy.get(".mr-tdmg__unit").should("be.visible").and("contain.text", "team avg DMG / rotation");
        cy.get(".mr-stack").should(($bar) => expect($bar[0]!.getBoundingClientRect().width, "member-share bar width").to.be.greaterThan(100));
        cy.get(".tcell--dmg").then(($cell) => {
          const cell = $cell[0]!.getBoundingClientRect();
          cy.get(".mr-tdmg__value").should(($v) => expect($v[0]!.getBoundingClientRect().right, "number inside its cell").to.be.at.most(cell.right + 0.5));
        });
      });
      cy.document().then((doc) => {
        expect(doc.documentElement.scrollWidth, "page width").to.be.at.most(doc.documentElement.clientWidth);
      });
    });
  }
});
