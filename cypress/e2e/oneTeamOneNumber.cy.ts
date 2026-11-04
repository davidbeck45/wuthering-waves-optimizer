// Wuthering Tools+ — "one team, one number" (track fix-numbers, 2026-11-02; src/sim/display/numberBasis.ts): one team
// reads one name and, where two figures should agree, one number across pages; where they legitimately differ, the
// page says on what basis. v3 UI, seeded through onBeforeLoad with the assistant's test account (src/sim/ai/__fixtures__/
// aiAccount.json: Aemeath, Mornye, Lynae and their echoes, one saved wuwa_calc team, trimmed from a real export and
// already part of the unit tests) and, for the re-roll advisor, the Echo Lab fixture.
import * as aiModule from "../../src/sim/ai/__fixtures__/aiAccount.json";
import * as labModule from "../../src/sim/echoLab/__fixtures__/echoLabAccount.json";

// Cypress's webpack hands JSON over as the module itself (no default export)
type AiAccount = { data: { character: Record<string, unknown>; inventory: Record<string, unknown>; teamRotations: { teams: Array<Record<string, unknown>> } } };
type LabAccount = { characters: Record<string, unknown>; echoes: unknown[]; equipped: Record<string, unknown> };
const ai = ((aiModule as unknown as { default?: AiAccount }).default ?? aiModule) as unknown as AiAccount;
const lab = ((labModule as unknown as { default?: LabAccount }).default ?? labModule) as unknown as LabAccount;

const TEAM_ID = "ay50jixqddo";
const ONE_NAME = "Aemeath · Mornye + Lynae";
const RAW_NAME = "wuwa_calc Aemeath S6R5 DPS · S1R1/S6R1 team · Mornye + Lynae";
const ENGINE = { timeout: 120000 };
const LAZY = { timeout: 30000 };

