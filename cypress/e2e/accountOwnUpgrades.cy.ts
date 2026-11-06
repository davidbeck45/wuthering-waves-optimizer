// Wuthering Tools+: /account's "With what you own" (src/sim/account/AccountOwnUpgrades.vue, ownUpgrades.ts,
// echoCheck.ts) in the v3 UI. Public data only: upstream's Cartethyia golden fixture with two of her five echoes taken
// off (they sit unworn in the inventory, so the inventory holds a better build), two armed teammates (Ciaccona, Chisa)
// and a saved team of the three built from the shipped wuwa_calc team preset. "Check my echoes" runs on demand with
// progress and Cancel, is kept for the tab, its row opens /build-team on that team with only her re-geared, that page's
// run prints the same own figure, and its save writes her new build alone behind a confirm.
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as teamPresetsModule from "../../src/sim/presets/data/teams.json";

type Preset = { name: string; data: { characterIds: string[]; actions: Array<Record<string, unknown>>; duration: number | null; enemyConfig?: Record<string, unknown>; handoffs?: Record<string, string[]> } };
const teamPresets = ((teamPresetsModule as unknown as { default?: Preset[] }).default ?? teamPresetsModule) as unknown as Preset[];
const preset = teamPresets.find((p) => ["Cartethyia", "Ciaccona", "Chisa"].every((k) => p.data.characterIds.includes(k)))!;

const TEAM_ID = "owncy1";
const RUN = { timeout: 120000 };
const CHECK_KEY = "wtplus:account:echoCheck";

function seed(options: { fontScale?: number; tuners?: number; noSavedTeam?: boolean } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  const inventory = JSON.parse(configOptimizer.data.inventory);
  // slots 4 and 5 go back to the inventory: unworn echoes a re-gear can use
  const cart = character.characters.Cartethyia;
  for (const slot of ["3", "4"]) {
    delete inventory.equipped[cart.echoes[slot].echoId];
    cart.echoes[slot].echoId = null;
  }
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  const team = {
    id: TEAM_ID,
    name: "Cartethyia + Ciaccona + Chisa (own test)",
    characterIds: preset.data.characterIds,
    buildIds: [null, null, null],
    actions: preset.data.actions.map((a, i) => ({ ...a, id: `a${i}` })),
    duration: preset.data.duration,
    enemyConfig: preset.data.enemyConfig ?? {},
    handoffs: preset.data.handoffs ?? null,
  };
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear(); // score and check on this visit, never a previous test's cache
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", JSON.stringify(inventory));
      win.localStorage.setItem("teamRotations", JSON.stringify({ teams: options.noSavedTeam ? [] : [team], favoriteTeamIds: [], favoritePresetNames: [] }));
      win.localStorage.removeItem("wtplus:buildTeam:options:v1");
      if (options.tuners != null) win.localStorage.setItem("wtplus:echoLab:tunerBudget", JSON.stringify({ v: 1, tuners: options.tuners, exp: null, weeklyTuners: null, weeklyExp: null }));
      else win.localStorage.removeItem("wtplus:echoLab:tunerBudget");
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

function expectNoHorizontalScroll(what: string, width: number): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    expect(win.innerWidth, `${what} layout viewport`).to.eq(width);
  });
}

/** waits for the roster ranking (the button turns on), runs the check, waits for it to finish */
function runCheck(): void {
  cy.get("[data-test-account-own-check]", RUN).should("not.be.disabled").click();
  cy.get('[data-test-account-own][data-state="done"]', RUN).should("exist");
}

const CART = '[data-test-account-own-row="Cartethyia:echoes"]';

