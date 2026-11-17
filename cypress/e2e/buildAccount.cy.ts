// Wuthering Tools+ "Whole account" (/build-team?mode=account, src/sim/buildTeam/account/) in the v3 UI: the teams the
// account can field with the saved ones ticked, priority and "how much this team matters", plan them together, review,
// save as "Account plan" builds (build history first, pins in the saved teams), undo. Seeded through onBeforeLoad with
// public data only: upstream's Cartethyia golden fixture (her build + 17 echoes), three armed teammates with no echoes,
// and two saved teams built from the shipped wuwa_calc team presets that share Cartethyia and Ciaccona.
import { configOptimizer } from "./calculator/data/Cartethyia/data";
import * as teamPresetsModule from "../../src/sim/presets/data/teams.json";

type Preset = { name: string; data: { characterIds: string[]; actions: Array<Record<string, unknown>>; duration: number | null; enemyConfig?: Record<string, unknown>; handoffs?: Record<string, string[]> } };
const teamPresets = ((teamPresetsModule as unknown as { default?: Preset[] }).default ?? teamPresetsModule) as unknown as Preset[];
const presetOf = (ids: string[]): Preset => teamPresets.find((p) => p.data.characterIds.length === ids.length && ids.every((k) => p.data.characterIds.includes(k)))!;

const RUN = { timeout: 120000 };
const TEAMS = [
  { id: "bacy1", name: "Account test: Cartethyia + Ciaccona + Chisa", preset: presetOf(["Cartethyia", "Ciaccona", "Chisa"]) },
  { id: "bacy2", name: "Account test: Cartethyia + Shorekeeper + Ciaccona", preset: presetOf(["Cartethyia", "Shorekeeper", "Ciaccona"]) },
];

/** A team that matters more than Cartethyia's and has no echoes of its own: its main DPS takes hers when the plans' sets
 *  are off, which is how the plan comes to lower her teams (the guard's test). */
const TAKER = { id: "bacy0", name: "Account test: Aemeath + Mornye + Lynae", preset: presetOf(["Aemeath", "Mornye", "Lynae"]) };

