// Wuthering Tools+ — crit luck (src/sim/critLuck/): every damage figure is an average, so the fight pages say how far a
// real run lands from it. /endgame: each timed team's chance to clear and per crest, at the sim's speed and at a logged
// pace, the plan's per-stage chance and its all-together chance; /rotation: the DPS range. v3, the phone first (David's
// S26: 412 px at 130 % text), the real solver worker on the Cartethyia fixture account.
import { configOptimizer } from "./calculator/data/Cartethyia/data";

const seed = (opts: { keepCheck?: boolean; usePace?: boolean; fontScale?: number } = {}) => ({
  onBeforeLoad(win: Window) {
    if (!opts.keepCheck) for (const k of ["wtplus:endgame:check", "wtplus:endgame:clears"]) win.localStorage.removeItem(k);
    win.localStorage.setItem("character", configOptimizer.data.character);
    win.localStorage.setItem("inventory", configOptimizer.data.inventory as string);
    win.localStorage.setItem("wtplus:endgame:prefs", JSON.stringify({ v: 1, region: "asia", usePace: !!opts.usePace, reading: "left" }));
    const settings = JSON.parse(win.localStorage.getItem("settings") ?? "{}");
    settings.config = { ...settings.config, useClassicUi: false };
    win.localStorage.setItem("settings", JSON.stringify(settings));
  },
  onLoad(win: Window) {
    const style = win.document.createElement("style");
    style.textContent = `html { font-size: ${(opts.fontScale ?? 1.3) * 100}%; }`;
    win.document.head.appendChild(style);
  },
});

const TIMED = ["hazard-1", "hazard-2", "hazard-3", "hazard-4", "resonant-4", "echoing-4"];
/** a chance as the page writes it */
const CHANCE = /(< 1 %|> 99 %|\b\d{1,2} %)/;

function expectInside(selector: string, what: string): void {
  cy.get(selector).each(($el) => {
    const width = $el[0].ownerDocument.documentElement.clientWidth;
    expect($el[0].getBoundingClientRect().right, `${what} inside the viewport`).to.be.at.most(width + 0.5);
  });
  cy.document().then((doc) => expect(doc.documentElement.scrollWidth, `${what}: page width`).to.be.at.most(doc.documentElement.clientWidth));
}