describe("my account: with what you own", () => {
  it("asks for Tuners without a figure, re-gears each character from the inventory on demand, and keeps the check for the tab", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    cy.get("[data-test-account-own]").should("have.attr", "data-state", "idle");
    cy.get("[data-test-account-own-idle]").should("contain.text", "Check my echoes");
    // no Tuners entered: one row that says where to enter them, with no number
    cy.get('[data-test-account-own-row="tuner:enter"]').should("contain.text", "Enter your Tuners in Echo Lab").within(() => {
      cy.get("[data-test-account-own-gain], [data-test-account-own-figure]").should("not.exist");
    });
    cy.get('[data-test-account-own-go="tuner:enter"]').should("have.attr", "href", "/echo-lab?tab=plan");

    runCheck();
    cy.get("[data-test-account-own-summary]").should("contain.text", "Checked 3 of 3").and("contain.text", "can wear better echoes");
    cy.get(CART)
      .should("contain.text", "Better echoes from your inventory")
      .and("contain.text", "swap")
      .and("contain.text", "nobody wears")
      .and("contain.text", "avg damage per rotation");
    // the team figure first (her strongest team you can field, re-scored the rankings' way), the own figure beside it
    cy.get(`${CART} [data-test-account-own-gain]`).invoke("text").should("match", /^[+−-]\d+\.\d%$/);
    cy.get(`${CART} .own-row__scope`).should("have.text", "team");
    cy.get(CART).invoke("attr", "data-own").then((own) => expect(Number(own)).to.be.greaterThan(0.01));
    cy.get(`[data-test-account-own-go="Cartethyia:echoes"]`)
      .should("contain.text", "Open Build my team")
      .invoke("attr", "href")
      .should("match", /^\/build-team\?(team=|members=)[^&]+&only=Cartethyia$/);
    cy.window().then((win) => expect(win.sessionStorage.getItem(CHECK_KEY), "kept for the tab").to.contain("Cartethyia:echoes"));

    // the drawer carries her row, with the way on
    cy.get(`${CART} .own-row__main`).click();
    cy.get("[data-test-account-drawer]").should("have.attr", "open");
    cy.get('[data-test-account-drawer-own-row="Cartethyia:echoes"]').should("contain.text", "Better echoes from your inventory").and("contain.text", "team");
    cy.get('[data-test-account-drawer-own-go="Cartethyia:echoes"]').should("contain.text", "Open Build my team");
    cy.get("[data-test-account-drawer-close]").click();
    cy.get("[data-test-account-drawer]").should("not.have.attr", "open");

    // a reload shows the same check from the tab's cache, without running it
    cy.reload();
    cy.get('[data-test-account-own][data-state="done"]', RUN).should("exist");
    cy.get("[data-test-account-own-summary]").should("contain.text", "kept for this tab");
    cy.get(CART).should("exist");
    cy.get("[data-test-account-own-check]").should("contain.text", "Check again");
  });

  it("opens /build-team on that team with only her re-geared, and that run prints the row's own figure", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    runCheck();
    cy.get(CART)
      .invoke("attr", "data-own")
      .then((own) => {
        const expected = Number(own) * 100;
        cy.get('[data-test-account-own-go="Cartethyia:echoes"]').click();
        cy.location("pathname").should("eq", "/build-team");
        cy.location("search").should("contain", "only=Cartethyia");
        cy.get("[data-test-build-team-only]", RUN).should("contain.text", "Re-gearing only").and("contain.text", "Cartethyia");
        // only her plan; the teammates keep their echoes
        cy.get("[data-test-build-team-plan]").should("have.length", 1).and("have.attr", "data-test-build-team-plan", "Cartethyia");
        cy.get("[data-test-build-team-run]").click();
        cy.get('[data-test-build-team-result="Cartethyia"] [data-test-build-team-delta]', RUN)
          .invoke("text")
          .then((text) => {
            const shown = Number(text.replace("−", "-").replace(/[^0-9.+-]/g, ""));
            expect(shown, `Δ on /build-team (${text}) vs the row's own ${expected.toFixed(2)} %`).to.be.closeTo(expected, 0.051);
          });
        cy.get("[data-test-build-team-result]").should("have.length", 1);
        // "Build the whole team" drops ?only= and plans every member
        cy.get("[data-test-build-team-whole]").click();
        cy.location("search").should("not.contain", "only=");
        cy.get("[data-test-build-team-plan]", RUN).should("have.length", 3);
      });
  });

  it("prints a preset team's row figure on the page it opens, and keeps that review through Back and Forward", () => {
    const signed = (text: string): number => Number(text.replace("−", "-").replace(/[^0-9.+-]/g, ""));
    cy.viewport(1440, 900);
    cy.visit("/account", seed({ noSavedTeam: true }));
    runCheck();
    cy.get(CART)
      .invoke("attr", "data-team")
      .then((team) => {
        const expected = Number(team) * 100;
        cy.get('[data-test-account-own-go="Cartethyia:echoes"]').click();
        cy.location("search").should("contain", "rankedTeam=");
        cy.get("[data-test-build-team-run]", RUN).click();
        // no saved team, so no Team rotation tile: the +N % team the row showed was nowhere on this page
        cy.get("[data-test-build-team-team-total]", RUN).should("not.exist");
        cy.get("[data-test-build-team-ranked-delta]", RUN)
          .invoke("text")
          .then((text) => {
            expect(signed(text), `team figure on /build-team (${text}) vs the row's ${expected.toFixed(2)} %`).to.be.closeTo(expected, 0.051);
          });
        // Back leaves the review, Forward finds it: it dropped to step 1 and cost a re-run
        cy.go("back");
        cy.location("pathname").should("eq", "/account");
        cy.go("forward");
        cy.location("pathname").should("eq", "/build-team");
        cy.get("[data-test-build-team-save]", RUN).should("be.visible");
        cy.get("[data-test-build-team-ranked-delta]").invoke("text").then((text) => expect(signed(text)).to.be.closeTo(expected, 0.051));
        // Build the whole team is another run: the figure was for the row's
        cy.get("[data-test-build-team-rebuild]").click();
        cy.get("[data-test-build-team-whole]").click();
        cy.location("search").should("not.contain", "rankedTeam=");
        cy.get("[data-test-build-team-plan]", RUN).should("have.length", 3);
      });
  });

  it("saves her build and nobody else's, only after the confirm; the old rows go, and undo puts everything back", () => {
    type Stored = { chars: Record<string, { activeBuildId?: string; echoes?: unknown; builds?: Array<{ id: string; name: string }> }>; inventory: unknown; buildIds: Array<string | null> };
    const stored = (win: Window): Stored => ({
      chars: JSON.parse(win.localStorage.getItem("character")!).characters,
      inventory: JSON.parse(win.localStorage.getItem("inventory")!),
      buildIds: JSON.parse(win.localStorage.getItem("teamRotations")!).teams.find((t: { id: string }) => t.id === TEAM_ID).buildIds,
    });
    const built = (s: Stored): number => (s.chars.Cartethyia!.builds ?? []).filter((b) => /^Built for /.test(b.name)).length;
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    runCheck();
    cy.get('[data-test-account-own-go="Cartethyia:echoes"]').click();
    cy.get('[data-test-build-team][data-phase="plan"]', RUN).should("exist");
    cy.window().then((win) => cy.wrap(JSON.stringify(stored(win))).as("before"));
    cy.get("[data-test-build-team-run]").click();
    cy.get("[data-test-build-team-save]", RUN).should("contain.text", "Save 1 team build").click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "Built for");
    // the dialog is up: nothing written yet
    cy.window().then((win) => cy.get("@before").then((raw) => expect(JSON.stringify(stored(win))).to.eq(raw)));
    cy.get(".confirm-dialog .modal-action .btn-primary").click();
    cy.get("[data-test-build-team-saved]").should("exist");
    cy.window().then((win) =>
      cy.get("@before").then((raw) => {
        const before = JSON.parse(raw as unknown as string) as Stored;
        const after = stored(win);
        expect(built(after), "one new build").to.eq(built(before) + 1);
        // a new build beside the old one: what she wears now, the teammates and the inventory stay as they were. The
        // fixture's record has no builds, so the save also gives it one for what she wears (ensureCharacterBuilds):
        // the active build may be that one, never the new one
        const fresh = after.chars.Cartethyia!.builds!.find((x) => /^Built for /.test(x.name))!;
        expect(after.chars.Cartethyia!.activeBuildId).not.to.eq(fresh.id);
        expect(after.chars.Cartethyia!.echoes).to.deep.eq(before.chars.Cartethyia!.echoes);
        expect(after.chars.Ciaccona).to.deep.eq(before.chars.Ciaccona);
        expect(after.chars.Chisa).to.deep.eq(before.chars.Chisa);
        expect(after.inventory).to.deep.eq(before.inventory);
      }),
    );
    // back on /account the check no longer matches the data: its rows are gone, never served as today's
    cy.visit("/account", { onBeforeLoad: () => undefined });
    cy.get("[data-test-account-own-check]", RUN).should("not.be.disabled");
    cy.get('[data-test-account-own][data-state="idle"]').should("exist");
    cy.get(CART).should("not.exist");
    // undo from the page: the build is gone, the pin is back
    cy.visit(`/build-team?team=${TEAM_ID}`, { onBeforeLoad: () => undefined });
    cy.get("[data-test-build-team-undo]", RUN).click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get("[data-test-build-team-undo]").should("not.exist");
    cy.window().then((win) =>
      cy.get("@before").then((raw) => {
        const before = JSON.parse(raw as unknown as string) as Stored;
        const after = stored(win);
        expect(built(after), "the build is gone").to.eq(built(before));
        expect(after.chars.Cartethyia).to.deep.eq(before.chars.Cartethyia);
        expect(after.buildIds).to.deep.eq(before.buildIds);
        expect(after.inventory).to.deep.eq(before.inventory);
      }),
    );
  });

  it("stops when cancelled, says so and keeps nothing, and keyboard focus stays on the button through both", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    cy.get("[data-test-account-own-check]", RUN).should("not.be.disabled").focus().click();
    cy.get("[data-test-account-own-cancel]").should("be.visible").and("have.focus").click();
    cy.get('[data-test-account-own][data-state="done"]', RUN).should("exist");
    cy.get("[data-test-account-own-summary]").should("contain.text", "stopped early, not kept");
    cy.get("[data-test-account-own-check]").should("contain.text", "Check my echoes").and("have.focus");
    cy.window().then((win) => expect(win.sessionStorage.getItem(CHECK_KEY)).to.eq(null));
  });

  it("says so on the way back when leaving the page stopped a check, and a new check takes the note away", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed());
    cy.get("[data-test-account-own-check]", RUN).should("not.be.disabled").click();
    cy.get("[data-test-account-own-cancel]").should("be.visible");
    // leave mid-run, the way a link does (a nav tap takes two commands, and the check can end between them)
    cy.window().then((win) => {
      win.history.pushState({}, "", "/today");
      win.dispatchEvent(new PopStateEvent("popstate"));
    });
    cy.location("pathname").should("eq", "/today");
    cy.get("[data-test-account-own]").should("not.exist");
    cy.go("back");
    cy.location("pathname").should("eq", "/account");
    // it read as if no check had ever run; Cancel does say how far it got
    cy.get("[data-test-account-own-left]", RUN).should("contain.text", "stopped when you left this page");
    cy.get("[data-test-account-own-check]", RUN).should("not.be.disabled").click();
    cy.get('[data-test-account-own][data-state="done"]', RUN).should("exist");
    cy.get("[data-test-account-own-left]").should("not.exist");
    // and a finished check isn't told it was stopped when the page is left and found again
    cy.get("[data-test-nav-rankings]").click();
    cy.get('[data-test-nav-plus-page="/my-rankings"]').click();
    cy.location("pathname").should("eq", "/my-rankings");
    cy.go("back");
    cy.get('[data-test-account-own][data-state="done"]', RUN).should("exist");
    cy.get("[data-test-account-own-left]").should("not.exist");
  });

  it("lists the Tuner plan's steps the Tuners you entered cover, never a team figure for them", () => {
    cy.viewport(1440, 900);
    cy.visit("/account", seed({ tuners: 400 }));
    cy.get('[data-test-account-own-row="tuner:pending"]').should("contain.text", "What your 400 Tuners buy");
    runCheck();
    // the plan is worked out in the Echo Lab worker beside the check: the pending row gives way to its steps
    cy.get('[data-test-account-own-row="tuner:pending"]', RUN).should("not.exist");
    // rows without a team figure sit under the divider, past the first four
    cy.get("body").then(($body) => {
      if ($body.find("[data-test-account-own-more]").length) cy.get("[data-test-account-own-more]").click();
    });
    cy.get('[data-test-account-own-row^="tuner:"]', RUN).should("have.length.at.least", 1);
    cy.get('[data-test-account-own-row="tuner:enter"]').should("not.exist");
    cy.get('[data-test-account-own-row^="tuner:"]')
      .first()
      .then(($row) => {
        const id = $row.attr("data-test-account-own-row")!;
        if (id === "tuner:none") return;
        // a step: an expected own gain (or what the budget lacks), the reason there is no team figure
        expect($row.text()).to.match(/expected own|Tuners short|Echo EXP short/);
        if (/expected own/.test($row.text())) expect($row.text()).to.contain("No team figure");
      });
  });

  for (const width of [412, 360]) {
    it(`fits a ${width} px phone at 130 % text after a check`, () => {
      cy.viewport(width, 915);
      cy.visit("/account", seed({ fontScale: 1.3 }));
      runCheck();
      cy.get(CART).scrollIntoView();
      expectNoHorizontalScroll(`/account with the check at ${width} px`, width);
      // tap targets: layout px (Cypress's Electron leaves classic's page-enter scale at 95 %)
      cy.get('[data-test-account-own-go="Cartethyia:echoes"]').should(($a) => expect($a[0]!.offsetHeight).to.be.at.least(40));
      cy.get("[data-test-account-own-check]").should(($b) => expect($b[0]!.offsetHeight).to.be.at.least(36));
      // the row's words use the width under the figure: the to-do line is wider than half the screen
      cy.get(`${CART} .own-row__todo`).should(($t) => expect($t[0]!.getBoundingClientRect().width).to.be.greaterThan(width * 0.6));
      cy.get(`${CART} .own-row__main`).click();
      cy.get('[data-test-account-drawer-own-row="Cartethyia:echoes"]').should("exist");
      cy.get('[data-test-account-drawer-own-go="Cartethyia:echoes"]').should(($a) => expect($a[0]!.offsetHeight).to.be.at.least(36));
      expectNoHorizontalScroll(`the drawer at ${width} px`, width);
    });
  }
});