function seed(options: { fontScale?: number; names?: Record<string, string>; taker?: boolean } = {}) {
  const character = JSON.parse(configOptimizer.data.character);
  character.characters.Ciaccona = { weapon: "WoodlandAria" };
  character.characters.Chisa = { weapon: "Kumokiri", weapons: { Kumokiri: { refinement: "5" } } };
  character.characters.Shorekeeper = { weapon: "StellarSymphony" };
  if (options.taker) {
    character.characters.Aemeath = { weapon: "EverbrightPolestar" };
    character.characters.Mornye = { weapon: "StarfieldCalibrator" };
    character.characters.Lynae = { weapon: "SpectrumBlaster" };
  }
  const teams = (options.taker ? [TAKER, ...TEAMS] : TEAMS).map((t) => ({
    id: t.id,
    name: options.names?.[t.id] ?? t.name,
    characterIds: t.preset.data.characterIds,
    buildIds: [null, null, null],
    actions: t.preset.data.actions.map((a, i) => ({ ...a, id: `a${i}` })),
    duration: t.preset.data.duration,
    enemyConfig: t.preset.data.enemyConfig ?? {},
    handoffs: t.preset.data.handoffs ?? null,
  }));
  return {
    onBeforeLoad(win: Window) {
      win.sessionStorage.clear();
      win.localStorage.removeItem("wtplus:buildAccount:undo:v1");
      for (const k of Object.keys(win.localStorage)) if (k.startsWith("wtplus:buildHistory:")) win.localStorage.removeItem(k);
      win.localStorage.setItem("character", JSON.stringify(character));
      win.localStorage.setItem("inventory", configOptimizer.data.inventory);
      win.localStorage.setItem("teamRotations", JSON.stringify({ teams, favoriteTeamIds: [], favoritePresetNames: [] }));
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

type Team = { id: string; buildIds: Array<string | null> };
const readTeams = (win: Window): Team[] => JSON.parse(win.localStorage.getItem("teamRotations")!).teams;
const readChar = (win: Window, id: string): { activeBuildId?: string; echoes?: unknown; builds?: Array<{ id: string; name: string }> } => JSON.parse(win.localStorage.getItem("character")!).characters[id];

function expectNoHorizontalScroll(what: string, width: number): void {
  cy.window().then((win) => {
    expect(win.document.documentElement.scrollWidth, `${what} page width`).to.be.at.most(win.document.documentElement.clientWidth);
    expect(win.innerWidth, `${what} layout viewport`).to.eq(width);
  });
}

describe("build my whole account", () => {
  it("calls a team what every other page calls it: its title and tier chips, on the rows and on the buttons' names", () => {
    cy.viewport(412, 915);
    cy.visit("/build-team?mode=account", seed({ names: { bacy1: "wuwa_calc Cartethyia S6R5 DPS · S0R1 team · Ciaccona + Chisa", bacy2: "Cartethyia · Shorekeeper + Ciaccona · S6R1 DPS · S1R1 team (wuwa_calc)" } }));
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get('[data-test-build-account-team="bacy1"] .wt-preset__text').should("have.text", "Cartethyia · Ciaccona + Chisa");
    cy.get('[data-test-build-account-team="bacy1"] .wt-chip--dps').should("contain.text", "S6R5");
    cy.get('[data-test-build-account-team="bacy1"] .wt-chip--team').should("contain.text", "S0R1");
    cy.get('[data-test-build-account-team="bacy2"] .wt-preset__text').should("have.text", "Cartethyia · Shorekeeper + Ciaccona");
    cy.get('[data-test-build-account-team="bacy2"] .wt-chip--dps').should("contain.text", "S6R1");
    cy.get("[data-test-build-account-team]").should("not.contain.text", "wuwa_calc Cartethyia").and("not.contain.text", "(wuwa_calc)");
    cy.get('[data-test-build-account-team="bacy1"] [data-test-build-account-remove]').should("have.attr", "aria-label", "Remove Cartethyia · Ciaccona + Chisa, main DPS S6R5 · supports S0R1");
    expectNoHorizontalScroll("the named rows", 412);
  });

  it("opens from the mode switch with the saved teams ticked; priority and weights in words", () => {
    cy.viewport(1440, 900);
    cy.visit("/build-team", seed());
    cy.get("[data-test-build-team-mode-account]").click();
    cy.location("search").should("contain", "mode=account");
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    // both saved teams, the stronger first; Cartethyia and Ciaccona are in both: one build each, said in words
    cy.get("[data-test-build-account-team]").should("have.length", 2);
    cy.get("[data-test-build-account-shared]").should("contain.text", "Cartethyia").and("contain.text", "one build");
    cy.get("[data-test-build-account-team]").first().find("[data-test-build-account-weight]").should("have.value", "1");
    cy.get("[data-test-build-account-team]").eq(1).find("[data-test-build-account-weight]").should("have.value", "0.8");
    cy.contains("How much this team matters").should("be.visible");
    // move the second team up: the priority numbers and the default weights follow
    cy.get("[data-test-build-account-team]").eq(1).invoke("attr", "data-test-build-account-team").then((secondId) => {
      cy.get("[data-test-build-account-team]").eq(1).find("[data-test-build-account-up]").click();
      cy.get("[data-test-build-account-team]").first().should("have.attr", "data-test-build-account-team", secondId).and("have.attr", "data-priority", "1");
      cy.get("[data-test-build-account-team]").first().find("[data-test-build-account-weight]").should("have.value", "1");
    });
    // a removed team moves to the list of other fieldable teams, and ticking it there brings it back last
    cy.get("[data-test-build-account-team]").first().invoke("attr", "data-test-build-account-team").then((firstId) => {
      cy.get("[data-test-build-account-team]").first().find("[data-test-build-account-remove]").click();
      cy.get("[data-test-build-account-team]").should("have.length", 1);
      cy.get("[data-test-build-account-shared]").should("not.exist");
      cy.get("[data-test-build-account-more]").then(($d) => {
        if (!$d.prop("open")) cy.get("[data-test-build-account-more] summary").click();
      });
      cy.get(`[data-test-build-account-pick="${firstId}"]`).check();
      cy.get("[data-test-build-account-team]").should("have.length", 2).last().should("have.attr", "data-test-build-account-team", firstId);
    });
  });

  it("keeps a team the plan would lower as it is, says so in words, and saves nothing for it", () => {
    cy.viewport(412, 915);
    cy.visit("/build-team?mode=account", seed({ fontScale: 1.3, taker: true }));
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    // the three saved teams are ticked strongest first: the one with no echoes is last. It is made the one that matters most
    cy.get("[data-test-build-account-team]").should("have.length", 3);
    cy.get('[data-test-build-account-team="bacy0"] [data-test-build-account-up]').click();
    cy.get('[data-test-build-account-team="bacy0"] [data-test-build-account-up]').click();
    cy.get("[data-test-build-account-team]").first().should("have.attr", "data-test-build-account-team", "bacy0");
    // any set, any main stat: the first team's main DPS, who wears nothing, may now take Cartethyia's echoes
    cy.get("[data-test-build-account-options] input[type=checkbox]").eq(0).uncheck({ force: true });
    cy.get("[data-test-build-account-options] input[type=checkbox]").eq(1).uncheck({ force: true });
    cy.get("[data-test-build-account-run]").click();
    // with every echo open to every member the improvement pass runs to its 60 s limit, and it is not what this test
    // is about: it is stopped as soon as it starts (the first pass alone already hands her echoes to the first team)
    cy.get('[data-test-build-account-stop], [data-test-build-account][data-phase="result"]', RUN).then(($el) => {
      if ($el.is("[data-test-build-account-stop]")) $el.trigger("click");
    });
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");

    // both of Cartethyia's teams would have read lower: each stays as it is, and the review says which and by how much
    cy.get("[data-test-build-account-guard]").should("have.length", 2);
    cy.get("[data-test-build-account-guard]").first().should("contain.text", "Team 2 (Cartethyia · Ciaccona + Chisa) stays as it is").invoke("text").should("match", /read (\d+\.\d|less than 0\.1) % lower there/);
    cy.get("[data-test-build-account-guard]").last().should("contain.text", "Team 3 (Cartethyia · Shorekeeper + Ciaccona) stays as it is");
    for (const team of [1, 2]) {
      cy.get(`[data-test-build-account-result-team="${team}"] [data-test-build-account-team-kept]`)
        .should("contain.text", "Stays as it is")
        .and("contain.text", "Cartethyia keeps today's build")
        .invoke("text")
        .should("match", /it read [\d,]+ damage per rotation, .* below today's [\d,]+/);
      // the card's own figures: today and the plan are the same number
      cy.get(`[data-test-build-account-result-team="${team}"] [data-test-build-account-team-delta]`).should("have.text", "±0 %");
      cy.get(`[data-test-build-account-result-team="${team}"] .ba-team__nums .tabular-nums`).invoke("text").then((text) => {
        const [today, plan] = text.split("→").map((x) => x.trim());
        expect(plan, `team ${team + 1} plan`).to.eq(today);
      });
    }
    // no team on the page reads lower than today
    cy.get("[data-test-build-account-team-delta]").each(($d) => expect($d.text()).not.to.match(/^−/));
    cy.get('[data-test-build-account-result-team="0"] [data-test-build-account-team-delta]').invoke("text").should("match", /^\+/);
    // her row says what happens to her, in the colour of an ordinary note and not of a failure
    cy.get('[data-test-build-account-member="Cartethyia"][data-shared="no"]').should("have.attr", "data-kept", "yes").find("[data-test-build-account-member-note]").should("contain.text", "Keeps today's build").as("keptNote");
    cy.get('[data-test-build-account-member="Aemeath"] [data-test-build-account-member-note]').then(($ordinary) => cy.get("@keptNote").should("have.css", "color", $ordinary.css("color")));
    cy.get('[data-test-build-account-member="Cartethyia"][data-shared="yes"]').should("contain.text", "keeps today's build, as in team 2");
    // the headline, the cards and the Save count the same builds: "N new builds" is the number on the Save button and
    // the number of cards with a new build that is saved; she is the one card set back, and the headline does not count
    // her as a build or as "keeps today's echoes"
    cy.get('[data-test-build-account-member][data-shared="no"][data-kept="yes"]').should("have.length", 1);
    cy.get("[data-test-build-account-summary]")
      .invoke("text")
      .then((summary) => {
        const builds = Number(/(\d+) new builds?/.exec(summary)?.[1] ?? 0);
        const keeping = Number(/(\d+) keeps? today's echoes/.exec(summary)?.[1] ?? 0);
        expect(builds, "builds the headline counts").to.be.at.least(1);
        cy.get('[data-test-build-account-member][data-shared="no"][data-status="ok"]').should("have.length", builds + keeping);
        cy.get("[data-test-build-account-save]").invoke("text").should("match", new RegExp(`Save ${builds} build`));
        cy.wrap(builds).as("builds");
      });
    // every member of a team that stays as it is keeps today's build: no card of teams 2 and 3 shows a new one
    for (const team of [1, 2]) cy.get(`[data-test-build-account-result-team="${team}"] [data-test-build-account-member][data-shared="no"][data-status="ok"]`).should("not.exist");
    // none of her echoes is in the plan
    cy.window().then((win) => {
      const hers = Object.values(readChar(win, "Cartethyia").echoes as Record<string, { echoId: string }>).map((s) => s.echoId);
      cy.get('[data-test-build-account-member="Aemeath"] [data-test-build-team-echo]').then(($tiles) => {
        const taken = [...$tiles].map((t) => t.getAttribute("data-echo-id"));
        expect(taken).to.have.length(5);
        expect(taken.filter((id) => hers.includes(id!)), "her echoes in the plan").to.deep.eq([]);
      });
    });
    expectNoHorizontalScroll("the review with kept teams", 412);
    cy.get("[data-test-build-account-team-kept]").each(($p) => expect($p[0].getBoundingClientRect().right, "kept note's right edge").to.be.at.most(412));

    // the Save writes what the review counted: a build for Aemeath, nothing for Cartethyia, her teams' pins untouched
    cy.get("[data-test-build-account-save]").click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "Aemeath").and("not.contain.text", "Cartethyia");
    cy.get(".confirm-dialog .modal-action .btn-primary").click();
    cy.get<number>("@builds").then((builds) => cy.get("[data-test-build-account-saved]").should("contain.text", `Saved ${builds} `));
    cy.window().then((win) => {
      for (const id of ["Cartethyia", "Ciaccona", "Chisa", "Shorekeeper"]) expect((readChar(win, id).builds ?? []).filter((b) => b.name.startsWith("Account plan")), `no Account plan build for ${id}`).to.have.length(0);
      const plan = (readChar(win, "Aemeath").builds ?? []).find((b) => b.name === "Account plan");
      expect(plan, "Aemeath's Account plan build").to.exist;
      const teams = readTeams(win);
      expect(teams.find((t) => t.id === "bacy0")!.buildIds).to.include(plan!.id);
      for (const id of ["bacy1", "bacy2"]) expect(teams.find((t) => t.id === id)!.buildIds, id).to.deep.eq([null, null, null]);
    });
  });

  it("a tab older than the site says to reload, with a button that does, instead of a Try again that cannot work", () => {
    cy.viewport(1440, 1000);
    cy.intercept("**/src/workers/processor.worker.ts*", { forceNetworkError: true });
    cy.visit("/build-team?mode=account", seed());
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get("[data-test-build-account-fatal]", RUN).should("contain.text", "older than the site");
    cy.get("[data-test-build-account-reload]").should("be.visible");
    cy.get("[data-test-build-account-fatal] button").should("have.length", 1);
  });

  it("plans both teams with no echo twice, saves Account plan builds after build history, and undo puts it all back", () => {
    cy.viewport(1440, 1000);
    cy.visit("/build-team?mode=account", seed());
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");

    cy.get("[data-test-build-account-summary]").should("contain.text", "heuristic").and("contain.text", "Weighted team damage");
    cy.get("[data-test-build-account-search]").should("not.be.empty");
    cy.get("[data-test-build-account-result-team]").should("have.length", 2);
    // Cartethyia is built once, in the first team, and worn in the second
    cy.get('[data-test-build-account-member="Cartethyia"][data-shared="no"]').should("have.length", 1).and("have.attr", "data-status", "ok");
    cy.get('[data-test-build-account-member="Cartethyia"][data-shared="yes"]').should("have.length", 1).and("contain.text", "planned in team 1");
    // Chisa has no echo of her sets: said in words
    cy.get('[data-test-build-account-member="Chisa"]').should("not.have.attr", "data-status", "ok");
    // the cards and the headline count the same members: as many cards say "keeps today's echoes" as the summary's
    // "N keep today's echoes" (none when it has no such count). A member who kept her echoes but got a build for her
    // second team read "keeps" too: three cards under a headline of two (2026-11-08 hunt, numbers 5)
    cy.get("[data-test-build-account-summary]")
      .invoke("text")
      .then((summary) => {
        const counted = Number(/(\d+) keeps? today's echoes/.exec(summary)?.[1] ?? 0);
        cy.get('[data-test-build-account-member][data-shared="no"]').then(($cards) => {
          const keeping = [...$cards].filter((c) => /keeps today's echoes/.test(c.querySelector("[data-test-build-account-member-note]")?.textContent ?? ""));
          expect(keeping.length, "cards that say keeps today's echoes").to.eq(counted);
        });
      });
    // no echo in two builds across the account
    cy.get('[data-test-build-account-member][data-shared="no"] [data-test-build-team-echo]').then(($tiles) => {
      const ids = [...$tiles].map((t) => t.getAttribute("data-echo-id"));
      expect(ids.length, "echoes in the plan").to.be.at.least(5);
      expect(new Set(ids).size, "distinct echoes").to.eq(ids.length);
    });

    cy.window().then((win) => cy.wrap(JSON.stringify(readChar(win, "Cartethyia").echoes ?? {})).as("liveEchoes"));
    cy.get("[data-test-build-account-save]").should("not.be.disabled").click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "Account plan").and("contain.text", "pinned in").and("contain.text", "Build history");
    cy.get(".confirm-dialog .modal-action .btn-primary").click();
    cy.get("[data-test-build-account-saved]").should("contain.text", "Account plan");
    cy.window().then((win) => {
      const cart = readChar(win, "Cartethyia");
      const built = (cart.builds ?? []).find((b) => b.name === "Account plan");
      expect(built, "a new Account plan build").to.exist;
      // a new build, not the active one: the live echoes are the ones she wore
      expect(cart.activeBuildId).not.to.eq(built!.id);
      cy.get("@liveEchoes").then((live) => expect(JSON.stringify(cart.echoes ?? {})).to.eq(live));
      // pinned in both saved teams she plays in
      for (const t of readTeams(win)) expect(t.buildIds, t.id).to.include(built!.id);
      // build history: her build as it was, kept just before the save
      const history = JSON.parse(win.localStorage.getItem("wtplus:buildHistory:v1:Cartethyia") ?? '{"versions":[]}');
      expect(history.versions.map((v: { label: string }) => v.label)).to.deep.eq(["before-account-plan"]);
    });

    // undo from the page (after a reload: the undo is stored)
    cy.visit("/build-team?mode=account", { onBeforeLoad: () => undefined });
    cy.get("[data-test-build-account-undo]", RUN).click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get("[data-test-build-account-undo]").should("not.exist");
    cy.window().then((win) => {
      for (const t of readTeams(win)) expect(t.buildIds, t.id).to.deep.eq([null, null, null]);
      expect((readChar(win, "Cartethyia").builds ?? []).some((b) => b.name === "Account plan")).to.eq(false);
    });
  });

  it("keeps the teams you chose through a reload, and a review through Back and Forward", () => {
    cy.viewport(1440, 900);
    cy.visit("/build-team", seed());
    cy.get("[data-test-build-team-mode-account]").click();
    cy.get("[data-test-build-account-team]", RUN).should("have.length", 2);
    // this account has no third team to add, so the change is the other way: a reload put eight chosen back to the default
    cy.get("[data-test-build-account-remove]").first().click();
    cy.get("[data-test-build-account-team]").should("have.length", 1);
    cy.get("[data-test-build-account-team]").then(($rows) => {
      const chosen = $rows[0]!.getAttribute("data-test-build-account-team");
      cy.reload();
      cy.get("[data-test-build-account-team]", RUN).should("have.length", 1).and("have.attr", "data-test-build-account-team", chosen);
    });
    // the steps are no history entries: Back leaves the page, and Forward used to find step 1 with the plan gone
    cy.get("[data-test-build-team-mode-team]").click();
    cy.get("[data-test-build-team-mode-account]").click();
    cy.get("[data-test-build-account-run]", RUN).click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");
    cy.go("back");
    cy.location("search").should("not.contain", "mode=account");
    cy.go("forward");
    cy.location("search").should("contain", "mode=account");
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");
    cy.get("[data-test-build-account-save]").should("be.visible").and("not.be.disabled");
    // Change teams puts the review down for good
    cy.get("[data-test-build-account-back]").click();
    cy.get('[data-test-build-account][data-phase="choose"]').should("exist");
    cy.go("back");
    cy.location("search").should("not.contain", "mode=account");
    cy.go("forward");
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
  });

  it("cancel during the run goes back to the teams with nothing written", () => {
    cy.viewport(1440, 900);
    cy.visit("/build-team?mode=account", seed());
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get("[data-test-build-account-cancel]").click();
    cy.get('[data-test-build-account][data-phase="choose"]').should("exist");
    cy.window().then((win) => {
      for (const t of readTeams(win)) expect(t.buildIds).to.deep.eq([null, null, null]);
    });
  });

  it("Undo on a review planned after the save drops that review: its figures were read from what the undo took back", () => {
    cy.visit("/build-team?mode=account", seed());
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");
    cy.get("[data-test-build-account-make-active]").check();
    cy.get("[data-test-build-account-save]").click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get("[data-test-build-account-saved]").should("exist");
    cy.get("[data-test-build-account-back]").click();
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");

    cy.get("[data-test-build-account-undo]").click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();

    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-save]").should("not.exist");
    cy.window().then((win) => {
      expect(readChar(win, "Cartethyia").builds?.some((b) => b.name === "Account plan") ?? false, "the plan's builds are gone").to.eq(false);
    });
  });

  it("after one edit, Undo says first which build stays, gives the others back and keeps only that one", () => {
    const store = (win: Window, id: string) => (win.document.querySelector("#wt-app") as unknown as { __vue_app__: { config: { globalProperties: { $pinia: { _s: Map<string, { characters: { [k: string]: { level?: string } } }> } } } } }).__vue_app__.config.globalProperties.$pinia._s.get("character")!.characters[id]!;
    cy.visit("/build-team?mode=account", seed());
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");
    cy.get("[data-test-build-account-make-active]").check();
    cy.get("[data-test-build-account-save]").click();
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get("[data-test-build-account-saved]").should("exist");
    cy.window().then((win) => {
      store(win, "Cartethyia").level = "80";
    });
    cy.get("[data-test-build-account-undo]").click();
    cy.get(".confirm-dialog .modal-box").should("contain.text", "changed after the save, so they stay").and("contain.text", "“Account plan” stays (it is the active build now)");
    cy.get(".confirm-dialog .modal-action .btn-warning").click();
    cy.get(".toast").should("contain.text", "Partly undone").and("contain.text", "kept Cartethyia");
    cy.window().then((win) => {
      expect(readChar(win, "Cartethyia").builds?.some((b) => b.name === "Account plan"), "the edited one stays").to.eq(true);
      expect(readChar(win, "Ciaccona").builds?.some((b) => b.name === "Account plan") ?? false, "Ciaccona went back").to.eq(false);
    });
  });

  it("after a save on a phone, Plan is not under the undo and planning again starts from the saved builds", () => {
    const todayAndPlan = (): Cypress.Chainable<string[][]> => cy.get("[data-test-build-account-result-team] .ba-team__nums > span:first-child").then(($n) => [...$n].map((n) => n.textContent!.split("→").map((s) => s.trim())));
    cy.viewport(412, 915);
    cy.visit("/build-team?mode=account", seed({ fontScale: 1.3 }));
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-run]").click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");
    todayAndPlan().as("firstPlan");
    cy.get("[data-test-build-account-save]").click();
    cy.get(".confirm-dialog .modal-action .btn-primary").click();
    cy.get("[data-test-build-account-saved]").should("exist");
    cy.get("[data-test-build-account-back]").click();

    // the Teams step with an undo waiting: one bar at the bottom edge, Plan on top of it, the undo in the page
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    cy.get("[data-test-build-account-undo]").should("exist");
    cy.get("[data-test-build-account-savebar]").should("have.css", "position", "static");
    cy.get("[data-test-build-account-run]").then(($b) => {
      const r = $b[0]!.getBoundingClientRect();
      const top = $b[0]!.ownerDocument.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      expect($b[0]!.contains(top), "Plan is the top element at its own centre").to.eq(true);
    });
    expectNoHorizontalScroll("teams with an undo", 412);
    cy.get("[data-test-build-account-undo]").scrollIntoView().should("be.visible");

    // no undo during a run: it would change what the run is reading
    cy.get("[data-test-build-account-run]").click();
    cy.get("[data-test-build-account-running]").should("exist");
    cy.get("[data-test-build-account-undo]").should("not.exist");
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");

    // today is what the save left: the first plan, not the builds before it
    todayAndPlan().then((second) => {
      cy.get<string[][]>("@firstPlan").then((first) => {
        expect(second.map((t) => t[0]), "today, planned again").to.deep.eq(first.map((t) => t[1]));
      });
    });
  });

  it("fits a phone at 412 px with 130 % text, choose and review, with a sticky save bar", () => {
    cy.viewport(412, 915);
    cy.visit("/build-team?mode=account", seed({ fontScale: 1.3 }));
    cy.get('[data-test-build-account][data-phase="choose"]', RUN).should("exist");
    expectNoHorizontalScroll("choose", 412);
    cy.get("[data-test-build-account-up]").last().should("be.visible").invoke("outerHeight").should("be.at.least", 40);
    cy.get("[data-test-build-account-run]").should("be.visible").click();
    cy.get('[data-test-build-account][data-phase="result"]', RUN).should("exist");
    cy.get("[data-test-build-account-savebar]").should("be.visible").and("have.css", "position", "fixed");
    expectNoHorizontalScroll("review", 412);
    cy.viewport(360, 800);
    expectNoHorizontalScroll("review at 360", 360);
  });
});