function seed(options: { fontScale?: number; account?: "ai" | "lab" } = {}) {
  const { fontScale, account = "ai" } = options;
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      if (account === "ai") {
        win.localStorage.setItem("character", JSON.stringify(ai.data.character));
        win.localStorage.setItem("inventory", JSON.stringify(ai.data.inventory));
        win.localStorage.setItem("teamRotations", JSON.stringify({ ...ai.data.teamRotations, favoriteTeamIds: [], favoritePresetNames: [] }));
      } else {
        win.localStorage.setItem("character", JSON.stringify({ characters: lab.characters, activeCharacter: "Cartethyia" }));
        win.localStorage.setItem("inventory", JSON.stringify({ echoes: lab.echoes, equipped: lab.equipped, echoPresets: [], equippedPresets: {} }));
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

const intOf = (s: string): number => Number(s.replace(/[^\d]/g, ""));

describe("one team, one number", () => {
  it("Build my team reads Mornye's Energy Regen on the Energy check's basis, and says it counts her inherent", () => {
    cy.viewport(1440, 900);
    cy.visit(`/build-team?team=${TEAM_ID}`, seed());
    // the plan card: wuwa_calc's 260 % kit floor against the same 287.0 % /energy and `cli er` print (277.0 % before)
    cy.get('[data-test-build-team-plan="Mornye"] .bt-er__hint', ENGINE).should("contain.text", "you have 287.0").and("contain.text", "incl. +10 % inherent");
    cy.get('[data-test-build-team-plan="Mornye"] [data-test-build-team-er-kit]').should("have.attr", "title").and("match", /build card and Build history leave it out/);
    cy.get('[data-test-build-team-plan="Lynae"] .bt-er__hint').should("contain.text", "you have").find("[data-test-build-team-er-kit]").should("not.exist");
  });

  it("Build my team's saved line names the team one way, not by its stored name", () => {
    cy.viewport(1440, 900);
    cy.visit(`/build-team?team=${TEAM_ID}`, seed());
    cy.get('[data-test-build-team][data-phase="plan"]', ENGINE).should("exist");
    cy.get("[data-test-build-team-run]").click();
    cy.get('[data-test-build-team][data-phase="result"]', ENGINE).should("exist");
    cy.get('[data-test-build-team-result][data-status="ok"]', ENGINE).first().invoke("attr", "data-test-build-team-result").then((id) => {
      cy.get(`[data-test-build-team-save-slot="${id}"]`).check({ force: true });
    });
    cy.get("[data-test-build-team-save]").click();
    cy.get(".confirm-dialog .modal-action .btn-primary").click();
    cy.get("[data-test-build-team-saved]").should("contain.text", `pinned in “${ONE_NAME}”`).and("not.contain.text", RAW_NAME);
  });

  it("the Teams editor's share bar splits the same average damage its header totals", () => {
    cy.viewport(1440, 900);
    cy.visit("/teams", seed());
    cy.get(`[data-test-team-rotations-item="${RAW_NAME}"]`, LAZY).click();
    cy.get("[data-test-team-rotation-summary]", ENGINE).should(($h) => expect(intOf(/Average:\s*([\d,]+)/.exec($h.text())?.[1] ?? "0"), "the editor has scored the team").to.be.greaterThan(0));
    cy.get("[data-test-team-rotation-summary]").invoke("text").then((text) => {
      const average = intOf(/Average:\s*([\d,]+)/.exec(text)![1]!);
      const normal = intOf(/Normal:\s*([\d,]+)/.exec(text)![1]!);
      expect(average, "average differs from non-crit").to.be.greaterThan(normal);
      // each segment's title is "<name>: <its damage> (<share>%)": the three add up to the Average, not the Normal
      cy.get("[data-test-team-rotation-summary] [data-test-team-rotation-damage-bar-segment]").then(($segs) => {
        const sum = [...$segs].reduce((n, el) => n + intOf(/:\s*([\d,]+)\s*\(/.exec(el.getAttribute("title") ?? "")?.[1] ?? "0"), 0);
        expect(Math.abs(sum - average), `segments ${sum} vs Average ${average}`).to.be.at.most(3);
      });
    });
  });

  it("on a phone: the palette, the share sheet over /rotation and /energy name the team one way, and the sheet says whose number its card carries", () => {
    cy.viewport(412, 915);
    cy.visit("/rotation#chars=Aemeath,Mornye,Lynae", seed({ fontScale: 1.3 }));
    cy.get("body").type("{ctrl}k");
    cy.get("[data-test-palette-input]", LAZY).type("aemeath mornye");
    cy.get(`[data-test-palette-item="team:${TEAM_ID}"]`).should("contain.text", ONE_NAME).and("contain.text", "main DPS S6R5").and("not.contain.text", "wuwa_calc Aemeath");
    cy.get("[data-test-palette-input]").clear().type("share this team");
    cy.get(`[data-test-palette-item="context:team:${TEAM_ID}:share"]`).click();
    cy.get("dialog[open]", LAZY).should("contain.text", `Share team · ${ONE_NAME}`).and("not.contain.text", "wuwa_calc Aemeath");
    // the card carries this app's number; /rotation shows wuwa_calc's: the sheet says so once the engine has scored it
    cy.get("[data-test-share-engine-note]", ENGINE).should("be.visible").and("contain.text", "this app's engine");
    cy.get("[data-test-share-team-card]").should("contain.text", ONE_NAME).and("contain.text", "main DPS S6R5 · supports S1R1 / S6R1");
    cy.get("dialog[open] h3").should(($h) => expect($h[0]!.getBoundingClientRect().height, "sheet title lines").to.be.lessThan(80));
    cy.get("[data-test-share-sheet-close]").click();

    cy.visit("/energy", seed({ fontScale: 1.3 }));
    cy.get(`[data-test-energy-team-id="${TEAM_ID}"] .en-card__title`, ENGINE).should("have.text", ONE_NAME).and("have.attr", "title", RAW_NAME);
    expectNoHorizontalScroll("/energy");
  });

  it("on a phone: /account and /energy say why the two engines differ, and the /share and /rotation pickers name the team one way", () => {
    cy.viewport(412, 915);
    cy.visit("/account", seed({ fontScale: 1.3 }));
    // no hover on a phone: the reason is a tap away, under the links to the other engine's figure
    cy.get("[data-test-account-hero-why] summary", ENGINE).should("be.visible").click();
    cy.get("[data-test-account-hero-why] p").should("be.visible").and("contain.text", "two different simulations");
    expectNoHorizontalScroll("/account");

    cy.visit("/energy", seed({ fontScale: 1.3 }));
    cy.get("[data-test-energy-help] summary", ENGINE).click();
    cy.get("[data-test-energy-why]").should("be.visible").and("contain.text", "two different simulations");

    cy.visit("/share", seed({ fontScale: 1.3 }));
    cy.get("[data-test-share-pick-team] option", LAZY).first().should("contain.text", ONE_NAME).and("contain.text", "main DPS S6R5").and("not.contain.text", "wuwa_calc Aemeath");

    cy.visit("/rotation", seed({ fontScale: 1.3 }));
    cy.get("[data-test-rotation-picker-team]", ENGINE).first().should("contain.text", ONE_NAME).and("contain.text", "main DPS S6R5").and("not.contain.text", "wuwa_calc Aemeath");
    expectNoHorizontalScroll("/rotation");
  });

  it("/rankings on My account says what its rows run on, on a phone and on a desktop", () => {
    cy.viewport(412, 915);
    cy.visit("/rankings#tc=mine", seed({ fontScale: 1.3 }));
    // a phone keeps the bar to two rows: the line sits in ⋯, under the Substats pick it points to
    cy.get("[data-test-rankings-account-bar] > [data-test-rankings-basis]", LAZY).should("not.exist");
    cy.get("[data-test-rankings-menu]", LAZY).click();
    cy.get("[data-test-rankings-pop] [data-test-rankings-basis]").should("be.visible").and("contain.text", "ChemX32 substats, not your echoes").and("contain.text", "pick My builds above");
    cy.get("[data-test-rankings-menu]").click();
    expectNoHorizontalScroll("/rankings 412");
    cy.viewport(1440, 900);
    cy.visit("/rankings#tc=mine&sb=m", seed());
    cy.get("[data-test-rankings-basis]", LAZY).should("contain.text", "echoes each character wears").and("contain.text", "this app's engine");
    // Riley's heading in words, each figure's seconds called a loop
    cy.get(".skittle-root .tgrid .c.dprhead", ENGINE).should("have.text", "Avg damage / rotation");
    // his loop time is the last of the four rotations and his DPS divides by all four: the heading says so
    cy.get(".skittle-root .tgrid .c.dprhead").should("have.attr", "title").and("match", /the last of the four took; DPS divides by the time all four took/);
    cy.get(".skittle-root .tgrid .c.teamdpr .looptime", ENGINE).first().then(($s) => {
      expect(getComputedStyle($s[0]!, "::after").content).to.equal('" loop"');
    });
    // Riley's tiers carry no such line
    cy.get("[data-test-rankings-riley]").click();
    cy.get("[data-test-rankings-basis]").should("not.exist");
  });

  it("the re-roll advisor's chips follow the plan it headlines", () => {
    cy.viewport(1440, 900);
    cy.visit("/echo-lab?tab=reroll&character=Galbrena", seed({ account: "lab" }));
    cy.get("[data-test-echo-lab-reroll-echo]", ENGINE).should("have.length", 5);
    cy.get("[data-test-echo-lab-reroll-loading]", ENGINE).should("not.exist");
    cy.get('[data-test-echo-lab-reroll-line="pending"]', ENGINE).should("not.exist");
    cy.get("[data-test-echo-lab-reroll-echo]").each(($card) => {
      const lines = $card.find("[data-test-echo-lab-reroll-line]");
      if (lines.length < 5) return;
      const plan = $card.find("[data-test-echo-lab-reroll-plan] .font-semibold").first().text();
      const rerolls = lines.filter('[data-test-echo-lab-reroll-line="reroll"]').length;
      const locks = lines.filter('[data-test-echo-lab-reroll-line="lock"]').length;
      if (!plan) {
        // "Keep as is": no chip asks for a re-roll
        expect(lines.filter('[data-test-echo-lab-reroll-line="keep"]').length, "keep chips").to.equal(5);
        return;
      }
      const m = /^(?:Lock (\d), re-roll (\d)|Re-roll all (\d))$/.exec(plan.trim());
      expect(m, plan).to.not.equal(null);
      expect(locks, `${plan}: lock chips`).to.equal(Number(m![1] ?? 0));
      expect(rerolls, `${plan}: re-roll chips`).to.equal(Number(m![2] ?? m![3]));
      expect($card.find("[data-test-echo-lab-reroll-plan-lines]").text()).to.match(/^Re-roll .+\.$/);
    });
  });
});