describe("Crit luck on the fight pages", () => {
  it("gives every timed team its chance to clear and per crest, keeps the distribution, and reads it at a logged pace and in the plan", () => {
    // the season ships dated: pin the clock inside Season 41 (Date only — the worker's timers run free)
    cy.clock(Date.UTC(2026, 9, 26, 12), ["Date"]);
    cy.viewport(412, 915);
    cy.visit("/endgame", seed());
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-team]', { timeout: 120000 }).should("have.length.at.least", 1);
    cy.get("[data-test-toa-progress]").should("not.exist");
    cy.get("[data-test-toa-odds-intro]").should("be.visible").and("contain.text", "Crit luck").and("contain.text", "runs in 100");
    for (const id of TIMED) {
      cy.get(`[data-test-toa-floor="${id}"] [data-test-toa-odds]`)
        .first()
        .invoke("text")
        .should("match", /^\s*Crit luck:/)
        .and("match", /every crest in more than 99 runs in 100|no clear, even on a lucky run|%/);
    }
    // a Hazard floor (no "just clear it" crest) names the clear on its own; per crest, a chance each
    cy.get('[data-test-toa-floor="hazard-1"] [data-test-toa-odds]').first().then(($line) => {
      if ($line.text().includes("every crest") || $line.text().includes("no clear")) return;
      cy.wrap($line).find("[data-test-toa-odds-clear]").invoke("text").should("match", CHANCE);
      cy.wrap($line).find("[data-test-toa-odds-crest]").should("have.length", 3).each(($c) => expect($c.text()).to.match(CHANCE));
    });
    expectInside("[data-test-toa-odds]", "crit-luck line at 412 px / 130 %");
    cy.get("[data-test-toa-credits]").should("contain.text", "Crit luck");

    // the check keeps each result's kill-time distribution (and re-runs a check stored before it did: the key says "odds1")
    cy.window().then((win) => {
      const check = JSON.parse(win.localStorage.getItem("wtplus:endgame:check") ?? "{}").check;
      expect(check.key, "check key").to.contain("odds1");
      expect(check.results.length).to.be.greaterThan(0);
      for (const r of check.results) {
        expect(r.odds.q, `${r.floorId} odds`).to.have.length(49);
        expect(["normal", "mixture", "monteCarlo"]).to.include(r.odds.method);
      }
      // a clear logged at 1.2× the sim's time on the first floor the team fells: "at your pace" reads the same distribution
      const r = check.results.find((x: { seconds: number | null }) => x.seconds !== null && x.seconds < 150);
      expect(r, "a timed kill").to.exist;
      win.localStorage.setItem(
        "wtplus:endgame:clears",
        JSON.stringify({ v: 1, clears: { [r.teamId]: { season: 41, floorId: r.floorId, seconds: Math.round(r.seconds * 1.2 * 10) / 10, sim: r.seconds, at: 1 } } }),
      );
      // the fixture fields one team, which the plan spends on the low floors (12 crests for its 10 Vigor): two more
      // copies of its results under other resonators give the plan teams for the timed stages (the page only renders a check)
      const [team] = check.candidates;
      const copies = [["Verina", "Shorekeeper", "Jinhsi"], ["Chixia", "Encore", "Calcharo"]].map((keys) => ({ ...team, id: [...keys].sort().join("+"), appKeys: keys, names: keys, mainDps: keys[2], saved: null }));
      check.candidates.push(...copies);
      check.results.push(...copies.flatMap((c) => check.results.filter((x: { teamId: string }) => x.teamId === team.id).map((x: object) => ({ ...x, teamId: c.id }))));
      win.localStorage.setItem("wtplus:endgame:check", JSON.stringify({ v: 1, check }));
    });
    cy.visit("/endgame", seed({ keepCheck: true, usePace: true }));
    cy.get("[data-test-toa-odds-pace]", { timeout: 30000 }).should("have.length.at.least", 1);
    cy.get("[data-test-toa-progress]").should("not.exist");
    cy.get("[data-test-toa-odds-pace]").first().invoke("text").should("match", /^\s*At your pace:/);
    expectInside("[data-test-toa-odds-pace]", "at-your-pace line at 412 px / 130 %");

    // the plan (at that pace): each seated timed stage's chance of its planned crests, and all of them together
    cy.get('[data-test-toa-tab="plan"]').click();
    cy.get("[data-test-toa-stage]").should("have.length", 12);
    cy.get("[data-test-toa-plan-luck]").should("contain.text", "Crit luck").and("contain.text", "at your pace").and("contain.text", "crests on average").and("contain.text", "lands together");
    cy.get("[data-test-toa-plan-luck]").invoke("text").should("match", CHANCE);
    cy.get("[data-test-toa-stage-chance]").should("have.length.at.least", 2).each(($c) => expect($c.text()).to.match(CHANCE).and.to.contain("of runs"));
    expectInside("[data-test-toa-stage-chance]", "stage chance at 412 px / 130 %");
    // the chance stacks under the stars ("of runs" on its own line), so the planned kill time beside them is never cut
    // (on one line it squeezed the note to "2:2…" at 360 px)
    for (const [width, height] of [[412, 915], [360, 800]] as const) {
      cy.viewport(width, height);
      cy.get("[data-test-toa-stage-chance]").each(($c) => {
        const note = $c[0].closest("[data-test-toa-stage]")!.querySelector<HTMLElement>("[data-test-toa-stage-note]")!;
        const time = /\d+:\d\d/.exec(note.textContent ?? "");
        expect(time, "a timed stage's note names its kill time").to.exist;
        if (note.scrollWidth <= note.clientWidth) return;
        // cut: the ellipsis takes the end of the box, so the time must end well before it
        const range = note.ownerDocument.createRange();
        range.setStart(note.firstChild!, time!.index);
        range.setEnd(note.firstChild!, time!.index + time![0].length);
        expect(range.getBoundingClientRect().right, `"${note.textContent}": its kill time shows at ${width} px / 130 %`).to.be.at.most(note.getBoundingClientRect().right - 12);
      });
    }
    cy.viewport(412, 915);
    expectInside("[data-test-toa-plan-luck]", "plan crit-luck line at 412 px / 130 %");
  });

  it("puts a DPS range under the rotation view's headline", () => {
    cy.viewport(412, 915);
    cy.visit("/rotation#team=t404", seed()); // Shorekeeper · Lynae · Iuno, a stock wuwa_calc team
    cy.get("[data-test-rotation-dps]", { timeout: 90000 }).should("be.visible");
    cy.get("[data-test-rotation-dps-range]")
      .should("be.visible")
      .invoke("text")
      .should("match", /Crit luck: 8 runs in 10 land between [\d,]+ and [\d,]+ DPS/)
      .then((text) => {
        const [lo, hi] = [...text.matchAll(/([\d,]+) (?:and|DPS)/g)].map((m) => Number(m[1]!.replace(/,/g, "")));
        cy.get("[data-test-rotation-dps]").invoke("text").then((dps) => {
          const mean = Number(dps.replace(/,/g, ""));
          expect(lo, "the range brackets the average").to.be.lessThan(mean);
          expect(hi).to.be.greaterThan(mean);
        });
      });
    expectInside("[data-test-rotation-dps-range]", "rotation DPS range at 412 px / 130 %");
  });
});
