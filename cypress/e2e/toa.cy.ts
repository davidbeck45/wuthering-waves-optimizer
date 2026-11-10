// Wuthering Tools+ — /endgame, the ToA clear check (src/sim/endgame/), in the v3 UI: the season's floor cards, the
// account's teams timed by Riley's engine in the real worker, a crest badge, the 12-stage plan, a logged clear; the
// empty state without an account, a season synced before its floor HP is published, and the stale-season banner once
// the newest shipped season has ended.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const v3 = (withAccount: boolean) => ({
  onBeforeLoad(win: Window) {
    for (const k of ["wtplus:endgame:check", "wtplus:endgame:clears", "wtplus:endgame:prefs"]) win.localStorage.removeItem(k);
    if (withAccount) {
      win.localStorage.setItem("character", configOptimizer.data.character);
      win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
    }
    win.localStorage.setItem("wtplus:endgame:prefs", JSON.stringify({ v: 1, region: "asia", usePace: false }));
    const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
    settings.config = { ...settings.config, useClassicUi: false };
    win.localStorage.setItem("settings", JSON.stringify(settings));
  },
});

describe("ToA clear check (/endgame)", () => {
  beforeEach(() => {
    cy.viewport(1440, 900);
  });

  it("times the account's team on every floor, plans all 12 stages and keeps a logged clear", () => {
    // the season ships dated: pin the clock inside Season 41 (Date only — the worker's timers run free)
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.visit("/endgame", v3(true));
    cy.title().should("eq", "Tower of Adversity — Wuthering Waves Calculator & Optimizer");
    cy.get("[data-test-toa-season-badge]").should("contain.text", "Season 41");
    cy.get("[data-test-toa-countdown]").should("contain.text", "d");
    for (const id of ["hazard-1", "hazard-2", "hazard-3", "hazard-4", "resonant-4", "echoing-4"]) cy.get(`[data-test-toa-floor="${id}"]`).should("be.visible");
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-hp]').should("contain.text", "5.51M");
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-vigor]').should("contain.text", "5 Vigor");
    cy.get('[data-test-toa-floor="hazard-2"] [data-test-toa-estimate]').should("be.visible");
    cy.get('[data-test-toa-floor="resonant-4"] [data-test-toa-effect="none"]').should("exist");
    cy.get('[data-test-toa-floor="hazard-3"] [data-test-toa-effect="exact"]').should("exist");
    // a chip opens its note under the chips (phones have no hover): what the engine does, and the game's wording
    cy.get('[data-test-toa-floor="hazard-3"] [data-test-toa-effect="approx"]').first().click();
    cy.get('[data-test-toa-floor="hazard-3"] [data-test-toa-effect-note]').should("contain.text", "Modelled (approximation)").and("contain.text", "In game:");
    cy.get('[data-test-toa-floor="hazard-3"] [data-test-toa-effect="approx"]').first().click();
    cy.get('[data-test-toa-floor="hazard-3"] [data-test-toa-effect-note]').should("not.exist");
    cy.get("[data-test-toa-credits]").should("contain.text", "Floor HP: ChemX32's DPR Calc sheet (data from Sleep)").and("not.contain.text", "encore");

    // the engine run: Aero Rover · Sanhua · Cartethyia is the one team this account fields
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-team]', { timeout: 120000 }).should("have.length.at.least", 1);
    cy.get("[data-test-toa-progress]").should("not.exist");
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-team]').first().as("row");
    cy.get("@row").find("[data-test-toa-kill]").invoke("text").should("match", /\d:\d\d|>5:00/);
    cy.get("@row").find("[data-test-toa-crests]").should("have.attr", "data-test-toa-crests").and("match", /^[0-3]$/);
    cy.get("@row").find("[data-test-toa-timebar]").should("be.visible");

    // the plan covers all 12 stages
    cy.get('[data-test-toa-tab="plan"]').click();
    cy.get("[data-test-toa-stage]").should("have.length", 12);
    cy.get("[data-test-toa-plan-crests]").invoke("text").then((t) => expect(Number(t)).to.be.within(1, 36));
    cy.get('[data-test-toa-plan-tower="hazard"] [data-test-toa-stage]').should("have.length", 4);
    cy.get("[data-test-toa-vigor-left]").should("be.visible");

    // a real clear, logged and kept
    cy.get('[data-test-toa-tab="calibrate"]').click();
    // the clock as the game counts it down: 3:20 left is 1:40 used
    cy.get('[data-test-toa-calibrate-reading="left"]').should("have.attr", "aria-checked", "true");
    cy.get("[data-test-toa-calibrate-team]").first().within(() => {
      cy.get("[data-test-toa-calibrate-time]").type("3:20");
      cy.get("[data-test-toa-calibrate-preview]").should("contain.text", "= 1:40 used");
    });
    // or as time used
    cy.get('[data-test-toa-calibrate-reading="used"]').click();
    cy.get("[data-test-toa-calibrate-team]").first().within(() => {
      cy.get("[data-test-toa-calibrate-time]").clear().type("2:30");
      cy.get("[data-test-toa-calibrate-preview]").should("contain.text", "= 2:30 used");
      cy.get("[data-test-toa-calibrate-save]").click();
      cy.get("[data-test-toa-calibrate-logged]").should("contain.text", "2:30");
    });
    cy.window().then((win) => {
      expect(Object.values(JSON.parse(win.localStorage.getItem("wtplus:endgame:clears") ?? "{}").clears ?? {})).to.have.length(1).and.to.satisfy((c: Array<{ seconds: number }>) => c[0]!.seconds === 150);
      expect(JSON.parse(win.localStorage.getItem("wtplus:endgame:prefs") ?? "{}").reading).to.eq("used");
    });
    cy.get('[data-test-toa-tab="floors"]').click();
    cy.get('[data-test-toa-floor="hazard-1"]').should("contain.text", "you:");
  });

  it("shows the floors without an account and asks for one", () => {
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.visit("/endgame", v3(false));
    cy.get("[data-test-toa-empty]").should("be.visible").and("contain.text", "Import your account");
    cy.get('[data-test-toa-floor="hazard-4"]').should("be.visible").and("contain.text", "Crownless");
    cy.get("[data-test-toa-progress]").should("not.exist");
  });

  it("puts no crest count on the Plan tab while there is no team to plan with", () => {
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    const alone = v3(true);
    cy.visit("/endgame", {
      onBeforeLoad(win: Window) {
        alone.onBeforeLoad(win);
        // one 5★ with no 4★ team to borrow (Cartethyia alone still fields one, with the 4★s wuwa_calc counts as owned)
        win.localStorage.setItem("character", JSON.stringify({ characters: { Aemeath: { weapon: "EverbrightPolestar" } }, activeCharacter: "Aemeath" }));
      },
    });
    cy.contains("No fieldable team", { timeout: 60000 }).should("be.visible");
    // the low floors are assumed clear by any spare team, so the plan counted 12★ for an account with no team at all
    cy.get('[data-test-toa-tab="plan"]').should("have.text", "Plan").click();
    cy.get("[data-test-toa-plan-empty]").should("contain.text", "Check your teams first");
  });

  it("shows a new season from its first day and says its floor HP is not published yet, with no number of the last one", () => {
    // 2026-11-09 21:00 US Central: Season 42 began that morning, and the HP sheet has no block for it yet.
    // This one reads the shipped Season 42 file: once its HP is synced, it asserts the HP figures instead (the unit
    // tests fight a season stripped of its HP and hold either way).
    cy.clock(Date.UTC(2026, 10, 10, 3), ["Date"]);
    cy.visit("/endgame", v3(true));
    cy.get("[data-test-toa-season-badge]").should("contain.text", "Season 42");
    cy.get("[data-test-toa-countdown]").should("have.text", "26 d 17 h");
    cy.get("[data-test-toa-season]").should("contain.text", "2026-11-09 → 2026-12-07 04:00");
    cy.get("[data-test-toa-stale]").should("not.exist");
    cy.get("[data-test-toa-hp-pending-note]").should("be.visible").and("contain.text", "Season 42's floor HP is not published yet");
    for (const id of ["hazard-1", "hazard-2", "hazard-3", "hazard-4", "resonant-4", "echoing-4"]) {
      cy.get(`[data-test-toa-floor="${id}"]`).should("be.visible").and("not.have.class", "opacity-60");
      cy.get(`[data-test-toa-floor="${id}"] [data-test-toa-hp-pending]`).should("contain.text", "HP not published yet");
      cy.get(`[data-test-toa-floor="${id}"] [data-test-toa-effect]`).should("have.length.at.least", 2);
      cy.get(`[data-test-toa-floor="${id}"] [data-test-toa-goals]`).should("be.visible");
      cy.get(`[data-test-toa-floor="${id}"] [data-test-toa-teams-pending]`).should("contain.text", "once the floor's HP is published");
    }
    // no HP figure anywhere: it read "0 HP" on every card, and "estimate · waves summed" over a 0
    cy.get("[data-test-toa-hp]").should("not.exist");
    cy.get("[data-test-toa-estimate]").should("not.exist");
    // what is known is shown: the enemies, what they resist, the effects in the game's wording, the crest goals
    cy.get('[data-test-toa-floor="hazard-1"]').should("contain.text", "Crownless");
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-res] .toa-res').should("have.length", 6);
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-effect="approx"]').should("contain.text", "Crit DMG +25%").click();
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-effect-note]')
      .should("contain.text", "Modelled (approximation)")
      .and("contain.text", "Crit. DMG is increased by 25%. Resonators gain 30% Glacio DMG Bonus.");
    cy.get('[data-test-toa-floor="echoing-4"] [data-test-toa-effect="none"]').should("have.length", 2);
    // the fold keeps to the six low side floors: the Hazard floors, HP or not, are no "any spare team" stages
    cy.get("[data-test-toa-low-floor]").should("have.length", 6);
    cy.get('[data-test-toa-low-floor^="hazard"]').should("not.exist");
    // nothing can be timed: no run starts, the button stays off, and the Plan tab counts no crest (it planned 36★)
    cy.get("[data-test-toa-recompute]").should("be.disabled");
    cy.get("[data-test-toa-progress]").should("not.exist");
    cy.get('[data-test-toa-tab="plan"]').should("have.text", "Plan").click();
    cy.get("[data-test-toa-plan-empty]").should("contain.text", "The plan comes once Season 42's floor HP is published");
    cy.get("[data-test-toa-stage]").should("not.exist");
    // and nothing of Season 41 is left on the page (its Hazard 1 had 5.51M HP)
    cy.get("[data-test-toa]").should("not.contain.text", "5.51M");
  });

  it("greys the last season once it has ended and says the data is due for the next", () => {
    // past the newest shipped season's end (Season 42 ends 2026-12-07)
    cy.clock(Date.UTC(2026, 11, 20, 12), ["Date"]);
    cy.visit("/endgame", v3(true));
    cy.get("[data-test-toa-season-badge]").should("contain.text", "Season 42");
    cy.get("[data-test-toa-stale]").should("be.visible").and("contain.text", "S43");
    // a season that has ended is not waiting for anything: the one banner says what is due
    cy.get("[data-test-toa-hp-pending-note]").should("not.exist");
    cy.get('[data-test-toa-floor="hazard-1"]').should("have.class", "opacity-60");
    // an ended season's floors are not fought again: no run starts, and the button stays off
    cy.get("[data-test-toa-recompute]").should("be.disabled");
    cy.get("[data-test-toa-progress]").should("not.exist");
  });
});
